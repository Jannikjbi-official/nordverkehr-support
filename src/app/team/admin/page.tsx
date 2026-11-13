import type { Metadata } from "next";
import { CheckCircle, XCircle } from "@phosphor-icons/react/ssr";
import { requireLead } from "@/lib/auth/session";
import { getSettings, SETTING_LABELS } from "@/lib/settings";
import { isAiConfigured } from "@/lib/ai/config";
import { diagnose, interactionsUrl } from "@/lib/discord/setup";
import { databaseCheck } from "@/lib/db-health";
import { SettingsForm } from "@/components/team/SettingsForm";
import { DiscordTools } from "@/components/team/DiscordTools";

export const metadata: Metadata = { title: "Einstellungen & Discord" };

export default async function AdminPage() {
  await requireLead();
  const [settings, discordChecks, dbCheck] = await Promise.all([
    getSettings(),
    diagnose().catch((e) => [{ label: "Discord", ok: false, detail: (e as Error).message }]),
    databaseCheck(),
  ]);
  const checks = [dbCheck, ...discordChecks];
  return (
    <div className="space-y-10">
      <div>
        <p className="nv-label">Leitung // Einstellungen</p>
        <h1 className="nv-headline text-4xl mt-3">
          Einstellungen &amp; <em>Discord</em>
        </h1>
      </div>

      <section className="nv-card p-5 space-y-4" aria-labelledby="discord">
        <h2 id="discord" className="font-semibold">
          Discord (NV Lotse)
        </h2>
        <ul className="grid gap-2 text-sm">
          {checks.map((c) => (
            <li key={c.label} className="flex items-start gap-2">
              {c.ok ? <CheckCircle size={18} className="text-[color:var(--tone-success)] shrink-0" aria-label="ok" /> : <XCircle size={18} className="text-[color:var(--tone-danger)] shrink-0" aria-label="Problem" />}
              <span>
                <strong>{c.label}:</strong> <span className="text-muted">{c.detail}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">
          Interactions-URL dieses Portals: <code className="font-mono">{interactionsUrl()}</code>. Knöpfe des Bewerbungsportals (Präfix <code>nv:</code>) und dessen Befehle werden automatisch weitergereicht.
        </p>
        <DiscordTools />
      </section>

      <section aria-labelledby="settings">
        <h2 id="settings" className="font-semibold mb-4">
          Abläufe, Löschfristen, KI
        </h2>
        {!isAiConfigured() && <p className="text-sm text-muted mb-4">Hinweis: Ohne ANTHROPIC_API_KEY bleibt die KI aus, egal was hier steht.</p>}
        <SettingsForm settings={settings} labels={SETTING_LABELS} />
      </section>
    </div>
  );
}
