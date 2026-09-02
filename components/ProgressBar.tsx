"use client";

/**
 * Six segments, one per section, each filled by how much of THAT section is answered.
 *
 * It replaced a single 1-of-17 bar, and the reason is not decoration: a bar that creeps a
 * seventeenth at a time tells a patient almost nothing, while six segments say "there are six
 * of these and you are in the third" at a glance.
 *
 * The fill used to be positional - every segment before the current one was drawn full. That
 * is fine in a wizard you can only walk forwards through, and wrong here, because the sidebar
 * lets a patient jump straight to Treatments. Doing so drew three full segments over three
 * sections containing no answers at all: a progress bar telling a patient they had completed
 * work they had not done, on a medical form. Now each segment reports its own section, so the
 * bar and the sidebar's counts cannot contradict each other, and position is carried by an
 * outline on the current segment instead of by fill.
 *
 * Every fill is ANSWERED over VISIBLE, so a male patient's Health section fills in thirds
 * rather than fifths. Gating away a question must never make the bar go backwards.
 */
import { motion, useReducedMotion } from "framer-motion";
import { t, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function ProgressBar({
  index,
  fractions,
  lang,
}: {
  /** 0-based index of the current section, outlined rather than filled. */
  index: number;
  /** One 0-to-1 completion figure per section, in section order. */
  fractions: number[];
  lang: Lang;
}) {
  const reduce = useReducedMotion();
  const total = fractions.length;
  return (
    <div
      className="flex items-center gap-1"
      role="progressbar"
      aria-valuenow={index + 1}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-label={t("progressAria", lang, { n: index + 1, total })}
    >
      {fractions.map((f, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 flex-1 overflow-hidden rounded-full bg-line",
            // "You are here", without spending fill on it.
            i === index && "ring-1 ring-brand/55",
          )}
        >
          <motion.span
            aria-hidden
            className="block h-full rounded-full bg-brand"
            initial={false}
            animate={{ width: `${Math.round(Math.min(1, Math.max(0, f)) * 100)}%` }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 26 }}
          />
        </span>
      ))}
    </div>
  );
}
