"use client";

/**
 * The wizard shell - the only router in the app.
 *
 * It does exactly three things:
 *   1. reads the current step out of the store,
 *   2. maps `step.kind` (which came from the schema's `type`) to a component,
 *   3. tells StepShell whether Next is allowed.
 *
 * Adding a question to lib/schema.ts makes it appear here with no edit, as long as
 * its `type` is one of the kinds in the switch below. That is what "schema-driven"
 * buys: the wizard has no list of questions in it.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useIntake } from "@/lib/store";
import { getQuestion, type QuestionKey } from "@/lib/schema";
import { stepIndexById, validateStep, visibleSteps, type Step } from "@/lib/steps";
import { COPY, SECTION_LABEL, UI_COPY } from "@/lib/copy";
import { questionSpeech } from "@/lib/questionSpeech";
import {
  maxOnsetAge,
  personalNote,
  personalSummary,
  welcomeLine,
  suggestionFor,
  type Comfort,
} from "@/lib/patient";
import { EXCLUSIVE_OPTIONS, hasNoneEscape, type Answers, type Meta } from "@/lib/types";
import { StepShell } from "@/components/StepShell";
import { ReviewScreen } from "@/components/ReviewScreen";
import { SingleChoice } from "@/components/questions/SingleChoice";
import { MultiChoice } from "@/components/questions/MultiChoice";
import { YesNo } from "@/components/questions/YesNo";
import { NumberStepper } from "@/components/questions/NumberStepper";
import { AboutYou } from "@/components/questions/AboutYou";
import { Consent } from "@/components/questions/Consent";
import { VoiceMatrix } from "@/components/questions/VoiceMatrix";
import { YesNoDescribe } from "@/components/questions/YesNoDescribe";
import { PatternPicker } from "@/components/questions/PatternPicker";

export default function IntakePage() {
  const router = useRouter();

  // One field per selector. Zustand compares selector results with Object.is, so a
  // selector must never BUILD its result - `(s) => s.steps()` returns a fresh array
  // every call, never compares equal, and re-renders forever.
  const answers = useIntake((s) => s.answers);
  const meta = useIntake((s) => s.meta);
  const currentStepId = useIntake((s) => s.currentStepId);
  const touched = useIntake((s) => s.touched);
  const explicitNone = useIntake((s) => s.explicitNone);
  const comfort = useIntake((s) => s.comfort);

  // Actions are created once, so these references are stable for the store's lifetime.
  const patch = useIntake((s) => s.patch);
  const setSex = useIntake((s) => s.setSex);
  const setAge = useIntake((s) => s.setAge);
  const setFirstName = useIntake((s) => s.setFirstName);
  const setComfort = useIntake((s) => s.setComfort);
  const comfortChosen = useIntake((s) => s.comfortChosen);
  const next = useIntake((s) => s.next);
  const back = useIntake((s) => s.back);
  const goTo = useIntake((s) => s.goTo);
  const chooseNone = useIntake((s) => s.chooseNone);
  const reset = useIntake((s) => s.reset);

  // Derived OUTSIDE the store, memoised on `meta` - the only input gating can depend
  // on. Same live-recompute behaviour, but a stable reference between sex changes.
  const steps = useMemo(() => visibleSteps(meta), [meta]);

  // Direction drives the slide animation; a plain ref beats storing it in the store.
  const [direction, setDirection] = useState<1 | -1>(1);
  const prevIndex = useRef(0);

  /**
   * "Focus mode" = this step is presenting its own focused surface (the speak-first
   * screen, or the guided follow-up flow), so StepShell stands down its outstanding-items
   * summary rather than repeating or pre-empting it.
   */
  const [focusMode, setFocusMode] = useState(false);
  // null, not currentStepId, so the derive below also runs on the FIRST render - a
  // resumed session can land straight onto a table question.
  const focusStepId = useRef<string | null>(null);

  const isReview = currentStepId === "review";
  const index = isReview ? steps.length : stepIndexById(steps, currentStepId);
  const step = isReview ? null : steps[index];

  /**
   * Reset focus mode DURING render, not in an effect.
   *
   * An effect runs after paint, so a table question rendered one frame with the summary
   * visible before its speak screen suppressed it - a visible ghost of "STILL NEEDED (6)"
   * flashing under the mic. Deriving it here means the correct value is on screen from
   * the very first frame. Table questions open focused (they start on the speak screen);
   * everything else opens with the summary available.
   */
  if (focusStepId.current !== currentStepId) {
    focusStepId.current = currentStepId;
    setFocusMode(step?.kind === "table");
  }

  useEffect(() => {
    setDirection(index >= prevIndex.current ? 1 : -1);
    prevIndex.current = index;
  }, [index]);

  // Scroll to top on every step change - otherwise a long grid leaves the next
  // question's heading off-screen.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [currentStepId]);

  function goBack() {
    if (index === 0 && !isReview) router.push("/");
    else back();
  }

  if (isReview) {
    return (
      <ReviewScreen
        answers={answers}
        meta={meta}
        explicitNone={explicitNone}
        onJump={(id) => goTo(id)}
        onRestart={() => {
          reset();
          router.push("/");
        }}
      />
    );
  }

  if (!step) return null;

  const copy = step.key ? COPY[step.key] : null;
  const title = step.kind === "about" ? UI_COPY.aboutTitle : (copy?.title ?? step.key ?? "");
  // A hint that knows who is reading it, where that changes what the question means.
  const extra = step.key ? personalNote(step.key, meta) : undefined;
  const hint = [copy?.hint, extra].filter(Boolean).join(" ") || undefined;
  // One call decides both whether Next is enabled and what the patient still owes us.
  const check = validateStep(step, answers, meta, explicitNone);

  return (
    <StepShell
      stepId={step.id}
      sectionTitle={SECTION_LABEL[step.sectionId] ?? step.sectionTitle}
      questionNumber={step.n}
      title={title}
      hint={hint}
      speech={questionSpeech(step, meta)}
      // Only on question 1: a greeting that repeats on every screen stops being one.
      welcome={step.n === 1 ? (welcomeLine(meta) ?? undefined) : undefined}
      personal={personalSummary(meta)}
      comfort={comfort}
      onComfort={setComfort}
      // Already been past this step once, so the outstanding list is a reminder rather
      // than an accusation and can show immediately.
      revisited={touched[step.id] === true}
      index={index}
      total={steps.length}
      direction={direction}
      canGoNext={check.complete}
      outstanding={focusMode ? [] : check.outstanding}
      onNext={next}
      onBack={goBack}
      // Auto-advancing kinds own their own progression, so no Next button is shown.
      hideNext={AUTO_ADVANCE.has(step.kind)}
      footerNote={step.kind === "multi" ? UI_COPY.multiHint : undefined}
    >
      {renderStep({
        step,
        answers,
        meta,
        patch,
        setSex,
        setAge,
        setFirstName,
        comfort,
        comfortChosen,
        next,
        chooseNone,
        explicitNone,
        setFocusMode,
      })}
    </StepShell>
  );
}

// About You is NOT auto-advance: it has three inputs, and jumping forward the instant
// one of them is touched would strand the other two.
const AUTO_ADVANCE = new Set(["single", "yesno"]);

interface RenderArgs {
  step: Step;
  answers: Answers;
  meta: Meta;
  patch: (p: Partial<Answers>) => void;
  setSex: ReturnType<typeof useIntake.getState>["setSex"];
  setAge: (age: number) => void;
  setFirstName: (name: string | null) => void;
  comfort: Comfort;
  comfortChosen: boolean;
  next: () => void;
  chooseNone: (key: string) => void;
  explicitNone: Record<string, true>;
  setFocusMode: (focused: boolean) => void;
}

function renderStep({
  step,
  answers,
  meta,
  patch,
  setSex,
  setAge,
  setFirstName,
  comfort,
  comfortChosen,
  next,
  chooseNone,
  explicitNone,
  setFocusMode,
}: RenderArgs) {
  switch (step.kind) {
    case "about":
      return (
        <AboutYou
          firstName={meta.first_name}
          sex={meta.patient_sex}
          age={meta.patient_age}
          comfort={comfort}
          comfortChosen={comfortChosen}
          onFirstName={setFirstName}
          onSex={setSex}
          onAge={setAge}
        />
      );

    case "number":
      return (
        <NumberStepper
          value={answers.age_hair_loss_began}
          // Cannot have started after the age they just told us they are.
          max={maxOnsetAge(meta)}
          onChange={(v) => patch({ age_hair_loss_began: v })}
        />
      );

    case "single": {
      const key = step.key as QuestionKey;
      const q = getQuestion(key);
      return (
        <SingleChoice
          options={"options" in q ? q.options : []}
          gloss={COPY[key]?.gloss}
          withIcons
          value={answers[key as "duration"]}
          suggestion={suggestionFor(key, answers, meta)}
          onChange={(v) => patch({ [key]: v } as Partial<Answers>)}
          onAdvance={next}
        />
      );
    }

    case "multi": {
      const key = step.key as QuestionKey;

      // Q4 is the picture question - a grid of scalp diagrams rather than a text list,
      // because patients recognise the shape long before the clinical term.
      if (key === "pattern") {
        return (
          <PatternPicker
            values={answers.pattern}
            noneChosen={explicitNone.pattern === true}
            onChange={(v) => patch({ pattern: v })}
            onChooseNone={() => chooseNone("pattern")}
          />
        );
      }

      const q = getQuestion(key);
      return (
        <MultiChoice
          options={"options" in q ? q.options : []}
          gloss={COPY[key]?.gloss}
          exclusive={EXCLUSIVE_OPTIONS[key]}
          noneLabel={hasNoneEscape(key) ? UI_COPY.none : undefined}
          noneChosen={explicitNone[key] === true}
          onChooseNone={() => chooseNone(key)}
          withIcons
          values={answers[key as "family_history"]}
          onChange={(v) => patch({ [key]: v } as Partial<Answers>)}
        />
      );
    }

    case "yesno": {
      const key = step.key as "adult_acne_oily_skin";
      return (
        <YesNo
          value={answers[key]}
          onChange={(v) => patch({ [key]: v } as Partial<Answers>)}
          onAdvance={next}
        />
      );
    }

    case "yesno_describe":
      return <YesNoDescribe answers={answers} patch={patch} />;

    case "table":
      return (
        <VoiceMatrix
          questionKey={step.key as "habits" | "products" | "procedures"}
          answers={answers}
          patch={patch}
          setFocusMode={setFocusMode}
        />
      );

    case "consent":
      return <Consent value={answers.consent} onChange={(v) => patch({ consent: v })} />;
  }
}
