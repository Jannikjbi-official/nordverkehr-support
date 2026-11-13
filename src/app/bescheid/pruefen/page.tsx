import type { Metadata } from "next";
import { headers } from "next/headers";
import { CheckCircle, SealCheck, XCircle } from "@phosphor-icons/react/ssr";
import { verifyCertificate, type VerifyResult } from "@/lib/requests/certificate-db";
import { rateLimit } from "@/lib/rate-limit";
import { Container, Notice, PageHero, formatDay } from "@/components/ui";

export const metadata: Metadata = {
  title: "Bescheid prüfen",
  description: "Echtheit eines Bescheids (z. B. Namensänderung) fürs Rathaus prüfen.",
  robots: { index: false },
};

/** Öffentlich: Das Rathaus (ingame) prüft hier, ob ein Bescheid echt ist. */
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ nr?: string; code?: string }> }) {
  const sp = await searchParams;
  const nr = (sp.nr ?? "").slice(0, 30);
  const code = (sp.code ?? "").slice(0, 20);
  let result: VerifyResult | "limit" | null = null;
  if (nr && code) {
    const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
    const rl = await rateLimit(`bescheid-pruefen:${ip}`, 30, 600);
    result = rl.ok ? await verifyCertificate(nr, code) : "limit";
  }

  return (
    <>
      <PageHero label="Anträge // Bescheid prüfen" title="Ist der Bescheid" emphasis="echt?" compact>
        Für das Rathaus: Bescheid-Nr. und Prüfcode vom Bescheid eingeben. Gezeigt wird nur, was auf dem Bescheid stehen muss.
      </PageHero>
      <Container className="pb-16">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <form method="get" className="nv-card p-6 space-y-4 self-start">
            <div>
              <label htmlFor="nr" className="nv-field-label">
                Bescheid-Nr.
              </label>
              <input id="nr" name="nr" defaultValue={nr} required placeholder="NVA-2026-0001" className="nv-input mt-1 font-mono uppercase" autoComplete="off" />
            </div>
            <div>
              <label htmlFor="code" className="nv-field-label">
                Prüfcode
              </label>
              <input id="code" name="code" defaultValue={code} required placeholder="XXXXX-XXXXX" className="nv-input mt-1 font-mono uppercase" autoComplete="off" />
            </div>
            <button type="submit" className="nv-btn nv-btn-primary">
              <SealCheck size={16} aria-hidden /> Prüfen
            </button>
          </form>

          <div aria-live="polite">
            {result === "limit" && (
              <Notice tone="warn" title="Zu viele Prüfungen">
                Bitte in ein paar Minuten nochmal versuchen.
              </Notice>
            )}
            {result && result !== "limit" && result.ok && (
              <section className="nv-card p-6 border-[var(--tone-success)]" aria-labelledby="ergebnis">
                <h2 id="ergebnis" className="flex items-center gap-2 font-semibold text-lg">
                  <CheckCircle size={22} weight="fill" className="text-[var(--tone-success)]" aria-hidden /> Bescheid ist echt
                </h2>
                <dl className="mt-5 grid gap-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Bescheid-Nr.</dt>
                    <dd className="font-mono">{result.publicId}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Art</dt>
                    <dd>Namensänderung (Charakter)</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Bisheriger Name</dt>
                    <dd className="font-semibold text-right">{result.currentName || "–"}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Neuer Name</dt>
                    <dd className="font-semibold text-right">{result.newName || "–"}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Genehmigt am</dt>
                    <dd>{formatDay(result.decidedAt)}</dd>
                  </div>
                </dl>
                <p className="mt-5 text-sm text-muted">Stimmen die Namen mit dem vorgelegten Bescheid überein, können neue Papiere ausgestellt werden.</p>
              </section>
            )}
            {result && result !== "limit" && !result.ok && (
              <Notice tone="danger" title="Nicht gültig" icon={XCircle}>
                Zu dieser Nummer und diesem Code gibt es keinen gültigen Bescheid. Tippfehler? Sonst bitte keine Papiere ausstellen und das Team informieren.
              </Notice>
            )}
            {!result && <p className="text-sm text-muted">Nummer und Code stehen unten auf dem Bescheid.</p>}
          </div>
        </div>
      </Container>
    </>
  );
}
