# Nordverkehr Support-Center – Plan (Entwurf zur Freigabe)

Stand: 13.11.2026 · Status: **wartet auf Bestätigung**

---

## 1. Analyse

### 1.1 Bewerbungsportal (`Jannikjbi-official/nordverkehr-bewerbungsportal`)

| Bereich | Was es dort gibt | Übernahme ins Support-Center |
|---|---|---|
| Stack | Next.js 16.4 (App Router, Cache Components, `proxy.ts` statt Middleware), React 19.3, TS, Tailwind 4.3, Prisma 6 + MongoDB (Replica Set, Transaktionen), Auth.js v5, zod 4, Vitest 5, Node ≥ 22.12 | 1:1 gleiche Versionen |
| Design | `globals.css` mit `--nv-*`-Tokens (Dark Standard, Light per `data-theme`), `nv-btn`, Karten, Badges; Fonts DM Serif Display / DM Sans / JetBrains Mono über `next/font`; Theme-Script ohne Aufblitzen; `ui.tsx`, Header/Footer/MobileMenu/ThemeToggle/UserMenu, ConfirmDialog, Tabs, Select, DiscordMarkdown | Übernehmen, Texte und Navigation anpassen |
| Auth | Discord-OAuth nur Scope `identify`, JWT mit `uid` + `sessionVersion` (sofort widerrufbar), Login **ohne** Server-Prüfung → gebannte Nutzer können sich technisch schon einloggen | Übernehmen + Bann-Erkennung ergänzen |
| Rollen | `access.ts`: Rollenprüfung per Bot (`GET guild member`), Cache 60 s in der DB, **fail closed**; `proxy.ts` + Prüfung in jeder Seite/Action/API; Admin = Team + Admin-Rolle | Erweitern auf drei Stufen Support < Moderation < Leitung |
| Discord-REST | `client.ts` (DiscordApi-Interface, Fehlerklassifizierung, DM-Cache, Threads, `getBan`) | Übernehmen + private Threads, Thread-Mitglieder, Nachrichten lesen |
| Outbox | `OutboxJob` in der DB, sofortige Zustellung per `after()`, Retry mit Backoff durch Worker/Cron, Nachtruhe | Übernehmen (+ neuer Job-Typ `THREAD_MESSAGE`) |
| Interactions | `POST /api/discord/interactions`, Ed25519-Prüfung, Custom-IDs `nv:claim:…`, `nv:reply:…`, `nv:answer:…` usw., Slash-Befehle `/bewerbung`, `/offen`, `/claim` (per `POST` einzeln registriert – **kein** Bulk-Overwrite) | Neues Präfix `nvs:`, eigene Befehle, Router (siehe 3.) |
| Worker | `worker/index.ts`: Gateway (Intents Guilds, GuildMembers, GuildVoiceStates) → Rollen-Cache invalidieren, Sprachkanäle, Presence „N offene Bewerbungen“; Outbox alle 15 s; Löschfristen alle 6 h | Eigener Worker mit zusätzlich GuildMessages + MessageContent für den Thread-Sync |
| Cron | `vercel.json`: Outbox (mehrfach täglich, Sommer/Winterzeit doppelt), Retention, Summary; Schutz per `CRON_SECRET` | Gleiches Muster: Outbox, Auto-Close/Erinnerungen, Löschfristen |
| Bausteine | `MessageTemplate` + `placeholders.ts` + Discord-Vorschau (Components V2) | Übernehmen, Kategorien je Ticket/Antragsart |
| Team-Bereich | Liste + Kanban (dnd-kit), Claim, Kommentare, Abstimmung Pro/Contra/Enthaltung, Nutzerprofil mit Notizen und Sperren, Audit-Log mit Filter, CSV-Export, Statistiken, Admin-Bereich mit Einstellungen in der DB | Übernehmen und auf Tickets/Anträge umbauen |
| KI | Anthropic SDK, `guard.ts` (Prompt-Injection-Schutz inkl. Leetspeak/unsichtbare Zeichen, Datenblöcke mit Zufallsnamen, Ausgabefilter), Monatsbudget, `AiUsage`, Auto-Antwort | Übernehmen **ohne** Auto-Antwort und ohne Scoring (KI sendet nie selbst) |
| Sicherheit | Origin-Prüfung (CSRF), Rate Limits in der DB, Honeypot, Mindest-Ausfüllzeit, Uploads: echte Bildprüfung mit sharp, Neucodierung als WebP ohne Metadaten, max. 8 MB, in der DB gespeichert | Übernehmen |
| Lizenz | AGPL-3.0 (`LICENSE`), `NOTICE.md` (Name/Logo nicht frei), Hinweis Rockstar/Take-Two | Übernehmen, auf Support-Center anpassen, Quellcode-Link im Footer |
| Tests | Vitest-Unit-Tests (reine Logik: Rechte, Routen, Outbox, Guard …), Integrationsskripte gegen `mongodb-memory-server` | Gleiches Muster |

**Entfällt komplett:** Positionen, Formular-Builder für Bewerbungen, Regel-Quiz, Gespräche/Slots/Server-Events, Sprachkanal-Logik, Probezeit/Einarbeitung, Bewerbungsrunden, Ideen-Board, Changelog-Posts, Stellenaufrufe, „Passt zu mir“, Auto-Antwort der KI, KI-Scoring.

### 1.2 nordverkehr.xyz

Astro-Seite, dunkel (`#0a0a0c`), Akzent `#c41e1e` / Text-Rot `#f06060`, Fonts wie oben, Labels im Stil „Zugang // Index 03“. Navigation: Start, Über uns, Team, Regeln, FAQ, Roadmap, Verbinden, Blog, News, Changelog. Fakten für die Hilfe-Artikel:
- Start auf GTA 5 über **FiveM** (PC), später Umzug auf GTA 6; Start „in Vorbereitung“.
- **Whitelist** per Bewerbung, **Voicechat-Pflicht: TeamSpeak 3 + SaltyChat**, funktionierendes Mikro Pflicht.
- Verbinden: `fivem://connect/connect.nordverkehr.xyz` bzw. F8 → `connect connect.nordverkehr.xyz`.
- Regelwerk unter `/regeln` (IC/OOC, Meta-Gaming, Power-RP, Fail-RP, Combat Logging, Fahrzeugregeln …).
- Discord: `https://discord.gg/KrfKASTHDp`. Footer: „Kein offizielles Produkt von Rockstar Games“.

---

## 2. Der Knackpunkt: ein Bot, zwei Apps

### 2.1 Was geht problemlos parallel

| Thema | Lösung |
|---|---|
| Custom-IDs | Support nutzt ausschließlich `nvs:` (z. B. `nvs:t:reply:<id>`), das Portal `nv:`. Kein Präfix ist Anfang des anderen (`nv:` ≠ `nvs:` – Prüfung immer inkl. Doppelpunkt). |
| Slash-Befehle | Support registriert nur eigene Namen (`/ticket`, `/antrag`, `/support-panel`) **einzeln per POST** – genau wie das Portal. Niemals `PUT …/commands` (Bulk-Overwrite würde die Portal-Befehle löschen). Ein Test stellt das sicher. |
| REST-Aufrufe | Beliebig viele Apps können denselben Token für REST nutzen; Rate-Limits teilen sich, bei unserem Volumen kein Problem. |
| Datenbank | Gleicher Atlas-Cluster ist ok, aber **eigene Datenbank `nordverkehr_support`** und zusätzlich Collection-Namen mit Präfix `sup_` (`@@map`). Selbst bei falsch gesetzter URL kollidiert nichts. |
| Gateway | Discord erlaubt mehrere Gateway-Sitzungen mit demselben Token. Zwei Worker laufen also parallel. **Presence** (Bot-Status) setzt nur einer – der Support-Worker lässt den Status in Ruhe, sonst flackert er. |
| Intents | Der Support-Worker braucht zusätzlich **Message Content Intent** (privilegiert, im Developer Portal einschalten). Schadet dem Portal nicht. |

### 2.2 Was NICHT sauber parallel geht: der Interactions-Endpoint

Eine Discord-App hat **genau eine** „Interactions Endpoint URL“. Alle Knöpfe, Modals und Slash-Befehle beider Projekte landen dort. Zusätzlich überschreibt der Admin-Knopf „Knopf ‚Übernehmen‘ einrichten“ im Bewerbungsportal (`setupInteractionsAction`) die URL mit seiner eigenen – würde man ihn nach der Einrichtung des Supports drücken, wären alle Support-Knöpfe tot.

**Optionen:**

**A) Support-Center als Router (Empfehlung)**
- Endpoint-URL = `https://support.nordverkehr.xyz/api/discord/interactions`.
- Der Router prüft die Signatur, behandelt `nvs:…` und Support-Befehle selbst und reicht alles andere (`nv:…`, `/bewerbung`, `/offen`, `/claim`) **unverändert** (Original-Body + Signatur-Header) an `https://bewerbung.nordverkehr.xyz/api/discord/interactions` weiter und gibt dessen Antwort zurück. Weil der Body unverändert bleibt, akzeptiert das Portal die Discord-Signatur wie bisher – **am Portal-Code ändert sich für das Routing nichts**.
- Nötig im Bewerbungsportal: nur der Admin-Knopf darf die URL nicht mehr überschreiben (ca. 10 Zeilen: Env `DISCORD_INTERACTIONS_URL` respektieren bzw. nur Befehle registrieren). Ich habe nur Lesezugriff auf das Portal-Repo – ich liefere den Patch, oder du gibst mir Schreibzugriff.
- Risiko: Discord verlangt eine Antwort in 3 s. Zwei Hops (beide in `fra1`) kosten typischerweise < 300 ms; kritisch wären nur zwei Kaltstarts hintereinander. Gegenmaßnahme: Router-Pfad ist schlank (keine DB-Abfrage beim Weiterleiten), Timeout 2,5 s mit ehrlicher Fehlermeldung „Versuch es gleich nochmal“.
- Fällt das Support-Center aus, sind auch die Portal-Knöpfe weg (und umgekehrt nicht).

**B) Bewerbungsportal als Router**
Wie A, nur umgekehrt. Mehr Änderungen am fertigen Portal, deshalb nicht empfohlen.

**C) Eigener Bot „NV Support“**
Komplett getrennt (eigener Token, eigene URL, eigene Befehle). Am saubersten technisch, aber ein zweiter Bot auf dem Server und gegen deine Vorgabe „gleicher Bot“.

**D) Interaktionen über das Gateway statt HTTP**
Ohne Endpoint-URL schickt Discord Interaktionen an Gateway-Verbindungen. Dann hängt jeder Knopf am Worker – fällt der aus, geht gar nichts. Nicht empfohlen.

➡️ **Entscheidung nötig** (siehe Ende).

---

## 3. Architektur & Hosting

```
                 ┌───────────────────────── Vercel (fra1) ──────────────────────────┐
 Spieler/Team ──►│ support.nordverkehr.xyz (Next.js)                               │
   (Browser)     │  • Seiten, Server Actions, API                                   │
                 │  • /api/discord/interactions  ── Router ──► bewerbung.nordverkehr.xyz
 Discord ───────►│    (Knöpfe, Modals, Slash-Befehle; Option A)                     │
 (HTTP-Interakt.)│  • Outbox sofort per after() → Discord REST (DMs, Thread-Posts)  │
                 │  • Cron: Outbox, Auto-Close/Erinnerungen, Löschfristen           │
                 └───────────────┬──────────────────────────────────────────────────┘
                                 │ MongoDB Atlas (DB nordverkehr_support)
                 ┌───────────────┴──────────────────────────────────────────────────┐
                 │ Support-Worker (Dauerprozess, ~100 MB RAM)                       │
                 │  • Gateway: MessageCreate in Ticket-Threads → Ticket-Nachricht    │
                 │  • GuildMember/Ban-Events → Rollen-/Bann-Cache invalidieren      │
                 │  • Outbox alle 15 s, Auto-Close/Erinnerungen, Löschfristen       │
                 └──────────────────────────────────────────────────────────────────┘
```

**Web → Discord:** Nachricht wird gespeichert, Outbox-Job `THREAD_MESSAGE` (Webhook-ähnlicher Post mit Name/Avatar im Text-Header) bzw. `DM`, sofort zugestellt per `after()`, Retry durch Worker/Cron.

**Discord → Web:** Worker hört `MessageCreate` in Threads, deren ID einem Ticket gehört; Bot-eigene Nachrichten und Nachrichten mit unserem Sync-Marker werden ignoriert (keine Echo-Schleife). Anhänge (Bilder) werden als Link übernommen, Discord-Message-ID wird gespeichert (Idempotenz, keine Duplikate nach Neustart). Beim Start holt der Worker verpasste Nachrichten nach (`GET messages?after=<lastSyncedId>`).

**Ohne Worker (Fallback):** Im Thread gibt es einen Knopf „Antwort ins Ticket“ → Modal → HTTP-Interaktion → landet im Web. Funktioniert also auch, wenn der Worker mal hängt; nur der automatische Spiegel fehlt.

**Kann der bestehende Portal-Worker beide bedienen?** Technisch nur, wenn man beide Codebasen in einen Prozess zusammenführt (zwei Prisma-Clients, zwei Datenbanken). Das koppelt Deployments und Fehler beider Projekte. **Empfehlung: zwei getrennte Worker-Prozesse auf demselben Host** – kostet nichts extra, ein Absturz reißt den anderen nicht mit. Ein `docker-compose.yml` startet beide.

**Günstige Hosting-Optionen für den Worker** (Preise vor Buchung prüfen, Stand meines Wissens):

| Option | Kosten ca. | Bewertung |
|---|---|---|
| Vorhandener Server (z. B. der FiveM-/TeamSpeak-Host) mit Docker oder pm2 | 0 € | Am günstigsten; Worker braucht kaum Ressourcen. Nachteil: hängt am Gameserver-Host. |
| Hetzner Cloud CX22 (Falkenstein/Nürnberg) | ~4–5 €/Monat | **Empfehlung**, wenn kein Server da ist: EU/DSGVO, beide Worker + Puffer, Docker Compose. |
| Railway | ~5 $/Monat (nutzungsbasiert) | Deploy direkt aus GitHub, sehr bequem, Region EU wählbar. |
| Fly.io | ~2–4 $/Monat (shared-cpu, 256 MB) | Günstig, Region `fra`, etwas mehr Setup. |
| Render Background Worker | ~7 $/Monat | Bequem, aber teurer; kein Gratis-Tarif für Worker. |

Alle Varianten dokumentiere ich in der README (Docker-Compose-Datei + Schritt-für-Schritt für Hetzner und Railway).

**Vercel-Plan:** Auf Hobby laufen Cron-Jobs höchstens einmal täglich pro Eintrag. Echtzeit kommt sowieso über `after()` + Worker; Cron ist das Sicherheitsnetz. Auf Pro kann der Outbox-Cron alle 5 min laufen – beides wird dokumentiert.

---

## 4. Datenmodell (MongoDB, Collections mit `sup_`-Präfix)

**Nutzer & Zugriff**
- `User` – discordId, Name, Avatar, sessionVersion, Rollen-Cache (inGuild, roleIds, `teamLevel`: NONE/SUPPORT/MODERATION/LEITUNG, roleCheckedAt), **Bann-Cache** (`guildBanned`, `guildBanReason`, `banCheckedAt`), `dmOptOut`, Einwilligung (Version/Datum)
- `PlayerNote` – interne Notizen des Teams zu einer Person
- `Sanction` – Banns, Verwarnungen, Kicks, Jail, Geldstrafen: `kind`, `source` (MANUAL/DISCORD/TXADMIN), `externalId` (Ban-ID), Grund, Dauer/Ende, `issuedByDiscordId`, `banType` (für Sperrfristen). Grundlage fürs Spielerprofil und das Vier-Augen-Prinzip.

**Hilfe-Center**
- `HelpCategory` – Slug, Titel, Icon, Reihenfolge, Beschreibung
- `HelpArticle` – Slug, Titel, Kurztext, Markdown, Kategorie, Status (DRAFT/PUBLISHED), Tags, verwandte Artikel, Autor, publishedAt/updatedAt, Zähler (Aufrufe, Ja, Nein)
- `ArticleFeedback` – Artikel, hilfreich ja/nein, optionaler Kommentar, **ohne** Nutzerbezug (nur gehashter Tages-Fingerprint gegen Mehrfachabstimmung)
- `SearchMiss` – normalisierter Suchbegriff, Anzahl, zuletzt gesucht
- `StatusIncident` – bekannte Probleme/Wartungen: Titel, Text, Art (PROBLEM/WARTUNG), betroffene Systeme, Schwere, Beginn/Ende, Updates
- `StatusCache` – letzter FiveM-/TeamSpeak-Abruf (kurz gecacht, 60 s)

**Tickets**
- `Ticket` – publicId (`NVS-2026-0001`), Kategorie, Felder je Kategorie (JSON, per zod validiert), Betreff, Status (OPEN/IN_PROGRESS/WAITING_PLAYER/RESOLVED/CLOSED), Priorität, Tags, Quelle (WEB/DISCORD), Ersteller, `claimedById`, **`accusedDiscordIds[]` + `sensitivity`** (NORMAL / MOD_ONLY / TEAM_COMPLAINT), Discord-Thread-ID + `lastSyncedMessageId`, firstResponseAt, resolvedAt, closedAt, `autoCloseWarnedAt`, Bewertung (1–5 + Kommentar)
- `TicketMessage` – Autor, Richtung (PLAYER/TEAM/SYSTEM/INTERNAL), Text, Quelle (WEB/DISCORD), discordMessageId (unique), Anhänge, Zustellstatus der DM
- `TicketEvent` – Status-/Claim-/Prioritätswechsel (Verlauf + Statistik)
- `Attachment` – Bilder (WebP in der DB wie im Portal) oder Clip-Link (YouTube/Twitch/Medal, URL-Whitelist), Owner, Größe, Hash
- `Transcript` – beim Schließen erzeugter, unveränderlicher Verlauf (HTML/Markdown) für Spieler und Team

**Anträge**
- `RequestType` – Slug, Titel, Beschreibung, aktiv, **Felder (Formular-Builder)**, Pflichtangaben, `minDecideLevel` (MODERATION/LEITUNG), `fourEyes` (Vier-Augen an/aus), `visibleFrom` (SUPPORT/MODERATION), `allowedWhenBanned`, Ergebnis-Optionen, Sperrfristen je Bannart, „nur ein offener Antrag“
- `Request` – publicId (`NVA-2026-0001`), Typ, Antragsteller, Antworten (JSON), `sanctionId`/Ban-ID, Ehrlichkeits-Checkbox (Zeitstempel), Status (SUBMITTED/IN_REVIEW/QUESTION/DECIDED/ARCHIVED), Ergebnis + Begründung, `issuedByDiscordId` (wer die Strafe ausgesprochen hat), decidedAt
- `RequestMessage` – Rückfragen/Antworten Team ↔ Spieler
- `RequestComment` – interne Diskussion
- `RequestVote` – Pro/Contra/Enthaltung
- `RequestDecision` – Vorschlag (Ergebnis + Begründung + Vorschlagender) und **Zustimmungen**; erst mit gültiger Zustimmung wird entschieden
- `Cooldown` – Spieler × Antragsart (× Bannart) gesperrt bis

**Team & Betrieb**
- `MessageTemplate` – Titel, Text mit Platzhaltern, Geltung (Ticket-Kategorie / Antragsart / alle), Reihenfolge
- `Setting` – Key/Value (Auto-Close-Tage, Erinnerung vorher, Limits, KI an/aus, Budget, Kanal-IDs, Löschfristen …)
- `AuditLog`, `OutboxJob`, `RateLimit`, `Counter`, `AiUsage`, `WorkerHeartbeat`

---

## 5. Seiten

**Öffentlich (ohne Login)**
- `/` – Hero „Wobei können wir *helfen?*“, große Suche mit Live-Vorschlägen, 8 Kategorie-Kacheln, beliebte Artikel, Status-Kurzanzeige, CTA Ticket/Antrag
- `/hilfe/[kategorie]`, `/hilfe/[kategorie]/[artikel]` – Markdown, Bilder, Inhaltsverzeichnis (sticky), „Zuletzt aktualisiert“, verwandte Artikel, „Hat dir das geholfen?“
- `/suche?q=` – Volltextsuche mit Tippfehler-Toleranz (eigener In-Memory-Index: Normalisierung, Umlaute, Trigramme + Levenshtein, Gewichtung Titel > Tags > Text; funktioniert lokal und auf Atlas ohne Atlas Search)
- `/status` – Gameserver (online/offline, Spieler x/y über FiveM-API, 60 s Cache), TeamSpeak (WebQuery oder TCP-Erreichbarkeit), aktuelle Probleme, geplante Wartungen, Verlauf
- `/login`, `/datenschutz`, `/kein-zugriff`; Impressum verlinkt auf nordverkehr.xyz/impressum

**Spieler (Login)**
- `/dashboard` – eigene Tickets (Web + Discord) und Anträge mit Status
- `/tickets/neu` – Kategorie → passende Pflichtfelder → Artikel-Vorschläge („Vielleicht hilft dir das schon“) → Anhänge → Absenden
- `/tickets/[id]` – Verlauf, antworten, Anhänge, Status, Bewertung nach Schließen, Transkript
- `/antraege`, `/antraege/neu/[typ]`, `/antraege/[id]` – Formular, Status, Rückfragen beantworten, Entscheidung mit Begründung
- `/konto` – DMs an/aus, Datenexport, Konto löschen

**Gebannt (Discord-Bann erkannt)**
- Sieht **nur** `/antraege` (Entbannungsantrag + Status eigener Anträge) und Hilfe-Artikel. Alles andere → Hinweis-Seite. Durchgesetzt in `proxy.ts` **und** in jeder Action/API.

**Team (`/team`)**
- Übersicht (meine Tickets, frei, überfällig), Tickets (Liste + Kanban, Filter, Suche, Priorität, Tags, Claim/Weitergeben, interne Notizen), Ticket-Detail mit Bausteinen + KI-Entwurf
- Anträge (Filter pro Art, Detail mit interner Diskussion, Abstimmung, Rückfrage, Entscheidungsvorschlag + Zustimmung)
- Spielerprofil (Tickets, Anträge, Sanktionen, Notizen)
- Hilfe-Artikel-Editor (Markdown mit Live-Vorschau, Kategorien, Entwurf/Veröffentlicht, Bilder)
- Statusseite pflegen (Vorfälle/Wartungen)
- Bausteine, Statistiken, Audit-Log, CSV-Export
- Admin (Leitung): Antragsarten-Builder, Kategorien, Einstellungen, Discord (Panel posten, Befehle registrieren, Diagnose), KI

---

## 6. Rollen & Rechte

| Recht | Support | Moderation | Leitung |
|---|:-:|:-:|:-:|
| Team-Bereich, normale Tickets, Hilfe-Artikel, Status pflegen, Bausteine nutzen | ✅ | ✅ | ✅ |
| Spielerbeschwerden (allgemein) | ✅ | ✅ | ✅ |
| Beschwerden über Teammitglieder | – | ✅* | ✅* |
| Anträge: Entbannung, Einspruch, Rückerstattung (sehen/bearbeiten) | – | ✅ | ✅ |
| Weitere Anträge (Namensänderung, CK, Fraktion, Sonstiges) | ✅ (sehen, vorbereiten) | ✅ | ✅ |
| Anträge entscheiden | – | ✅ (je Antragsart einstellbar) | ✅ |
| Spielerprofil inkl. Sanktionen | Tickets/Notizen | ✅ | ✅ |
| Antragsarten, Kategorien, Einstellungen, KI, Bausteine verwalten, Audit-Log, Export | – | – | ✅ |

\* **Nie**, wenn die Person selbst beschuldigt ist (`accusedDiscordIds`). Gilt für Liste, Detail, Suche, Statistik-Drilldown, Spielerprofil, CSV-Export, KI und Discord.

**Umsetzung:** eine zentrale, reine Funktion `can(viewer, action, resource)` + `ticketVisibilityFilter(viewer)` (Prisma-`where`), die **überall** benutzt wird – keine verstreuten Einzelprüfungen. Rollen: Env `SUPPORT_ROLE_ID`, `MODERATION_ROLE_ID`, `LEITUNG_ROLE_ID`; höchste Stufe zählt. Prüfung per Bot, Cache 60 s, fail closed, sofortige Invalidierung durch Worker bei Rollenänderung, zusätzlich Neuprüfung bei jeder Team-Aktion, die älter als TTL ist.

**Discord und Beschwerden über Teammitglieder:** Private Threads sehen alle mit „Threads verwalten“ – Discord kann ein Mod-Teammitglied also nicht technisch aus einem Thread aussperren. Darum laufen solche Tickets **nur im Web**. Wird im Discord-Modal „Beschwerde über ein Teammitglied“ gewählt, bekommt der Spieler einen Link ins Portal, es wird kein Thread erstellt.

**Vier-Augen-Prinzip (Entbannung, Einspruch):**
1. Mod/Leitung A legt einen Entscheidungsvorschlag an (Ergebnis + Pflicht-Begründung).
2. Mod/Leitung B (≠ A) stimmt zu → Entscheidung gilt, Spieler wird benachrichtigt.
3. Wer die Strafe ausgesprochen hat (`issuedByDiscordId`), darf vorschlagen, zählt aber nie als zweite Person; ist er der Vorschlagende, muss B jemand anderes sein.
4. Ändert B das Ergebnis, ist es ein neuer Vorschlag (A muss zustimmen oder C).

Vorschlag zur Voreinstellung: **immer zwei Personen** bei Entbannung/Einspruch (strenger als „nur wenn der Aussprechende beteiligt ist“), je Antragsart umschaltbar.

---

## 7. Discord-Logik (Support)

- **Ticket-Panel** (`/support-panel` oder Admin-Knopf): Post mit Knöpfen „Ticket erstellen“ (`nvs:panel:ticket`) und „Antrag stellen“ (`nvs:panel:request`).
- Ticket: Knopf → Select-Menü Kategorie (ephemeral) → Modal (Betreff, Beschreibung, je Kategorie 1–3 Felder; Discord erlaubt max. 5 Felder) → Ticket in der DB → **privater Thread** im Ticket-Channel, Spieler hinzugefügt, Support-Rolle sieht ihn über „Threads verwalten“ im Channel → Begrüßung mit Ticket-ID, Link zum Web, Knöpfen „Übernehmen“ (Team), „Antwort ins Ticket“ (Fallback), „Schließen“.
- Antrag: Knopf → ephemeral Antwort mit persönlichem Link ins Portal (ausgefüllt wird immer im Portal); bei gebannten Personen per DM, falls möglich.
- Befehle: `/ticket` (Unterbefehle `neu`, `status`), `/antrag` (Link + Status), Team: `/ticket claim id:` in einem Ticket-Thread.
- Status-Änderungen im Web aktualisieren den Thread (System-Nachricht, Threadname mit Status-Emoji, Archivieren beim Schließen).
- DMs bei jeder Team-Antwort (abschaltbar), Nachtruhe wie im Portal.
- Log-Channel: neue Tickets/Anträge, Entscheidungen (optional).

---

## 8. Abläufe

**Ticket:** Limit offener Tickets pro Spieler (Standard 3), Rate-Limit, Duplikat-/Copy-Paste-Erkennung (Ähnlichkeit zu eigenen letzten Nachrichten und zu anderen Tickets in kurzer Zeit). Status-Automatik: Team antwortet → „wartet auf Spieler“; Spieler antwortet → „in Bearbeitung“. Auto-Close: nach X Tagen (Standard 5) in „wartet auf Spieler“ → Erinnerung 24 h vorher, dann „geschlossen“. Gelöst → nach Y Tagen geschlossen. Nach dem Schließen: Bewertung (Web + Knopf in DM), Transkript.

**Antrag:** Formular aus der Antragsart; Prüfung „nur ein offener Antrag je Art“ und Sperrfrist; Ehrlichkeits-Checkbox Pflicht (Entbannung/Einspruch); Status eingereicht → in Prüfung → Rückfrage → entschieden → archiviert (automatisch nach N Tagen). Jede Entscheidung: Audit-Log, optional Discord-Log-Channel, DM (falls möglich), im Portal immer sichtbar. Ablehnung setzt die Sperrfrist der Bannart.

**Ban-Daten (vorbereitet):** Interface `BanProvider` mit `lookup(discordId | banId)`; Implementierungen `ManualBanProvider` (Team trägt ein) und `DiscordBanProvider` (Guild-Bann-Grund); `TxAdminBanProvider` als dokumentierter Stub (nicht aktiv).

---

## 9. KI (optional, Schalter im Admin-Bereich)

- Team-Entwürfe für Ticket-Antworten auf Basis passender Hilfe-Artikel (Retrieval über die eigene Suche), Zusammenfassung langer Tickets, Vorschlag Kategorie/Priorität.
- Anträge: nur neutrale Zusammenfassung, **keine** Bewertung, keine Empfehlung.
- Die KI sendet nie, entscheidet nie; jeder Entwurf landet nur im Textfeld des Teammitglieds.
- Nur nötige Daten: keine Namen, Discord-IDs, Bilder; Texte durch den Guard aus dem Portal; Monatsbudget, Token-Limits, Fehlerhandling wie im Portal.

---

## 10. Datenschutz & Sicherheit

DSGVO-Hinweis + Einwilligung beim ersten Ticket/Antrag, Datenexport (JSON), Konto löschen (Tickets anonymisieren, Anhänge löschen), Löschfristen (einstellbar: Tickets 12 Monate nach Schließen, Anträge 24 Monate nach Entscheidung, Anhänge 90 Tage, Suchbegriffe 90 Tage, Audit-Log 24 Monate), Rate Limits, Honeypot, Copy-Paste-Spam-Erkennung, zod überall, Uploads wie im Portal (nur Bilder, Neucodierung, 8 MB, max. 5 pro Nachricht), Clip-Links nur von YouTube/Twitch/Medal, CSRF per Origin-Prüfung bei Server Actions/APIs, Security-Header (CSP).

---

## 11. Umsetzung in Schritten

1. Grundgerüst aus dem Portal (Design, Auth, Rollen, Discord-Client, Outbox, Settings, Audit), Lizenz/NOTICE, `.env.example`, `.gitignore`
2. Datenmodell + Seed (Kategorien, 12–15 Artikel, Antragsarten, Bausteine, Test-Tickets/-Anträge)
3. Hilfe-Center + Suche + Feedback + Statusseite
4. Tickets Web (Spieler + Team), Anhänge, Transkript, Bewertung, Auto-Close
5. Discord: Router-Endpoint, Panel, Modals, Threads, Befehle, Sync-Worker
6. Anträge inkl. Vier-Augen, Sperrfristen, Bann-Modus
7. Team-Bereich: Kanban, Profil, Editor, Statistiken, Export, Admin
8. KI-Entwürfe
9. Tests (Rechte, Team-Beschwerden, Vier-Augen, Bann-Zugriff, Sync-Logik, Sperrfristen, Custom-ID-Routing, kein Bulk-Overwrite)
10. README (lokal, GitHub, Vercel, Domain/CNAME, Discord, Worker-Hosting, Env-Tabelle), Commit + Push

---

## 12. Offene Entscheidungen

1. **Interactions-Endpoint:** A (Support als Router, empfohlen), B, C oder D?
   Bei A: Patch fürs Bewerbungsportal liefere ich als Datei – oder gibst du mir Schreibzugriff auf das Portal-Repo?
2. **Vier-Augen:** immer zwei Personen bei Entbannung/Einspruch (empfohlen) oder nur, wenn der Aussprechende selbst entscheiden will?
3. **Worker-Hosting:** vorhandener Server, Hetzner, Railway oder Fly.io?
4. **Discord-Bann = einziges Bann-Signal fürs Login?** (Vorschlag: ja, plus vom Team eingetragene Ingame-Banns erscheinen im Antrag; Login-Beschränkung nur bei Discord-Bann.) Dafür braucht der Bot das Recht „Mitglieder bannen“ (nur zum Lesen der Bannliste).
