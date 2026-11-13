# Nordverkehr Support-Center

Hilfe-Center, Tickets und Anträge für **Nordverkehr** (Hamburg-Roleplay, Start auf GTA 5 / FiveM, später GTA 6) – im Web **und** über Discord, alles landet an einem Ort.

**Live:** `https://support.nordverkehr.xyz` · **Lizenz:** [AGPL-3.0](LICENSE) · Name und Logo „Nordverkehr“ sind nicht freigegeben – siehe [NOTICE.md](NOTICE.md).

---

## Inhalt

- [Funktionen](#funktionen)
- [Architektur: Vercel ohne Worker](#architektur-vercel-ohne-worker)
- [Ein Bot, zwei Apps](#ein-bot-zwei-apps)
- [Schnellstart (lokal)](#schnellstart-lokal)
- [Deployment](#deployment) – GitHub, Vercel, Domain, Discord, Datenbank
- [Umgebungsvariablen](#umgebungsvariablen)
- [Rollen & Rechte](#rollen--rechte)
- [Betrieb](#betrieb) – Hintergrundarbeiten, Worker-Frage, KI, Datenschutz
- [Entwicklung](#entwicklung) – Struktur, Skripte, Tests
- [Lizenz](#lizenz)

---

## Funktionen

### Hilfe-Center (öffentlich)
- Startseite „Wobei können wir *helfen?*“ mit großer Suche (Live-Vorschläge) und 8 Kategorien.
- Artikel in Markdown mit Inhaltsverzeichnis, „Zuletzt aktualisiert“, verwandten Artikeln und anonymem „Hat dir das geholfen?“ (+ Kommentar).
- **Volltextsuche mit Tippfehler-Toleranz** (eigener Index, kein Atlas Search nötig): „whitlist“, „salty chat“, „metagamming“ finden die richtigen Artikel. Suchbegriffe ohne Treffer landen anonym in der Statistik.
- **Statusseite:** Gameserver (FiveM, Spieler online, 60 s gecacht), TeamSpeak, bekannte Probleme und Wartungen.
- 14 Start-Artikel (u. a. „SaltyChat verbindet nicht“, „Wie komme ich auf die Whitelist?“, „FiveM startet nicht“, „Was ist Metagaming?“, „Wie stelle ich einen Entbannungsantrag?“).

### Tickets – Web und Discord verbunden
- Kategorien Technik, Spielerbeschwerde, Bug, Frage zum Regelwerk, Sonstiges – je Kategorie eigene Pflichtfelder (Beschwerde: Datum, Uhrzeit, Beteiligte, Clip-Link oder Begründung).
- Vor dem Absenden: passende Hilfe-Artikel („Vielleicht hilft dir das schon“).
- Anhänge: Screenshots (neu codiert, ohne Metadaten, max. 8 MB, max. 5) und Clip-Links (YouTube, Twitch, Medal).
- **Discord:** Panel mit Knopf → Kategorie-Auswahl → Formular → **privater Thread** (nur Spieler + Support). Nachrichten aus dem Web erscheinen im Thread und umgekehrt. Alle Tickets – egal wo erstellt – im Web-Dashboard.
- Status offen → in Bearbeitung → wartet auf Spieler → gelöst → geschlossen, automatisch nach Antworten. DM vom NV Lotse bei jeder Antwort (abschaltbar).
- Bewertung 1–5 Sterne + Kommentar (auch per Knopf in der DM), Auto-Schließen nach X Tagen mit Erinnerung vorher, Transkript für Spieler und Team.

### Anträge (getrennt von Tickets)
- Entbannung, Einspruch gegen Verwarnung/Strafe, Namensänderung, Charakter-Tod (CK), Rückerstattung, Fraktionswechsel/-gründung, Sonstiges – **im Team-Bereich frei verwaltbar** (Felder, Pflichtangaben, wer sieht/entscheidet, Vier-Augen, Sperrfristen je Bannart).
- **Gebannte Spieler** loggen sich ganz normal mit Discord ein und sehen **nur** den Entbannungsantrag und den Stand ihrer Anträge.
- Ehrlichkeits-Checkbox, nur ein offener Antrag je Art, Sperrfrist nach Ablehnung.
- **Vier-Augen-Prinzip:** Vorschlag + Zustimmung einer zweiten Person (Moderation/Leitung). Wer die Strafe ausgesprochen hat, zählt nie als zweite Person.
- Ergebnisse mit Pflicht-Begründung, die der Spieler sieht; interne Diskussion, Pro/Contra-Abstimmung, Bausteine je Antragsart, Audit-Log, optional Discord-Log-Channel.
- Schnittstelle für Bann-Daten aus dem Bann-System (z. B. txAdmin) vorbereitet: `src/lib/requests/ban-provider.ts`.

### Team-Bereich
- Tickets als Liste und **Kanban** (Drag & Drop), Filter, Suche, Priorität, Tags, Claim, Weitergabe, interne Notizen.
- Nachrichtenbausteine mit Platzhaltern und Live-Vorschau, Spielerprofil (Tickets, Anträge, Banns/Verwarnungen, Notizen).
- Artikel-Editor mit Vorschau und Entwurf/Veröffentlicht, Statusseite pflegen.
- Statistiken (Kategorie/Zeitraum, erste Antwort, Lösungszeit, Zufriedenheit, Auslastung, Suchen ohne Treffer, Artikel mit vielen „Nein“), Audit-Log, CSV-Export.
- **KI (optional):** Antwort-Entwürfe auf Basis der Hilfe-Artikel, Zusammenfassungen, Vorschlag für Kategorie/Priorität. Bei Anträgen nur neutrale Zusammenfassung. Die KI sendet nie selbst und entscheidet nichts.

---

## Architektur: Vercel ohne Worker

Vercel-Funktionen sind serverless – ein dauerhaft verbundener Discord-Bot (Gateway) läuft dort nicht. Das Support-Center braucht **keinen Dauer-Worker**:

```
 Spieler/Team (Browser) ──► support.nordverkehr.xyz (Vercel, fra1) ──► MongoDB Atlas (DB nordverkehr_support)
                               │  Seiten, Server Actions, API
 Discord (HTTP-Interaktionen) ─┤  /api/discord/interactions  ── Weiterleitung ──► bewerbung.nordverkehr.xyz
                               │  Outbox → Discord REST (DMs, Thread-Posts)
                               └─ Hintergrundarbeiten (Cron + gedrosselt bei Seitenaufrufen)
```

| Richtung | Wie |
|---|---|
| Knöpfe, Formulare, Slash-Befehle | HTTP-Interactions-Endpoint auf Vercel (Signatur geprüft) |
| Web → Discord | Outbox: Nachricht wird gespeichert und sofort per REST gepostet; Wiederholung mit Backoff |
| Discord → Web | **Abholen per REST** (`GET /channels/{thread}/messages?after=…`): sobald jemand das Ticket im Portal öffnet, per Knopf „Antwort ins Ticket“ im Thread und bei den Hintergrundarbeiten. Idempotent (jede Discord-Nachricht nur einmal), eigene Spiegel-Nachrichten werden nie zurückübernommen. |
| Auto-Close, Erinnerungen, Löschfristen | `/api/cron/housekeeping` (Vercel Cron) **und** gedrosselt bei normalen Seitenaufrufen (höchstens alle 5 Min., mit Sperre in der DB) |

Was ohne Worker anders ist: Discord-Nachrichten stehen nicht „in derselben Sekunde“ im Portal, sondern spätestens, wenn jemand das Ticket öffnet. Rollenänderungen greifen nach höchstens 60 s (Cache), nicht sofort.

---

## Ein Bot, zwei Apps

Bewerbungsportal und Support-Center nutzen **denselben Bot „NV Lotse“**. Discord erlaubt pro Bot aber nur **eine** Interactions-URL. Lösung:

- **Das Support-Center ist der Router.** Die Interactions-URL zeigt auf `https://support.nordverkehr.xyz/api/discord/interactions`.
- Alles mit Präfix `nvs:` und die Befehle `/ticket`, `/antrag`, `/support-panel` bearbeitet das Support-Center.
- Alles andere (`nv:…`-Knöpfe, `/bewerbung`, `/offen`, `/claim`) wird **unverändert** (Original-Body + Signatur-Header) an `INTERACTIONS_FORWARD_URL` weitergereicht. Das Bewerbungsportal prüft die Discord-Signatur wie bisher – am Routing muss dort nichts geändert werden.
- Slash-Befehle werden **einzeln per POST** registriert (nie `PUT`/Bulk-Overwrite) – die Befehle beider Apps bleiben bestehen.
- Eigene Datenbank (`nordverkehr_support`) und zusätzlich Collection-Präfix `sup_` – keine Kollision, selbst bei falscher URL.

**Einzige Änderung im Bewerbungsportal:** Dessen Admin-Knopf „Knopf ‚Übernehmen‘ einrichten“ würde die Interactions-URL wieder auf sich selbst setzen. Der Patch [`docs/bewerbungsportal-interactions.patch`](docs/bewerbungsportal-interactions.patch) (≈ 20 Zeilen) sorgt dafür, dass er das nicht mehr tut, sobald `DISCORD_INTERACTIONS_ROUTER_URL` gesetzt ist:

```bash
cd nordverkehr-bewerbungsportal
```
```bash
git apply ../nordverkehr-support/docs/bewerbungsportal-interactions.patch
```

Danach im Bewerbungsportal (Vercel) `DISCORD_INTERACTIONS_ROUTER_URL=https://support.nordverkehr.xyz/api/discord/interactions` setzen und neu deployen.

> Risiko: Discord erwartet eine Antwort in 3 Sekunden. Die Weiterleitung kostet einen zusätzlichen Hop (beide in `fra1`, typisch < 300 ms). Antwortet das Bewerbungsportal nicht, bekommt der Nutzer eine ehrliche Meldung statt „Interaktion fehlgeschlagen“. Fällt das Support-Center aus, gehen auch die Knöpfe des Bewerbungsportals nicht.

---

## Schnellstart (lokal)

Voraussetzung: Node.js 22 (≥ 22.12).

```bash
npm install
```
```bash
cp .env.example .env
```

In `.env` mindestens `AUTH_SECRET` setzen und für den Start ohne Discord `DEV_LOGIN="true"` eintragen (`DISCORD_GUILD_ID` leer lassen). Dann in einem eigenen Terminal die lokale MongoDB starten (Port 27018, damit das Bewerbungsportal auf 27017 parallel laufen kann):

```bash
npm run db:dev
```

Im zweiten Terminal:

```bash
npm run db:push
```
```bash
npm run db:seed
```
```bash
npm run dev
```

→ http://localhost:3000. Auf `/login` gibt es einen **Dev-Login** für die Demo-Nutzer: Ole (Leitung), Hanna und Kai (Moderation), Jonas (Support), Finn und Mia (Spieler), Tjark (vom Discord gebannt). Die Demo enthält u. a. eine Beschwerde über Jonas (die Jonas nicht sieht), einen Entbannungsantrag von Tjark (Bann ausgesprochen von Hanna) und eine geplante Wartung. Demo-Nutzer bekommen nie DMs. In Produktion ist der Dev-Login immer aus.

---

## Deployment

### 1. GitHub

Das Repository heißt `nordverkehr-support`. Keine Secrets committen – `.env*` ist ignoriert, nur `.env.example` liegt im Repo.

```bash
git push -u origin main
```

### 2. Datenbank (MongoDB Atlas)

- Gleicher Cluster wie das Bewerbungsportal ist okay – aber **eigene Datenbank**: `…mongodb.net/nordverkehr_support?retryWrites=true&w=majority`.
- Cluster in der EU (Frankfurt), DB-Nutzer mit `readWrite`, Netzwerkzugriff `0.0.0.0/0` (Vercel hat keine festen IPs).
- Schema/Indizes: einmal lokal mit der Atlas-URL `npm run db:push` ausführen. Basisdaten (Kategorien, Artikel, Antragsarten, Bausteine) legt das Portal beim ersten Start einer leeren Datenbank **selbst** an – ohne Demo-Daten.

### 3. Vercel

1. *Add New → Project* → GitHub-Repo `nordverkehr-support` importieren. Framework „Next.js“ wird erkannt.
2. Build-Einstellungen kommen aus [`vercel.json`](vercel.json): `npm ci`, `npm run build` (= `prisma generate && next build`), Region `fra1`.
3. **Node.js-Version:** *Settings → Build and Deployment → Node.js Version* auf **22.x** (oder höher) stellen (`engines` in `package.json`: `22.x`).
4. Alle [Umgebungsvariablen](#umgebungsvariablen) unter *Settings → Environment Variables* eintragen (Production; `DEV_LOGIN` **nicht**).
5. Deployen. Jeder Push auf `main` deployt automatisch, Pull Requests bekommen Preview-Deployments.
6. **Cron:** `vercel.json` ruft `/api/cron/housekeeping` zweimal täglich auf (Vercel schickt `Authorization: Bearer $CRON_SECRET`). Auf dem **Hobby-Plan** laufen Cron-Jobs höchstens einmal täglich pro Eintrag – reicht, weil die Hintergrundarbeiten zusätzlich bei Seitenaufrufen laufen. Für pünktlichere Erinnerungen:
   - **Pro-Plan:** Schedule auf `*/10 * * * *` ändern, oder
   - **kostenloser externer Scheduler** (z. B. cron-job.org): alle 10 Minuten `GET https://support.nordverkehr.xyz/api/cron/housekeeping` mit Header `Authorization: Bearer <CRON_SECRET>`.

### 4. Domain `support.nordverkehr.xyz`

1. Vercel → Projekt → *Settings → Domains* → `support.nordverkehr.xyz` hinzufügen.
2. Beim Domain-Anbieter von `nordverkehr.xyz` einen **CNAME**-Eintrag anlegen:

   | Typ | Name/Host | Wert/Ziel | TTL |
   |---|---|---|---|
   | CNAME | `support` | `cname.vercel-dns.com` | Standard (z. B. 3600) |

   Zeigt Vercel unter *Domains* einen projektspezifischen Wert an (z. B. `…vercel-dns-0xx.com`), diesen verwenden. Liegt die Domain bei Cloudflare: Proxy (orange Wolke) für diesen Eintrag **aus**.
3. Warten, bis Vercel „Valid Configuration“ zeigt – das SSL-Zertifikat kommt automatisch.
4. `NEXT_PUBLIC_APP_URL` auf `https://support.nordverkehr.xyz` setzen und neu deployen.

### 5. Discord Developer Portal (App „NV Lotse“)

1. **OAuth2 → Redirects** ergänzen (die des Bewerbungsportals bleiben):
   - `https://support.nordverkehr.xyz/api/auth/callback/discord`
   - `http://localhost:3000/api/auth/callback/discord` (Entwicklung)
2. **Bot → Privileged Gateway Intents:** **Message Content Intent** einschalten. Ohne ihn liefert Discord die Texte aus Ticket-Threads leer (gilt auch für REST-Abrufe). Das Bewerbungsportal stört das nicht.
3. **Bot-Rechte** auf dem Server (Bot-Rolle bzw. im Ticket-Channel):
   - Kanäle ansehen, Nachrichten senden, Links einbetten, Nachrichtenverlauf lesen
   - **Private Threads erstellen**, **In Threads Nachrichten senden**, **Threads verwalten**
   - **Mitglieder bannen** – nur, um die Bannliste lesen zu können (Erkennung gebannter Spieler). Der Bot bannt niemanden.
4. **Ticket-Channel** anlegen (z. B. `#support`): Spieler dürfen lesen, aber nicht schreiben; die **Support-Rolle** bekommt dort „Threads verwalten“ – damit sieht das Team alle privaten Ticket-Threads.
5. Im Portal als Leitung: *Team-Bereich → Einstellungen & Discord*:
   - **Befehle registrieren** (`/ticket`, `/antrag`, `/support-panel`)
   - **Interactions-URL setzen** (erst, wenn `INTERACTIONS_FORWARD_URL` gesetzt und der Patch im Bewerbungsportal eingespielt ist)
   - **Panel posten** (oder in Discord `/support-panel` im Ticket-Channel)
   - Die Diagnose oben zeigt, ob Token, URL, Intent, Rollen und Channels passen.

> Beschwerden über Teammitglieder bekommen **nie** einen Discord-Thread: Wer „Threads verwalten“ hat, sieht alle privaten Threads – Discord kann ein beschuldigtes Mod-Mitglied dort nicht aussperren. Diese Tickets laufen nur im Portal.

---

## Umgebungsvariablen

| Name | Wofür | Woher | Pflicht |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Adresse des Support-Centers (Links in DMs, Interactions-URL) | `https://support.nordverkehr.xyz` | ✅ |
| `NEXT_PUBLIC_MAIN_SITE_URL` | Hauptseite (Navigation, Impressum, Regelwerk) | `https://nordverkehr.xyz` | optional (Standard) |
| `NEXT_PUBLIC_BEWERBUNG_URL` | Link zum Bewerbungsportal | `https://bewerbung.nordverkehr.xyz` | optional (Standard) |
| `NEXT_PUBLIC_DISCORD_INVITE` | Discord-Einladung | dauerhafter Invite-Link | optional (Standard) |
| `NEXT_PUBLIC_RULES_URL` | Regelwerk | Standard `<Hauptseite>/regeln` | optional |
| `DATABASE_URL` | MongoDB (eigene DB `nordverkehr_support`) | Atlas → Connect → Drivers | ✅ |
| `DATABASE_NAME` | Erzwingt den Datenbanknamen (`nordverkehr_support`) – nötig, wenn ihr die Atlas-Verbindung des Bewerbungsportals (`DATABASE_URL_MONGODB_URI` der Vercel-Integration) mitbenutzt | `nordverkehr_support` | empfohlen |
| `AUTH_SECRET` | Verschlüsselung der Sitzungen | `npx auth secret` | ✅ |
| `AUTH_DISCORD_ID` | Discord-Login | Developer Portal → OAuth2 → Client ID | ✅ |
| `AUTH_DISCORD_SECRET` | Discord-Login | Developer Portal → OAuth2 → Client Secret | ✅ |
| `AUTH_TRUST_HOST` | Host-Header hinter Vercel vertrauen | `true` | ✅ |
| `DISCORD_BOT_TOKEN` | Bot „NV Lotse“ (derselbe wie im Bewerbungsportal) | Developer Portal → Bot → Token | ✅ |
| `DISCORD_PUBLIC_KEY` | Signaturprüfung der Interaktionen | Developer Portal → General → Public Key | optional (sonst per Token geholt) |
| `DISCORD_GUILD_ID` | Nordverkehr-Server | Rechtsklick auf Server → ID kopieren (Entwicklermodus) | ✅ |
| `SUPPORT_ROLE_ID` | Rolle Support | Rechtsklick auf Rolle → ID kopieren | ✅ |
| `MODERATION_ROLE_ID` | Rolle Moderation | ebenso | ✅ |
| `LEITUNG_ROLE_ID` | Rolle Leitung | ebenso | ✅ |
| `DISCORD_TICKET_CHANNEL_ID` | Channel für Panel und private Ticket-Threads | Rechtsklick auf Channel → ID | empfohlen (ohne: Tickets nur im Web) |
| `DISCORD_LOG_CHANNEL_ID` | Log neuer Tickets/Anträge und Entscheidungen | Rechtsklick auf Channel → ID | optional |
| `INTERACTIONS_FORWARD_URL` | Weiterleitung fremder Interaktionen ans Bewerbungsportal | `https://bewerbung.nordverkehr.xyz/api/discord/interactions` | ✅ (sonst gehen dessen Knöpfe nicht) |
| `ROLE_CACHE_TTL_SECONDS` | Wie oft Rollen neu geprüft werden | Standard 60 | optional |
| `BAN_CACHE_TTL_SECONDS` | Wie oft der Bann-Status neu geprüft wird | Standard 300 | optional |
| `CRON_SECRET` | Schutz von `/api/cron/housekeeping` | zufällig, ≥ 16 Zeichen (`openssl rand -hex 24`) | ✅ |
| `TICKET_ID_PREFIX` / `REQUEST_ID_PREFIX` | ID-Präfixe | Standard `NVS` / `NVA` | optional |
| `FIVEM_SERVER_URL` | Statusseite: Server direkt (`/dynamic.json`) | z. B. `http://<IP>:30120` | optional |
| `FIVEM_CFX_CODE` | Statusseite: alternativ cfx.re-Join-Code | Server-Browser / `cfx.re/join/<code>` | optional |
| `TEAMSPEAK_WEBQUERY_URL` / `TEAMSPEAK_WEBQUERY_KEY` | TeamSpeak-Status inkl. Nutzerzahl (WebQuery, TS3 ≥ 3.12) | TeamSpeak-Server-Konfiguration | optional |
| `TEAMSPEAK_HOST` / `TEAMSPEAK_PORT` | TeamSpeak nur als „erreichbar ja/nein“ (TCP) | Server-Adresse, Port z. B. 10011 | optional |
| `ANTHROPIC_API_KEY` | KI-Entwürfe (kostenpflichtig) | [Claude Console](https://platform.claude.com) → API Keys | optional |
| `AI_MODEL_DEFAULT` / `AI_MODEL_FAST` | Modelle | Standard `claude-sonnet-5-5` / `claude-haiku-5-5` | optional |
| `DEV_LOGIN` | Dev-Login ohne Discord – **nur lokal** | `true` | nie in Produktion |

Im **Bewerbungsportal** zusätzlich: `DISCORD_INTERACTIONS_ROUTER_URL=https://support.nordverkehr.xyz/api/discord/interactions` (nach Einspielen des Patches).

---

## Rollen & Rechte

Rollen kommen aus Discord und werden serverseitig geprüft (Bot, Cache 60 s, fail closed; Proxy + Prüfung in jeder Seite, Action und API).

| | Support | Moderation | Leitung |
|---|:-:|:-:|:-:|
| Team-Bereich, normale Tickets, Artikel, Statusseite | ✅ | ✅ | ✅ |
| Beschwerden über Teammitglieder | – | ✅ ¹ | ✅ ¹ |
| Entbannung, Einspruch, Rückerstattung, CK | – | ✅ | ✅ |
| Namensänderung, Fraktion, Sonstiges sehen | ✅ | ✅ | ✅ |
| Entscheiden | je Antragsart | je Antragsart | ✅ |
| Banns/Verwarnungen im Spielerprofil, Strafen eintragen | – | ✅ | ✅ |
| Bausteine bearbeiten | – | ✅ | ✅ |
| Antragsarten, Einstellungen, Discord, Audit-Log, CSV-Export | – | – | ✅ |

¹ Nie, wenn die Person selbst beschuldigt ist – gilt für Liste, Detail, Suche, Statistik, Profil, Export, KI und Discord. Ist der Beschuldigte noch unbekannt, sieht nur die Leitung das Ticket.

**Vier-Augen-Prinzip** (Entbannung, Einspruch; je Antragsart schaltbar): A schlägt Ergebnis + Begründung vor, B (≠ A, Moderation/Leitung) stimmt zu. Wer die Strafe ausgesprochen hat (Feld im Antrag, automatisch über die Ban-ID), entscheidet nie allein und zählt nie als zweite Person – auch bei Antragsarten ohne Vier-Augen-Pflicht.

---

## Betrieb

### Hintergrundarbeiten
`/api/cron/housekeeping` erledigt: Outbox-Wiederholungen, fehlende Discord-Threads, Thread-Abgleich (Discord → Web), Erinnerungen, Auto-Close, Schließen gelöster Tickets, Archivieren entschiedener Anträge und einmal täglich die Löschfristen. Zusätzlich anstoßbar unter *Einstellungen & Discord → Hintergrundarbeiten jetzt ausführen*.

### Brauchen wir einen Worker?
**Nein.** Das Support-Center läuft komplett auf Vercel. Der Worker des Bewerbungsportals (falls ihr ihn betreibt) kann weiterlaufen – er arbeitet nur mit der Datenbank des Portals und berührt das Support-Center nicht; den Bot-Status („online“) setzt weiterhin nur er. Ein gemeinsamer Worker für beide Projekte wäre möglich, koppelt aber Deployments und Fehler beider Apps – nicht empfohlen. Wollt ihr später Discord-Nachrichten in Echtzeit, ist ein kleiner Worker die Erweiterung (z. B. auf einem vorhandenen Server oder Hetzner CX22).

### KI (optional)
Nur über die Claude API von Anthropic, kostenpflichtig nach Verbrauch. API-Konto in der [Claude Console](https://platform.claude.com) mit Prepaid-Guthaben (5–10 $ reichen lange), Ausgabenlimit setzen, Key als `ANTHROPIC_API_KEY`. Im Portal unter *Einstellungen* einschalten; Monatsbudget (Standard 10 $), Anfragen pro Stunde und Tokens pro Tag begrenzen die Kosten. An Anthropic gehen keine Namen, Discord-IDs oder Bilder; Spielertexte stehen in Datenblöcken mit Zufallsnamen und werden auf Manipulationsversuche geprüft.

### Datenschutz & Sicherheit
- DSGVO-Hinweis mit Versionsbestätigung beim ersten Ticket/Antrag, Datenexport (JSON) und Konto-Löschung unter `/konto`.
- Löschfristen (einstellbar): Tickets 12 Monate nach Schließen, Anträge 24 Monate, Bild-Anhänge 90 Tage, Suchbegriffe 90 Tage, Audit-Log 24 Monate.
- zod-Validierung überall, CSRF über Origin-Prüfung (Server Actions automatisch, API-Routen explizit), Rate Limits in der DB, Honeypot + Mindest-Ausfüllzeit, Copy-Paste-/Zeichensalat-Erkennung, max. offene Tickets pro Spieler.
- Uploads: echte Bildprüfung mit sharp, Neucodierung als WebP ohne Metadaten, Auslieferung nur an Berechtigte mit `Content-Security-Policy: sandbox`.
- Discord: Ed25519-Signaturprüfung mit Zeitfenster, Rechte aus der signierten Interaktion, keine Pings in gespiegelten Nachrichten.

---

## Entwicklung

### Struktur

```
src/
  app/              Seiten (Hilfe, Status, Tickets, Anträge, Konto, Team), API-Routen, Server Actions
  components/       UI (help/, tickets/, requests/, team/, layout/), Markdown-Renderer
  lib/
    perms.ts        zentrale Rechte-Logik (Sichtbarkeit, Beschwerden, Vier-Augen)
    auth/           Login, Rollen- und Bannprüfung, Routen-Schutz
    tickets/        Kategorien, Status, Service, Discord-Abgleich, Transkript, Auto-Close
    requests/       Antragsarten, Sperrfristen, Service, Bann-Schnittstelle
    discord/        REST-Client, Outbox, Interaktionen, Router, Nachrichten, Einrichtung
    help/           Suche (Tippfehler-Toleranz), Artikel-Service
    status/         FiveM- und TeamSpeak-Status
    ai/             Claude-Anbindung, Schutzschicht, Entwürfe/Zusammenfassungen
    setup/          Startdaten, Seed-Artikel, Demo-Daten
  proxy.ts          Zugriffsschutz vor geschützten Routen
prisma/             Schema (MongoDB, Collections mit Präfix sup_), Seed
tests/              unit/ (Vitest), integration/ (echte MongoDB im Speicher)
docs/               Plan, Patch fürs Bewerbungsportal
```

### Skripte

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklung |
| `npm run build` / `npm start` | Produktion |
| `npm test` | Unit-Tests (Rechte, Vier-Augen, Bann-Zugriff, Router, Sync, Sperrfristen, Suche, Spam …) |
| `npm run test:integration` | Integrationstests gegen eine echte MongoDB (lädt beim ersten Mal ein mongod-Binary) |
| `npm run lint` / `npm run typecheck` | Qualität |
| `npm run db:dev` | lokale MongoDB (Replica Set, Port 27018) |
| `npm run db:push` | Schema + Indizes |
| `npm run db:seed` | Basisdaten + Demo (ohne Demo: `SEED_DEMO=false`) |

---

## Lizenz

Quellcode: **GNU Affero General Public License v3.0** – siehe [LICENSE](LICENSE). Basiert auf dem [Nordverkehr Bewerbungsportal](https://github.com/Jannikjbi-official/nordverkehr-bewerbungsportal) (AGPL-3.0). Wer eine veränderte Version öffentlich betreibt, muss deren Quellcode zugänglich machen.

Name, Logo und Wortmarke „Nordverkehr“ sind nicht Teil der Lizenz – siehe [NOTICE.md](NOTICE.md). Nordverkehr ist ein Roleplay-Projekt und steht in keiner Verbindung zu Rockstar Games oder Take-Two Interactive.
