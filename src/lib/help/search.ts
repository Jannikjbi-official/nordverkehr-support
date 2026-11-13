/**
 * Volltextsuche für Hilfe-Artikel mit Tippfehler-Toleranz – rein, ohne
 * Atlas Search (läuft lokal und auf jedem MongoDB-Plan).
 *
 *  - Normalisierung: klein, Umlaute → ae/oe/ue/ss, Satzzeichen weg
 *  - Treffer je Suchwort: exakt > Wortanfang > Teilwort > Tippfehler
 *    (Damerau-Levenshtein, 1 Fehler ab 4 Zeichen, 2 ab 7)
 *  - Zusammengesetzte Wörter: „salty chat“ findet „saltychat“ und umgekehrt
 *  - Gewichtung: Titel > Tags > Kurztext > Text
 */

export interface SearchDoc {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  tags: string[];
  categorySlug: string;
  categoryTitle: string;
}

export interface SearchHit {
  doc: SearchDoc;
  score: number;
  snippet: string;
}

const STOP = new Set(
  "der die das den dem des ein eine einen einem einer und oder aber ich du er sie es wir ihr mein meine mich mir dein deine wie was wo wer wann warum ist sind bin bist war geht gehen kann kannst koennen nicht kein keine mit fuer von zu im in am an auf aus bei nach ueber um so auch noch nur mal ja nein bitte hilfe help habe hab hat man".split(
    " ",
  ),
);

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function tokenize(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter((w) => w.length >= 2 && !STOP.has(w));
}

/** Damerau-Levenshtein (optimal string alignment) mit Abbruch über `max` */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

const allowedErrors = (len: number) => (len >= 7 ? 2 : len >= 4 ? 1 : 0);

/** Wie gut passt ein Suchwort zu einem Wort? 0..1 */
export function termScore(q: string, w: string): number {
  if (q === w) return 1;
  if (q.length >= 3 && w.startsWith(q)) return 0.85;
  if (q.length >= 5 && w.includes(q)) return 0.7;
  if (w.length >= 4 && q.startsWith(w) && q.length - w.length <= 3) return 0.6;
  const max = allowedErrors(Math.min(q.length, Math.max(w.length, q.length)));
  if (!max) return 0;
  const dist = editDistance(q, w, max);
  if (dist <= max) return dist === 1 ? 0.65 : 0.45;
  // Tippfehler im Wortanfang eines längeren Worts („teamspek“ → „teamspeak3“)
  if (q.length >= 5 && w.length > q.length) {
    const head = w.slice(0, q.length);
    const dh = editDistance(q, head, allowedErrors(q.length));
    if (dh <= allowedErrors(q.length)) return 0.5;
  }
  return 0;
}

interface IndexedDoc {
  doc: SearchDoc;
  fields: { weight: number; words: string[] }[];
}

export interface SearchIndex {
  docs: IndexedDoc[];
}

const uniq = (a: string[]) => [...new Set(a)];

/** Wörter eines Felds + zusammengezogene Paare („salty chat“ → „saltychat“) */
function fieldWords(text: string) {
  const words = tokenize(text);
  const pairs: string[] = [];
  for (let i = 0; i < words.length - 1; i++) pairs.push(words[i] + words[i + 1]);
  return uniq([...words, ...pairs]);
}

export function buildIndex(docs: SearchDoc[]): SearchIndex {
  return {
    docs: docs.map((doc) => ({
      doc,
      fields: [
        { weight: 6, words: fieldWords(doc.title) },
        { weight: 4, words: uniq(doc.tags.flatMap((t) => fieldWords(t))) },
        { weight: 2.5, words: fieldWords(`${doc.summary} ${doc.categoryTitle}`) },
        { weight: 1, words: fieldWords(doc.body) },
      ],
    })),
  };
}

/** Suchwörter + zusammengezogene Varianten */
export function queryTerms(query: string): string[][] {
  const words = tokenize(query).slice(0, 8);
  // Jede Gruppe: Alternativen für ein Suchwort (Wort selbst; Wort+nächstes Wort)
  return words.map((w, i) => (i < words.length - 1 ? [w, w + words[i + 1]] : [w]));
}

function bestFieldScore(alternatives: string[], words: string[]) {
  let best = 0;
  for (const q of alternatives) {
    for (const w of words) {
      const s = termScore(q, w);
      if (s > best) best = s;
      if (best === 1) return 1;
    }
  }
  return best;
}

export function makeSnippet(doc: SearchDoc, terms: string[][], max = 180): string {
  const flat = terms.flat();
  const plain = doc.body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[#>*_`|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const sentences = plain.split(/(?<=[.!?])\s+/);
  let best = "";
  let bestScore = 0;
  for (const s of sentences) {
    const words = tokenize(s);
    const sc = flat.reduce((acc, q) => acc + Math.max(0, ...words.map((w) => termScore(q, w))), 0);
    if (sc > bestScore) {
      bestScore = sc;
      best = s;
    }
  }
  const text = bestScore > 0.5 ? best : doc.summary;
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}

export function search(index: SearchIndex, query: string, limit = 10): SearchHit[] {
  const terms = queryTerms(query);
  if (!terms.length) return [];
  const hits: SearchHit[] = [];
  for (const d of index.docs) {
    let score = 0;
    let matched = 0;
    for (const alt of terms) {
      let termBest = 0;
      for (const f of d.fields) termBest = Math.max(termBest, bestFieldScore(alt, f.words) * f.weight);
      if (termBest > 0) matched++;
      score += termBest;
    }
    // Die meisten Suchwörter müssen passen (bei 1–2 Wörtern: alle bzw. eins von zwei)
    const needed = terms.length <= 2 ? 1 : Math.ceil(terms.length * 0.6);
    if (matched < needed) continue;
    score *= matched / terms.length;
    hits.push({ doc: d.doc, score, snippet: "" });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit).map((h) => ({ ...h, snippet: makeSnippet(h.doc, terms) }));
}

/** Suchbegriff für die „ohne Treffer“-Liste vereinheitlichen */
export function missKey(query: string) {
  return normalize(query).slice(0, 80);
}
