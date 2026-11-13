/** Platzhalter beim Seitenwechsel – erscheint sofort, bis der Server die Seite liefert. */
export function PageSkeleton({ variant = "page" }: { variant?: "page" | "team" }) {
  return (
    <div role="status" aria-live="polite" aria-label="Seite lädt" className={variant === "page" ? "mx-auto max-w-6xl px-4 sm:px-6 pt-32 sm:pt-36 pb-16" : ""}>
      <div className="nv-skeleton h-3 w-32" />
      <div className="nv-skeleton mt-4 h-10 w-full max-w-md" />
      <div className="nv-skeleton mt-3 h-4 w-full max-w-xl" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="nv-skeleton h-32" />
        <div className="nv-skeleton h-32" />
        <div className="nv-skeleton h-32 sm:col-span-2" />
      </div>
      <span className="sr-only">Lädt …</span>
    </div>
  );
}
