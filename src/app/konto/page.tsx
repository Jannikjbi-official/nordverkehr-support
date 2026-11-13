import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { Container, PageHero } from "@/components/ui";
import { AccountControls } from "@/components/AccountControls";

export const metadata: Metadata = { title: "Konto & Daten", robots: { index: false } };

export default async function AccountPage() {
  const { user } = await requireUser("/konto");
  return (
    <>
      <PageHero label="Konto // Daten" title="Deine" emphasis="Daten." compact>
        Benachrichtigungen, Export und Löschung – ohne Umwege.
      </PageHero>
      <Container>
        <AccountControls dmOptOut={user.dmOptOut} />
      </Container>
    </>
  );
}
