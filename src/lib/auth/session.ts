import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import type { TeamLevel } from "@prisma/client";
import { atLeast, type Access } from "@/lib/auth/access";
import { getAccess, loadUserFromSession, type CurrentUser } from "@/lib/auth/user-access";

export type { CurrentUser };
export { getAccess, loadUserFromSession };

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  await connection();
  const { auth } = await import("@/auth");
  const session = await auth();
  return loadUserFromSession(session);
});

export const getCurrentAccess = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return { user: null, access: null } as const;
  return { user, access: await getAccess(user) } as const;
});

/** Eingeloggt sein, sonst Login. Gebannte Personen sind erlaubt (nur für Anträge/Konto verwenden). */
export async function requireUser(callbackUrl = "/dashboard"): Promise<{ user: CurrentUser; access: Access }> {
  const { user, access } = await getCurrentAccess();
  if (!user || !access) redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  return { user, access };
}

/** Eingeloggt und NICHT vom Discord gebannt (Tickets, Dashboard). */
export async function requirePlayer(callbackUrl = "/dashboard") {
  const ctx = await requireUser(callbackUrl);
  if (ctx.access.guildBanned) redirect("/antraege?gesperrt=1");
  return ctx;
}

/** Merkt sich, dass ein Teammitglied aktiv ist. Max. 1×/Minute. */
async function touchTeamActivity(user: CurrentUser) {
  if (user.lastTeamActiveAt && Date.now() - user.lastTeamActiveAt.getTime() < 60_000) return;
  const { db } = await import("@/lib/db");
  await db.user.update({ where: { id: user.id }, data: { lastTeamActiveAt: new Date() } }).catch(() => {});
}

/** Team-Rolle (mindestens `min`) – bei jeder Seite UND jeder Action prüfen. */
export async function requireTeam(min: TeamLevel = "SUPPORT") {
  const { user, access } = await getCurrentAccess();
  if (!user || !access) redirect("/login?callbackUrl=/team");
  if (!access.isTeam) redirect("/kein-zugriff");
  if (!atLeast(access.teamLevel, min)) redirect("/team?hinweis=rechte");
  await touchTeamActivity(user);
  return { user, access };
}

export const requireLead = () => requireTeam("LEITUNG");

export class AccessError extends Error {
  constructor(
    public readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
  }
}

/** Für Route-Handler/Actions: wirft AccessError statt Redirect. */
export async function assertTeam(min: TeamLevel = "SUPPORT") {
  const { user, access } = await getCurrentAccess();
  if (!user || !access) throw new AccessError(401, "Nicht eingeloggt.");
  if (!access.isTeam) throw new AccessError(403, "Kein Zugriff.");
  if (!atLeast(access.teamLevel, min)) throw new AccessError(403, "Dafür fehlen dir die Rechte.");
  await touchTeamActivity(user);
  return { user, access };
}

export async function assertUser(opts: { allowBanned?: boolean } = {}) {
  const { user, access } = await getCurrentAccess();
  if (!user || !access) throw new AccessError(401, "Nicht eingeloggt.");
  if (access.guildBanned && !opts.allowBanned) throw new AccessError(403, "Du bist vom Discord gesperrt – möglich ist nur ein Entbannungsantrag.");
  return { user, access };
}

export function accessErrorResponse(err: unknown): Response {
  if (err instanceof AccessError) return Response.json({ error: err.message }, { status: err.status });
  throw err;
}
