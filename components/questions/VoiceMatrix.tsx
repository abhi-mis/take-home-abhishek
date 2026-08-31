"use client";

/**
 * Q11 / Q12 / Q13 - the "software does the work" steps.
 *
 * Flow: mic -> /api/transcribe -> /api/extract (one schema slice) -> patch the store
 * -> the grid below re-renders with those rows highlighted -> the patient confirms or
 * corrects by tapping -> Next.
 *
 * The grid is ALWAYS mounted, before and after recording. That is the tap fallback:
 * there is no separate "manual mode" to switch into, so a mic denial, a dead API key
 * or a patient who simply prefers tapping all land in exactly the same UI.
 *
 * `justFilled` is derived by diffing the patch against what was there, so the
 * highlight marks what the model actually changed rather than everything it returned.
 */
import { useEffect, useMemo, useState } from "react";
import { INTAKE_SCHEMA } from "@/lib/schema";
import { PRODUCT_DUR, PRODUCT_ROWS, PROCEDURE_ROWS, SESSIONS } from "@/lib/types";
import type { Answers, Habits } from "@/lib/types";
import type { ExtractResult } from "@/lib/extractPrompt";
import { UI_COPY } from "@/lib/copy";
import { CheckIcon } from "../ui/Button";
import { VoicePanel } from "./VoicePanel";
import { HabitsGrid } from "./HabitsGrid";
import { TableGrid, type ColumnSpec } from "./TableGrid";
import { FollowUpFlow } from "./FollowUpFlow";
import { SpeakFirst } from "./SpeakFirst";
import { ResultDialog } from "./ResultDialog";
import { answeredFieldsFor, outstandingFieldsFor, type OutstandingField } from "@/lib/followups";
import { fieldOps, mergeRows } from "@/lib/apply";

const PRODUCT_COLUMNS: ColumnSpec[] = [
  { key: "duration", label: "How long", kind: "options", options: PRODUCT_DUR },
  { key: "helped", label: "Did it help?", kind: "yesno" },
  { key: "side_effects", label: "Any side effects?", kind: "yesno" },
];

const PROCEDURE_COLUMNS: ColumnSpec[] = [
  { key: "sessions", label: "How many sessions", kind: "options", options: SESSIONS },
  { key: "helped", label: "Did it help?", kind: "yesno" },
];

const PRODUCT_GLOSS: Record<string, string> = {
  "OTC/Medicated Shampoos": "Anti-dandruff or medicated shampoo",
  "Hair Oils/Serums": "Oils or leave-in serums",
  "Topical Minoxidil": "The solution or foam you apply",
  "Oral Minoxidil": "Minoxidil tablets",
  Supplements: "Biotin, vitamins, iron",
};

const PROCEDURE_GLOSS: Record<string, string> = {
  "PRP/GFC/iPRF": "Injections made from your own blood",
  "Stem Cells/Exosomes": "Stem cell or exosome therapy",
  "Hair Transplant": "Transplant surgery",
  Other: "Any other clinic treatment",
};

export function VoiceMatrix({
  questionKey,
  answers,
  patch,
  setFocusMode,
}: {
  questionKey: "habits" | "products" | "procedures";
  answers: Answers;
  patch: (p: Partial<Answers>) => void;
  /**
   * Reported UP to the page: "this step is presenting its own focused UI, so stand
   * down the shared chrome". True on the speak screen and during the follow-up flow.
   * StepShell then hides its outstanding-items summary, which would otherwise scold a
   * patient who has not been given a chance to answer yet, or repeat the very list the
   * flow is already walking them through.
   */
  setFocusMode: (focused: boolean) => void;
}) {
  const [justFilled, setJustFilled] = useState<string[]>([]);

  /**
   * Stage machine for the question.
   *
   *   "speak"  the default - mic plus the spoken prompt, no grid. Speaking is the
   *            intended path on these three questions, and a grid on screen invites
   *            tapping instead.
   *   "result" the popup: how much was captured, and an explicit confirm.
   *   "form"   the grid, for confirming, correcting, or answering by hand.
   *
   * A patient who chose to tap, or whose mic/API failed, goes straight to "form" and
   * never sees the other two.
   */
  const [stage, setStage] = useState<"speak" | "result" | "form">("speak");
  const [flowOpen, setFlowOpen] = useState(false);
  /**
   * When set, the follow-up flow is limited to ONE item: the row (or habit field) whose
   * conditional questions just unlocked.
   *
   * Answering "yes" to a product does not finish that row - it creates three more
   * questions (how long, did it help, side effects) that previously just appeared,
   * collapsed, further down the grid. Now they are asked immediately and only they, so
   * a patient tapping down the list is not yanked into the whole outstanding queue.
   */
  const [flowScope, setFlowScope] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  /** Set once the patient says the auto-filled values are right. */
  const [confirmed, setConfirmed] = useState(false);

  /**
   * Recomputed from the answers on every render, NOT from the model's `unfilled` list.
   * That matters: it means the flow shrinks as the patient answers (including answers
   * they give by tapping the grid directly), and it stays exactly in step with what
   * validateStep() is blocking Next on.
   */
  const outstanding: OutstandingField[] = useMemo(
    () => outstandingFieldsFor(questionKey, answers),
    [questionKey, answers],
  );

  /**
   * Merge, never replace. The model returns only fields the patient mentioned, so a
   * shallow spread over the existing value keeps earlier taps and lets the patient
   * record twice ("...and I also take biotin") without losing round one.
   */
  function apply(result: ExtractResult, spoken: string) {
    const p = result.patch;
    // Show the summary popup rather than dropping the patient into a filled grid with
    // no explanation of what just happened.
    setTranscript(spoken);
    setConfirmed(false);
    setStage("result");

    if (questionKey === "habits" && p.habits) {
      const incoming = p.habits as Partial<Habits>;
      setJustFilled(Object.keys(incoming));
      patch({ habits: { ...answers.habits, ...incoming } });
      return;
    }

    if (questionKey === "products" && p.products) {
      const incoming = p.products as Partial<Answers["products"]>;
      setJustFilled(Object.keys(incoming));
      patch({
        products: mergeRows(answers.products, incoming),
      });
      return;
    }

    if (questionKey === "procedures" && p.procedures) {
      const incoming = p.procedures as Partial<Answers["procedures"]>;
      setJustFilled(Object.keys(incoming));
      patch({
        procedures: mergeRows(answers.procedures, incoming),
      });
      return;
    }

    // The model understood nothing usable - say so plainly and leave the grid alone.
    setJustFilled([]);
  }

  /**
   * Write one follow-up answer back into the store.
   *
   * Mirrors the grid's own edit rules exactly - in particular, answering a flag "No"
   * nulls that row's detail columns, so the "must be null when false" invariant in
   * validate.ts holds no matter which control the patient used.
   */
  function answerField(field: OutstandingField, value: boolean | string) {
    // The write rules (notably "a No nulls that row's detail columns") live in
    // lib/apply.ts because chat mode answers the same follow-ups. Two copies of a
    // clinical invariant is one copy too many.
    const ops = fieldOps(questionKey, field, value, answers);
    if (ops.patch) patch(ops.patch);
  }

  /** Ask the conditional questions a "yes" just unlocked, and nothing else. */
  function askConditional(scope: string) {
    setFlowScope(scope);
    setFlowOpen(true);
  }

  function closeFlow() {
    setFlowOpen(false);
    setFlowScope(null);
  }

  const answered = answeredFieldsFor(questionKey, answers);

  // A scope narrows the queue to the item the patient just switched on; without one the
  // flow walks everything still outstanding.
  const flowFields = flowScope
    ? outstanding.filter((f) => f.row === flowScope || f.field === flowScope)
    : outstanding;

  // Keep the page in step with whichever focused surface is on screen.
  useEffect(() => {
    setFocusMode(stage === "speak" || flowOpen);
  }, [stage, flowOpen, setFocusMode]);

  // Stage 1: speak, or opt into tapping.
  if (stage === "speak") {
    return (
      <SpeakFirst
        questionKey={questionKey}
        onResult={apply}
        onTapInstead={() => setStage("form")}
      />
    );
  }

  return (
    <div>
      {/* Stage 2: the popup. Rendered over the form so dismissing it reveals the grid. */}
      {stage === "result" ? (
        <ResultDialog
          transcript={transcript}
          answered={answered}
          outstanding={outstanding}
          onConfirm={() => {
            setConfirmed(true);
            setStage("form");
          }}
          onAnswerRest={() => {
            setStage("form");
            setFlowScope(null);
            setFlowOpen(true);
          }}
          onEdit={() => setStage("form")}
        />
      ) : null}

      {/* The patient said the auto-filled values are right - shown until they edit. */}
      {confirmed && !flowOpen ? (
        <p className="mb-4 flex items-center gap-2 rounded-2xl border border-brand/35 bg-brand-soft/50 px-4 py-2.5 text-[13px] font-semibold text-brand-ink">
          <CheckIcon className="size-4 shrink-0" />
          {UI_COPY.confirmedBanner} - you can still change anything below.
        </p>
      ) : null}

      {/* Re-record without leaving the question. */}
      {!flowOpen ? <VoicePanel questionKey={questionKey} onResult={apply} /> : null}

      {/*
        The layered-question answer: rather than listing what is missing and leaving the
        patient to hunt through collapsed rows, each gap is asked as its own full-size
        question, one at a time.
      */}
      {flowOpen ? (
        <FollowUpFlow
          // Remount on scope change so the progress total restarts for the new queue.
          key={flowScope ?? "all"}
          fields={flowFields}
          title={flowScope ? UI_COPY.followUpConditional : undefined}
          // A one-item detour should hand the grid straight back.
          autoCloseOnComplete={flowScope !== null}
          onAnswer={answerField}
          onClose={closeFlow}
        />
      ) : outstanding.length > 0 ? (
        <button
          type="button"
          onClick={() => {
            setFlowScope(null);
            setFlowOpen(true);
          }}
          className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-brand/35 bg-brand-soft/50 px-4 py-3 text-left transition-colors hover:bg-brand-soft"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand text-[13px] font-bold text-white tabular-nums">
            {outstanding.length}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-bold leading-snug text-brand-ink">
              Answer the remaining {outstanding.length} one at a time
            </span>
            <span className="mt-0.5 block text-[12px] leading-snug text-muted">
              Quicker than finding them in the list below
            </span>
          </span>
          <span aria-hidden className="shrink-0 text-brand">
            →
          </span>
        </button>
      ) : justFilled.length > 0 && !confirmed ? (
        <p className="mb-3 text-[13px] font-medium text-brand-ink">{UI_COPY.reviewFilled}</p>
      ) : null}

      {/*
        While the flow is open the grid is hidden. Showing both meant the patient saw
        "Do you smoke?" twice on one screen - once in the focused card and again in the
        row underneath, which is exactly the kind of duplication that makes a form feel
        like it was assembled rather than designed. Closing the flow brings the grid
        straight back, with the voice highlights intact.
      */}
      {flowOpen ? null : questionKey === "habits" ? (
        <HabitsGrid
          value={answers.habits}
          justFilled={justFilled}
          onChange={(p) => {
            patch({ habits: { ...answers.habits, ...p } });
            if (p.smoking === true) askConditional("smoking_severity");
            else if (p.salon_treatments === true) askConditional("salon_treatment_detail");
          }}
        />
      ) : questionKey === "products" ? (
        <TableGrid
          rows={PRODUCT_ROWS}
          flagKey="used"
          flagLabel="Yes"
          detailColumns={PRODUCT_COLUMNS}
          rowGloss={PRODUCT_GLOSS}
          justFilled={justFilled}
          value={answers.products as unknown as Record<string, Record<string, unknown>>}
          onChangeRow={(row, p) => {
            patch({
              products: {
                ...answers.products,
                [row]: { ...answers.products[row as keyof Answers["products"]], ...p },
              } as Answers["products"],
            });
            if (p.used === true) askConditional(row);
          }}
        />
      ) : (
        <TableGrid
          rows={PROCEDURE_ROWS}
          flagKey="done"
          flagLabel="Yes"
          detailColumns={PROCEDURE_COLUMNS}
          rowGloss={PROCEDURE_GLOSS}
          justFilled={justFilled}
          value={answers.procedures as unknown as Record<string, Record<string, unknown>>}
          onChangeRow={(row, p) => {
            patch({
              procedures: {
                ...answers.procedures,
                [row]: { ...answers.procedures[row as keyof Answers["procedures"]], ...p },
              } as Answers["procedures"],
            });
            if (p.done === true) askConditional(row);
          }}
        />
      )}

      {/* Sanity check that the rendered rows come from the schema, not a local list. */}
      {flowOpen ? null : (
        <p className="mt-4 text-[11px] text-muted/70">
          {rowCount(questionKey)} rows from the intake schema.
        </p>
      )}
    </div>
  );
}

/**
 * Shallow-merge the rows the model returned into the rows already in the store.
 * Generic over the row key and entry type, so products and procedures share it
 * without either side losing its literal row-name union.
 */
function rowCount(key: "habits" | "products" | "procedures"): number {
  if (key === "habits") return INTAKE_SCHEMA.sections[2].questions[1].rows.length;
  if (key === "products") return PRODUCT_ROWS.length;
  return PROCEDURE_ROWS.length;
}

