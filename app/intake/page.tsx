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
  advancesOnAnswer,
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
import { sexMissing, shouldOfferComfort, suggestedComfort } from "@/lib/patient";
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
  /*
    Which section holds the sex question. Found by looking for the about step rather than
    hardcoding "0", so moving About You cannot leave the one required answer enforced on the
    wrong screen.
  */
  const aboutSectionId = ALL_SECTIONS.find((sec) =>
    sec.steps.some((step) => step.kind === "about"),
  )?.id;
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
  useEffect(() => {
    if (openQuestionId === null) return;
    const open = visible.find((s) => s.id === openQuestionId);
    if (open === undefined) return;
    if (!isAnswered(open, answers, meta, explicitNone)) {
      correcting.current = false;
      return;
    }
    /*
      Some questions are not finished just because they are answerable.
      See `advancesOnAnswer`: a checkbox list reports itself answered after one tick, and
      closing it there is what made picking two conditions require answering the question
      twice. Those cards stay open and offer an explicit way on instead.
    */
    if (!advancesOnAnswer(open)) return;
    if (correcting.current) return;
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

  /*
    A session that predates this rule, or one restored from sessionStorage mid-form, can be
    sitting on any section with no sex answered - a state the UI can no longer produce but can
    still be handed. Send it back to the question rather than leaving the requirement true in
    one place and unenforced in another.
  */
  useEffect(() => {
    if (aboutSectionId === undefined) return;
    if (!sexMissing(meta)) return;
    if (currentSectionId === aboutSectionId) return;
    goToSection(aboutSectionId);
  }, [meta, currentSectionId, aboutSectionId, goToSection]);

  // Scrolling to the top on a SECTION change, not on every answer: the whole point of the
  // accordion is that answering does not move the page under the patient.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    setAnnouncement("");
  }, [currentSectionId]);

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

  /*
    The only gate in the form: this section asks for sex, and it has not been answered.
    Keyed on the section CONTAINING the about step rather than on its id, so moving About You
    somewhere else cannot leave the rule pointing at the wrong screen.
  */
  /*
    While the sex is unanswered, the section holding it is the only place to be: the Next
    button is disabled AND the sidebar will not navigate anywhere else. Disabling one route
    is not a requirement, it is an inconvenience - a patient found the other one immediately.
  */
  const lockedTo = sexMissing(meta) ? aboutSectionId : undefined;
  const blockedReason =
    visible.some((step) => step.kind === "about") && sexMissing(meta)
      ? t("sexRequired", lang)
      : undefined;

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
        blockedReason={blockedReason}
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
        lockedTo={lockedTo}
      >
        {visible.map((step, i) => {
          const done = isAnswered(step, answers, meta, explicitNone);
          // Null when this card advances on its own, or when nothing follows it here.
          const continueTarget = advancesOnAnswer(step)
            ? null
            : nextUnansweredAfter(section, step, answers, meta, explicitNone);
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
            /*
              Only the cards that do not advance by themselves get a Continue button, and
              only once they have an answer. Everything else moves on when the answer lands,
              so a button there would be a second way to do what just happened.
            */
            /*
              Only where there is a next question to go to.

              The first version handed this to every card that does not advance by itself and
              fell back to focusing the footer when the section had nothing left - so About
              You, which is the only card in its section, showed a "Done, next question"
              button whose next question did not exist. A button that names something it
              cannot do is worse than no button: the way on from the last card in a section is
              Next, which is already there and says where it goes.
            */
            onContinue={
              continueTarget === null
                ? undefined
                : () => {
                    correcting.current = false;
                    openQuestion(continueTarget.id);
                  }
            }
          />
          );
        })}
      </SectionShell>
    </>
  );
}
