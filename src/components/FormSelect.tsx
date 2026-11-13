"use client";

import { useRef, useState } from "react";
import { Select, type SelectOption } from "@/components/Select";

/**
 * Unkontrollierte Variante von <Select> für normale Formulare (z. B. GET-Filter
 * in Server-Komponenten): hält den Wert selbst, schickt ihn über ein verstecktes
 * Feld (`name`) mit ab und kann das Formular optional direkt absenden.
 */
export function FormSelect({
  options,
  defaultValue = "",
  name,
  id,
  ariaLabel,
  placeholder,
  disabled,
  size,
  className,
  autoSubmit = false,
}: {
  options: SelectOption[];
  defaultValue?: string;
  name: string;
  id?: string;
  ariaLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  size?: "md" | "sm";
  className?: string;
  /** Formular nach der Auswahl sofort abschicken */
  autoSubmit?: boolean;
}) {
  const [value, setValue] = useState(defaultValue);
  // Neuer Ausgangswert (z. B. nach Navigation) → übernehmen
  const [initial, setInitial] = useState(defaultValue);
  if (initial !== defaultValue) {
    setInitial(defaultValue);
    setValue(defaultValue);
  }
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div ref={ref} className={className}>
      <Select
        options={options}
        value={value}
        onChange={setValue}
        id={id}
        ariaLabel={ariaLabel}
        name={name}
        placeholder={placeholder}
        disabled={disabled}
        size={size}
        onAfterChange={autoSubmit ? () => ref.current?.closest("form")?.requestSubmit() : undefined}
      />
    </div>
  );
}
