import type { Metadata } from "next";
import Link from "next/link";
import { Container, PageHero } from "@/components/ui";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { getSettings } from "@/lib/settings";
import { IMPRINT_URL } from "@/lib/public-urls";

export const metadata: Metadata = { title: "Datenschutz" };

export default async function PrivacyPage() {
  const s = await getSettings().catch(() => DEFAULT_SETTINGS);
  return (
    <>
      <PageHero label="Rechtliches // Datenschutz" title="Datenschutz im" emphasis="Support-Center" compact>
        Kurz und ehrlich: was wir speichern, warum, wie lange – und wie du es wieder loswirst. Stand: Version {s["privacy.version"]}.
      </PageHero>
      <Container>
        <div className="nv-prose max-w-3xl">
          <h2 id="verantwortlich">Verantwortlich</h2>
          <p>
            Verantwortlich ist der Betreiber von Nordverkehr – die vollständigen Angaben stehen im{" "}
            <a href={IMPRINT_URL} className="nv-link">
              Impressum auf nordverkehr.xyz
            </a>
            .
          </p>

          <h2 id="was">Was wir speichern</h2>
          <ul>
            <li>
              <strong>Login über Discord</strong> (Scope <code>identify</code>): deine Discord-ID, dein Name und Avatar. Keine E-Mail, keine Server-Liste. Über den Bot prüfen wir, ob du auf unserem Discord bist, welche Team-Rollen du hast und ob du dort gebannt bist.
            </li>
            <li>
              <strong>Tickets</strong>: Kategorie, deine Angaben, Nachrichten, Anhänge (Bilder werden neu gespeichert, Metadaten wie GPS entfernt) und Clip-Links, Status und deine Bewertung. Läuft ein Ticket auch in Discord, liegen die Nachrichten zusätzlich in unserem privaten Discord-Thread.
            </li>
            <li>
              <strong>Anträge</strong>: deine Antworten, Rückfragen und die Entscheidung mit Begründung. Intern: Diskussion und Abstimmung des Teams.
            </li>
            <li>
              <strong>Hilfe-Center</strong>: „Hat dir das geholfen?“ speichern wir anonym (nur Ja/Nein, optional Kommentar und ein täglich wechselnder, nicht rückrechenbarer Fingerabdruck gegen Mehrfachabstimmung). Suchbegriffe ohne Treffer speichern wir ohne Bezug zu dir.
            </li>
            <li>
              <strong>Protokoll</strong>: wichtige Aktionen des Teams (z. B. Entscheidungen) im Audit-Log.
            </li>
          </ul>

          <h2 id="warum">Wofür und auf welcher Grundlage</h2>
          <p>
            Um dir zu helfen und Anträge fair zu prüfen (Art. 6 Abs. 1 lit. b DSGVO – du nutzt unser Angebot) und um den Server sicher zu betreiben, Missbrauch zu verhindern
            und Entscheidungen nachvollziehbar zu machen (Art. 6 Abs. 1 lit. f DSGVO – berechtigtes Interesse).
          </p>

          <h2 id="wie-lange">Wie lange</h2>
          <table>
            <thead>
              <tr>
                <th>Daten</th>
                <th>Gelöscht nach</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Geschlossene Tickets inkl. Transkript</td>
                <td>{s["retention.ticketMonths"]} Monaten</td>
              </tr>
              <tr>
                <td>Entschiedene Anträge</td>
                <td>{s["retention.requestMonths"]} Monaten</td>
              </tr>
              <tr>
                <td>Bild-Anhänge</td>
                <td>{s["retention.attachmentDays"]} Tagen</td>
              </tr>
              <tr>
                <td>Suchbegriffe ohne Treffer</td>
                <td>{s["retention.searchDays"]} Tagen</td>
              </tr>
              <tr>
                <td>Audit-Log</td>
                <td>{s["retention.auditMonths"]} Monaten</td>
              </tr>
            </tbody>
          </table>

          <h2 id="weitergabe">Wer die Daten sieht</h2>
          <p>
            Nur das Team – und auch das nicht komplett: Beschwerden über Teammitglieder, Entbannungen, Einsprüche und Rückerstattungen sieht nur Moderation/Leitung, und wer
            selbst beschuldigt ist, sieht den Vorgang nie. Wir hosten bei Vercel (EU-Region Frankfurt) und MongoDB Atlas (EU). Nachrichten an dich laufen über Discord.
          </p>
          <p>
            <strong>KI (optional):</strong> Ist die KI-Unterstützung eingeschaltet, kann das Team Antwort-Entwürfe und Zusammenfassungen über die Claude-API von Anthropic
            erstellen lassen. Dabei gehen nur die nötigen Texte raus – ohne Namen, Discord-IDs und Bilder. Die KI antwortet dir nie selbst und entscheidet nichts.
          </p>

          <h2 id="rechte">Deine Rechte</h2>
          <p>
            Auskunft, Berichtigung, Löschung, Einschränkung, Widerspruch und Datenübertragbarkeit. Am schnellsten: unter{" "}
            <Link href="/konto" className="nv-link">
              Konto &amp; Daten
            </Link>{" "}
            kannst du alle deine Daten als Datei herunterladen und dein Konto löschen. Du hast außerdem das Recht, dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren.
          </p>
        </div>
      </Container>
    </>
  );
}
