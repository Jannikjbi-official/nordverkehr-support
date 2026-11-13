/**
 * Claude-Anbindung (serverseitig) – nur für Entwürfe und Zusammenfassungen fürs
 * Team. Die KI sendet NIE selbst, entscheidet nichts und bewertet keine Anträge.
 */
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { type Settings } from "@/lib/settings";
import { rateLimit } from "@/lib/rate-limit";
import { FEATURE_CONFIG, SERVER_FALLBACK_MODELS, costMicroUsd, dayStart, isAiConfigured, monthStart, type AiFeature } from "@/lib/ai/config";

export class AiError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

let client: Anthropic | null = null;
function anthropic() {
  // API-Key nur serverseitig aus der Umgebung (ANTHROPIC_API_KEY)
  client ??= new Anthropic({ maxRetries: 2, timeout: 60_000 });
  return client;
}

export async function monthlySpendMicro() {
  const agg = await db.aiUsage.aggregate({ _sum: { costMicroUsd: true }, where: { createdAt: { gte: monthStart() } } });
  return agg._sum.costMicroUsd ?? 0;
}

/** Tokens (Ein + Aus), die ein Nutzer heute verbraucht hat. */
export async function tokensToday(userId: string) {
  const agg = await db.aiUsage.aggregate({
    _sum: { inputTokens: true, outputTokens: true },
    where: { userId, createdAt: { gte: dayStart() } },
  });
  return (agg._sum.inputTokens ?? 0) + (agg._sum.outputTokens ?? 0);
}

export async function budgetLeft(settings: Settings) {
  return (await monthlySpendMicro()) < settings["ai.monthlyBudgetUsd"] * 1_000_000;
}

/** Vorbedingungen für Team-Anfragen: Schalter, Key, Monatsbudget, Rate Limit, Tageslimit. */
export async function assertAiAllowed(userId: string, settings: Settings) {
  if (!settings["ai.enabled"]) throw new AiError("Die KI-Unterstützung ist deaktiviert.", 403);
  if (!isAiConfigured()) throw new AiError("Kein ANTHROPIC_API_KEY hinterlegt.", 503);
  if (!(await budgetLeft(settings))) {
    throw new AiError("Das monatliche KI-Budget ist aufgebraucht. Die Leitung kann es in der Verwaltung erhöhen.", 402);
  }
  if ((await tokensToday(userId)) >= settings["ai.tokensPerUserPerDay"]) {
    throw new AiError("Dein tägliches KI-Token-Limit ist erreicht. Morgen geht's weiter.", 429);
  }
  const rl = await rateLimit(`ai:${userId}`, settings["ai.requestsPerHour"], 3600);
  if (!rl.ok) throw new AiError("Du hast dein stündliches KI-Kontingent erreicht. Später nochmal versuchen.", 429);
}

interface CallOptions {
  feature: AiFeature;
  /** Wem der Verbrauch zugerechnet wird (Teammitglied); null = System */
  userId: string | null;
  settings: Settings;
  system: string;
  prompt: string;
  maxTokens?: number;
  onText?: (delta: string) => void;
  signal?: AbortSignal;
}

export interface CallResult {
  text: string;
  refused: boolean;
}

/** Ein Aufruf (gestreamt), protokolliert Tokens & Kosten – auch bei Fehlern. */
export async function callAi({ feature, userId, settings, system, prompt, maxTokens, onText, signal }: CallOptions): Promise<CallResult> {
  const cfg = FEATURE_CONFIG[feature];
  const model = cfg.tier === "fast" ? settings["ai.fastModel"] : settings["ai.model"];
  const useFallbacks = SERVER_FALLBACK_MODELS.has(model);
  // Günstige Aufgaben auf Haiku: ohne Denkphase, damit das Ausgabe-Limit voll für den Text gilt
  // (Haiku 5.5 erlaubt "disabled" bei effort ≤ high; Sonnet/Opus 5.5 nicht – dort bleibt adaptiv).
  const noThinking = cfg.tier === "fast" && model.startsWith("claude-haiku-5");

  let text = "";
  let usage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  try {
    const stream = anthropic().beta.messages.stream(
      {
        model,
        // Hartes Ausgabe-Limit pro Anfrage
        max_tokens: Math.min(maxTokens ?? cfg.maxTokens, cfg.maxTokens),
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: prompt }],
        output_config: { effort: cfg.effort },
        ...(noThinking ? { thinking: { type: "disabled" as const } } : {}),
        ...(useFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      },
      { signal },
    );
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        text += event.delta.text;
        onText?.(event.delta.text);
      }
    }
    const final = await stream.finalMessage();
    usage = {
      input_tokens: final.usage.input_tokens,
      output_tokens: final.usage.output_tokens,
      cache_creation_input_tokens: final.usage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: final.usage.cache_read_input_tokens ?? 0,
    };
    return { text, refused: final.stop_reason === "refusal" };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      throw new AiError("Der hinterlegte API-Key wird von Anthropic nicht akzeptiert.", 502);
    }
    if (err instanceof Anthropic.RateLimitError) throw new AiError("Die KI ist gerade ausgelastet. Gleich nochmal versuchen.", 503);
    if (err instanceof Anthropic.APIConnectionError) throw new AiError("Keine Verbindung zur KI. Gleich nochmal versuchen.", 503);
    if (err instanceof Anthropic.APIError) throw new AiError(`KI-Dienst nicht verfügbar (${err.status ?? "?"}).`, 503);
    if (signal?.aborted) throw new AiError("Abgebrochen.", 499);
    throw err;
  } finally {
    await db.aiUsage
      .create({
        data: {
          userId,
          feature,
          model,
          inputTokens: usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens,
          outputTokens: usage.output_tokens,
          costMicroUsd: costMicroUsd(model, usage),
        },
      })
      .catch((e) => console.error("[ai] usage log failed", e));
  }
}
