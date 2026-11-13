import { PageSkeleton } from "@/components/PageSkeleton";

/** Im Team-Bereich bleibt die Seitenleiste stehen, nur der Inhalt lädt. */
export default function Loading() {
  return <PageSkeleton variant="team" />;
}
