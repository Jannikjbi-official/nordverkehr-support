/** Fehler mit Text, der dem Nutzer angezeigt werden darf */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

/** Fehler in eine Antwort für den Client übersetzen (interne Fehler nie im Detail zeigen) */
export function toActionError(err: unknown): { ok: false; error: string } {
  if (err instanceof UserError) return { ok: false, error: err.message };
  const e = err as { name?: string; message?: string; status?: number; digest?: string } | null;
  // Next.js-Redirects/NotFound durchreichen
  if (e && typeof e.digest === "string" && e.digest.startsWith("NEXT_")) throw err;
  if (e?.name === "RateLimitedError" && e.message) return { ok: false, error: e.message };
  if (e && (e.status === 401 || e.status === 403) && e.message) return { ok: false, error: e.message };
  console.error("[action]", err);
  return { ok: false, error: "Da ist etwas schiefgelaufen. Versuch es gleich nochmal." };
}
