"use client";

/**
 * The wizard shell — the only router in the app.
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
import { COPY, UI_COPY } from "@/lib/copy";
import { EXCLUSIVE_OPTIONS, hasNoneEscape, type Answers } from "@/lib/types";
import { StepShell } from "@/components/StepShell";
import { ReviewScreen } from "@/components/ReviewScreen";
import { SingleChoice } from "@/components/questions/SingleChoice";
import { MultiChoice } from "@/components/questions/MultiChoice";
import { YesNo } from "@/components/questions/YesNo";
import { NumberStepper } from "@/components/questions/NumberStepper";
import { SexGate } from "@/components/questions/SexGate";
import { Consent } from "@/components/questions/Consent";
import { VoiceMatrix } from "@/components/questions/VoiceMatrix";
import { YesNoDescribe } from "@/components/questions/YesNoDescribe";
import { PatternPicker } from "@/components/questions/PatternPicker";

export default function IntakePage() {
  const router = useRouter();

  // One field per selector. Zustand compares selector results with Object.is, so a
  // selector must never BUILD its result — `(s) => s.steps()` returns a fresh array
  // every call, never compares equal, and re-renders forever.
  const answers = useIntake((s) => s.answers);
  const meta = useIntake((s) => s.meta);
  const currentStepId = useIntake((s) => s.currentStepId);
  const touched = useIntake((s) => s.touched);
  const explicitNone = useIntake((s) => s.explicitNone);

  // Actions are created once, so these references are stable for the store's lifetime.
  const patch = useIntake((s) => s.patch);
  const setSex = useIntake((s) => s.setSex);
  const next = useIntake((s) => s.next);
  const back = useIntake((s) => s.back);
  const goTo = useIntake((s) => s.goTo);
  const chooseNone = useIntake((s) => s.chooseNone);
  const reset = useIntake((s) => s.reset);

  // Derived OUTSIDE the store, memoised on `meta` — the only input gating can depend
  // on. Same live-recompute behaviour, but a stable reference between sex changes.
  const steps = useMemo(() => visibleSteps(meta), [meta]);

  // Direction drives the slide animation; a plain ref beats storing it in the store.
  const [direction, setDirection] = useState<1 | -1>(1);
  const prevIndex = useRef(0);

  const isReview = currentStepId === "review";
  const index = isReview ? steps.length : stepIndexById(steps, currentStepId);
  const step = isReview ? null : steps[index];

  useEffect(() => {
    setDirection(index >= prevIndex.current ? 1 : -1);
    prevIndex.current = index;
  }, [index]);

  // Scroll to top on every step change — otherwise a long grid leaves the next
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
  const title = step.kind === "sexgate" ? UI_COPY.sexGateTitle : (copy?.title ?? step.key ?? "");
  // One call decides both whether Next is enabled and what the patient still owes us.
  const check = validateStep(step, answers, meta, explicitNone);

  return (
    <StepShell
      stepId={step.id}
      sectionTitle={step.sectionTitle}
      questionNumber={step.n}
      title={title}
      hint={copy?.hint}
      index={index}
      total={steps.length}
      direction={direction}
      canGoNext={check.complete}
      outstanding={check.outstanding}
      onNext={next}
      onBack={goBack}
      // Auto-advancing kinds own their own progression, so no Next button is shown.
      hideNext={AUTO_ADVANCE.has(step.kind)}
      footerNote={step.kind === "multi" ? UI_COPY.multiHint : undefined}
    >
      {renderStep({
        step,
        answers,
        patch,
        setSex,
        next,
        chooseNone,
        explicitNone,
        sex: meta.patient_sex,
      })}
    </StepShell>
  );
}

const AUTO_ADVANCE = new Set(["single", "yesno", "sexgate"]);

interface RenderArgs {
  step: Step;
  answers: Answers;
  patch: (p: Partial<Answers>) => void;
  setSex: ReturnType<typeof useIntake.getState>["setSex"];
  next: () => void;
  chooseNone: (key: string) => void;
  explicitNone: Record<string, true>;
  sex: string | null;
}

function renderStep({
  step,
  answers,
  patch,
  setSex,
  next,
  chooseNone,
  explicitNone,
  sex,
}: RenderArgs) {
  switch (step.kind) {
    case "sexgate":
      return <SexGate value={sex as never} onChange={setSex} onAdvance={next} />;

    case "number":
      return (
        <NumberStepper
          value={answers.age_hair_loss_began}
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
          suggestion={suggestionFor(key, answers)}
          onChange={(v) => patch({ [key]: v } as Partial<Answers>)}
          onAdvance={next}
        />
      );
    }

    case "multi": {
      const key = step.key as QuestionKey;

      // Q4 is the picture question — a grid of scalp diagrams rather than a text list,
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
        />
      );

    case "consent":
      return <Consent value={answers.consent} onChange={(v) => patch({ consent: v })} />;
  }
}

/**
 * Q6: a patient whose hair loss began at 50+ is very likely post-menopausal, so we
 * offer that answer instead of making her scroll — but only as a suggestion she has
 * to accept, never a silent pre-fill.
 *
 * Note we suggest "Menopausal" rather than "Not applicable": both skip the follow-up
 * work, but "Menopausal" is the one that actually tells the doctor something, and
 * "Not applicable" reads as "I won't say". Onset age is an imperfect proxy for
 * current age, which is exactly why this is a suggestion and not an inference.
 */
function suggestionFor(
  key: QuestionKey,
  answers: Answers,
): { value: string; reason: string } | undefined {
  if (key !== "menstrual_cycle") return undefined;
  const onset = answers.age_hair_loss_began;
  if (onset === null || onset < 50) return undefined;
  return {
    value: "Menopausal",
    reason: "You said your hair loss started after 50 — is this the right answer?",
  };
}
