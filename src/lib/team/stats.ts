/** Statistik-Helfer – rein, testbar */
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function average(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

/** Dauer in ms → „3 Std. 20 Min.“ / „2 Tage 4 Std.“ */
export function formatDuration(ms: number | null): string {
  if (ms === null) return "–";
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} Min.`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} Std.${min % 60 ? ` ${min % 60} Min.` : ""}`;
  const d = Math.floor(h / 24);
  return `${d} Tage${h % 24 ? ` ${h % 24} Std.` : ""}`;
}

export function countBy<T>(items: T[], key: (t: T) => string): { key: string; count: number }[] {
  const m = new Map<string, number>();
  for (const i of items) m.set(key(i), (m.get(key(i)) ?? 0) + 1);
  return [...m.entries()].map(([k, count]) => ({ key: k, count })).sort((a, b) => b.count - a.count);
}

/** Artikel mit auffällig vielen „Nein“: mind. `minVotes` Stimmen und Quote < 50 % */
export function weakArticles<T extends { helpfulYes: number; helpfulNo: number }>(articles: T[], minVotes = 3) {
  return articles
    .filter((a) => a.helpfulYes + a.helpfulNo >= minVotes && a.helpfulNo > a.helpfulYes)
    .sort((a, b) => b.helpfulNo / (b.helpfulYes + b.helpfulNo) - a.helpfulNo / (a.helpfulYes + a.helpfulNo));
}
