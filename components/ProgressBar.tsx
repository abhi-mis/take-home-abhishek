"use client";

/**
 * Progress is computed from the VISIBLE step list, so a male patient sees 15 steps
 * and a female patient 17 (16 questions + the sex gate) - the bar never jumps
 * backwards when questions are gated away mid-form.
 */
import { motion } from "framer-motion";
import { t, type Lang } from "@/lib/i18n";

export function ProgressBar({
  index,
  total,
  lang,
}: {
  index: number;
  total: number;
  lang: Lang;
}) {
  const pct = total === 0 ? 0 : Math.round((index / total) * 100);
  return (
    <div className="flex items-center gap-3">
      <div
        className="h-2 flex-1 overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuenow={index}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={t("progressAria", lang, { n: Math.min(index + 1, total), total })}
      >
        <motion.div
          className="h-full rounded-full bg-brand"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 260, damping: 30 }}
        />
      </div>
      <span className="w-11 shrink-0 text-right text-[13px] font-semibold tabular-nums text-muted">
        {Math.min(index + 1, total)}/{total}
      </span>
    </div>
  );
}
