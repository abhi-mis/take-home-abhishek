"use client";

/**
 * One question, in one of three states, inside a section.
 *
 * This is the component that makes a five-question section readable instead of a wall: only
 * the open card shows a question, answered ones shrink to a line you can check at a glance,
 * and the ones still to come stay visible but quiet so the patient can see what they are in
 * for. At most one card is open at a time, which is the property the whole design rests on.
 *
 * The contents of an open card are `QuestionBody`, unchanged - the same component the review
 * screen's edit dialog renders. Three surfaces, one implementation of "what does
 * `type: multi` look like".
 *
 * Semantics are a DISCLOSURE, not an ARIA accordion widget: a button carrying
 * `aria-expanded` and `aria-controls` over a region. A real accordion would owe the user
 * roving arrow-key focus inside the widget, and that is not the interaction here - Up and
 * Down move between cards at the section level, which the page owns.
 *
 * A waiting card is fully tappable on purpose. A patient who wants to answer the fourth
 * question first is allowed to; the dimming says "not yet", not "not allowed".
 */
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { QuestionBody } from "./QuestionBody";
import { QuestionSpeaker } from "../QuestionSpeaker";
import { questionSpeech } from "@/lib/questionSpeech";
import { answerSummary, shortLabel } from "@/lib/summary";
import { questionCopy, t, ui, type Lang } from "@/lib/i18n";
import type { Comfort } from "@/lib/patient";
import type { Step } from "@/lib/steps";
import type { Answers, Meta, PatientSex } from "@/lib/types";
import { cn, tick } from "@/lib/utils";
import { Button } from "../ui/Button";

export type CardState = "answered" | "open" | "waiting";

export function QuestionCard({
  step,
  state,
  answered,
  index,
  answers,
  meta,
  lang,
  comfort,
  comfortAsked,
  explicitNone,
  patch,
  setSex,
  setAge,
  setFirstName,
  chooseNone,
  onOpen,
  onContinue,
}: {
  step: Step;
  state: CardState;
  /**
   * Whether the question has a value.
   *
   * Distinct from `state` on purpose: `state` is how the card is DISPLAYED, and an open card
   * hides whether it has been answered. Both facts are needed - one drives styling, the
   * other drives "may we move on".
   */
  answered: boolean;
  /** 1-based position within the section. Doubles as the keyboard hint on desktop. */
  index: number;
  answers: Answers;
  meta: Meta;
  lang: Lang;
  comfort: Comfort;
  comfortAsked: boolean;
  explicitNone: Record<string, true>;
  patch: (p: Partial<Answers>) => void;
  setSex: (sex: PatientSex) => void;
  setAge: (age: number | null) => void;
  setFirstName: (name: string | null) => void;
  chooseNone: (key: string) => void;
  onOpen: () => void;
  /**
   * Present only on the cards that do not move on by themselves - a checkbox list, the
   * describe box. See `advancesOnAnswer` in lib/sections.ts for which and why.
   */
  onContinue?: () => void;
}) {
  const reduce = useReducedMotion();
  const open = state === "open";
  const regionId = `question-${step.id}`;
  const title =
    step.key === null ? ui(lang).aboutTitle : (questionCopy(lang)[step.key]?.title ?? step.id);

  return (
    <section
      /*
        The card's state, in the DOM.
        Not for styling - the classes below do that - but because "answered" and "waiting"
        both render as a collapsed row, and telling them apart from the outside otherwise
        means guessing from text. The browser smoke asserts the accordion's invariants
        against this, and a guessing test is a test that lies eventually.
      */
      data-state={state}
      data-answered={answered}
      className={cn(
        "overflow-hidden rounded-2xl border bg-card transition-colors",
        open
          ? "border-brand shadow-[0_3px_14px_rgba(60,45,25,0.10)]"
          : "border-line shadow-[0_1px_2px_rgba(60,45,25,0.05)]",
      )}
    >
      {/*
        The header is a ROW, not just the disclosure button.

        The read-aloud control cannot live inside that button - a button inside a button is
        invalid, and a screen reader would read the whole header as one confused control - and
        it used to sit on a row of its own inside the open card, which cost vertical space on
        every question to hold one icon. As a sibling it lines up with the question it reads
        out, and it only renders when the card is open: reading out a collapsed one-line
        summary would be reading the patient their own answer back.
      */}
      <div className="flex items-start">
        <h2 className="min-w-0 flex-1">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={regionId}
          onClick={() => {
            if (open) return;
            tick();
            onOpen();
          }}
          className={cn(
            "flex w-full items-start gap-3 px-4 text-left desk:gap-4 desk:px-6",
            open
              ? "cursor-default pb-1 pt-4 desk:pt-6"
              : "min-h-[52px] cursor-pointer py-3.5 desk:min-h-[62px] desk:py-4.5",
            state === "waiting" && "opacity-60",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold tabular-nums desk:size-7 desk:text-[12px]",
              state === "answered"
                ? // accent-icon-ok: the done fill holds a tick, never a word.
                  "bg-done text-white"
                : open
                  ? "bg-brand-soft text-brand-ink"
                  : "border border-line text-muted",
            )}
          >
            {state === "answered" ? <Tick /> : index}
          </span>

          <span className="min-w-0 flex-1">
            {open ? (
              <span className="font-display block text-[21px] leading-[1.45] text-ink desk:text-[25px] desk:leading-[1.35]">
                {title}
              </span>
            ) : (
              <span className="block truncate text-[13.5px] leading-snug text-muted desk:text-[14.5px]">
                {shortLabel(step, lang)}
              </span>
            )}
          </span>

          {state === "answered" ? (
            <span className="mt-px max-w-[46%] truncate text-[13.5px] font-semibold text-ink desk:text-[14.5px]">
              {answerSummary(step, answers, meta, lang)}
            </span>
          ) : null}
        </button>
        </h2>
        {open ? (
          <QuestionSpeaker
            text={questionSpeech(step, meta, lang)}
            lang={lang}
            className="mr-4 mt-4 shrink-0 desk:mr-6 desk:mt-6"
          />
        ) : null}
      </div>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={regionId}
            role="group"
            aria-label={title}
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={reduce ? { height: "auto", opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-3 desk:px-6 desk:pb-6">
              {/*
                "Pick as many as apply", said before they start rather than discovered.

                A checkbox list looks exactly like a radio list to someone who has not tried
                it twice, and the single choices in this form outnumber the multiples - so the
                reasonable assumption is one tap and move on. One line removes the guess.
              */}
              {onContinue !== undefined && step.kind === "multi" ? (
                <p className="mb-2.5 text-[12.5px] font-medium text-brand-ink">
                  {t("pickMore", lang)}
                </p>
              ) : null}

              <QuestionBody
                step={step}
                answers={answers}
                meta={meta}
                lang={lang}
                comfort={comfort}
                comfortAsked={comfortAsked}
                explicitNone={explicitNone}
                patch={patch}
                setSex={setSex}
                setAge={setAge}
                setFirstName={setFirstName}
                chooseNone={chooseNone}
              />

              {/*
                The way on, and only once there is something to move on FROM. An empty
                checkbox list with a "done" button beside it is inviting the patient to skip
                a question they have not read yet - they can still skip it, with Next, which
                is a deliberate act rather than an accidental one.
              */}
              {onContinue !== undefined && answered ? (
                <div className="mt-4 flex justify-end">
                  <Button variant="secondary" onClick={onContinue}>
                    {t("doneWithThis", lang)} <Arrow />
                  </Button>
                </div>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

function Arrow() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className="size-[15px] shrink-0"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 10h11M11 5.5 15.5 10 11 14.5" />
    </svg>
  );
}

function Tick() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className="size-3.5 shrink-0"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 10.5 8 14.5 16 6" />
    </svg>
  );
}
