import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChatCircleDots, ClockCountdown, Eyes, FilmSlate, ShieldCheck, Lightbulb } from "@phosphor-icons/react/ssr";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { eligibilityFor } from "@/lib/requests/service";
import { parseFields } from "@/lib/requests/model";
import { LEVEL_LABEL } from "@/lib/auth/access";
import { Container, Notice } from "@/components/ui";
import { IconTile } from "@/components/icons";
import { RequestForm } from "@/components/requests/RequestForm";

export const metadata: Metadata = { title: "Antrag stellen", robots: { index: false } };

export default async function NewRequestPage({ params }: { params: Promise<{ typ: string }> }) {
  const { typ } = await params;
  const { user, access } = await requireUser(`/antraege/neu/${typ}`);
  const type = await db.requestType.findUnique({ where: { slug: typ } });
  if (!type || !type.active || (access.guildBanned && !type.allowedWhenBanned)) notFound();
  const [elig, settings] = await Promise.all([eligibilityFor(user, type, access.guildBanned), getSettings()]);

  const facts = [
    { icon: Eyes, text: `Entscheidet: ${LEVEL_LABEL[type.decideFrom]}${type.decideFrom === "LEITUNG" ? "" : " oder höher"}` },
    ...(type.fourEyes ? [{ icon: ShieldCheck, text: "Vier-Augen-Prinzip: Immer mindestens zwei Teammitglieder entscheiden. Wer die Strafe ausgesprochen hat, nie allein." }] : []),
    ...(type.cooldownDays > 0 ? [{ icon: ClockCountdown, text: `Bei Ablehnung kannst du diesen Antrag ${type.cooldownDays} Tage lang nicht neu stellen.` }] : []),
    { icon: ChatCircleDots, text: "Rückfragen und die Entscheidung siehst du im Portal – zusätzlich per DM vom NV Lotse." },
  ];

  return (
    <Container className="pt-28 sm:pt-32 pb-16">
      <Link href="/antraege" className="nv-btn nv-btn-quiet nv-btn-sm">
        <ArrowLeft size={14} aria-hidden /> Alle Anträge
      </Link>

      <header className="mt-6 flex items-start gap-4 nv-anim">
        <IconTile name={type.icon} />
        <div className="min-w-0">
          <p className="nv-label">Antrag stellen</p>
          <h1 className="nv-headline text-4xl sm:text-5xl mt-3">{type.title}</h1>
          <p className="mt-3 text-muted max-w-2xl">{type.description}</p>
        </div>
      </header>

      {!elig.ok ? (
        <Notice tone="warn" title="Gerade nicht möglich" className="mt-8 max-w-2xl">
          {elig.reason}
        </Notice>
      ) : (
        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <RequestForm
            typeSlug={type.slug}
            fields={parseFields(type.fields)}
            requireHonesty={type.requireHonesty}
            needsConsent={(user.consentVersion ?? 0) < settings["privacy.version"]}
            discordId={user.discordId}
          />
          <aside className="space-y-4 self-start">
            <section className="nv-card p-5" aria-labelledby="ablauf">
              <h2 id="ablauf" className="nv-mono mb-4">
                Gut zu wissen
              </h2>
              <ul className="space-y-3 text-sm">
                {facts.map((f) => (
                  <li key={f.text} className="flex gap-3">
                    <f.icon size={18} className="text-red-text shrink-0 mt-0.5" aria-hidden />
                    <span className="text-fg-2">{f.text}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="nv-card p-5" aria-labelledby="tipps">
              <h2 id="tipps" className="nv-mono mb-4 flex items-center gap-2">
                <Lightbulb size={14} aria-hidden /> Tipps
              </h2>
              <ul className="space-y-2 text-sm text-fg-2 list-disc pl-5 marker:text-red-text">
                <li>Sachlich und ehrlich bleiben – das wirkt mehr als Ausrufezeichen.</li>
                <li>Konkret werden: Wann, wo, wer war beteiligt?</li>
                <li className="flex-wrap">
                  <FilmSlate size={14} className="inline mr-1 -mt-0.5" aria-hidden />
                  Clips (YouTube, Twitch, Medal) und Screenshots helfen fast immer.
                </li>
                <li>Nach dem Einreichen kannst du jederzeit Infos nachreichen.</li>
              </ul>
            </section>
          </aside>
        </div>
      )}
    </Container>
  );
}
