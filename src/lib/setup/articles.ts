export interface SeedArticle {
  slug: string; // kebab-case, ascii only (ae/oe/ue/ss), unique
  title: string;
  summary: string; // 1 sentence, max ~160 chars
  category: string; // one of the category slugs
  tags: string[]; // 3-6 lowercase search tags incl. common misspellings/synonyms
  related: string[]; // 1-3 slugs of other articles in this file
  body: string; // Markdown
}

/**
 * Fassung der Standard-Artikel. Erhöhen, wenn Texte geändert wurden: Artikel,
 * die das Team nicht bearbeitet hat, bekommen dann beim nächsten Start den
 * neuen Text (bearbeitete bleiben unangetastet).
 */
export const SEED_CONTENT_VERSION = 4;

export const SEED_ARTICLES: SeedArticle[] = [
  {
    slug: "erste-schritte-auf-nordverkehr",
    title: "Erste Schritte auf Nordverkehr",
    summary:
      "Was du brauchst, bevor du auf Nordverkehr spielen kannst: Discord, Regelwerk, Whitelist, TeamSpeak und FiveM.",
    category: "erste-schritte",
    tags: ["start", "anfang", "neu", "einstieg", "anleitung", "neuling"],
    related: [
      "wie-komme-ich-auf-die-whitelist",
      "mit-dem-server-verbinden",
      "teamspeak-3-einrichten",
    ],
    body: `Moin und willkommen. Nordverkehr ist ein Roleplay-Server, der in Hamburg spielt. Wir starten auf GTA 5 über FiveM (PC) und ziehen später auf GTA 6 um. Der Start ist aktuell in Vorbereitung – du kannst dich aber jetzt schon fertig machen.

## Was du brauchst

- Eine legale Kopie von GTA 5 auf dem PC
- [FiveM](https://fivem.net) installiert
- TeamSpeak 3 mit dem SaltyChat-Plugin
- Ein funktionierendes Mikrofon – ohne geht es nicht, Voice ist Pflicht
- Einen Discord-Account

## Der Weg auf den Server

1. Tritt unserem [Discord](https://discord.gg/KrfKASTHDp) bei. Dort laufen Ankündigungen, Bewerbungsphasen und die Links, die du später brauchst.
2. Lies das [Regelwerk](https://nordverkehr.xyz/regeln). Komplett, nicht nur die Überschriften.
3. Bewirb dich für die Whitelist, sobald die Bewerbung im Discord angekündigt ist.
4. Richte TeamSpeak 3 und SaltyChat ein. Die TeamSpeak-Adresse und den Plugin-Link findest du im Discord.
5. Wenn du angenommen bist: Verbinde dich mit dem Server.

![Dein Weg auf den Server in fünf Schritten](/hilfe/erste-schritte-weg.webp)

## Wo du Hilfe bekommst

Dieses Support-Center ist deine Anlaufstelle. Hier findest du Artikel zu typischen Problemen, kannst Tickets aufmachen und Anträge stellen. Eingeloggt wird ausschließlich über Discord – ein separates Passwort gibt es nicht.

Bevor du ein Ticket schreibst, lohnt sich ein Blick in die Suche. Die meisten Fragen zu FiveM, TeamSpeak oder SaltyChat sind hier schon beantwortet.

## Hilft alles nichts?

Wenn du irgendwo festhängst, mach ein [Ticket auf](/tickets/neu) und beschreib kurz, wo es hakt. Je genauer, desto schneller geht's.`,
  },
  {
    slug: "mit-dem-server-verbinden",
    title: "So verbindest du dich mit dem Server",
    summary:
      "Zwei Wege auf den Server: über die F8-Konsole in FiveM oder per Direktlink.",
    category: "technik-verbindung",
    tags: ["verbinden", "connect", "ip", "f8", "server adresse", "joinen"],
    related: [
      "fivem-startet-nicht",
      "teamspeak-3-einrichten",
      "wie-komme-ich-auf-die-whitelist",
    ],
    body: `Es gibt zwei Wege, auf Nordverkehr zu kommen. Beide führen zum selben Ziel, nimm einfach den, der dir lieber ist. Voraussetzung: Du stehst auf der Whitelist, sonst wirst du beim Verbinden abgewiesen.

## Vorher erledigen

1. Starte TeamSpeak 3 und verbinde dich mit unserem TeamSpeak-Server (Adresse steht im Discord).
2. Prüfe, ob das SaltyChat-Plugin aktiv ist.
3. Erst dann FiveM starten.

Wer das in umgekehrter Reihenfolge macht, landet meist direkt im SaltyChat-Fehler.

## Weg 1: F8-Konsole

1. Starte FiveM und warte, bis das Hauptmenü geladen ist.
2. Drück **F8**, um die Konsole zu öffnen.
3. Gib Folgendes ein und bestätige mit Enter:

\`connect connect.nordverkehr.xyz\`

![F8-Konsole mit dem Befehl connect connect.nordverkehr.xyz](/hilfe/verbinden-konsole.webp)

## Weg 2: Direktlink

Öffne im Browser den Link \`fivem://connect/connect.nordverkehr.xyz\` oder geh auf [nordverkehr.xyz/connect](https://nordverkehr.xyz/connect). Dein Browser fragt, ob er FiveM öffnen darf – erlauben, fertig.

Klappt der Link nicht, ist FiveM meistens nicht richtig installiert oder der Browser blockiert den Protokoll-Aufruf. Dann nimm Weg 1.

## Typische Stolpersteine

- **Abgewiesen wegen Whitelist:** Du bist noch nicht freigeschaltet. Siehe Artikel zur Whitelist.
- **Verbindung bricht beim Laden ab:** Cache leeren und neu versuchen, siehe "FiveM startet nicht".
- **Hängt bei SaltyChat:** TeamSpeak läuft nicht, falscher TS-Server oder Plugin-Version passt nicht.

## Hilft alles nichts?

Mach ein [Ticket in der Kategorie Technik](/tickets/neu) auf. Schreib dazu, welchen Weg du genommen hast und welche Fehlermeldung kommt – am besten wortgleich.`,
  },
  {
    slug: "ticket-oder-antrag",
    title: "Ticket oder Antrag – was ist der Unterschied?",
    summary:
      "Wann du ein Ticket aufmachst und wann ein Antrag der richtige Weg ist, inklusive Übersicht aller Kategorien.",
    category: "erste-schritte",
    tags: ["ticket", "antrag", "support", "hilfe", "antraege", "tiket"],
    related: [
      "wie-stelle-ich-einen-entbannungsantrag",
      "einspruch-gegen-verwarnung-oder-strafe",
      "fraktionen-und-jobs",
    ],
    body: `Kurz gesagt: Ein **Ticket** ist für Fragen und Probleme, bei denen dir jemand helfen soll. Ein **Antrag** ist für Entscheidungen, die das Team treffen muss. Wer den falschen Weg nimmt, wartet unnötig.

![Ticket für Hilfe bei Problemen, Antrag für formelle Entscheidungen](/hilfe/ticket-oder-antrag.webp)

## Tickets

Tickets eröffnest du entweder hier im Web unter [/tickets/neu](/tickets/neu) oder im Discord über den Button im Ticket-Kanal. Geschrieben wird immer hier im Portal – Antworten vom Team bekommst du zusätzlich per DM.

## Anträge

Anträge werden immer hier im Portal unter [/antraege](/antraege) ausgefüllt – nicht im Discord, nicht per DM. Pro Person ist immer nur ein offener Antrag gleichzeitig möglich.

## Übersicht

| Anliegen | Weg | Kategorie |
|---|---|---|
| Spiel startet nicht, Verbindungsprobleme | Ticket | Technik |
| Jemand hat gegen Regeln verstoßen | Ticket | Spielerbeschwerde |
| Etwas funktioniert im Spiel nicht wie gedacht | Ticket | Bug |
| Du verstehst eine Regel nicht | Ticket | Frage zum Regelwerk |
| Alles andere, was Hilfe braucht | Ticket | Sonstiges |
| Du wurdest gebannt | Antrag | Entbannung |
| Du hältst eine Verwarnung oder Strafe für falsch | Antrag | Einspruch gegen Verwarnung/Strafe |
| Dein Charaktername soll sich ändern | Antrag | Namensänderung |
| Dein Charakter soll endgültig sterben | Antrag | Charakter-Tod (CK) |
| Du hast durch einen Bug etwas verloren | Antrag | Rückerstattung |
| Fraktion wechseln oder gründen | Antrag | Fraktionswechsel/-gründung |
| Entscheidung, die nirgends reinpasst | Antrag | Sonstiger Antrag |

## Faustregel

Bei Bugs gilt: Erst das Ticket (damit der Fehler behoben wird), dann bei Bedarf der Antrag auf Rückerstattung (damit du deinen Verlust zurückbekommst). Das sind zwei verschiedene Dinge.

## Hilft alles nichts?

Wenn du dir unsicher bist, mach ein [Ticket unter Sonstiges](/tickets/neu) auf. Das Team sagt dir dann, ob ein Antrag nötig ist.`,
  },
  {
    slug: "wie-komme-ich-auf-die-whitelist",
    title: "Wie komme ich auf die Whitelist?",
    summary:
      "Nordverkehr ist ein Whitelist-Server: So läuft die Bewerbung ab und worauf du vorher achten solltest.",
    category: "whitelist",
    tags: ["whitelist", "wl", "bewerbung", "freischaltung", "whitlist", "einreise"],
    related: [
      "erste-schritte-auf-nordverkehr",
      "was-ist-metagaming",
      "mit-dem-server-verbinden",
    ],
    body: `Auf Nordverkehr kommt nur, wer auf der Whitelist steht. Das klingt nach Hürde, ist aber Absicht: Wir wollen Leute, die Lust auf ernsthaftes Roleplay haben und die Regeln kennen.

## So läuft es ab

1. Tritt dem [Discord](https://discord.gg/KrfKASTHDp) bei.
2. Warte auf die Ankündigung der Bewerbungsphase. Die Bewerbung wird im Discord angekündigt – vorher bringt Nachfragen nichts.
3. Lies das [Regelwerk](https://nordverkehr.xyz/regeln) vollständig.
4. Füll die Bewerbung im [Bewerbungsportal](https://bewerbung.nordverkehr.xyz) aus.
5. Warte auf die Rückmeldung.

![Ablauf der Whitelist-Bewerbung in fünf Schritten](/hilfe/whitelist-ablauf.webp)

## Das Regelwerk ist kein Beiwerk

Wir sagen es lieber einmal zu oft:

> Unwissenheit schützt nicht vor Konsequenzen.

Wer auf dem Server landet, hat die Regeln gelesen – davon gehen wir aus, und danach richten wir uns. Begriffe wie Metagaming, Power-RP, Fail-RP oder Combat Logging solltest du erklären können, ohne nachzuschlagen.

## Tipps für die Bewerbung

- **Schreib selbst.** Eine kopierte oder generierte Bewerbung fällt auf.
- **Sei ehrlich.** Wenig RP-Erfahrung ist kein Ausschlussgrund, falsche Angaben schon.
- **Denk an Hamburg.** Ein Charakter, der in die Stadt passt, überzeugt mehr als der zehnte Gangboss ohne Hintergrund.
- **Lies die Fragen genau.** Wer an der Frage vorbei antwortet, macht es dem Team schwer.

## Und dann?

Wenn du angenommen bist, kannst du dich verbinden. Vorher solltest du TeamSpeak 3 mit SaltyChat einrichten, denn ohne Voice kommst du nicht weit.

## Hilft alles nichts?

Fragen zur Bewerbung, die hier nicht beantwortet sind? Mach ein [Ticket unter Sonstiges](/tickets/neu) auf. Bitte keine Nachfragen zum Stand deiner Bewerbung per DM an Teammitglieder.`,
  },
  {
    slug: "fivem-startet-nicht",
    title: "FiveM startet nicht",
    summary:
      "FiveM stürzt ab, lädt endlos oder startet gar nicht? Diese Schritte lösen die meisten Fälle.",
    category: "technik-verbindung",
    tags: ["fivem", "startet nicht", "absturz", "crash", "spiel startet nicht", "five m"],
    related: [
      "mit-dem-server-verbinden",
      "fivem-cache-loeschen",
      "saltychat-verbindet-nicht",
    ],
    body: `Wenn FiveM nicht startet, abstürzt oder beim Laden hängen bleibt, liegt es fast nie am Server. Meistens ist es der Cache, eine beschädigte GTA-Installation oder ein Programm, das dazwischenfunkt. Arbeite die Schritte der Reihe nach ab und teste nach jedem.

## 1. Cache leeren

Der Klassiker und oft schon die Lösung.

1. Schließ FiveM komplett, auch im Task-Manager.
2. Rechtsklick auf die FiveM-Verknüpfung, dann "Dateipfad öffnen".
3. Öffne den Ordner **FiveM Application Data**.
4. Öffne den Ordner **data**. Lösch darin alles **außer** dem Ordner **game**.
5. FiveM neu starten.

Den Ordner **game** behältst du, sonst lädt FiveM alles neu herunter. Ausführlich: [FiveM-Cache löschen](/hilfe/technik-verbindung/fivem-cache-loeschen).

![Ordner im FiveM-Cache](/hilfe/cache-ordner.webp)

## 2. GTA-5-Dateien überprüfen

Beschädigte Spieldateien sorgen für Abstürze. Lass die Dateien im Launcher überprüfen, über den du GTA 5 gekauft hast (Steam, Epic oder Rockstar Launcher). Die Funktion heißt je nach Launcher "Dateien überprüfen" oder "Integrität überprüfen".

## 3. Treiber und Windows aktualisieren

Installier den aktuellen Grafikkartentreiber direkt vom Hersteller. Ein veralteter Treiber ist eine häufige Absturzursache.

## 4. Störende Programme ausschließen

- **Overlays deaktivieren:** Discord-Overlay, Steam-Overlay, GeForce Experience, MSI Afterburner und ähnliche.
- **Antivirus:** Leg für den FiveM-Ordner eine Ausnahme an. Manche Virenscanner blockieren Dateien, ohne Bescheid zu sagen.
- **Als Administrator starten** ist normalerweise nicht nötig. Wenn du es aus Gewohnheit tust, probier es testweise ohne.

## 5. Neu installieren

Wenn alles andere scheitert: FiveM deinstallieren, Ordner löschen, frisch installieren. GTA 5 selbst musst du dafür nicht neu installieren.

## Hilft alles nichts?

Mach ein [Ticket in der Kategorie Technik](/tickets/neu) auf. Schreib dazu, was du schon probiert hast, und häng die Fehlermeldung an – ein Screenshot oder der genaue Text spart Rückfragen.`,
  },
  {
    slug: "teamspeak-3-einrichten",
    title: "TeamSpeak 3 einrichten",
    summary:
      "Voice ist Pflicht: So richtest du TeamSpeak 3 mit dem SaltyChat-Plugin für Nordverkehr ein.",
    category: "teamspeak-saltychat",
    tags: ["teamspeak", "ts3", "ts", "saltychat", "voice", "einrichten"],
    related: [
      "saltychat-verbindet-nicht",
      "mikrofon-und-push-to-talk-probleme",
      "mit-dem-server-verbinden",
    ],
    body: `Auf Nordverkehr wird gesprochen, nicht getippt. Ingame-Voice läuft über TeamSpeak 3 mit dem Plugin SaltyChat. Das ist Pflicht, ebenso ein funktionierendes Mikrofon.

![TeamSpeak 3 und SaltyChat in fünf Schritten einrichten](/hilfe/teamspeak-einrichten.webp)

## 1. TeamSpeak 3 installieren

Lade TeamSpeak 3 von der offiziellen Website herunter und installiere es. Wichtig: **TeamSpeak 3**, nicht TeamSpeak 5 oder 6 – SaltyChat ist ein TS3-Plugin.

## 2. SaltyChat installieren

1. Lade das SaltyChat-Plugin über den Link in unserem [Discord](https://discord.gg/KrfKASTHDp) herunter.
2. Schließ TeamSpeak, bevor du das Plugin installierst.
3. Führ die Plugin-Datei aus. TeamSpeak installiert sie automatisch.
4. Starte TeamSpeak neu.

Die Plugin-Version muss zur Version auf dem Server passen. Lade SaltyChat deshalb immer über unseren Link, nicht von irgendeiner anderen Seite. Nach Updates kann sich die Version ändern – dann einfach neu installieren.

## 3. Plugin aktivieren

1. In TeamSpeak: **Extras** → **Optionen** → **Addons**.
2. SaltyChat in der Liste suchen.
3. Prüfen, dass es aktiviert ist.

## 4. Mit dem Server verbinden

Die Adresse unseres TeamSpeak-Servers steht im Discord. Verbinde dich dort, **bevor** du FiveM startest. Im Spiel verschiebt dich SaltyChat dann automatisch in den richtigen Channel.

## 5. Mikrofon prüfen

Unter **Extras** → **Optionen** → **Aufnahme** stellst du dein Mikrofon als Aufnahmegerät ein und legst fest, ob du Push-to-Talk oder Sprachaktivierung nutzt. Teste kurz, ob der Pegel ausschlägt.

## Hilft alles nichts?

Wenn TeamSpeak oder SaltyChat sich weigern, schau in die Artikel zu SaltyChat und Mikrofonproblemen. Danach: [Ticket in der Kategorie Technik](/tickets/neu).`,
  },
  {
    slug: "saltychat-verbindet-nicht",
    title: "SaltyChat verbindet nicht",
    summary:
      "Du hängst im Spiel bei SaltyChat fest oder hörst niemanden? Diese Checkliste hilft in den meisten Fällen.",
    category: "teamspeak-saltychat",
    tags: ["saltychat", "salty", "salty chat", "ts3", "voice", "saltichat"],
    related: [
      "teamspeak-3-einrichten",
      "mikrofon-und-push-to-talk-probleme",
      "fivem-startet-nicht",
    ],
    body: `SaltyChat verbindet FiveM mit TeamSpeak 3. Wenn eins der beiden Enden nicht passt, bleibst du im Spiel bei einer SaltyChat-Meldung hängen oder hörst niemanden. Die Ursache ist fast immer eine der folgenden.

## Die Checkliste

1. **Läuft TeamSpeak 3?** TS3 muss gestartet sein, **bevor** du dem Server beitrittst. Nachträglich starten hilft oft nicht – dann FiveM neu verbinden.
2. **Richtiger TeamSpeak-Server?** Du musst auf unserem TS verbunden sein. Die Adresse steht im Discord. Ein anderer Server funktioniert nicht.
3. **Plugin aktiviert?** In TeamSpeak unter **Extras** → **Optionen** → **Addons** prüfen, ob SaltyChat aktiv ist.
4. **Passende Version?** Die Plugin-Version muss zum Server passen. Lade SaltyChat über den Link im Discord neu und installier es drüber.
5. **TeamSpeak 3, nicht 5 oder 6?** SaltyChat läuft nur mit TeamSpeak 3.

## Windows und Sicherheitssoftware

- Wenn Windows oder deine Firewall beim ersten Start nach Zugriff fragt: erlauben.
- Manche Antivirenprogramme blockieren das Plugin. Leg testweise eine Ausnahme für den TeamSpeak-Ordner an.
- Laufen TeamSpeak und FiveM mit unterschiedlichen Rechten (eins als Administrator, eins nicht), können sie nicht miteinander reden. Starte beide normal.

## Du bist verbunden, hörst aber nichts

- Prüf in TeamSpeak, ob dein Ausgabegerät stimmt.
- Prüf, ob du im TS gemutet bist oder die Lautsprecher stumm sind.
- Im Spiel verschiebt dich SaltyChat automatisch in einen Channel. Wenn du manuell wechselst, hörst du niemanden mehr.

## Reihenfolge, die funktioniert

TeamSpeak starten → auf unseren TS verbinden → Plugin prüfen → FiveM starten → Server beitreten.

![Richtige Reihenfolge und Checkliste bei Not connected](/hilfe/saltychat-reihenfolge.webp)

## Hilft alles nichts?

Mach ein [Ticket in der Kategorie Technik](/tickets/neu) auf. Schreib dazu, welche Meldung im Spiel erscheint und welche SaltyChat-Version du in den Addons siehst.`,
  },
  {
    slug: "mikrofon-und-push-to-talk-probleme",
    title: "Mikrofon und Push-to-Talk funktionieren nicht",
    summary:
      "Andere hören dich nicht oder Push-to-Talk reagiert nicht? So findest du den Fehler.",
    category: "teamspeak-saltychat",
    tags: ["mikrofon", "mic", "push to talk", "ptt", "micro", "niemand hoert mich"],
    related: [
      "teamspeak-3-einrichten",
      "saltychat-verbindet-nicht",
    ],
    body: `Ein funktionierendes Mikrofon ist auf Nordverkehr Pflicht. Wenn dich niemand hört, liegt es meist an Windows, an TeamSpeak oder an einer belegten Taste.

![Mikrofon von Windows bis ins Spiel prüfen](/hilfe/mikrofon-pruefen.webp)

## 1. Windows prüfen

1. Öffne die Windows-Soundeinstellungen.
2. Prüf, ob dein Mikrofon als Eingabegerät ausgewählt ist und der Pegel beim Sprechen ausschlägt.
3. Unter **Datenschutz** → **Mikrofon** muss der Zugriff für Desktop-Apps erlaubt sein.

Wenn Windows dein Mikrofon nicht erkennt, hilft TeamSpeak auch nicht weiter. Dann Kabel, Anschluss und Treiber prüfen.

## 2. TeamSpeak prüfen

1. **Extras** → **Optionen** → **Aufnahme**.
2. Wähl unter Aufnahmegerät dein Mikrofon aus, nicht "Standard", wenn du mehrere Geräte hast.
3. Leg fest: Push-to-Talk oder Sprachaktivierung.
4. Nutz den Testknopf. Wenn sich nichts tut, stimmt das Gerät nicht.

## 3. Push-to-Talk-Taste

- Die Taste muss in TeamSpeak belegt sein und darf nicht mit einer Taste kollidieren, die du im Spiel brauchst.
- Wenn die Taste im TeamSpeak-Fenster funktioniert, im Spiel aber nicht: TeamSpeak und FiveM laufen wahrscheinlich mit unterschiedlichen Rechten. Starte beide ohne Administratorrechte.
- Overlays und Makro-Software können Tasten abfangen. Testweise schließen.

## 4. Im Spiel

SaltyChat regelt die Reichweite deiner Stimme. Wenn dich jemand direkt neben dir nicht hört, ist meistens SaltyChat das Problem, nicht das Mikrofon – dann hilft der Artikel "SaltyChat verbindet nicht".

## Hilft alles nichts?

Mach ein [Ticket in der Kategorie Technik](/tickets/neu) auf. Nenn dein Mikrofon, deine TeamSpeak-Einstellung (PTT oder Sprachaktivierung) und was beim Test passiert.`,
  },
  {
    slug: "was-ist-metagaming",
    title: "Was ist Metagaming?",
    summary:
      "Metagaming heißt, Wissen von außerhalb des Spiels im RP zu nutzen – und ist auf Nordverkehr verboten.",
    category: "regelwerk",
    tags: ["metagaming", "meta", "mg", "regel 2.3", "metagameing", "stream"],
    related: [
      "power-rp-fail-rp-und-combat-logging",
      "wie-komme-ich-auf-die-whitelist",
    ],
    body: `Metagaming ist einer der häufigsten Regelverstöße im Roleplay – und einer der ärgerlichsten, weil er das Spiel für alle anderen kaputt macht. Im [Regelwerk](https://nordverkehr.xyz/regeln) steht es unter Punkt 2.3.

## Die Regel

> Das Nutzen von Informationen, die außerhalb des Spiels erlangt wurden, ist verboten.

Dein Charakter weiß nur, was er im Spiel selbst erlebt, gesehen oder gehört hat. Alles andere bist du, nicht er.

## Typische Beispiele

- Du schaust einen Stream und siehst, wo sich eine Gruppe versteckt. Dein Charakter fährt "zufällig" hin.
- Ein Kumpel schreibt dir im Discord, dass er gerade überfallen wird. Dein Charakter taucht auf.
- Du erkennst jemanden an der Stimme seines letzten Charakters und behandelst den neuen Charakter so, als würde deiner ihn kennen.
- Du liest in einem Kanal, wer bei der Polizei arbeitet, und dein Charakter weiß es plötzlich.

![Was du weißt ist nicht, was dein Charakter weiß](/hilfe/metagaming.webp)

## Warum das so ernst genommen wird

Roleplay lebt davon, dass Informationen im Spiel weitergegeben werden: durch Gespräche, Beobachtungen, Fehler. Wer Abkürzungen über Discord oder Streams nimmt, entwertet die Arbeit aller anderen. Das widerspricht auch Grundsatz 1.4: RP vor Gewinn.

## Wie du es vermeidest

1. Trenn bewusst zwischen dir und deinem Charakter.
2. Frag dich bei jeder Entscheidung: Woher weiß mein Charakter das?
3. Wenn du etwas OOC erfahren hast, ignorier es im Spiel – auch wenn es weh tut.
4. Schau keine Streams von Leuten, mit denen du gerade in einer laufenden Situation steckst.

## Hilft alles nichts?

Wenn du dir bei einer konkreten Situation unsicher bist, mach ein [Ticket unter "Frage zum Regelwerk"](/tickets/neu) auf. Wenn du Metagaming bei anderen beobachtet hast, nimm die Kategorie Spielerbeschwerde.`,
  },
  {
    slug: "power-rp-fail-rp-und-combat-logging",
    title: "Power-RP, Fail-RP und Combat Logging",
    summary:
      "Drei Begriffe aus dem Regelwerk, die du kennen musst: was sie bedeuten und wie du sie vermeidest.",
    category: "regelwerk",
    tags: ["power rp", "fail rp", "combat logging", "powerrp", "failrp", "cl"],
    related: [
      "was-ist-metagaming",
      "einspruch-gegen-verwarnung-oder-strafe",
    ],
    body: `Neben Metagaming sind das die drei Begriffe, über die im RP am meisten diskutiert wird. Sie stehen im [Regelwerk](https://nordverkehr.xyz/regeln) unter 2.4 bis 2.6.

![Power-RP, Fail-RP und Combat Logging im Überblick](/hilfe/power-fail-combat.webp)

## Power-RP (2.4)

Power-RP heißt, anderen Spielern Handlungen aufzuzwingen, ohne ihnen eine Chance zur Reaktion zu lassen.

Beispiele:

- "Ich schlage dich bewusstlos und nehme dir alles ab" – in einem Satz, ohne dass der andere reagieren kann.
- Fähigkeiten, die dein Charakter realistisch nicht hat.
- Aktionen, die im Spiel technisch gar nicht möglich wären, einfach behaupten.

Roleplay ist ein Zusammenspiel. Du beschreibst, was du versuchst – der andere entscheidet mit, wie es ausgeht.

## Fail-RP (2.5)

Fail-RP ist unrealistisches Verhalten, das nicht zu einer echten Person passt.

Beispiele:

- Verletzungen ignorieren und nach einem Unfall weiterrennen, als wäre nichts gewesen.
- Mit vorgehaltener Waffe in aller Ruhe Witze reißen und weggehen.
- Fahrzeuge fahren, als gäbe es keine Physik. Auch die Fahrzeugregeln (Abschnitt 4) verlangen realistisches Fahren und das Ausspielen von Unfällen.

## Combat Logging (2.6)

Combat Logging heißt, das Spiel während einer laufenden RP-Situation zu verlassen. Das ist verboten – egal, ob du gerade verlierst, keine Lust mehr hast oder "eh gleich offline wolltest".

Wenn dein Spiel wirklich abstürzt, melde dich so schnell wie möglich wieder an und sag den Beteiligten OOC über die vorgesehenen Wege Bescheid. Ein echter Absturz ist kein Combat Logging, ein "Absturz" im richtigen Moment schon.

## Die Grundidee dahinter

Alle drei Regeln folgen aus den Grundsätzen 1.1 bis 1.4: Realismus, Konsequenzen, Eigenverantwortung, RP vor Gewinn. Wer verlieren kann, spielt besseres RP.

## Hilft alles nichts?

Fragen zu einer konkreten Situation? [Ticket unter "Frage zum Regelwerk"](/tickets/neu). Verstoß beobachtet? Kategorie Spielerbeschwerde.`,
  },
  {
    slug: "fraktionen-und-jobs",
    title: "Fraktionen und Jobs – wie komme ich rein?",
    summary:
      "Wie du in eine Fraktion oder einen Job kommst, wie ein Fraktionswechsel läuft und wann du einen Antrag brauchst.",
    category: "fraktionen-jobs",
    tags: ["fraktion", "job", "fraktionswechsel", "fraktion gruenden", "fraktionen", "arbeit"],
    related: [
      "ticket-oder-antrag",
      "power-rp-fail-rp-und-combat-logging",
    ],
    body: `Ob Behörde, Unternehmen oder Gruppe: Fraktionen und Jobs sind ein großer Teil des Lebens in der Stadt. Hier steht, wie du grundsätzlich reinkommst und wann du einen Antrag brauchst.

![Fraktion: reinkommen im RP, wechseln und gründen per Antrag](/hilfe/fraktionen.webp)

## Reinkommen läuft im RP

Der Normalfall ist simpel: Dein Charakter bewirbt sich, wird angesprochen oder arbeitet sich hoch – im Spiel. Wie genau eine Fraktion aufnimmt, entscheidet sie selbst im Rahmen der Regeln. Frag also im RP nach, nicht per DM bei der Leitung.

Halte dich dabei an Grundsatz 1.4: RP vor Gewinn. Wer nur wegen der Ausrüstung oder des Geldes in eine Fraktion will, merkt schnell, dass das keinen Spaß macht.

## Fraktionswechsel

Ein Wechsel zwischen Fraktionen ist mehr als ein Jobwechsel, weil er andere Spieler und laufende Geschichten betrifft. Deshalb läuft er über einen Antrag:

1. Geh auf [/antraege](/antraege).
2. Wähl **Fraktionswechsel/-gründung**.
3. Beschreib, von wo nach wo du wechseln willst und warum – IC und OOC.
4. Absenden und abwarten.

Denk daran: Du kannst immer nur einen offenen Antrag gleichzeitig haben.

## Eigene Fraktion gründen

Auch dafür ist der Antrag **Fraktionswechsel/-gründung** da. Ein Gründungsantrag sollte mindestens erklären:

- Was die Fraktion ist und was sie im RP beiträgt
- Wer dabei ist
- Warum es so etwas in der Stadt noch nicht gibt oder warum es eine weitere braucht

Ein Name und ein Logo allein reichen nicht.

## Wissen aus der Fraktion

Was du in einer Fraktion erfährst, darf dein nächster Charakter nicht wissen. Das wäre Metagaming.

## Hilft alles nichts?

Allgemeine Fragen zu Fraktionen? Mach ein [Ticket unter Sonstiges](/tickets/neu) auf. Für Wechsel und Gründungen nimm direkt den [Antrag](/antraege).`,
  },
  {
    slug: "wie-stelle-ich-einen-entbannungsantrag",
    title: "Wie stelle ich einen Entbannungsantrag?",
    summary:
      "Gebannt? So stellst du einen Entbannungsantrag, wie er geprüft wird und was danach passiert.",
    category: "banns-antraege",
    tags: ["entbannung", "unban", "bann", "ban", "entbannungsantrag", "gebannt"],
    related: [
      "einspruch-gegen-verwarnung-oder-strafe",
      "ticket-oder-antrag",
    ],
    body: `Wenn du gebannt wurdest, kannst du einen Entbannungsantrag stellen. Das geht ausschließlich hier im Portal, nicht per DM an Teammitglieder.

## Auch ohne Discord möglich

Der Login läuft über Discord. Wenn du auch vom Discord-Server gebannt bist, kannst du dich trotzdem anmelden – du siehst dann nur den Entbannungsantrag. Das ist Absicht: Der Weg zurück soll nicht daran scheitern, dass du nirgends mehr hinschreiben kannst.

## So stellst du den Antrag

1. Melde dich mit Discord an.
2. Geh auf [/antraege](/antraege).
3. Wähl **Entbannung**.
4. Füll alle Felder aus. Beschreib, was passiert ist, wie du es heute siehst und warum du zurück willst.
5. Bestätige die Ehrlichkeitserklärung und schick den Antrag ab.

Die Ehrlichkeitserklärung ist ernst gemeint: **Falsche Angaben führen zur Ablehnung.** Wer etwas weglässt oder schönredet, schadet sich selbst.

![Das Formular für den Entbannungsantrag im Portal](/hilfe/portal-entbannung.webp)

## Wie geprüft wird

- Entbannungsanträge laufen nach dem **Vier-Augen-Prinzip**: Zwei Teammitglieder aus Moderation oder Leitung entscheiden.
- Du bekommst **immer eine Begründung**, egal wie die Entscheidung ausfällt.
- Du kannst nur **einen offenen Antrag** gleichzeitig haben. Mehrfach-Anträge beschleunigen nichts.

## Wenn der Antrag abgelehnt wird

Nach einer Ablehnung gilt eine **Sperrfrist**. Bis sie abgelaufen ist, kannst du keinen neuen Entbannungsantrag stellen. Nutz die Zeit, um die Begründung zu lesen und ernst zu nehmen – ein neuer Antrag mit denselben Argumenten hat wenig Chancen.

## Was einen guten Antrag ausmacht

- Sachlich bleiben, auch wenn du den Bann unfair findest
- Konkret auf den Bann-Grund eingehen
- Keine Vorwürfe an einzelne Teammitglieder

## Hilft alles nichts?

Wenn du technische Probleme mit dem Formular hast, schreib ein [Ticket](/tickets/neu), sofern du Zugriff hast. Inhaltliche Fragen zum Bann gehören in den [Antrag](/antraege) selbst.`,
  },
  {
    slug: "einspruch-gegen-verwarnung-oder-strafe",
    title: "Einspruch gegen eine Verwarnung oder Strafe",
    summary:
      "Du hältst eine Verwarnung oder Strafe für falsch? So legst du sachlich und richtig Einspruch ein.",
    category: "banns-antraege",
    tags: ["einspruch", "verwarnung", "strafe", "warn", "widerspruch", "verwarung"],
    related: [
      "wie-stelle-ich-einen-entbannungsantrag",
      "ticket-oder-antrag",
      "power-rp-fail-rp-und-combat-logging",
    ],
    body: `Teammitglieder sind auch nur Menschen und liegen manchmal daneben. Wenn du eine Verwarnung oder Strafe für falsch hältst, kannst du Einspruch einlegen. Diskussionen im Spiel, im Discord oder per DM bringen dagegen nichts.

## So legst du Einspruch ein

1. Geh auf [/antraege](/antraege).
2. Wähl **Einspruch gegen Verwarnung/Strafe**.
3. Gib an, um welche Verwarnung oder Strafe es geht.
4. Erklär sachlich, warum du sie für falsch hältst.
5. Bestätige die Ehrlichkeitserklärung und schick ab.

![Das Formular für den Einspruch im Portal](/hilfe/portal-einspruch.webp)

## Was in einen Einspruch gehört

- **Was ist passiert?** Aus deiner Sicht, aber vollständig.
- **Warum ist die Entscheidung falsch?** Bezieh dich auf das [Regelwerk](https://nordverkehr.xyz/regeln), wenn möglich mit Regelnummer.
- **Belege**, falls du welche hast, zum Beispiel einen Clip.

Was nicht hineingehört: Beleidigungen, Vorwürfe gegen einzelne Teammitglieder, "andere machen das auch".

## Wie entschieden wird

- Auch Einsprüche laufen nach dem **Vier-Augen-Prinzip**: Zwei Teammitglieder aus Moderation oder Leitung prüfen.
- Du bekommst **immer eine Begründung**.
- Es gibt nur **einen offenen Antrag** gleichzeitig pro Person.
- Nach einer Ablehnung gilt eine **Sperrfrist**, bevor du erneut Einspruch einlegen kannst.

## Ehrlich bleiben

Falsche Angaben führen zur Ablehnung. Wenn du einen Teil der Situation weglässt und das später auffällt, ist der Einspruch erledigt – auch wenn der Rest berechtigt gewesen wäre. Die Grundsätze 1.2 und 1.3 (Konsequenzen, Eigenverantwortung) gelten auch hier.

## Hilft alles nichts?

Wenn du nur verstehen willst, warum eine Regel so ausgelegt wird, ist ein [Ticket unter "Frage zum Regelwerk"](/tickets/neu) oft der bessere Weg. Für den eigentlichen Einspruch nimm den [Antrag](/antraege).`,
  },
  {
    slug: "meine-daten-export-und-loeschung",
    title: "Meine Daten: Export und Löschung",
    summary:
      "Auf der Kontoseite kannst du deine Daten exportieren, dein Konto löschen und DMs vom Bot NV Lotse abschalten.",
    category: "account-daten",
    tags: ["daten", "dsgvo", "export", "loeschen", "konto", "account"],
    related: [
      "ticket-oder-antrag",
      "erste-schritte-auf-nordverkehr",
    ],
    body: `Alles rund um dein Konto im Support-Center findest du unter [/konto](/konto). Dort kannst du deine Daten exportieren, dein Konto löschen und einstellen, ob dir unser Bot schreiben darf.

## Login

Eingeloggt wird ausschließlich über Discord. Es gibt kein separates Passwort, das du vergessen oder zurücksetzen müsstest. Wenn du dich nicht mehr anmelden kannst, liegt es meist an deinem Discord-Login.

## Daten exportieren

1. Geh auf [/konto](/konto).
2. Wähl den Datenexport.
3. Lade die Datei herunter.

Damit bekommst du eine Kopie der Daten, die das Support-Center zu deinem Konto gespeichert hat, zum Beispiel deine Tickets und Anträge.

![Die Seite Konto & Daten im Portal](/hilfe/portal-konto.webp)

## Konto löschen

1. Geh auf [/konto](/konto).
2. Wähl die Löschung und bestätige sie.

Überleg dir das vorher. Wenn du deine Tickets oder Anträge noch brauchst, mach zuerst einen Export. Wer gerade einen offenen Antrag hat, sollte dessen Ergebnis abwarten.

## DMs von NV Lotse abschalten

NV Lotse ist unser Bot. Er schickt dir zum Beispiel Bescheid, wenn sich bei deinem Ticket oder Antrag etwas tut. Wenn du das nicht willst, kannst du die DMs unter [/konto](/konto) abschalten. Die Infos siehst du dann weiterhin hier im Portal – du musst nur selbst nachschauen.

## Hilft alles nichts?

Fragen zu deinen Daten, die hier nicht beantwortet sind? Mach ein [Ticket unter Sonstiges](/tickets/neu) auf.`,
  },
  // ─── Ergänzt (Anleitungen aus dem Discord, für Nordverkehr angepasst) ───
  {
    slug: "so-laeuft-deine-einreise",
    title: "So läuft deine Einreise",
    summary: "Die Einreise ist entspannter als du denkst: reines RP, kein Interview. So bereitest du dich vor.",
    category: "erste-schritte",
    tags: ["einreise", "einreisen", "erster tag", "charakter", "ic", "neu"],
    related: ["erste-schritte-auf-nordverkehr", "wie-komme-ich-auf-die-whitelist", "was-ist-metagaming"],
    body: `Schön, dass du den Weg zu uns gefunden hast! Die Einreise ist **entspannter, als du denkst**. Sie hilft uns dabei, die richtige Community aufzubauen und unpassende Spieler wie Trolle oder Leute ohne RP-Interesse vorab herauszufiltern.

## Das solltest du vorher erledigen

### 1. Deinen Charakter zum Leben erwecken

Bei uns spielst du nicht dich selbst, sondern eine eigene Figur. Überleg dir vorab: Wer ist dein Charakter, woher kommt er und was treibt ihn an? Eine durchdachte Hintergrundgeschichte macht den Unterschied zum echten RP-Erlebnis.

### 2. Tastenbelegung checken

Wirf vorher einen Blick in die Tastenbelegung im Discord, damit du im Spiel nicht nach Tasten suchen musst.

### 3. Das Regelwerk verinnerlichen

Lies unbedingt das [Regelwerk](https://nordverkehr.xyz/regeln). Bei uns gilt: **Rolle spielen statt OOC quatschen.** Auch die **komplette Einreise findet IC (In Character) statt** – also direkt im RP, von der ersten Sekunde an.

### 4. Regeländerungen im Blick behalten

Das Regelwerk entwickelt sich weiter. Änderungen kündigen wir im Discord an – schau dort regelmäßig rein.

### 5. Unsere Werte kennenlernen

Was Nordverkehr ausmacht und wofür wir als Server stehen, findest du im Discord. Schau kurz rein, dann weißt du, worauf es uns ankommt.

## So läuft deine Einreise ab

Kein Interview, keine Fangfragen – deine Einreise ist **reines RP**. Spiel deinen Charakter, lass dich auf neue Situationen ein und zeig uns, dass du Lust hast, dich in unsere Welt einzufinden. Bleib entspannt und in deiner Rolle – der Rest ergibt sich von selbst.

![Check-in am Flughafen – hier beginnt deine Einreise](/hilfe/einreise-checkin.webp)

Viel Erfolg – wir sehen uns in Hamburg!`,
  },
  {
    slug: "fivem-profiler-aufnahme",
    title: "FiveM-Profiler-Aufnahme erstellen",
    summary: "Lags oder FPS-Einbrüche? Mit einer Profiler-Aufnahme sieht das Team, was bei dir bremst.",
    category: "technik-verbindung",
    tags: ["profiler", "lag", "fps", "ruckeln", "performance", "profiler json"],
    related: ["grafik-einstellungen-fuer-mehr-fps", "fivem-cache-loeschen", "fivem-startet-nicht"],
    body: `Wenn du Lags oder FPS-Einbrüche hast, hilft dem Team eine **Profiler-Aufnahme**. Damit sehen wir genau, welche Skripte bei dir Leistung fressen.

## 1. FiveM im Beta-Modus starten

1. FiveM öffnen, oben rechts auf das **Zahnrad** (Einstellungen) klicken.
2. Unter **Game** den **Update Channel** auf **Beta** setzen.
3. FiveM neu starten und auf den Server joinen.

## 2. Konsole öffnen und Aufnahme starten

1. Drück **F8**, um die Client-Konsole zu öffnen.
2. Gib diesen Befehl ein:

\`\`\`
profiler record 1500
\`\`\`

Damit werden die nächsten 1500 Frames aufgezeichnet.

> Nimm die Aufnahme dort auf, wo das Problem auftritt – also genau dann, wenn es laggt oder die FPS einbrechen.

## 3. Aufnahme als Datei speichern

Wenn die Aufnahme fertig ist, gib in der F8-Konsole ein:

\`\`\`
profiler saveJSON profilerNV
\`\`\`

![F8-Konsole mit den beiden Profiler-Befehlen](/hilfe/profiler-konsole.webp)

## 4. Datei finden

Die Datei liegt im FiveM-Ordner. Drück **Windows + R**, füg diesen Pfad ein und bestätige mit Enter:

\`\`\`
%localappdata%\\FiveM\\FiveM.app\\citizen\\profilerNV
\`\`\`

## 5. Datei ans Team schicken

1. Pack die Datei als **.zip**, sie ist oft recht groß.
2. Lade die ZIP-Datei bei einem Datei-Dienst hoch (z. B. Google Drive oder OneDrive) und erstell einen Freigabe-Link.
3. Mach ein [Ticket in der Kategorie Technik](/tickets/neu) auf und schreib den Link in deine Nachricht. Erwähn kurz, wann und wo das Problem auftritt.

Im Portal kannst du nur Bilder direkt hochladen – deshalb der Umweg über den Link.`,
  },
  {
    slug: "cfx-identifier-wechseln",
    title: "CFX.re-Identifier wechseln",
    summary: "Hat sich deine license nach einem PC-Reset geändert? So stellst du die richtige Identität wieder ein.",
    category: "technik-verbindung",
    tags: ["identifier", "license", "cfx", "identitaet", "pc reset", "charakter weg"],
    related: ["mit-dem-server-verbinden", "fivem-startet-nicht"],
    body: `Durch das CFX.re-Sicherheitsupdate und einen PC-Reset kann sich dein **license-Identifier** ändern. Dann wirkt es so, als wäre dein Fortschritt weg – dein Charakter hängt aber an der alten Identität. So wechselst du zurück:

## Anleitung

1. FiveM starten.
2. Oben rechts auf das **Zahnrad** (Einstellungen) klicken.
3. Zum Reiter **Account** wechseln.
4. Unter **Linked Identities** bzw. **Default Identity** auf **Change Default** klicken und bei der gewünschten Identität **Set as default** wählen.
5. FiveM neu starten.

![FiveM-Einstellungen: Account, Linked Identities, Change Default und Set as default](/hilfe/cfx-identitaet.webp)

Die richtige Identität erkennst du meist am Datum unter **Last active** – das ist die, mit der du zuletzt bei uns gespielt hast.

## Hinweis

Die Option wird nur angezeigt, wenn deinem CFX.re-Konto **mehrere Identitäten** zugeordnet sind. Fehlt sie, lässt sich der Identifier nicht selbst wechseln. Mach dann ein [Ticket in der Kategorie Technik](/tickets/neu) auf – und schick deine license-IDs nie öffentlich in Kanäle.`,
  },
  {
    slug: "grafik-einstellungen-fuer-mehr-fps",
    title: "Grafik-Einstellungen für mehr FPS",
    summary: "Mit diesen GTA-Grafikeinstellungen holst du auf dem RP-Server spürbar mehr FPS raus.",
    category: "technik-verbindung",
    tags: ["fps", "grafik", "einstellungen", "ruckeln", "performance", "lag"],
    related: ["fix-fuer-textur-bugs", "fivem-profiler-aufnahme", "fivem-cache-loeschen"],
    body: `Auf einem RP-Server brauchst du keine Grafik auf Anschlag. Mit diesen Einstellungen holst du spürbar mehr FPS raus. Zu finden unter **Einstellungen → Grafik** bzw. **Erweiterte Grafik**.

## Die wichtigsten Einstellungen

| Einstellung | Empfehlung | Warum |
| --- | --- | --- |
| Erweiterte Darstellungsdistanz | **0** | Rendert weit entfernte Objekte. Kostet viel CPU. |
| Erweiterte Schattendistanz | **0** | Weit entfernte Schatten kosten CPU- und GPU-Leistung. |
| Bevölkerungsdichte & -vielfalt | **0** | Weniger NPCs und Verkehr – auf RP-Servern nicht nötig. |
| Grasqualität | **Normal** | Verringert die CPU-Last deutlich. |
| Schattenqualität | **Normal** | Guter Kompromiss zwischen Optik und Leistung. |
| Renderauflösung | **native Auflösung** | z. B. 1920×1080. Bei GPU-Limit kann weniger mehr FPS bringen. |
| Erweitertes Texturbudget | **40–60 %** | Auf 0 % laden Texturen nicht richtig, siehe [Textur-Fix](/hilfe/technik-verbindung/fix-fuer-textur-bugs). Bei wenig VRAM eher 40 %. |
| VSync | **Aus** | Weniger Input-Lag, oft mehr FPS. Nur bei starkem Tearing einschalten. |

![Erweiterte Grafik: Erweiterte Darstellungsdistanz auf 0](/hilfe/textur-darstellungsdistanz.webp)

![Erweitertes Texturbudget: 0 % ist falsch, 40–60 % empfohlen](/hilfe/textur-budget.webp)

## Immer noch Ruckler?

- [Cache leeren](/hilfe/technik-verbindung/fivem-cache-loeschen) – hilft oft nach Updates.
- Läuft es nur an bestimmten Orten schlecht, schick uns eine [Profiler-Aufnahme](/hilfe/technik-verbindung/fivem-profiler-aufnahme).`,
  },
  {
    slug: "fix-fuer-textur-bugs",
    title: "Texturen laden nicht richtig? So behebst du's",
    summary: "Fehlende Straßen, weiße Flächen, Löcher in der Map? Zwei Grafik-Einstellungen lösen fast alle Textur-Bugs.",
    category: "technik-verbindung",
    tags: ["textur", "texturen laden nicht", "map bug", "texturbudget", "weisse flaechen", "texture loss"],
    related: ["fivem-cache-loeschen", "grafik-einstellungen-fuer-mehr-fps"],
    body: `Hast du Probleme mit **nicht ladenden Texturen** – fehlende Straßen, weiße oder verwaschene Flächen, Gebäude ohne Details oder Löcher in der Map? Dann liegt es fast immer an zwei Grafik-Einstellungen.

Beide findest du unter **Einstellungen → Erweiterte Grafik**.

## 1. Erweitertes Texturbudget auf 40–60 %

Das ist der häufigste Grund. Steht der Regler **Erweitertes Texturbudget** (englisch: *Extended Texture Budget*) auf **0 %**, hat das Spiel zu wenig Platz für Texturen: Boden, Hänge und Gebäude bleiben weiß oder grau, Details fehlen.

- **0 % – falsch!** Texturen laden nicht oder verschwinden.
- **40–60 % – empfohlen.** Alles lädt sauber, ohne die Grafikkarte zu überlasten.

![Erweitertes Texturbudget: 0 % ist falsch, 40–60 % empfohlen](/hilfe/textur-budget.webp)

Hast du eine Grafikkarte mit wenig Videospeicher (4 GB oder weniger), nimm eher **40 %**.

## 2. Erweiterte Darstellungsdistanz auf 0

Setz die **Erweiterte Darstellungsdistanz auf 0** (Regler ganz nach links). Weit entfernte Objekte belasten sonst das Laden der Texturen in deiner Nähe.

![Erweiterte Grafik: Erweiterte Darstellungsdistanz auf 0 stellen](/hilfe/textur-darstellungsdistanz.webp)

## 3. Spiel neu starten

Starte das Spiel einmal **komplett** neu – nicht nur neu verbinden. Erst dann greifen die Einstellungen richtig.

## Fertig!

Danach sollten die Texturen auf Nordverkehr wieder sauber laden.

## Immer noch Probleme?

- [FiveM-Cache leeren](/hilfe/technik-verbindung/fivem-cache-loeschen) – das hilft bei hartnäckigen Fällen.
- Treten die Bugs immer an derselben Stelle auf, mach ein [Ticket in der Kategorie Bug](/tickets/neu) auf und schreib dazu, **wo** genau – am besten mit Screenshot.`,
  },
  {
    slug: "fivem-cache-loeschen",
    title: "FiveM-Cache löschen",
    summary: "Ladefehler, fehlende Texturen oder Abbrüche? So leerst du den FiveM-Cache in einer Minute.",
    category: "technik-verbindung",
    tags: ["cache", "cache leeren", "cache loeschen", "ladefehler", "texturen", "kesch"],
    related: ["fix-fuer-textur-bugs", "fivem-startet-nicht", "mit-dem-server-verbinden"],
    body: `Das Leeren des FiveM-Caches hilft bei **Ladefehlern, fehlenden Texturen oder Bugs**. So geht's:

## 1. Cache-Ordner öffnen

1. Schließ FiveM komplett.
2. Drück **Windows + R**, um das Ausführen-Fenster zu öffnen.
3. Gib diesen Pfad ein und bestätige mit Enter:

\`\`\`
%LOCALAPPDATA%\\FiveM\\FiveM.app\\data
\`\`\`

![Ausführen-Fenster mit dem Pfad zum FiveM-Cache](/hilfe/cache-ausfuehren.webp)

## 2. Inhalt löschen

1. Markiere **alle Dateien und Ordner** (Strg + A).
2. Lösch sie (Entf).

![Ordner im FiveM-Cache: cache, game-storage, nui-storage, server-cache, server-cache-priv](/hilfe/cache-ordner.webp)

> Tipp: Wenn du nicht alles neu herunterladen willst, lass den Ordner **game-storage** stehen und lösch nur **cache**, **server-cache** und **server-cache-priv**. Hilft das nicht, lösch beim nächsten Mal alles.

## 3. FiveM neu starten

Starte FiveM neu – die benötigten Dateien werden automatisch neu erstellt.

## Wann sollte man den Cache löschen?

- Bei **fehlenden Texturen** oder **Verbindungsabbrüchen**
- Nach größeren Server-Updates, wenn etwas komisch aussieht
- Zur Wartung etwa **alle 4–6 Wochen**

## Hinweis

Beim ersten Start und Verbinden werden alle Ressourcen neu geladen. Das dauert **einmalig etwas länger** – das ist normal.

## Fertig!

Dein Cache ist bereinigt und du kannst Nordverkehr wieder ohne Probleme genießen.`,
  },
  {
    slug: "teamspeak-join-und-leave-sounds-abschalten",
    title: "TeamSpeak: Join- & Leave-Sounds abschalten",
    summary: "Die ständigen Sounds beim Betreten und Verlassen von Channels nerven? In vier Klicks sind sie weg.",
    category: "teamspeak-saltychat",
    tags: ["teamspeak", "sounds", "join sound", "leave sound", "ts3", "toene"],
    related: ["teamspeak-3-einrichten", "saltychat-verbindet-nicht"],
    body: `Die ständigen Sounds beim Betreten und Verlassen von Channels können auf Dauer ganz schön stören – gerade mit SaltyChat, wo ständig gewechselt wird. Zum Glück lassen sie sich mit wenigen Klicks abschalten.

## Anleitung

1. **TeamSpeak öffnen** – starte deinen TeamSpeak-Client ganz normal.
2. **Optionen öffnen** – oben in der Menüleiste auf **Extras** klicken und **Optionen** wählen.
3. **Sounds deaktivieren** – links den Reiter **Meldungen** wählen. Unter **Sound Pack** auf **Sounds deactivated** stellen.
4. **Speichern** – mit **OK** bestätigen und TeamSpeak neu starten.

![TeamSpeak-Optionen: Reiter Meldungen, Sound Pack auf „Sounds deactivated“](/hilfe/teamspeak-sounds.webp)

## Das war's schon!

Die nervigen Join- und Leave-Geräusche gehören damit der Vergangenheit an.

> Tipp: Willst du später doch wieder Sounds, geh den gleichen Weg zurück und wähl ein anderes Sound Pack.`,
  },
];
