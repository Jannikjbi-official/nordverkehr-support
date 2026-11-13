"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { feedbackFingerprint } from "@/lib/help/service";
import { rateLimit } from "@/lib/rate-limit";
import type { ActionResult } from "@/lib/errors";

const Schema = z.object({ articleId: z.string().min(10).max(40), helpful: z.boolean(), comment: z.string().max(1000).optional() });

/** „Hat dir das geholfen?“ – anonym, eine Stimme pro Artikel und Tag (änderbar) */
export async function articleFeedbackAction(input: z.input<typeof Schema>): Promise<ActionResult> {
  const p = Schema.safeParse(input);
  if (!p.success) return { ok: false, error: "Ungültige Eingabe." };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  const rl = await rateLimit(`feedback:${ip}`, 30, 3600);
  if (!rl.ok) return { ok: false, error: "Zu viele Rückmeldungen. Später nochmal." };
  const article = await db.helpArticle.findUnique({ where: { id: p.data.articleId }, select: { id: true, status: true } });
  if (!article || article.status !== "PUBLISHED") return { ok: false, error: "Artikel nicht gefunden." };
  const fingerprint = feedbackFingerprint(ip, h.get("user-agent") ?? "");
  const comment = p.data.comment?.trim() ? p.data.comment.trim().slice(0, 1000) : null;
  const existing = await db.articleFeedback.findUnique({ where: { articleId_fingerprint: { articleId: article.id, fingerprint } } });
  if (existing) {
    await db.articleFeedback.update({ where: { id: existing.id }, data: { helpful: p.data.helpful, ...(comment ? { comment } : {}) } });
    if (existing.helpful !== p.data.helpful) {
      await db.helpArticle.update({
        where: { id: article.id },
        data: p.data.helpful ? { helpfulYes: { increment: 1 }, helpfulNo: { decrement: 1 } } : { helpfulNo: { increment: 1 }, helpfulYes: { decrement: 1 } },
      });
    }
  } else {
    await db.articleFeedback.create({ data: { articleId: article.id, helpful: p.data.helpful, comment, fingerprint } });
    await db.helpArticle.update({ where: { id: article.id }, data: p.data.helpful ? { helpfulYes: { increment: 1 } } : { helpfulNo: { increment: 1 } } });
  }
  return { ok: true };
}
