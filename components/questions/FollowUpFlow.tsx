"use client";

/**
 * The answer to "what happens after a voice fill?"
 *
 * The model answers what the patient actually said and leaves the rest blank. Those
 * blanks are usually buried inside collapsed table rows, so telling someone "3 things
 * missing" and leaving them to hunt is the worst possible ending to an otherwise magic
 * moment. Instead, this asks each remaining field as its own full-size question, one at
 * a time, with the same big controls as the rest of the form.
 *
 * The design trick that makes it feel effortless: it is STATELESS about position. It
 * always renders `fields[0]`, and because `fields` is recomputed from the answers on
 * every render, answering the current question makes it drop out of the list and the
 * next one slides in. Nothing to keep in sync, nothing that can desync, and the flow
 * self-closes the moment the list empties.
 */
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import type { OutstandingField } from "@/lib/followups";
import { cn, tick } from "@/lib/utils";
import { CheckIcon } from "../ui/Button";

export function FollowUpFlow({
  fields,
  onAnswer,
  onClose,
}: {
  fields: OutstandingField[];
  onAnswer: (field: OutstandingField, value: boolean | string) => void;
  onClose: () => void;
}) {
  // Total is captured when the flow opens so "2 of 5" counts up instead of down to a
  // moving target.
  const [total] = useState(fields.length);
  const [draft, setDraft] = useState("");
  const current = fields[0];
  const done = total - fields.length;

  // Everything answered: a brief confirmation, then get out of the way.
  if (!current) return <Complete total={total} onClose={onClose} />;

  return (
    <motion.section
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-5 overflow-hidden rounded-3xl border-2 border-brand/30 bg-card shadow-[0_2px_16px_rgba(13,107,95,0.08)]"
      aria-label="Remaining questions"
    >
      <header className="flex items-center gap-3 border-b border-line bg-brand-soft/60 px-4 py-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand text-[12px] font-bold text-white tabular-nums">
          {done + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold uppercase tracking-wide text-brand-ink">
            Just {fields.length} to go
          </p>
          <div className="mt-1.5 flex gap-1" aria-hidden>
            {Array.from({ length: total }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors duration-300",
                  i < done ? "bg-brand" : "bg-brand/20",
                )}
              />
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close these questions and use the full list instead"
          className="shrink-0 cursor-pointer rounded-lg px-2 py-1 text-[12px] font-semibold text-muted transition-colors hover:bg-line/60 hover:text-ink"
        >
          Use list
        </button>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={current.path}
          initial={{ opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -14 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="p-4"
        >
          <p className="text-[17px] font-bold leading-snug text-ink">{current.question}</p>

          <div className="mt-4">
            {current.kind === "yesno" ? (
              <div className="grid grid-cols-2 gap-3">
                {[
                  { v: true, label: "Yes" },
                  { v: false, label: "No" },
                ].map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    onClick={() => {
                      tick();
                      onAnswer(current, o.v);
                    }}
                    className="min-h-[64px] cursor-pointer rounded-2xl border-2 border-line bg-paper text-[17px] font-bold text-ink transition-all duration-100 hover:border-brand hover:bg-brand-soft hover:text-brand-ink active:scale-[0.98]"
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            ) : current.kind === "options" ? (
              <div className="flex flex-col gap-2.5">
                {(current.options ?? []).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      tick();
                      onAnswer(current, opt);
                    }}
                    className="min-h-[54px] cursor-pointer rounded-2xl border-2 border-line bg-paper px-4 text-left text-[15px] font-semibold text-ink transition-all duration-100 hover:border-brand hover:bg-brand-soft hover:text-brand-ink active:scale-[0.99]"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <input
                  autoFocus
                  type="text"
                  value={draft}
                  placeholder={current.placeholder}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && draft.trim()) {
                      onAnswer(current, draft.trim());
                      setDraft("");
                    }
                  }}
                  className="min-h-[54px] w-full rounded-2xl border-2 border-line bg-paper px-4 text-[15px] text-ink transition-colors placeholder:text-muted/70 focus:border-brand focus:outline-none"
                />
                <button
                  type="button"
                  disabled={!draft.trim()}
                  onClick={() => {
                    onAnswer(current, draft.trim());
                    setDraft("");
                  }}
                  className="min-h-[52px] cursor-pointer rounded-2xl bg-brand text-[15px] font-bold text-white transition-colors hover:bg-brand-ink disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
                >
                  Save
                </button>
              </div>
            )}
          </div>

          {/* Context, so a bare "Did it help?" is never ambiguous about which row. */}
          {current.row ? (
            <p className="mt-3 text-[12px] text-muted">
              About: <span className="font-semibold text-ink">{current.row}</span>
            </p>
          ) : null}
        </motion.div>
      </AnimatePresence>
    </motion.section>
  );
}

function Complete({ total, onClose }: { total: number; onClose: () => void }) {
  return (
    <motion.section
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="mb-5 flex items-center gap-3 rounded-3xl border-2 border-brand bg-brand-soft px-4 py-3.5"
    >
      <motion.span
        initial={{ scale: 0.4 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 340, damping: 16 }}
        className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-white"
      >
        <CheckIcon className="size-5" />
      </motion.span>
      <p className="min-w-0 flex-1 text-[14.5px] font-semibold leading-snug text-brand-ink">
        All {total} filled in. Check the answers below, then continue.
      </p>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss"
        className="shrink-0 cursor-pointer rounded-lg px-2 py-1 text-[12px] font-semibold text-brand-ink/70 transition-colors hover:bg-brand/10"
      >
        Got it
      </button>
    </motion.section>
  );
}
