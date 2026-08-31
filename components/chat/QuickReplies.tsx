"use client";

/**
 * The tap half of "talk or type".
 *
 * Every question in the conversation still offers its exact schema options as chips.
 * That is not a convenience - it is what keeps the answers clean. A tapped chip is the
 * option string verbatim, with no transcription and no model in the path, so a patient
 * who is unsure of their English, in a noisy waiting room, or simply faster with a
 * thumb, produces a BETTER answer than one who speaks. Voice is the accelerator; taps
 * are the ground truth.
 *
 * Multi-selects stage locally and commit on "Done". Committing each tap immediately
 * would be wrong here: validateStep passes the moment one option is selected, so the
 * conversation would leap to the next question after the first of five taps.
 */
import { motion } from "framer-motion";
import type { QuickReply, QuickValue } from "@/lib/chatFlow";
import { cn, tick } from "@/lib/utils";
import { CheckIcon } from "../ui/Button";
import { ScalpDiagram } from "../questions/ScalpDiagram";

export function QuickReplies({
  quick,
  multiSelect,
  staged,
  disabled = false,
  onStage,
  onPick,
  onDone,
}: {
  quick: QuickReply[];
  multiSelect: boolean;
  staged: string[];
  disabled?: boolean;
  onStage: (option: string) => void;
  onPick: (value: QuickValue) => void;
  onDone: () => void;
}) {
  if (quick.length === 0) return null;

  const hasDiagrams = quick.some((q) => q.diagram !== undefined);

  function handle(q: QuickReply) {
    tick();
    // "None of these" is unambiguous and terminal - it commits on the spot.
    if (multiSelect && q.value.t === "option") onStage(q.value.option);
    else onPick(q.value);
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          "max-h-[42dvh] overflow-y-auto",
          hasDiagrams ? "grid grid-cols-3 gap-2" : "flex flex-wrap gap-2",
        )}
      >
        {quick.map((q) => {
          const selected =
            multiSelect && q.value.t === "option" && staged.includes(q.value.option);
          return (
            <motion.button
              key={q.label}
              type="button"
              disabled={disabled}
              whileTap={{ scale: 0.97 }}
              aria-pressed={multiSelect ? selected : undefined}
              onClick={() => handle(q)}
              className={cn(
                "relative rounded-2xl border-2 text-left transition-colors duration-100",
                "disabled:opacity-50",
                hasDiagrams ? "p-1.5" : "min-h-[44px] px-3.5 py-2",
                selected
                  ? "border-brand bg-brand-soft text-brand-ink"
                  : "border-line bg-card text-ink hover:border-brand/60 hover:bg-brand-soft/40",
              )}
            >
              {q.diagram !== undefined ? (
                <>
                  <span className="block overflow-hidden rounded-xl">
                    <ScalpDiagram option={q.diagram} />
                  </span>
                  <span className="mt-1 block text-[11px] font-semibold leading-tight">
                    {q.label}
                  </span>
                </>
              ) : (
                <>
                  <span className="block text-[14px] font-semibold leading-tight">{q.label}</span>
                  {q.gloss ? (
                    <span className="mt-0.5 block text-[11.5px] leading-tight text-muted">
                      {q.gloss}
                    </span>
                  ) : null}
                </>
              )}

              {selected ? (
                <span className="absolute right-1.5 top-1.5 grid size-4 place-items-center rounded-full bg-brand text-white">
                  <CheckIcon className="size-2.5" />
                </span>
              ) : null}
            </motion.button>
          );
        })}
      </div>

      {multiSelect ? (
        <button
          type="button"
          disabled={disabled || staged.length === 0}
          onClick={() => {
            tick();
            onDone();
          }}
          className={cn(
            "min-h-[48px] rounded-2xl text-[15px] font-bold transition-colors",
            "bg-brand text-white hover:bg-brand-strong",
            "disabled:bg-line disabled:text-muted",
          )}
        >
          {staged.length === 0
            ? "Pick at least one"
            : `Done (${staged.length} selected)`}
        </button>
      ) : null}
    </div>
  );
}
