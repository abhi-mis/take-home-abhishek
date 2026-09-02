"use client";

/**
 * The intake, one section at a time.
 *
 * This page is the only router in the app, and it does four things:
 *   1. reads the current SECTION out of the store,
 *   2. renders its visible questions as cards, one of them open,
 *   3. opens the next unanswered card when the open one is answered,
 *   4. tells SectionShell whether the section may be left.
 *
 * Adding a question to lib/schema.ts still needs no edit here: it lands in a section via
 * lib/sections.ts and renders via QuestionBody's switch on `step.kind`.
 *
 * Two rules this file exists to enforce, both learned the hard way:
 *
 *  - Nothing NAVIGATES on its own. Answering may open the next card in place, which keeps
 *    the answer on screen as a summary; it may never move to another section. A mis-tap
 *    that both records an answer and leaves the screen is a wrong clinical answer nobody
 *    sees again.
 *  - Correcting an answered card does NOT jump forward. First pass wants momentum, a
 *    correction wants to stay put.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useIntake } from "@/lib/store";
import {
  ALL_SECTIONS,
  answeredCount,
  isAnswered,
  nextUnansweredAfter,
  sectionById,
  sectionIndexById,
  validateSection,
  visibleQuestions,
} from "@/lib/sections";
import { questionCopy, sectionLabel, t, ui } from "@/lib/i18n";
import { shortLabel } from "@/lib/summary";
import { shouldOfferComfort, suggestedComfort } from "@/lib/patient";
import { keyAction, optionCountForStep, optionsForStep, toggleMulti } from "@/lib/keymap";
import { neighbourQuestion } from "@/lib/sections";
import { EXCLUSIVE_OPTIONS, type Answers } from "@/lib/types";
import { SectionShell } from "@/components/SectionShell";
import { ComfortPrompt } from "@/components/ComfortPrompt";
import { ReviewScreen } from "@/components/ReviewScreen";
import { QuestionCard } from "@/components/questions/QuestionCard";

export default function IntakePage() {
  const router = useRouter();

  // One field per selector. Zustand compares selector results with Object.is, so a selector
  // must never BUILD its result - `(s) => s.steps()` returns a fresh array every call, never
  // compares equal, and re-renders until React throws.
  const answers = useIntake((s) => s.answers);
  const meta = useIntake((s) => s.meta);
  const currentSectionId = useIntake((s) => s.currentSectionId);
  const openQuestionId = useIntake((s) => s.openQuestionId);
  const touched = useIntake((s) => s.touched);
  const explicitNone = useIntake((s) => s.explicitNone);
  const comfort = useIntake((s) => s.comfort);
  const lang = useIntake((s) => s.lang);

  // Actions are created once, so these references are stable for the store's lifetime.
  const patch = useIntake((s) => s.patch);
  const setSex = useIntake((s) => s.setSex);
  const setAge = useIntake((s) => s.setAge);
  const setFirstName = useIntake((s) => s.setFirstName);
  const setComfort = useIntake((s) => s.setComfort);
  const setLang = useIntake((s) => s.setLang);
  const comfortChosen = useIntake((s) => s.comfortChosen);
  const comfortAsked = useIntake((s) => s.comfortAsked);
  const acceptComfort = useIntake((s) => s.acceptComfort);
  const declineComfort = useIntake((s) => s.declineComfort);
  const openQuestion = useIntake((s) => s.openQuestion);
  const nextSection = useIntake((s) => s.nextSection);
  const prevSection = useIntake((s) => s.prevSection);
  const goToSection = useIntake((s) => s.goToSection);
  const chooseNone = useIntake((s) => s.chooseNone);
  const reset = useIntake((s) => s.reset);

  /**
   * The text-size offer, held back for a beat.
   *
   * The delay is why this is an effect rather than a render-time flag: an age can be set by
   * dragging a slider through 55, and a dialog that appears mid-drag has interrupted the
   * very control the patient is using. Half a second of stillness means they arrived at an
   * age rather than passed through one.
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

  const isReview = currentSectionId === "review";
  const section = sectionById(currentSectionId) ?? ALL_SECTIONS[0]!;
  const index = sectionIndexById(section.id);

  // Derived OUTSIDE the store and memoised on the only inputs gating depends on.
  const visible = useMemo(() => visibleQuestions(section, meta), [section, meta]);
  const check = validateSection(section, answers, meta, explicitNone);
  const answered = visible.length - check.missing.length;

  /**
   * Answering the open card opens the next unanswered one, in place.
   *
   * An effect rather than a callback so it fires however the answer arrived: a tap, the
   * keyboard, or a voice fill that answered six rows at once. The guard on `justOpened`
   * is what makes a CORRECTION stay put - reopening an answered card sets it, so the
   * effect declines to move on that render.
   */
  /**
   * What to announce after a card opens by itself.
   *
   * Focus deliberately does NOT move on a tap: yanking a screen reader's cursor because
   * someone answered a question is worse than leaving it alone. But something has to say
   * that a new question appeared, or a screen-reader user taps an answer and the form goes
   * silent while the next question quietly renders below them. A polite live region is the
   * right tool: it waits for a gap in speech instead of interrupting.
   *
   * On the keyboard the opposite applies and focus does move, because pressing Enter is
   * asking to move.
   */
  const [announcement, setAnnouncement] = useState("");
  const correcting = useRef(false);
  /**
   * Set when an answer came from a NUMBER KEY, to stop the auto-open for that change.
   *
   * Tapping option 2 and having the next card open is the accordion working. Pressing "2"
   * and having it open is the same thing until you consider that a keyboard repeats: "2 2 2"
   * would answer three different questions in a row, each one scrolling out from under the
   * patient. So on the keyboard, selecting and moving on are two separate keys - which is
   * what Enter is for.
   */
  const keyboardSelect = useRef(false);
  useEffect(() => {
    if (openQuestionId === null) return;
    const open = visible.find((s) => s.id === openQuestionId);
    if (open === undefined) return;
    if (!isAnswered(open, answers, meta, explicitNone)) {
      correcting.current = false;
      return;
    }
    if (correcting.current) return;
    if (keyboardSelect.current) {
      keyboardSelect.current = false;
      return;
    }
    const next = nextUnansweredAfter(section, open, answers, meta, explicitNone);
    if (next !== null) {
      openQuestion(next.id);
      setAnnouncement(
        t("announceOpened", lang, {
          title: next.key === null ? ui(lang).aboutTitle : questionCopy(lang)[next.key].title,
        }),
      );
      return;
    }
    // Nothing left in this section: say so, and name where Next goes.
    const at = sectionIndexById(section.id);
    const following = ALL_SECTIONS[at + 1];
    setAnnouncement(
      t("announceSectionDone", lang, {
        next: following === undefined ? t("finishUp", lang) : (sectionLabel(lang)[following.id] ?? ""),
      }),
    );
  }, [answers, meta, explicitNone, openQuestionId, section, visible, openQuestion, lang]);

  // Scrolling to the top on a SECTION change, not on every answer: the whole point of the
  // accordion is that answering does not move the page under the patient.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    setAnnouncement("");
  }, [currentSectionId]);

  /**
   * Write the nth option of the open card.
   *
   * Only the kinds a single keystroke can answer honestly: a single or multi select, and a
   * yes/no. A table is five rows deep and About You is a name field plus two pickers, so
   * `optionsForStep` returns nothing for those and this is never reached with one.
   */
  function selectByIndex(step: typeof visible[number], i: number) {
    const options = optionsForStep(step);
    const option = options[i];
    if (option === undefined || step.key === null) return;

    if (step.kind === "single") {
      patch({ [step.key]: option } as Partial<Answers>);
      return;
    }
    if (step.kind === "multi") {
      const current = answers[step.key as "family_history"];
      patch({
        [step.key]: toggleMulti(current, option, EXCLUSIVE_OPTIONS[step.key]),
      } as Partial<Answers>);
      return;
    }
    // yesno, yesno_describe and consent: index 0 is yes, 1 is no.
    const yes = i === 0;
    if (step.key === "past_treatment_side_effects") {
      patch({
        past_treatment_side_effects: yes,
        // "No" must clear the description, or validate.ts rejects the output.
        past_treatment_describe: yes ? answers.past_treatment_describe : null,
      });
      return;
    }
    patch({ [step.key]: yes } as Partial<Answers>);
  }

  /**
   * The keyboard, listened for once at page level rather than per card.
   *
   * A keystroke should work wherever focus happens to be inside the section, and the rules
   * it obeys live in lib/keymap.ts so they can be tested without a DOM. The one rule worth
   * repeating here: a number selects and never advances.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
      const open = visible.find((q) => q.id === openQuestionId) ?? null;
      const action = keyAction(e, {
        optionCount: open === null ? 0 : optionCountForStep(open),
        openAnswered: open !== null && isAnswered(open, answers, meta, explicitNone),
        typing,
      });
      if (action === null) return;
      e.preventDefault();

      switch (action.t) {
        case "select":
          if (open !== null) {
            keyboardSelect.current = true;
            selectByIndex(open, action.index);
          }
          return;
        case "nextQuestion": {
          if (open === null) return;
          const target = nextUnansweredAfter(section, open, answers, meta, explicitNone);
          // Nothing left to open: put focus where the patient is going instead.
          if (target === null) {
            /*
              The RENDERED one. Back and Next exist twice - once in the desktop column, once
              in the phone's fixed bar - with one side `display: none` at any given width, so
              `querySelector` returns whichever comes first in the document rather than the
              one on screen. On a phone that was the hidden desktop button, and focusing a
              `display: none` element is a silent no-op: Enter on a finished section moved
              focus nowhere at all. `getClientRects()` is empty exactly when an element is
              not rendered, and unlike `offsetParent` it does not also go null on fixed
              positioning - which the phone bar uses.
            */
            [...document.querySelectorAll<HTMLButtonElement>("[data-next-action]")]
              .find((b) => b.getClientRects().length > 0)
              ?.focus();
            return;
          }
          correcting.current = false;
          openQuestion(target.id);
          return;
        }
        case "nextSection":
          // Unconditional, like the button: Shift+Enter is the patient asking to move on.
          nextSection();
          return;
        case "moveUp":
        case "moveDown": {
          if (open === null) return;
          const target = neighbourQuestion(section, open, meta, action.t === "moveDown" ? 1 : -1);
          if (target === null) return;
          // Moving by keyboard onto an answered card is a correction, so it must not then
          // bounce forward on its own.
          correcting.current = isAnswered(target, answers, meta, explicitNone);
          openQuestion(target.id);
          return;
        }
        case "close":
          openQuestion(null);
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, openQuestionId, answers, meta, explicitNone, section, check.complete]);

  /*
    Per-section progress for the rail. Computed here rather than inside the rail so the rail
    stays a presentation component, and memoised on the three inputs that can change it.

    It sits ABOVE the review early-return on purpose: a hook after that branch runs on the
    section screens and not on the review screen, which is "Rendered fewer hooks than
    expected" - the browser smoke caught exactly that when this was two lines lower.
  */
  const railProgress = useMemo(() => {
    const out: Record<string, { answered: number; visible: number }> = {};
    for (const s of ALL_SECTIONS) {
      out[s.id] = {
        answered: answeredCount(s, answers, meta, explicitNone),
        visible: visibleQuestions(s, meta).length,
      };
    }
    return out;
  }, [answers, meta, explicitNone]);

  /*
    Rendered on both branches and at page level: a fixed overlay inside an animating
    wrapper positions itself against that transform rather than the viewport.
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
          onJump={(id) => goToSection(id)}
          onRestart={() => {
            reset();
            router.push("/");
          }}
        />
      </>
    );
  }

  const nextTitle =
    index === ALL_SECTIONS.length - 1
      ? null
      : (sectionLabel(lang)[ALL_SECTIONS[index + 1]!.id] ?? null);

  return (
    <>
      {comfortDialog}
      <SectionShell
        section={section}
        index={index}
        total={ALL_SECTIONS.length}
        answered={answered}
        visible={visible.length}
        nextTitle={nextTitle}
        outstanding={check.missing.map((s) => shortLabel(s, lang))}
        revisited={touched[section.id] === true}
        lang={lang}
        comfort={comfort}
        onComfort={setComfort}
        onLang={setLang}
        onNext={nextSection}
        onBack={() => {
          if (index === 0) router.push("/");
          else prevSection();
        }}
        announcement={announcement}
        onJumpSection={goToSection}
        allSections={ALL_SECTIONS}
        railProgress={railProgress}
      >
        {visible.map((step, i) => {
          const done = isAnswered(step, answers, meta, explicitNone);
          return (
          <QuestionCard
            key={step.id}
            step={step}
            index={i + 1}
            answered={done}
            state={step.id === openQuestionId ? "open" : done ? "answered" : "waiting"}
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
            onOpen={() => {
              // Opening an ALREADY answered card is a correction: mark it so the
              // auto-open effect leaves the patient where they are.
              correcting.current = done;
              openQuestion(step.id);
            }}
          />
          );
        })}
      </SectionShell>
    </>
  );
}
