import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react/ssr";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { eligibilityFor } from "@/lib/requests/service";
import { parseFields } from "@/lib/requests/model";
import { Container, Notice, PageHero } from "@/components/ui";
import { RequestForm } from "@/components/requests/RequestForm";

export const metadata: Metadata = { title: "Antrag stellen", robots: { index: false } };

export default async function NewRequestPage({ params }: { params: Promise<{ typ: string }> }) {
  const { typ } = await params;
  const { user, access } = await requireUser(`/antraege/neu/${typ}`);
  const type = await db.requestType.findUnique({ where: { slug: typ } });
  if (!type || !type.active || (access.guildBanned && !type.allowedWhenBanned)) notFound();
  const [elig, settings] = await Promise.all([eligibilityFor(user, type, access.guildBanned), getSettings()]);

  return (
    <>
      <PageHero label={`Antrag // ${type.title}`} title={type.title} compact>
        {type.description}
      </PageHero>
      <Container>
        <Link href="/antraege" className="nv-btn nv-btn-quiet nv-btn-sm mb-6">
          <ArrowLeft size={14} aria-hidden /> Alle Anträge
        </Link>
        {!elig.ok ? (
          <Notice tone="warn" title="Gerade nicht möglich">
            {elig.reason}
          </Notice>
        ) : (
          <>
            {type.fourEyes && (
              <Notice tone="info" className="mb-6 max-w-3xl">
                Über diesen Antrag entscheiden immer mindestens zwei Teammitglieder aus Moderation oder Leitung (Vier-Augen-Prinzip). Wer die Strafe ausgesprochen hat, entscheidet nie allein.
              </Notice>
            )}
            <RequestForm
              typeSlug={type.slug}
              fields={parseFields(type.fields)}
              requireHonesty={type.requireHonesty}
              needsConsent={(user.consentVersion ?? 0) < settings["privacy.version"]}
              discordId={user.discordId}
            />
          </>
        )}
      </Container>
    </>
  );
}
