"use client";

import { useId, useRef, useState } from "react";
import { ImageSquare, LinkSimple, Trash, X } from "@phosphor-icons/react/ssr";
import { CLIP_HOSTS_LABEL, isAllowedClipUrl } from "@/lib/uploads/links";

export interface AttachmentValue {
  attachmentIds: string[];
  links: string[];
}

/**
 * Screenshots (JPG/PNG/WebP, max. 8 MB, max. 5) und Clip-Links (YouTube, Twitch, Medal).
 * Die Bilder werden sofort hochgeladen und beim Absenden zugeordnet.
 */
export function AttachmentInput({ value, onChange, maxImages = 5, compact = false }: { value: AttachmentValue; onChange: (v: AttachmentValue) => void; maxImages?: number; compact?: boolean }) {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    setBusy(true);
    const ids = [...value.attachmentIds];
    for (const f of [...files].slice(0, maxImages - ids.length)) {
      if (f.size > 8 * 1024 * 1024) {
        setError(`${f.name}: zu groß (max. 8 MB).`);
        continue;
      }
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { attachment?: { id: string }; error?: string };
      if (!res.ok || !data.attachment) {
        setError(data.error ?? "Upload fehlgeschlagen.");
        continue;
      }
      ids.push(data.attachment.id);
      setPreviews((p) => ({ ...p, [data.attachment!.id]: URL.createObjectURL(f) }));
    }
    onChange({ ...value, attachmentIds: ids });
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const remove = async (aid: string) => {
    await fetch(`/api/uploads/${aid}`, { method: "DELETE" }).catch(() => {});
    onChange({ ...value, attachmentIds: value.attachmentIds.filter((x) => x !== aid) });
  };

  const addLink = () => {
    const l = link.trim();
    if (!l) return;
    if (!isAllowedClipUrl(l)) {
      setError(`Nur https-Links von ${CLIP_HOSTS_LABEL}.`);
      return;
    }
    if (value.links.length >= 5) return;
    setError(null);
    onChange({ ...value, links: [...new Set([...value.links, l])] });
    setLink("");
  };

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div className="flex flex-wrap gap-2 items-center">
        <input id={`${id}-file`} ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => upload(e.target.files)} />
        <label htmlFor={`${id}-file`} className={`nv-btn nv-btn-ghost nv-btn-sm cursor-pointer ${value.attachmentIds.length >= maxImages || busy ? "opacity-50 pointer-events-none" : ""}`}>
          <ImageSquare size={16} aria-hidden /> {busy ? "Lädt hoch …" : "Screenshot anhängen"}
        </label>
        <div className="flex gap-1.5 flex-1 min-w-[220px]">
          <label htmlFor={`${id}-link`} className="sr-only">
            Clip-Link
          </label>
          <input
            id={`${id}-link`}
            type="url"
            inputMode="url"
            className="nv-input !py-1.5 text-sm"
            placeholder={`Clip-Link (${CLIP_HOSTS_LABEL})`}
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addLink();
              }
            }}
          />
          <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm" onClick={addLink}>
            <LinkSimple size={16} aria-hidden /> Hinzufügen
          </button>
        </div>
      </div>
      {!compact && <p className="nv-help">Bilder: JPG, PNG oder WebP, max. 8 MB, höchstens {maxImages}. Metadaten (z. B. GPS) entfernen wir automatisch.</p>}
      {(value.attachmentIds.length > 0 || value.links.length > 0) && (
        <ul className="flex flex-wrap gap-2">
          {value.attachmentIds.map((aid) => (
            <li key={aid} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previews[aid] ?? `/api/uploads/${aid}`} alt="Anhang" className="h-16 w-16 object-cover rounded-lg border border-line" />
              <button type="button" onClick={() => remove(aid)} className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-surface border border-line grid place-items-center" aria-label="Bild entfernen">
                <Trash size={12} aria-hidden />
              </button>
            </li>
          ))}
          {value.links.map((l) => (
            <li key={l} className="nv-pill nv-tone-muted !normal-case max-w-full">
              <LinkSimple size={12} aria-hidden /> <span className="truncate max-w-[16rem]">{l}</span>
              <button type="button" onClick={() => onChange({ ...value, links: value.links.filter((x) => x !== l) })} aria-label="Link entfernen">
                <X size={12} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="nv-error" role="alert">{error}</p>}
    </div>
  );
}
