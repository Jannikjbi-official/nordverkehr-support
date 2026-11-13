import { db } from "@/lib/db";

/** Fortlaufende öffentliche ID pro Jahr: NVS-2026-0001 / NVA-2026-0001 */
export function formatPublicId(prefix: string, year: number, n: number) {
  return `${prefix}-${year}-${String(n).padStart(4, "0")}`;
}

export async function nextPublicId(prefix: string, now = new Date()): Promise<string> {
  const year = now.getFullYear();
  const key = `${prefix}-${year}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const c = await db.counter.upsert({ where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } } });
      return formatPublicId(prefix, year, c.value);
    } catch {
      // gleichzeitiges Anlegen → nochmal (dann greift das Update)
    }
  }
  throw new Error("ID konnte nicht vergeben werden.");
}

/** „NVS-2026-0012“, „nvs-2026-12“, „12“ → normalisiert (aktuelles Jahr bei reiner Zahl) */
export function normalizePublicId(input: string, prefix: string, year = new Date().getFullYear()): string | null {
  const s = input.trim().toUpperCase().replace(/\s+/g, "");
  const p = prefix.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let m = s.match(new RegExp(`^${p}-?(\\d{4})-?(\\d{1,5})$`));
  if (m) return formatPublicId(prefix.toUpperCase(), Number(m[1]), Number(m[2]));
  m = s.match(/^#?(\d{1,5})$/);
  if (m) return formatPublicId(prefix.toUpperCase(), year, Number(m[1]));
  return null;
}
