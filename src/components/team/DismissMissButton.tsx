"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { X } from "@phosphor-icons/react/ssr";
import { dismissSearchMissAction } from "@/app/actions/team-content";

export function DismissMissButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="nv-btn nv-btn-quiet !p-1"
      aria-label="Erledigt"
      title="Erledigt"
      disabled={pending}
      onClick={() => start(async () => void (await dismissSearchMissAction(id), router.refresh()))}
    >
      <X size={12} aria-hidden />
    </button>
  );
}
