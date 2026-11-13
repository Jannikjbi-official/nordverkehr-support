"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, MagnifyingGlass } from "@phosphor-icons/react/ssr";

interface Hit {
  title: string;
  url: string;
  snippet: string;
  category: string;
}

/** Große Suche mit Live-Vorschlägen (Combobox, Tastatur-bedienbar). */
export function SearchBox({ initial = "", autoFocus = false, size = "lg" }: { initial?: string; autoFocus?: boolean; size?: "lg" | "md" }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) return;
    timer.current = setTimeout(async () => {
      ctrl.current?.abort();
      ctrl.current = new AbortController();
      try {
        const res = await fetch(`/api/help/search?q=${encodeURIComponent(q)}&live=1`, { signal: ctrl.current.signal });
        if (!res.ok) return;
        const data = (await res.json()) as { hits: Hit[] };
        setHits(data.hits.slice(0, 6));
        setActive(-1);
        setOpen(true);
      } catch {
        // abgebrochen
      }
    }, 180);
  }, [q]);

  // Zu kurze Eingabe: keine Vorschläge anzeigen (ohne State im Effect zu setzen)
  const shown = q.trim().length >= 2 ? hits : [];

  const go = (url: string) => {
    setOpen(false);
    router.push(url);
  };

  return (
    <form
      role="search"
      className="relative w-full"
      onSubmit={(e) => {
        e.preventDefault();
        if (active >= 0 && shown[active]) return go(shown[active].url);
        if (q.trim().length >= 2) go(`/suche?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <label htmlFor={`${listId}-input`} className="sr-only">
        Hilfe durchsuchen
      </label>
      <div className={`flex items-center gap-3 rounded-2xl border border-line-strong bg-surface shadow-[var(--nv-shadow)] focus-within:border-red ${size === "lg" ? "px-5 py-4" : "px-4 py-2.5"}`}>
        <MagnifyingGlass size={size === "lg" ? 24 : 18} className="text-muted shrink-0" aria-hidden />
        <input
          id={`${listId}-input`}
          type="search"
          role="combobox"
          aria-expanded={open && shown.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          autoFocus={autoFocus}
          maxLength={120}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => shown.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(shown.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(-1, a - 1));
            } else if (e.key === "Escape") setOpen(false);
          }}
          placeholder="z. B. „SaltyChat“ oder „Whitelist“"
          className={`flex-1 min-w-0 bg-transparent outline-none placeholder:text-faint ${size === "lg" ? "text-lg" : "text-base"}`}
        />
        <button type="submit" className={`nv-btn nv-btn-primary ${size === "lg" ? "" : "nv-btn-sm"}`}>
          Suchen
        </button>
      </div>
      {open && shown.length > 0 && (
        <ul id={listId} role="listbox" className="absolute z-20 left-0 right-0 mt-2 rounded-xl border border-line bg-surface p-1.5 shadow-[var(--nv-shadow)] text-left">
          {shown.map((h, i) => (
            <li key={h.url} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(h.url)}
                className={`w-full text-left rounded-lg px-3 py-2.5 flex items-start gap-3 ${i === active ? "bg-card-hover" : "hover:bg-card-hover"}`}
              >
                <ArrowRight size={16} className="text-red-text mt-1 shrink-0" aria-hidden />
                <span>
                  <span className="block font-medium">{h.title}</span>
                  <span className="block text-xs text-muted line-clamp-1">
                    {h.category} · {h.snippet}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
