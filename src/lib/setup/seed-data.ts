/**
 * Startdaten: Hilfe-Kategorien, Antragsarten, Nachrichtenbausteine.
 * Werden bei einer leeren Datenbank automatisch angelegt (ohne Demo-Daten).
 */
import type { FieldDef } from "@/lib/tickets/categories";
import type { Outcome } from "@/lib/requests/model";
import type { TeamLevel } from "@prisma/client";

export const HELP_CATEGORIES = [
  { slug: "erste-schritte", title: "Erste Schritte", description: "Neu in Hamburg? Hier fängst du an.", icon: "compass" },
  { slug: "whitelist", title: "Whitelist", description: "Bewerbung, Ablauf und was wir erwarten.", icon: "checks" },
  { slug: "technik-verbindung", title: "Technik & Verbindung", description: "FiveM startet nicht, Abbrüche, Fehlermeldungen.", icon: "plug" },
  { slug: "teamspeak-saltychat", title: "TeamSpeak & SaltyChat", description: "Voice einrichten, Plugin, Mikro.", icon: "headset" },
  { slug: "regelwerk", title: "Regelwerk", description: "Begriffe wie Metagaming, Power-RP und Fail-RP erklärt.", icon: "scales" },
  { slug: "fraktionen-jobs", title: "Fraktionen & Jobs", description: "Wie du reinkommst – und wieder raus.", icon: "briefcase" },
  { slug: "banns-antraege", title: "Banns & Anträge", description: "Entbannung, Einspruch und wie das Team entscheidet.", icon: "gavel" },
  { slug: "account-daten", title: "Account & Daten", description: "Login, Datenschutz, Export und Löschung.", icon: "user" },
];

export interface SeedRequestType {
  slug: string;
  title: string;
  description: string;
  icon: string;
  order: number;
  active: boolean;
  visibleFrom: TeamLevel;
  decideFrom: TeamLevel;
  fourEyes: boolean;
  allowedWhenBanned: boolean;
  requireHonesty: boolean;
  singleOpen: boolean;
  needsSanction: boolean;
  outcomes: Outcome[];
  cooldownDays: number;
  cooldownByBanType?: Record<string, number>;
  fields: FieldDef[];
}

const sanctionBase = (labelRef: string, typeLabel: string, typeOptions: string[], reasonLabel: string): FieldDef[] => [
  { key: "ingame_name", label: "Ingame-Name", type: "text", required: true, max: 80 },
  { key: "ban_ref", label: labelRef, type: "text", required: true, help: "Steht in der Nachricht, die du bekommen hast. Datum reicht auch.", max: 80 },
  { key: "ban_type", label: typeLabel, type: "select", required: true, options: typeOptions },
  { key: "ban_reason", label: reasonLabel, type: "textarea", required: true, max: 1500 },
];

export const REQUEST_TYPES: SeedRequestType[] = [
  {
    slug: "entbannung",
    title: "Entbannungsantrag",
    description: "Du bist gebannt (Server oder Discord) und möchtest, dass wir den Bann noch einmal prüfen.",
    icon: "gavel",
    order: 1,
    active: true,
    visibleFrom: "MODERATION",
    decideFrom: "MODERATION",
    fourEyes: true,
    allowedWhenBanned: true,
    requireHonesty: true,
    singleOpen: true,
    needsSanction: true,
    cooldownDays: 30,
    cooldownByBanType: { "Temporärer Bann": 14, "Permanenter Bann": 60, "Cheating / Modding": 180, "Discord-Bann": 30 },
    outcomes: [
      { key: "abgelehnt", label: "Abgelehnt", category: "REJECTED" },
      { key: "verkuerzt", label: "Bann verkürzt", category: "PARTIAL" },
      { key: "aufgehoben", label: "Bann aufgehoben", category: "ACCEPTED" },
      { key: "bewaehrung", label: "Aufgehoben auf Bewährung", category: "PARTIAL" },
    ],
    fields: [
      ...sanctionBase("Ban-ID oder Datum des Banns", "Art des Banns", ["Temporärer Bann", "Permanenter Bann", "Cheating / Modding", "Discord-Bann"], "Grund laut Bann-Nachricht"),
      { key: "own_view", label: "Deine Sicht der Situation", type: "textarea", required: true, help: "Was ist aus deiner Sicht passiert? Ehrlich, auch wenn es unangenehm ist.", max: 3000 },
      { key: "why_lift", label: "Warum sollten wir den Bann aufheben?", type: "textarea", required: true, max: 2000 },
      { key: "future", label: "Was machst du künftig anders?", type: "textarea", required: true, max: 2000 },
      { key: "evidence", label: "Beweise (Clip-Link, optional)", type: "url", max: 300 },
    ],
  },
  {
    slug: "einspruch",
    title: "Einspruch gegen Verwarnung oder Strafe",
    description: "Verwarnung, Kick, Jail-Zeit oder Geldstrafe – du hältst sie für falsch? Dann leg Einspruch ein.",
    icon: "scales",
    order: 2,
    active: true,
    visibleFrom: "MODERATION",
    decideFrom: "MODERATION",
    fourEyes: true,
    allowedWhenBanned: false,
    requireHonesty: true,
    singleOpen: true,
    needsSanction: true,
    cooldownDays: 14,
    outcomes: [
      { key: "abgelehnt", label: "Abgelehnt", category: "REJECTED" },
      { key: "reduziert", label: "Strafe reduziert", category: "PARTIAL" },
      { key: "aufgehoben", label: "Strafe aufgehoben", category: "ACCEPTED" },
    ],
    fields: [
      ...sanctionBase("Datum oder ID der Strafe", "Art der Strafe", ["Verwarnung", "Kick", "Jail-Zeit", "Geldstrafe", "Sonstige Strafe"], "Begründung der Strafe (laut Team)"),
      { key: "own_view", label: "Deine Sicht der Situation", type: "textarea", required: true, max: 3000 },
      { key: "why_lift", label: "Warum ist die Strafe aus deiner Sicht falsch?", type: "textarea", required: true, max: 2000 },
      { key: "evidence", label: "Beweise (Clip-Link)", type: "url", help: "Ohne Clip ist ein Einspruch schwer zu prüfen.", max: 300 },
    ],
  },
  {
    slug: "namensaenderung",
    title: "Namensänderung (Charakter)",
    description: "Dein Charakter soll anders heißen – mit RP-Begründung.",
    icon: "identification",
    order: 3,
    active: true,
    visibleFrom: "SUPPORT",
    decideFrom: "SUPPORT",
    fourEyes: false,
    allowedWhenBanned: false,
    requireHonesty: false,
    singleOpen: true,
    needsSanction: false,
    cooldownDays: 14,
    outcomes: [
      { key: "angenommen", label: "Angenommen", category: "ACCEPTED" },
      { key: "abgelehnt", label: "Abgelehnt", category: "REJECTED" },
    ],
    fields: [
      { key: "current_name", label: "Aktueller Charaktername", type: "text", required: true, max: 80 },
      { key: "new_name", label: "Gewünschter Name", type: "text", required: true, help: "Realistisch, kein Promi-, Meme- oder Fantasiename.", max: 80 },
      { key: "reason", label: "Begründung im RP", type: "textarea", required: true, max: 1500 },
    ],
  },
  {
    slug: "charakter-tod",
    title: "Charakter-Tod (CK)",
    description: "Eigenen CK beantragen oder einen CK für einen anderen Charakter – nur mit sauberer RP-Grundlage.",
    icon: "skull",
    order: 4,
    active: true,
    visibleFrom: "MODERATION",
    decideFrom: "MODERATION",
    fourEyes: false,
    allowedWhenBanned: false,
    requireHonesty: true,
    singleOpen: true,
    needsSanction: false,
    cooldownDays: 7,
    outcomes: [
      { key: "angenommen", label: "CK genehmigt", category: "ACCEPTED" },
      { key: "abgelehnt", label: "Abgelehnt", category: "REJECTED" },
    ],
    fields: [
      { key: "ck_type", label: "Art", type: "select", required: true, options: ["Eigener CK (freiwillig)", "CK für einen anderen Charakter"] },
      { key: "character_name", label: "Betroffener Charakter", type: "text", required: true, max: 80 },
      { key: "story", label: "RP-Hintergrund", type: "textarea", required: true, help: "Warum ist der CK im RP nachvollziehbar? Was ist vorher passiert?", max: 4000 },
      { key: "involved", label: "Beteiligte", type: "textarea", max: 1000 },
      { key: "evidence", label: "Clip-Link (optional)", type: "url", max: 300 },
    ],
  },
  {
    slug: "rueckerstattung",
    title: "Rückerstattung",
    description: "Items oder Geld durch einen Bug verloren? Mit Beweis prüfen wir eine Rückerstattung.",
    icon: "coins",
    order: 5,
    active: true,
    visibleFrom: "MODERATION",
    decideFrom: "MODERATION",
    fourEyes: false,
    allowedWhenBanned: false,
    requireHonesty: true,
    singleOpen: true,
    needsSanction: false,
    cooldownDays: 0,
    outcomes: [
      { key: "erstattet", label: "Erstattet", category: "ACCEPTED" },
      { key: "teilweise", label: "Teilweise erstattet", category: "PARTIAL" },
      { key: "abgelehnt", label: "Abgelehnt", category: "REJECTED" },
    ],
    fields: [
      { key: "ingame_name", label: "Ingame-Name", type: "text", required: true, max: 80 },
      { key: "date", label: "Datum", type: "date", required: true },
      { key: "time", label: "Uhrzeit (ungefähr)", type: "time", required: true },
      { key: "lost", label: "Was ist verloren gegangen?", type: "textarea", required: true, help: "Items, Anzahl, Geldbetrag – so genau wie möglich.", max: 1500 },
      { key: "how", label: "Wie ist es passiert?", type: "textarea", required: true, max: 2000 },
      { key: "evidence", label: "Beweis (Clip-Link)", type: "url", required: true, help: "Ohne Beweis keine Rückerstattung. Screenshots kannst du zusätzlich anhängen.", max: 300 },
    ],
  },
  {
    slug: "fraktion",
    title: "Fraktionswechsel oder -gründung",
    description: "Du willst die Fraktion wechseln oder eine neue gründen? Konzept rein, wir prüfen.",
    icon: "flag",
    order: 6,
    active: true,
    visibleFrom: "SUPPORT",
    decideFrom: "LEITUNG",
    fourEyes: false,
    allowedWhenBanned: false,
    requireHonesty: false,
    singleOpen: true,
    needsSanction: false,
    cooldownDays: 14,
    outcomes: [
      { key: "angenommen", label: "Angenommen", category: "ACCEPTED" },
      { key: "probe", label: "Angenommen mit Probephase", category: "PARTIAL" },
      { key: "abgelehnt", label: "Abgelehnt", category: "REJECTED" },
    ],
    fields: [
      { key: "kind", label: "Was möchtest du?", type: "select", required: true, options: ["Fraktionswechsel", "Fraktionsgründung"] },
      { key: "current_faction", label: "Aktuelle Fraktion (falls vorhanden)", type: "text", max: 80 },
      { key: "target_faction", label: "Ziel-Fraktion bzw. Name der neuen Fraktion", type: "text", required: true, max: 80 },
      { key: "concept", label: "Konzept / Begründung", type: "textarea", required: true, max: 5000 },
      { key: "members", label: "Wer ist dabei?", type: "textarea", max: 1000 },
    ],
  },
  {
    slug: "sonstiges",
    title: "Sonstiger Antrag",
    description: "Alles Formelle, das nicht in die anderen Arten passt.",
    icon: "file",
    order: 7,
    active: true,
    visibleFrom: "SUPPORT",
    decideFrom: "MODERATION",
    fourEyes: false,
    allowedWhenBanned: false,
    requireHonesty: false,
    singleOpen: true,
    needsSanction: false,
    cooldownDays: 0,
    outcomes: [
      { key: "angenommen", label: "Angenommen", category: "ACCEPTED" },
      { key: "teilweise", label: "Teilweise angenommen", category: "PARTIAL" },
      { key: "abgelehnt", label: "Abgelehnt", category: "REJECTED" },
    ],
    fields: [
      { key: "subject", label: "Worum geht es?", type: "text", required: true, max: 140 },
      { key: "text", label: "Dein Antrag", type: "textarea", required: true, max: 5000 },
    ],
  },
];

export interface SeedTemplate {
  title: string;
  body: string;
  scope: "ticket" | "request" | "all";
  ticketCategory?: string;
  requestTypeSlug?: string;
}

export const TEMPLATES: SeedTemplate[] = [
  { scope: "ticket", title: "Übernommen", body: "Moin {name},\n\nich hab dein Ticket {ticket_id} übernommen und schau es mir an. Ich melde mich, sobald ich mehr weiß.\n\nGruß, {teammitglied}" },
  {
    scope: "ticket",
    title: "Rückfrage: mehr Infos",
    body: "Moin {name},\n\ndamit wir dir helfen können, brauchen wir noch ein paar Infos:\n- Was genau passiert (Fehlermeldung im Wortlaut)?\n- Seit wann?\n- Was hast du schon ausprobiert?\n\nAntworte einfach hier – Screenshots helfen. {status_link}",
  },
  {
    scope: "ticket",
    ticketCategory: "technik",
    title: "Technik: Cache leeren",
    body: "Moin {name},\n\nbitte probier einmal Folgendes:\n1. FiveM komplett schließen.\n2. Im FiveM-Ordner unter „FiveM Application Data“ den Ordner „data“ öffnen und „cache“, „server-cache“ und „server-cache-priv“ löschen (nicht „game“).\n3. FiveM neu starten und verbinden.\n\nHat's geholfen? Kurze Rückmeldung reicht. Mehr dazu: {hilfe_link}",
  },
  {
    scope: "ticket",
    ticketCategory: "technik",
    title: "SaltyChat-Check",
    body: "Moin {name},\n\nbei Voice-Problemen bitte einmal checken:\n- TeamSpeak 3 läuft, BEVOR du FiveM startest\n- Du bist auf unserem TeamSpeak (Adresse steht im Discord)\n- Das SaltyChat-Plugin ist in TeamSpeak unter Einstellungen → Addons aktiviert und in der richtigen Version\n- Dein Mikro ist in TeamSpeak als Aufnahmegerät eingestellt\n\nAnleitung: {hilfe_link}",
  },
  {
    scope: "ticket",
    ticketCategory: "beschwerde",
    title: "Beschwerde: Clip fehlt",
    body: "Moin {name},\n\ndanke für deine Meldung. Ohne Clip können wir die Situation leider kaum bewerten – wir waren ja nicht dabei. Hast du (oder jemand anderes) die Szene aufgenommen? Dann schick uns den Link (YouTube, Twitch oder Medal).\n\nGruß, {teammitglied}",
  },
  {
    scope: "ticket",
    ticketCategory: "beschwerde",
    title: "Beschwerde: wird geprüft",
    body: "Moin {name},\n\nwir haben uns den Fall angeschaut und kümmern uns darum. Was mit der anderen Person passiert, sagen wir dir aus Datenschutzgründen nicht im Detail – aber es bleibt nicht liegen.\n\nGruß, {teammitglied}",
  },
  { scope: "ticket", ticketCategory: "bug", title: "Bug: weitergegeben", body: "Moin {name},\n\ndanke für die genaue Meldung! Ich hab den Bug an die Entwicklung weitergegeben. Wann er behoben ist, können wir noch nicht sagen – im Changelog auf nordverkehr.xyz siehst du, wenn es soweit ist.\n\nGruß, {teammitglied}" },
  { scope: "ticket", ticketCategory: "regelwerk", title: "Regelwerk: Verweis", body: "Moin {name},\n\ngute Frage. Die Antwort steht im Regelwerk: {regelwerk_link}\n\nKurz gesagt: … \n\nWenn noch was unklar ist, frag gern nach." },
  { scope: "ticket", title: "Gelöst? Kurze Rückmeldung", body: "Moin {name},\n\nhat sich dein Problem erledigt? Wenn ja, sag kurz Bescheid – dann schließen wir das Ticket. Wenn wir nichts hören, schließt es sich nach ein paar Tagen von selbst." },
  { scope: "ticket", title: "Schließen ohne Rückmeldung", body: "Moin {name},\n\nda wir länger nichts gehört haben, schließen wir das Ticket. Falls das Problem wieder auftaucht, mach einfach ein neues auf.\n\nGruß, {teammitglied}" },
  { scope: "request", title: "Antrag in Prüfung", body: "Moin {name},\n\ndein Antrag {antrag_id} ({antragsart}) ist bei uns angekommen und wird geprüft. Das kann ein paar Tage dauern – bitte nicht doppelt einreichen. Den Stand siehst du hier: {status_link}" },
  {
    scope: "request",
    requestTypeSlug: "entbannung",
    title: "Rückfrage: Ban-ID",
    body: "Moin {name},\n\nwir finden deinen Bann mit der angegebenen ID bzw. dem Datum nicht. Kannst du uns die genaue Ban-ID aus der Bann-Nachricht schicken (oder einen Screenshot davon)?",
  },
  {
    scope: "request",
    requestTypeSlug: "entbannung",
    title: "Entbannung abgelehnt",
    body: "Moin {name},\n\nwir haben deinen Antrag zu zweit geprüft und lehnen ihn ab. Die Begründung steht unten.\n\nEinen neuen Antrag kannst du ab {sperrfrist} stellen. Nutze die Zeit und schau dir das Regelwerk noch einmal an: {regelwerk_link}",
  },
  {
    scope: "request",
    requestTypeSlug: "entbannung",
    title: "Entbannung auf Bewährung",
    body: "Moin {name},\n\nwir geben dir noch eine Chance: Der Bann ist aufgehoben – auf Bewährung. Das heißt: Beim nächsten ähnlichen Verstoß gibt's keine weitere Chance.\n\nWillkommen zurück in Hamburg.",
  },
  { scope: "request", requestTypeSlug: "einspruch", title: "Einspruch: Clip nötig", body: "Moin {name},\n\num deinen Einspruch fair zu prüfen, brauchen wir einen Clip der Situation (YouTube, Twitch oder Medal). Hast du einen? Dann schick ihn bitte hier als Antwort." },
  { scope: "request", requestTypeSlug: "rueckerstattung", title: "Rückerstattung: Beweis fehlt", body: "Moin {name},\n\nohne Beweis können wir leider nichts erstatten. Hast du einen Clip oder Screenshots, auf denen man den Verlust sieht? Dann gern nachreichen." },
  { scope: "request", requestTypeSlug: "namensaenderung", title: "Namensänderung angenommen", body: "Moin {name},\n\ndie Namensänderung ist durch. Deinen Bescheid (PDF) findest du im Portal bei diesem Antrag – lade ihn herunter und gib ihn ingame im Rathaus ab, dort bekommst du neue Papiere auf den neuen Namen.\n\nGruß, {teammitglied}" },
];
