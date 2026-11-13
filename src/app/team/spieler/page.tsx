import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireTeam } from "@/lib/auth/session";
import { LEVEL_LABEL } from "@/lib/auth/access";
import { Avatar, EmptyState, formatRelative } from "@/components/ui";

export const metadata: Metadata = { title: "Spieler" };

export default async function PlayersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireTeam();
  const { q = "" } = await searchParams;
  const query = q.trim().slice(0, 60);
  const users = await db.user.findMany({
    where: query
      ? { OR: [{ username: { contains: query, mode: "insensitive" } }, { globalName: { contains: query, mode: "insensitive" } }, { discordId: query }] }
      : {},
    orderBy: { lastLoginAt: { sort: "desc", nulls: "last" } },
    take: 50,
    include: { _count: { select: { tickets: true, requests: true } } },
  });
  return (
    <div>
      <p className="nv-label">Team // Spieler</p>
      <h1 className="nv-headline text-4xl mt-3">
        Spieler<em>profile</em>
      </h1>
      <form className="mt-6 flex gap-2 max-w-xl" method="get">
        <label htmlFor="q" className="sr-only">
          Suche
        </label>
        <input id="q" name="q" defaultValue={query} className="nv-input" placeholder="Name, Benutzername oder Discord-ID" />
        <button type="submit" className="nv-btn nv-btn-primary nv-btn-sm">
          Suchen
        </button>
      </form>
      <div className="mt-6">
        {users.length === 0 ? (
          <EmptyState title="Niemand gefunden">Nur Personen, die sich schon mal eingeloggt oder per Discord ein Ticket erstellt haben.</EmptyState>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {users.map((u) => (
              <li key={u.id}>
                <Link href={`/team/spieler/${u.id}`} className="nv-card nv-card-hover p-3 flex items-center gap-3">
                  <Avatar discordId={u.discordId} avatar={u.avatar} size={36} />
                  <span className="flex-1 min-w-0">
                    <span className="font-medium block truncate">{u.globalName || u.username}</span>
                    <span className="text-xs text-muted">
                      @{u.username} · {u._count.tickets} Tickets · {u._count.requests} Anträge
                      {u.lastLoginAt ? ` · zuletzt ${formatRelative(u.lastLoginAt)}` : ""}
                    </span>
                  </span>
                  {u.teamLevel !== "NONE" && <span className="nv-pill nv-pill-red !text-[0.65rem]">{LEVEL_LABEL[u.teamLevel]}</span>}
                  {u.guildBanned && <span className="nv-pill nv-tone-danger !text-[0.65rem]">gebannt</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
