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
import { questionCopy, sectionLabel, ui, type Lang } from "@/lib/i18n";
import { questionSpeech } from "@/lib/questionSpeech";
import {
  maxOnsetAge,
  personalNote,
  shouldOfferComfort,
  suggestedComfort,
  unavailableOptions,
  personalSummary,
  welcomeLine,
  suggestionFor,
  type Comfort,
} from "@/lib/patient";
import { EXCLUSIVE_OPTIONS, hasNoneEscape, type Answers, type Meta } from "@/lib/types";
import { StepShell } from "@/components/StepShell";
import { ComfortPrompt } from "@/components/ComfortPrompt";
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
  const lang = useIntake((s) => s.lang);
  const setLang = useIntake((s) => s.setLang);

  // Actions are created once, so these references are stable for the store's lifetime.
  const patch = useIntake((s) => s.patch);
  const setSex = useIntake((s) => s.setSex);
  const setAge = useIntake((s) => s.setAge);
  const setFirstName = useIntake((s) => s.setFirstName);
  const setComfort = useIntake((s) => s.setComfort);
  const comfortChosen = useIntake((s) => s.comfortChosen);
  const comfortAsked = useIntake((s) => s.comfortAsked);
  const acceptComfort = useIntake((s) => s.acceptComfort);
  const declineComfort = useIntake((s) => s.declineComfort);
  const next = useIntake((s) => s.next);
  const back = useIntake((s) => s.back);
  const goTo = useIntake((s) => s.goTo);
  const chooseNone = useIntake((s) => s.chooseNone);
  const reset = useIntake((s) => s.reset);

  /**
   * The text-size offer, held back for a beat.
   *
   * The delay is the whole reason this is an effect rather than a render-time flag: an
   * age can be set by dragging a slider through 55, and a dialog that appears mid-drag
   * has interrupted the very control the patient is using. Half a second of stillness
   * means they have arrived at an age rather than passed through one.
   *
   * It is not scoped to the About You step on purpose. A fast patient can tap "55-64"
   * and Next inside those 500ms, and the offer still has to reach them - one screen
   * later is late, never is a bug.
   */
  const [offerComfort, setOfferComfort] = useState(false);
  const eligible = shouldOfferComfort(meta, comfortChosen, comfortAsked);
  useEffect(() => {
    if (!eligible) {
      setOfferComfort(false);
      return;
    }
    const t = setTimeout(() => setOfferComfort(true), 500);
    return () => clearTimeout(t);
  }, [eligible, meta.patient_age]);

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

  // Resolved once per render: the whole screen is in one language, so every string
  // below comes from the same two objects.
  const UI = ui(lang);
  const COPY_L = questionCopy(lang);

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

  /*
    Rendered on both branches (wizard and review) and at page level, outside StepShell:
    a fixed overlay inside framer-motion's animating question wrapper positions itself
    against that transform instead of the viewport.
  */
  const comfortDialog =
    offerComfort && meta.patient_age !== null ? (
      <ComfortPrompt
        lang={lang}
        age={meta.patient_age}
        target={suggestedComfort(meta.patient_age)}
        onAccept={acceptComfort}
        onDecline={declineComfort}
      />
    ) : null;

  if (isReview) {
    return (
      <>
      {comfortDialog}
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
      </>
    );
  }

  if (!step) return null;

  const copy = step.key ? COPY_L[step.key] : null;
  const title = step.kind === "about" ? UI.aboutTitle : (copy?.title ?? step.key ?? "");
  // A hint that knows who is reading it, where that changes what the question means.
  const extra = step.key ? personalNote(step.key, meta, lang) : undefined;
  const hint = [copy?.hint, extra].filter(Boolean).join(" ") || undefined;
  // One call decides both whether Next is enabled and what the patient still owes us.
  const check = validateStep(step, answers, meta, explicitNone, lang);

  return (
    <>
    {comfortDialog}
    <StepShell
      stepId={step.id}
      sectionTitle={sectionLabel(lang)[step.sectionId] ?? step.sectionTitle}
      questionNumber={step.n}
      title={title}
      hint={hint}
      speech={questionSpeech(step, meta, lang)}
      // Only on question 1: a greeting that repeats on every screen stops being one.
      welcome={step.n === 1 ? (welcomeLine(meta, lang) ?? undefined) : undefined}
      personal={personalSummary(meta, lang)}
      comfort={comfort}
      onComfort={setComfort}
      lang={lang}
      onLang={setLang}
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
      footerNote={step.kind === "multi" ? UI.multiHint : undefined}
    >
      {renderStep({
        step,
        answers,
        meta,
        COPY_L,
        patch,
        setSex,
        setAge,
        setFirstName,
        comfort,
        comfortAsked,
        lang,
        next,
        chooseNone,
        explicitNone,
        setFocusMode,
      })}
    </StepShell>
    </>
  );
}

// About You is NOT auto-advance: it has three inputs, and jumping forward the instant
// one of them is touched would strand the other two.
const AUTO_ADVANCE = new Set(["single", "yesno"]);

interface RenderArgs {
  step: Step;
  answers: Answers;
  meta: Meta;
  /** The question copy in the patient's language, resolved once by the page. */
  COPY_L: ReturnType<typeof questionCopy>;
  patch: (p: Partial<Answers>) => void;
  setSex: ReturnType<typeof useIntake.getState>["setSex"];
  setAge: (age: number) => void;
  setFirstName: (name: string | null) => void;
  comfort: Comfort;
  comfortAsked: boolean;
  lang: Lang;
  next: () => void;
  chooseNone: (key: string) => void;
  explicitNone: Record<string, true>;
  setFocusMode: (focused: boolean) => void;
}

function renderStep({
  step,
  answers,
  meta,
  COPY_L,
  patch,
  setSex,
  setAge,
  setFirstName,
  comfort,
  comfortAsked,
  lang,
  next,
  chooseNone,
  explicitNone,
  setFocusMode,
}: RenderArgs) {
  switch (step.kind) {
    case "about":
      return (
        <AboutYou
          lang={lang}
          firstName={meta.first_name}
          sex={meta.patient_sex}
          age={meta.patient_age}
          comfort={comfort}
          comfortAsked={comfortAsked}
          onFirstName={setFirstName}
          onSex={setSex}
          onAge={setAge}
        />
      );

    case "number":
      return (
        <NumberStepper
          lang={lang}
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
          lang={lang}
          options={"options" in q ? q.options : []}
          gloss={COPY_L[key]?.gloss}
          withIcons
          value={answers[key as "duration"]}
          suggestion={suggestionFor(key, answers, meta, lang)}
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
          lang={lang}
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
          lang={lang}
          options={"options" in q ? q.options : []}
          gloss={COPY_L[key]?.gloss}
          // PCOS/PCOD to a male patient: shown, greyed, and unpressable. See lib/patient.
          unavailable={unavailableOptions(key, "options" in q ? q.options : [], meta, lang)}
          exclusive={EXCLUSIVE_OPTIONS[key]}
          noneLabel={hasNoneEscape(key) ? ui(lang).none : undefined}
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
          lang={lang}
          value={answers[key]}
          onChange={(v) => patch({ [key]: v } as Partial<Answers>)}
          onAdvance={next}
        />
      );
    }

    case "yesno_describe":
      return <YesNoDescribe answers={answers} patch={patch} lang={lang} />;

    case "table":
      return (
        <VoiceMatrix
          lang={lang}
          questionKey={step.key as "habits" | "products" | "procedures"}
          answers={answers}
          patch={patch}
          setFocusMode={setFocusMode}
        />
      );

    case "consent":
      return <Consent value={answers.consent} onChange={(v) => patch({ consent: v })} lang={lang} />;
  }
}
