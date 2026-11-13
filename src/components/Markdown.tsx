/**
 * Kleiner, sicherer Markdown-Renderer für Hilfe-Artikel (Server und Client).
 * Erzeugt React-Elemente – kein `dangerouslySetInnerHTML`, damit kein HTML/
 * Script aus Artikeln durchrutscht. Unterstützt: Überschriften (mit Anker),
 * Absätze, Listen, Zitate, Code, Tabellen, Trennlinien, fett/kursiv, Links,
 * Bilder (nur https oder relative Pfade).
 */
import type { ReactNode } from "react";

export interface TocItem {
  id: string;
  text: string;
  level: number;
}

export function slugify(text: string) {
  return (
    text
      .toLowerCase()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "abschnitt"
  );
}

function safeUrl(url: string): string | null {
  const u = url.trim();
  if (u.startsWith("/") && !u.startsWith("//")) return u;
  if (u.startsWith("#")) return u;
  if (/^https:\/\//i.test(u)) return u;
  if (/^mailto:/i.test(u)) return u;
  if (/^fivem:\/\/connect\//i.test(u)) return u;
  return null;
}

/** Inline: `code`, **fett**, *kursiv*, [Link](url), ![Bild](url) */
export function renderInline(text: string, keyPrefix = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`)|(!\[[^\]]*]\([^)\s]+\))|(\[[^\]]+]\([^)\s]+\))|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(_[^_\s][^_]*_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyPrefix}-${n++}`;
    if (tok.startsWith("`")) {
      out.push(<code key={key}>{tok.slice(1, -1)}</code>);
    } else if (tok.startsWith("![")) {
      const mm = tok.match(/^!\[([^\]]*)]\(([^)\s]+)\)$/)!;
      const src = safeUrl(mm[2]);
      // eslint-disable-next-line @next/next/no-img-element
      out.push(src && !src.startsWith("#") ? <img key={key} src={src} alt={mm[1]} loading="lazy" className="rounded-xl border border-line my-4 max-w-full" /> : mm[1]);
    } else if (tok.startsWith("[")) {
      const mm = tok.match(/^\[([^\]]+)]\(([^)\s]+)\)$/)!;
      const href = safeUrl(mm[2]);
      const external = !!href && /^https:\/\//i.test(href);
      out.push(
        href ? (
          <a key={key} href={href} className="nv-link" {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
            {renderInline(mm[1], key)}
          </a>
        ) : (
          mm[1]
        ),
      );
    } else if (tok.startsWith("**")) {
      out.push(<strong key={key}>{renderInline(tok.slice(2, -2), key)}</strong>);
    } else {
      out.push(<em key={key}>{renderInline(tok.slice(1, -1), key)}</em>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { t: "h"; level: number; text: string; id: string }
  | { t: "p"; text: string }
  | { t: "ul" | "ol"; items: string[] }
  | { t: "quote"; text: string }
  | { t: "code"; text: string }
  | { t: "table"; head: string[]; rows: string[][] }
  | { t: "hr" };

const splitRow = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

export function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  const used = new Map<string, number>();
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i++]);
      i++;
      blocks.push({ t: "code", text: buf.join("\n") });
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.+)$/);
    if (h) {
      const text = h[2].trim();
      let id = slugify(text);
      const c = used.get(id) ?? 0;
      used.set(id, c + 1);
      if (c) id = `${id}-${c + 1}`;
      blocks.push({ t: "h", level: h[1].length, text, id });
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push({ t: "hr" });
      i++;
      continue;
    }
    if (line.startsWith(">")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) buf.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push({ t: "quote", text: buf.join(" ") });
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && (ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/).test(lines[i])) {
        let item = lines[i].replace(ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/, "");
        i++;
        // Fortsetzungszeilen (eingerückt)
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) item += " " + lines[i++].trim();
        items.push(item);
      }
      blocks.push({ t: ordered ? "ol" : "ul", items });
      continue;
    }
    if (line.trim().startsWith("|") && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const head = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(splitRow(lines[i++]));
      blocks.push({ t: "table", head, rows });
      continue;
    }
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4}\s|```|>|\s*[-*+]\s+|\s*\d+[.)]\s+|-{3,}\s*$)/.test(lines[i]) &&
      !(lines[i].trim().startsWith("|") && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1]))
    )
      buf.push(lines[i++].trim());
    blocks.push({ t: "p", text: buf.join(" ") });
  }
  return blocks;
}

export function extractToc(md: string): TocItem[] {
  return parseBlocks(md)
    .filter((b): b is Extract<Block, { t: "h" }> => b.t === "h" && b.level >= 2 && b.level <= 3)
    .map((b) => ({ id: b.id, text: b.text.replace(/[*_`]/g, ""), level: b.level }));
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  const blocks = parseBlocks(source);
  return (
    <div className={`nv-prose ${className ?? ""}`}>
      {blocks.map((b, k) => {
        switch (b.t) {
          case "h": {
            const Tag = (`h${Math.min(4, b.level + (b.level === 1 ? 1 : 0))}`) as "h2" | "h3" | "h4";
            return (
              <Tag key={k} id={b.id}>
                {renderInline(b.text, `h${k}`)}
              </Tag>
            );
          }
          case "p":
            return <p key={k}>{renderInline(b.text, `p${k}`)}</p>;
          case "ul":
            return (
              <ul key={k}>
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it, `u${k}-${j}`)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={k}>
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it, `o${k}-${j}`)}</li>
                ))}
              </ol>
            );
          case "quote":
            return <blockquote key={k}>{renderInline(b.text, `q${k}`)}</blockquote>;
          case "code":
            return (
              <pre key={k}>
                <code>{b.text}</code>
              </pre>
            );
          case "table":
            return (
              <div key={k} className="nv-scroll-x">
                <table>
                  <thead>
                    <tr>
                      {b.head.map((c, j) => (
                        <th key={j}>{renderInline(c, `th${k}-${j}`)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j}>
                        {r.map((c, x) => (
                          <td key={x}>{renderInline(c, `td${k}-${j}-${x}`)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "hr":
            return <hr key={k} />;
        }
      })}
    </div>
  );
}
