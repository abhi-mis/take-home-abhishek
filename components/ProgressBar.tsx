"use client";

/**
 * Six segments, one per section, with the current one filling as its questions are answered.
 *
 * It replaced a single 1-of-17 bar, and the reason is not decoration: a bar that creeps a
 * seventeenth at a time tells a patient almost nothing, while six segments say "there are
 * six of these and you are in the third" at a glance. Progress inside the current section is
 * carried by that segment's fill, so the two questions a patient cares about - how far
 * through, and how much of this bit is left - are both answered by one control.
 *
 * The fill is driven by ANSWERED over VISIBLE, so a male patient's Health section fills in
 * thirds rather than fifths. Gating away a question must never make the bar go backwards.
 */
import { motion, useReducedMotion } from "framer-motion";
import { t, type Lang } from "@/lib/i18n";

export function ProgressBar({
  index,
  total,
  fraction,
  lang,
}: {
  /** 0-based index of the current section. */
  index: number;
  total: number;
  /** How much of the current section is answered, 0 to 1. */
  fraction: number;
  lang: Lang;
}) {
  const reduce = useReducedMotion();
  return (
    <div
      className="flex items-center gap-1"
      role="progressbar"
      aria-valuenow={index + 1}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-label={t("progressAria", lang, { n: index + 1, total })}
    >
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
          <motion.span
            aria-hidden
            className="block h-full rounded-full bg-brand"
            initial={false}
            animate={{
              width: i < index ? "100%" : i === index ? `${Math.round(fraction * 100)}%` : "0%",
            }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 26 }}
          />
        </span>
      ))}
    </div>
  );
}
