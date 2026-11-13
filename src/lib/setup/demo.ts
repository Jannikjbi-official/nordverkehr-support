/**
 * Demo-Daten für lokale Entwicklung und Tests (Dev-Login): Teammitglieder aller
 * Stufen, Spieler (einer gebannt), Tickets in allen Zuständen – darunter eine
 * Beschwerde über ein Teammitglied –, Anträge, eine Strafe und eine Wartung.
 * Alle Discord-IDs beginnen mit 0 → es wird nie etwas an Discord geschickt.
 */
import type { PrismaClient, TeamLevel } from "@prisma/client";
import { formatPublicId } from "@/lib/ids";

const DEMO_USERS: { key: string; discordId: string; username: string; globalName: string; teamLevel: TeamLevel; inGuild: boolean; guildBanned?: boolean }[] = [
  { key: "ole", discordId: "0100000000000000001", username: "ole.leitung", globalName: "Ole (Leitung)", teamLevel: "LEITUNG", inGuild: true },
  { key: "hanna", discordId: "0100000000000000002", username: "hanna.mod", globalName: "Hanna (Moderation)", teamLevel: "MODERATION", inGuild: true },
  { key: "kai", discordId: "0100000000000000003", username: "kai.mod", globalName: "Kai (Moderation)", teamLevel: "MODERATION", inGuild: true },
  { key: "jonas", discordId: "0100000000000000004", username: "jonas.support", globalName: "Jonas (Support)", teamLevel: "SUPPORT", inGuild: true },
  { key: "finn", discordId: "0200000000000000001", username: "finn_hh", globalName: "Finn", teamLevel: "NONE", inGuild: true },
  { key: "mia", discordId: "0200000000000000002", username: "mia.elbe", globalName: "Mia", teamLevel: "NONE", inGuild: true },
  { key: "tjark", discordId: "0200000000000000003", username: "tjark99", globalName: "Tjark (gebannt)", teamLevel: "NONE", inGuild: false, guildBanned: true },
];

const DAY = 86_400_000;
const ago = (days: number, hours = 0) => new Date(Date.now() - days * DAY - hours * 3600_000);

export async function seedDemo(db: PrismaClient, log: (m: string) => void = () => {}) {
  if (await db.user.findFirst({ where: { isTest: true } })) {
    log("Demo-Daten sind schon da – übersprungen.");
    return;
  }
  const u: Record<string, { id: string; discordId: string; globalName: string | null; username: string }> = {};
  for (const d of DEMO_USERS) {
    u[d.key] = await db.user.create({
      data: {
        discordId: d.discordId,
        username: d.username,
        globalName: d.globalName,
        discordCreatedAt: new Date("2020-01-01"),
        teamLevel: d.teamLevel,
        inGuild: d.inGuild,
        guildBanned: d.guildBanned ?? false,
        guildBanReason: d.guildBanned ? "Mehrfaches Combat Logging" : null,
        isTest: true,
        consentVersion: 1,
        consentAt: new Date(),
      },
    });
  }
  const year = new Date().getFullYear();
  let n = 0;
  const tid = () => formatPublicId("NVS", year, 900 + ++n);
  const name = (k: string) => u[k].globalName ?? u[k].username;

  const ticket = async (o: {
    creator: string;
    category: string;
    subject: string;
    fields: Record<string, unknown>;
    status: "OPEN" | "IN_PROGRESS" | "WAITING_PLAYER" | "RESOLVED" | "CLOSED";
    claimedBy?: string;
    sensitivity?: "NORMAL" | "MOD_ONLY" | "TEAM_COMPLAINT";
    accused?: string[];
    createdDaysAgo: number;
    priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
    messages: { by: string; kind: "PLAYER" | "TEAM" | "INTERNAL" | "SYSTEM"; body: string; hoursAfter: number; source?: "WEB" | "DISCORD" }[];
    rating?: number;
  }) => {
    const created = ago(o.createdDaysAgo);
    const t = await db.ticket.create({
      data: {
        publicId: tid(),
        category: o.category,
        subject: o.subject,
        fields: o.fields as never,
        status: o.status,
        priority: o.priority ?? "NORMAL",
        creatorId: u[o.creator].id,
        claimedById: o.claimedBy ? u[o.claimedBy].id : null,
        sensitivity: o.sensitivity ?? "NORMAL",
        accusedDiscordIds: (o.accused ?? []).map((k) => u[k].discordId),
        isTest: true,
        createdAt: created,
        lastPlayerAt: created,
        closedAt: o.status === "CLOSED" ? ago(o.createdDaysAgo - 2) : null,
        resolvedAt: o.status === "RESOLVED" ? ago(0, 5) : null,
        waitingSince: o.status === "WAITING_PLAYER" ? ago(1) : null,
        rating: o.rating ?? null,
        ratedAt: o.rating ? ago(o.createdDaysAgo - 2) : null,
      },
    });
    let firstResponse: Date | null = null;
    for (const m of o.messages) {
      const at = new Date(created.getTime() + m.hoursAfter * 3600_000);
      if (m.kind === "TEAM" && !firstResponse) firstResponse = at;
      await db.ticketMessage.create({
        data: { ticketId: t.id, authorId: u[m.by].id, authorName: name(m.by), authorDiscordId: u[m.by].discordId, kind: m.kind, body: m.body, source: m.source ?? "WEB", createdAt: at },
      });
    }
    await db.ticket.update({ where: { id: t.id }, data: { firstResponseAt: firstResponse } });
    await db.ticketEvent.create({ data: { ticketId: t.id, actorId: u[o.creator].id, actorName: name(o.creator), type: "created", to: "OPEN", createdAt: created } });
    return t;
  };

  await ticket({
    creator: "finn",
    category: "technik",
    subject: "SaltyChat verbindet nicht",
    fields: { area: "TeamSpeak / SaltyChat", error: "SaltyChat: Not connected to TeamSpeak", since: "seit gestern" },
    status: "OPEN",
    createdDaysAgo: 0.2,
    messages: [{ by: "finn", kind: "PLAYER", body: "Moin, seit gestern zeigt mir FiveM unten rechts nur 'Not connected'. TeamSpeak läuft aber. Was kann ich machen?", hoursAfter: 0 }],
  });
  await ticket({
    creator: "mia",
    category: "beschwerde",
    subject: "VDM am Hafen",
    fields: { date: new Date(Date.now() - 2 * DAY).toISOString().slice(0, 10), time: "21:30", involved: "Ingame: 'Kalle Krause' (schwarzer Sultan)", clip: "https://medal.tv/games/gta-v/clips/demo123" },
    status: "IN_PROGRESS",
    claimedBy: "jonas",
    priority: "HIGH",
    createdDaysAgo: 2,
    messages: [
      { by: "mia", kind: "PLAYER", body: "Ein Spieler ist mir am Hafen dreimal absichtlich reingefahren, ohne jedes RP. Clip ist dabei.", hoursAfter: 0 },
      { by: "jonas", kind: "TEAM", body: "Moin Mia, danke für den Clip – ich schau ihn mir an und melde mich.", hoursAfter: 1.5, source: "DISCORD" },
      { by: "jonas", kind: "INTERNAL", body: "Clip eindeutig. Kalle hat schon eine Verwarnung – an Moderation weitergeben?", hoursAfter: 2 },
    ],
  });
  await ticket({
    creator: "finn",
    category: "beschwerde",
    subject: "Beschwerde über Supporter",
    fields: { date: new Date(Date.now() - 1 * DAY).toISOString().slice(0, 10), time: "18:00", involved: "Supporter Jonas", noClip: true, noClipReason: "War im Support-Talk, keine Aufnahme", teamComplaint: true },
    status: "OPEN",
    sensitivity: "TEAM_COMPLAINT",
    accused: ["jonas"],
    createdDaysAgo: 1,
    messages: [{ by: "finn", kind: "PLAYER", body: "Im Support-Talk wurde ich ziemlich unfreundlich abgewürgt und ohne Erklärung gekickt. Ich will das nur mal gemeldet haben.", hoursAfter: 0 }],
  });
  await ticket({
    creator: "mia",
    category: "bug",
    subject: "Tankstelle zieht doppelt Geld ab",
    fields: { where: "Tankstelle Wilhelmsburg", steps: "Tanken, mit Karte bezahlen, Geld wird zweimal abgebucht", expected: "Einmal abbuchen" },
    status: "WAITING_PLAYER",
    claimedBy: "hanna",
    createdDaysAgo: 3,
    messages: [
      { by: "mia", kind: "PLAYER", body: "Beim Tanken wird mir immer doppelt abgebucht.", hoursAfter: 0 },
      { by: "hanna", kind: "TEAM", body: "Moin Mia, passiert das an allen Tankstellen oder nur an der in Wilhelmsburg?", hoursAfter: 3 },
    ],
  });
  await ticket({
    creator: "finn",
    category: "regelwerk",
    subject: "Darf ich Infos aus dem Stream nutzen?",
    fields: { rule: "2.3 Meta-Gaming" },
    status: "CLOSED",
    claimedBy: "kai",
    createdDaysAgo: 6,
    rating: 5,
    messages: [
      { by: "finn", kind: "PLAYER", body: "Ein Kumpel streamt – darf mein Charakter wissen, was er im Stream gesehen hat?", hoursAfter: 0 },
      { by: "kai", kind: "TEAM", body: "Moin Finn, nein – das ist Meta-Gaming (Regel 2.3). Dein Charakter weiß nur, was er im Spiel erlebt.", hoursAfter: 2 },
      { by: "finn", kind: "PLAYER", body: "Alles klar, danke!", hoursAfter: 3 },
    ],
  });
  log("Demo-Tickets angelegt");

  // Strafe für Tjark, ausgesprochen von Hanna (Vier-Augen-Prinzip testbar)
  const ban = await db.sanction.create({
    data: {
      subjectDiscordId: u.tjark.discordId,
      subjectId: u.tjark.id,
      kind: "BAN",
      source: "MANUAL",
      externalId: "BAN-1042",
      banType: "Temporärer Bann",
      reason: "Mehrfaches Combat Logging",
      startsAt: ago(5),
      endsAt: new Date(Date.now() + 25 * DAY),
      issuedByDiscordId: u.hanna.discordId,
      issuedByName: name("hanna"),
      createdById: u.hanna.id,
    },
  });
  await db.sanction.create({
    data: { subjectDiscordId: u.mia.discordId, subjectId: u.mia.id, kind: "WARNING", reason: "Fail-RP bei Verfolgungsjagd", issuedByDiscordId: u.kai.discordId, issuedByName: name("kai"), startsAt: ago(10), createdById: u.kai.id },
  });

  const types = Object.fromEntries((await db.requestType.findMany()).map((t) => [t.slug, t]));
  let r = 0;
  const rid = () => formatPublicId("NVA", year, 900 + ++r);
  if (types.entbannung) {
    const req = await db.request.create({
      data: {
        publicId: rid(),
        typeId: types.entbannung.id,
        applicantId: u.tjark.id,
        answers: {
          ingame_name: "Tjark Petersen",
          ban_ref: "BAN-1042",
          ban_type: "Temporärer Bann",
          ban_reason: "Mehrfaches Combat Logging",
          own_view: "Ich hatte zweimal Verbindungsabbrüche, einmal bin ich aber wirklich rausgegangen, weil ich keinen Bock auf die Situation hatte. Das war dumm.",
          why_lift: "Ich habe das Regelwerk nochmal gelesen und verstehe, warum das unfair gegenüber den anderen war.",
          future: "Ich spiele Situationen zu Ende, auch wenn sie für meinen Charakter schlecht laufen.",
          evidence: "",
        },
        banRef: "BAN-1042",
        banType: "Temporärer Bann",
        sanctionId: ban.id,
        issuedByDiscordId: u.hanna.discordId,
        honestyConfirmedAt: ago(1),
        isTest: true,
        createdAt: ago(1),
      },
    });
    await db.requestMessage.create({ data: { requestId: req.id, authorName: "System", kind: "SYSTEM", body: "Antrag eingereicht (Entbannungsantrag).", createdAt: ago(1) } });
  }
  if (types.einspruch) {
    const req = await db.request.create({
      data: {
        publicId: rid(),
        typeId: types.einspruch.id,
        applicantId: u.mia.id,
        status: "IN_REVIEW",
        answers: {
          ingame_name: "Mia Hansen",
          ban_ref: ago(10).toISOString().slice(0, 10),
          ban_type: "Verwarnung",
          ban_reason: "Fail-RP bei Verfolgungsjagd",
          own_view: "Mein Auto war laut Mechaniker repariert, deshalb bin ich weitergefahren.",
          why_lift: "Das war kein Fail-RP, der Schaden war vorher behoben.",
          evidence: "https://www.youtube.com/watch?v=demo",
        },
        issuedByDiscordId: u.kai.discordId,
        honestyConfirmedAt: ago(4),
        isTest: true,
        createdAt: ago(4),
      },
    });
    await db.requestComment.create({ data: { requestId: req.id, authorId: u.hanna.id, body: "Clip zeigt Reparatur nicht eindeutig – Kai, hast du noch was?", createdAt: ago(3) } });
    await db.requestVote.create({ data: { requestId: req.id, userId: u.hanna.id, value: "CONTRA" } });
  }
  if (types.namensaenderung) {
    await db.request.create({
      data: {
        publicId: rid(),
        typeId: types.namensaenderung.id,
        applicantId: u.finn.id,
        status: "DECIDED",
        answers: { current_name: "Finn Möller", new_name: "Finn Mahler", reason: "Heirat im RP" },
        outcomeKey: "angenommen",
        outcomeLabel: "Angenommen",
        outcomeCategory: "ACCEPTED",
        decisionReason: "Passt, Heirat ist im RP gut dokumentiert. Glückwunsch!",
        decidedAt: ago(2),
        decidedById: u.jonas.id,
        isTest: true,
        createdAt: ago(5),
      },
    });
  }
  log("Demo-Anträge angelegt");

  await db.statusIncident.create({
    data: {
      title: "Geplante Wartung: Server-Update",
      body: "Wir spielen ein größeres Update ein. Der Server ist in der Zeit nicht erreichbar.",
      kind: "MAINTENANCE",
      severity: "INFO",
      systems: ["gameserver"],
      startsAt: new Date(Date.now() + 2 * DAY),
      endsAt: new Date(Date.now() + 2 * DAY + 2 * 3600_000),
      createdById: u.ole.id,
    },
  });
  await db.searchMiss.createMany({ data: [{ term: "auto tuning", count: 4 }, { term: "hausnummer kaufen", count: 2 }] });
  log("Demo-Statusmeldung angelegt");
}
