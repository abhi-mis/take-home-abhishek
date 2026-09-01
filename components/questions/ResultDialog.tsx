"use client";

/**
 * The popup that closes the loop after a voice fill.
 *
 * It answers the only two questions a patient actually has at that moment:
 *   "How much of that did you get?"  -> "5 of 8", listed item by item.
 *   "Is it right?"                   -> an explicit confirm, never assumed.
 *
 * Confirmation is the point. An LLM filled six medical fields from one sentence; taking
 * that as agreed because nobody objected is not consent, it is silence. So the primary
 * action when everything is captured is "Yes, these match", and when something is
 * missing the primary action is to go and answer it.
 *
 * A real modal, not an inline banner, because it needs to be read - and because the
 * counts are the moment the software looks like it did the work.
 */
import { motion } from "framer-motion";
import { t, ui, type Lang } from "@/lib/i18n";
import type { AnsweredField, OutstandingField } from "@/lib/followups";
import { cn } from "@/lib/utils";
import { CheckIcon } from "../ui/Button";

export function ResultDialog({
  transcript,
  answered,
  outstanding,
  lang,
  onConfirm,
  onAnswerRest,
  onEdit,
}: {
  transcript: string;
  lang: Lang;
  answered: AnsweredField[];
  outstanding: OutstandingField[];
  onConfirm: () => void;
  onAnswerRest: () => void;
  onEdit: () => void;
}) {
  const total = answered.length + outstanding.length;
  const missed = outstanding.length;
  const got = answered.length;

  const UI = ui(lang);
  const title =
    got === 0 ? UI.resultNoneTitle : missed === 0 ? UI.resultAllTitle : UI.resultSomeTitle;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-ink/35 backdrop-blur-[2px]"
        onClick={onEdit}
      />

      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        className="relative m-3 flex max-h-[86dvh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-line bg-card shadow-2xl"
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-full text-white",
              missed === 0 && got > 0 ? "bg-brand" : "bg-warn",
            )}
          >
            {missed === 0 && got > 0 ? (
              <CheckIcon className="size-5" />
            ) : (
              <span className="text-lg font-bold">!</span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px] font-bold leading-tight text-ink">{title}</h2>
            <p className="mt-0.5 text-[13px] leading-snug text-muted">
              {got === 0
                ? t("resultNothingMatched", lang)
                : missed > 0
                  ? t("resultFilledOfLeft", lang, { got, total, missed })
                  : t("resultFilledOf", lang, { got, total })}
            </p>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {transcript ? (
            <p className="mb-4 rounded-xl bg-paper px-3 py-2.5 text-[12.5px] italic leading-snug text-muted">
              &ldquo;{transcript}&rdquo;
            </p>
          ) : null}

          {answered.length > 0 ? (
            <>
              <p className="text-[11px] font-bold uppercase tracking-wide text-brand-ink">
                {UI.resultConfirmQuestion}
              </p>
              <ul className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line">
                {answered.map((f) => (
                  <li key={f.label} className="flex items-start gap-3 bg-paper/50 px-3 py-2.5">
                    <span className="min-w-0 flex-1 text-[13px] leading-snug text-muted">
                      {f.label}
                    </span>
                    <span className="max-w-[58%] text-right text-[13px] font-semibold leading-snug text-ink">
                      {f.value}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {missed > 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-warn/45 bg-warn/[0.05] p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-warn">
                {t("resultNotMentioned", lang, { n: missed })}
              </p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {outstanding.slice(0, 6).map((f) => (
                  <li key={f.path} className="text-[13px] leading-snug text-warn">
                    · {f.label}
                  </li>
                ))}
                {missed > 6 ? (
                  <li className="text-[12.5px] italic text-warn/80">
                    {t("resultAndMore", lang, { n: missed - 6 })}
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}
        </div>

        <footer className="flex flex-col gap-2 border-t border-line px-5 py-4">
          {missed > 0 ? (
            <button
              type="button"
              onClick={onAnswerRest}
              className="min-h-[52px] rounded-2xl bg-brand text-[15px] font-bold text-white transition-colors hover:bg-brand-strong active:scale-[0.99]"
            >
              {UI.resultAnswerRest} ({missed})
            </button>
          ) : (
            <button
              type="button"
              onClick={onConfirm}
              className="min-h-[52px] rounded-2xl bg-brand text-[15px] font-bold text-white transition-colors hover:bg-brand-strong active:scale-[0.99]"
            >
              {UI.resultConfirm}
            </button>
          )}
          <button
            type="button"
            onClick={onEdit}
            className="min-h-[48px] rounded-2xl border border-line text-[14px] font-semibold text-muted transition-colors hover:border-brand/50 hover:text-brand-ink"
          >
            {UI.resultEdit}
          </button>
        </footer>
      </motion.div>
    </div>
  );
}
