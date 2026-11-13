import { Check, ChatCircleDots, Hourglass, PaperPlaneTilt, Scales, X } from "@phosphor-icons/react/ssr";
import type { OutcomeCategory, RequestStatus } from "@prisma/client";
import { cn, formatDay } from "@/components/ui";

type StepState = "done" | "current" | "todo" | "warn" | "good" | "bad" | "neutral";

interface Props {
  status: RequestStatus;
  createdAt: Date;
  decidedAt?: Date | null;
  outcomeCategory?: OutcomeCategory | null;
  outcomeLabel?: string | null;
  compact?: boolean;
}

/** Fortschritt eines Antrags: Eingereicht → In Prüfung (ggf. Rückfrage) → Entschieden */
export function RequestProgress({ status, createdAt, decidedAt, outcomeCategory, outcomeLabel, compact }: Props) {
  const decided = status === "DECIDED" || status === "ARCHIVED";
  const withdrawn = status === "WITHDRAWN";
  const reviewing = status === "IN_REVIEW" || status === "QUESTION";
  const outcomeState: StepState = outcomeCategory === "ACCEPTED" ? "good" : outcomeCategory === "REJECTED" ? "bad" : "neutral";

  const steps: { label: string; hint: string; state: StepState; icon: typeof Check }[] = [
    { label: "Eingereicht", hint: formatDay(createdAt), state: "done", icon: PaperPlaneTilt },
    {
      label: status === "QUESTION" ? "Rückfrage an dich" : "In Prüfung",
      hint: status === "QUESTION" ? "Antworte unten" : reviewing ? "Das Team schaut drauf" : decided || withdrawn ? "erledigt" : "wartet auf das Team",
      state: status === "QUESTION" ? "warn" : reviewing ? "current" : decided || withdrawn ? "done" : "todo",
      icon: status === "QUESTION" ? ChatCircleDots : Hourglass,
    },
    withdrawn
      ? { label: "Zurückgezogen", hint: "", state: "neutral", icon: X }
      : {
          label: decided ? (outcomeLabel ?? "Entschieden") : "Entscheidung",
          hint: decided ? formatDay(decidedAt ?? null) : "mit Begründung",
          state: decided ? outcomeState : "todo",
          icon: decided ? (outcomeCategory === "REJECTED" ? X : outcomeCategory === "ACCEPTED" ? Check : Scales) : Scales,
        },
  ];

  const dot: Record<StepState, string> = {
    done: "bg-red border-red text-white",
    current: "border-red text-red-text bg-red-soft nv-pulse-ring",
    todo: "border-line text-faint bg-transparent",
    warn: "border-[color:var(--tone-warn)] text-[color:var(--tone-warn)] bg-[color:var(--tone-warn-bg)]",
    good: "border-[color:var(--tone-success)] text-white bg-[color:var(--tone-success)]",
    bad: "border-[color:var(--tone-danger)] text-white bg-[color:var(--tone-danger)]",
    neutral: "border-line-strong text-muted bg-card",
  };
  const bar = (i: number) => (steps[i + 1].state === "todo" ? "bg-line" : "bg-red");

  if (compact) {
    return (
      <ol className="flex items-center gap-1.5" aria-label="Fortschritt">
        {steps.map((s, i) => (
          <li key={s.label} className="flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full border", dot[s.state])} title={s.label} aria-label={`${s.label}${s.state === "todo" ? " (offen)" : ""}`} />
            {i < steps.length - 1 && <span className={cn("h-px w-5 sm:w-8", bar(i))} aria-hidden />}
          </li>
        ))}
      </ol>
    );
  }

  return (
    <ol className="grid grid-cols-3" aria-label="Fortschritt deines Antrags">
      {steps.map((s, i) => {
        const I = s.icon;
        return (
          <li key={s.label} className="relative flex flex-col items-center text-center px-1" aria-current={s.state === "current" || s.state === "warn" ? "step" : undefined}>
            {i < steps.length - 1 && <span className={cn("absolute top-5 left-1/2 w-full h-0.5", bar(i))} aria-hidden />}
            <span className={cn("relative z-10 h-10 w-10 rounded-full border-2 grid place-items-center", dot[s.state])}>
              <I size={18} weight="bold" aria-hidden />
            </span>
            <span className={cn("mt-2 text-sm font-semibold", s.state === "todo" && "text-muted")}>{s.label}</span>
            {s.hint && <span className="text-xs text-muted">{s.hint}</span>}
          </li>
        );
      })}
    </ol>
  );
}
