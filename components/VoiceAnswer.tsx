"use client";

/**
 * "Answer by speaking" - the second way through every question, under the first.
 *
 * THE ORDER IS THE DESIGN. The tap controls are above this, always, and they are what a
 * patient meets first: they need no permission, no network, no model, and they work in a
 * quiet room and a loud one. Speaking is offered underneath as a quieter row, because for
 * the six-row habits table and the five-row product table, saying one sentence genuinely
 * beats fourteen taps - and because a patient who finds reading hard should not have to
 * read to answer.
 *
 * An earlier version had this the other way round, with a "speak first" panel that opened
 * before the question and a mic on every card at the top. It came out, and the reason it
 * came out is worth keeping: a microphone offered before the question has been read is a
 * demand, not an offer. This one is an offer.
 *
 * WHAT IT NEVER DOES
 *
 *  - It never advances, and it asks the page not to either. A tap and a voice fill are not
 *    the same event: someone who tapped an option watched themselves choose it, while
 *    someone who spoke is being shown a machine's reading of what they said and has to be
 *    able to check it. So `onWillFill` suppresses the one auto-advance that would otherwise
 *    collapse this card the instant it became answered, taking the transcript with it. The
 *    way on is then offered here, once, as a button - see `onContinue`.
 *  - It never renders when the browser cannot record, or when this deployment has no
 *    speech-to-text key. A dead microphone icon is worse than none, so `micSupported()`
 *    and `voiceConfigured()` together decide whether this component exists at all.
 *  - It never fills consent. That is enforced two layers down, in the API route's
 *    allow-list, not here - a UI rule can be bypassed by a caller, and this one may not be.
 *  - It never replaces the question. The card stays exactly where it was; this is one row
 *    that grows into a panel and shrinks back.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { MAX_RECORDING_MS, micSupported, startRecording, type Recorder } from "@/lib/audio";
import { fillFromSpeech, voiceConfigured, type VoiceFailure } from "@/lib/voiceClient";
import { planVoiceFill, type VoicePlan } from "@/lib/voiceApply";
import { speakPrompts, t, type Lang } from "@/lib/i18n";
import type { Answers, Meta, PatientSex } from "@/lib/types";
import { cn, tick } from "@/lib/utils";
import { Button } from "./ui/Button";

type Phase = "idle" | "recording" | "working" | "done" | "error";

interface Report {
  transcript: string;
  plan: VoicePlan;
}

export function VoiceAnswer({
  questionKey,
  lang,
  meta,
  patch,
  setSex,
  setAge,
  setFirstName,
  chooseNone,
  onWillFill,
  onContinue,
}: {
  /** The slice this card is answered by. See `voiceKeyForStep`. */
  questionKey: string;
  lang: Lang;
  meta: Meta;
  patch: (p: Partial<Answers>) => void;
  setSex: (sex: PatientSex) => void;
  setAge: (age: number | null) => void;
  setFirstName: (name: string | null) => void;
  chooseNone: (key: string) => void;
  /**
   * Called immediately BEFORE the store is written, so the page can decline to auto-open
   * the next card on this change. Before, not after: the auto-open is an effect, and by
   * the time it runs the store write has already happened.
   */
  onWillFill?: () => void;
  /**
   * The way on, offered inside the report once something was filled.
   *
   * Present only on the cards that would have advanced by themselves - the ones that do
   * not already carry their own "Done, next question" button. Two buttons saying the same
   * thing on one card is worse than either.
   */
  onContinue?: () => void;
}) {
  const reduce = useReducedMotion();
  const [supported, setSupported] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [failure, setFailure] = useState<VoiceFailure>("failed");
  const [report, setReport] = useState<Report | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [slow, setSlow] = useState(false);
  const recorder = useRef<Recorder | null>(null);

  /*
    Capability is client-only; checking during render would break hydration.

    Two conditions, not one. `micSupported()` is about the browser, and it never changes.
    `voiceConfigured()` is about this deployment, and it goes false the first time a route
    answers 503 - so on a deployment with no speech-to-text key the patient is told once,
    on the card where they tried, and no card after it offers a microphone that cannot work.
  */
  useEffect(() => setSupported(micSupported() && voiceConfigured()), []);

  /*
    A recording in progress when the card closes is a recording nobody will ever see the
    result of, and it is holding the microphone. Both are fixed by cancelling on unmount -
    which also covers the patient tapping a different question mid-sentence.
  */
  useEffect(
    () => () => {
      recorder.current?.cancel();
      recorder.current = null;
    },
    [],
  );

  /** The live meter and the clock, on one timer rather than two. */
  useEffect(() => {
    if (phase !== "recording") return;
    const started = Date.now();
    const id = window.setInterval(() => {
      const elapsed = Date.now() - started;
      setSeconds(Math.floor(elapsed / 1000));
      setLevel(recorder.current?.getLevel() ?? 0);
      // A patient who forgets to press stop should not lose the whole reply, so the
      // recorder has a ceiling and reaching it behaves exactly like pressing stop.
      if (elapsed >= MAX_RECORDING_MS) void finish();
    }, 100);
    return () => window.clearInterval(id);
    // `finish` is recreated every render and is only read inside the interval; the effect
    // must not restart on that account, or the clock resets four times a second.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  /** "Taking a while" appears on its own, so a slow model never looks like a dead one. */
  useEffect(() => {
    if (phase !== "working") {
      setSlow(false);
      return;
    }
    const id = window.setTimeout(() => setSlow(true), 6000);
    return () => window.clearTimeout(id);
  }, [phase]);

  if (!supported) return null;

  async function begin() {
    tick(12);
    setReport(null);
    setSeconds(0);
    setLevel(0);
    try {
      recorder.current = await startRecording();
      setPhase("recording");
    } catch {
      // Overwhelmingly this is a refused permission prompt. Either way the answer is the
      // same sentence: the taps above still work.
      setFailure("failed");
      setPhase("error");
    }
  }

  function abandon() {
    tick();
    recorder.current?.cancel();
    recorder.current = null;
    setPhase("idle");
  }

  async function finish() {
    const rec = recorder.current;
    if (rec === null) return;
    recorder.current = null;
    tick(12);
    setPhase("working");

    let wav: Blob;
    try {
      wav = await rec.stop();
    } catch {
      setFailure("failed");
      setPhase("error");
      return;
    }

    const outcome = await fillFromSpeech(questionKey, wav);
    if (outcome.kind === "error") {
      setFailure(outcome.failure);
      setPhase("error");
      return;
    }

    const plan = planVoiceFill(outcome.payload, questionKey, meta, lang);
    apply(plan);
    setReport({ transcript: outcome.transcript, plan });
    setPhase("done");
  }

  /**
   * The store writes, in the order the store needs them.
   *
   * Sex before age is deliberate: `setSex` rewrites answers to enforce its gate (it nulls
   * the two female-only questions and drops PCOS/PCOD for a male patient), so applying an
   * answer patch first and the sex second would let the gate undo the fill it just made.
   */
  function apply(plan: VoicePlan) {
    onWillFill?.();
    // `Meta` allows null on all three, so `undefined` alone is not the test: a null here
    // would mean "clear what the patient already told us", which a fill may never do.
    const sex = plan.meta.patient_sex;
    if (sex !== undefined && sex !== null) setSex(sex);
    const age = plan.meta.patient_age;
    if (age !== undefined && age !== null) setAge(age);
    const name = plan.meta.first_name;
    if (name !== undefined && name !== null) setFirstName(name);
    if (Object.keys(plan.answers).length > 0) patch(plan.answers);
    for (const key of plan.noneOf) chooseNone(key);
  }

  const prompt = speakPrompts(lang)[questionKey];

  return (
    <div className="mt-4 border-t border-line pt-3">
      <AnimatePresence initial={false} mode="wait">
        {phase === "idle" ? (
          <Fade key="idle" reduce={reduce}>
            <button
              type="button"
              onClick={() => void begin()}
              aria-label={t("voiceCtaAria", lang)}
              className={cn(
                "flex min-h-[44px] items-center gap-2.5 rounded-xl px-2 -ml-2",
                "text-[13.5px] font-semibold text-brand-ink",
                "transition-colors hover:bg-brand-soft/50 active:bg-brand-soft",
              )}
            >
              <span
                aria-hidden
                className="grid size-7 shrink-0 place-items-center rounded-full border border-brand/40 bg-brand-soft text-brand-ink"
              >
                <MicIcon />
              </span>
              {t("voiceCta", lang)}
            </button>
          </Fade>
        ) : null}

        {phase === "recording" ? (
          <Fade key="recording" reduce={reduce} reveal>
            <div className="rounded-xl border border-brand/40 bg-brand-soft/40 p-3.5">
              <div className="flex items-center gap-3">
                <Meter level={level} reduce={reduce} />
                <p className="min-w-0 flex-1 text-[13.5px] font-semibold text-brand-ink">
                  {t("voiceListening", lang)}
                  <span className="ml-2 font-normal tabular-nums text-muted">
                    {t("voiceSeconds", lang, { n: seconds })}
                  </span>
                </p>
              </div>

              {/*
                The guidance is here rather than beside the idle button, and only for the
                table questions, because that is the only place it earns its space: "please
                mention smoking, alcohol, hard water..." is genuinely hard to remember, and
                a patient reads it while they are talking. On a single question the options
                are already on screen directly above.
              */}
              {prompt !== undefined ? (
                <div className="mt-3 border-t border-brand/25 pt-2.5 text-[12.5px] leading-relaxed text-ink">
                  <p className="font-semibold">{t("voiceMention", lang)}</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted">
                    {prompt.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                  {prompt.detailNote !== undefined ? (
                    <p className="mt-1.5 text-muted">{prompt.detailNote}</p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
                  {t("voiceHint", lang)}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={() => void finish()} className="min-h-[44px] flex-1 text-[14px]">
                  {t("voiceStopFill", lang)}
                </Button>
                <Button variant="ghost" onClick={abandon} className="min-h-[44px] text-[14px]">
                  {t("voiceCancel", lang)}
                </Button>
              </div>
            </div>
          </Fade>
        ) : null}

        {phase === "working" ? (
          <Fade key="working" reduce={reduce}>
            <p
              role="status"
              className="flex min-h-[44px] items-center gap-2.5 text-[13.5px] font-medium text-muted"
            >
              <Spinner reduce={reduce} />
              {t("voiceWorking", lang)}
              {slow ? <span className="text-[12.5px]">{t("voiceSlow", lang)}</span> : null}
            </p>
          </Fade>
        ) : null}

        {phase === "done" && report !== null ? (
          <Fade key="done" reduce={reduce} reveal>
            <Result
              report={report}
              lang={lang}
              onAgain={() => void begin()}
              onContinue={onContinue}
            />
          </Fade>
        ) : null}

        {phase === "error" ? (
          <Fade key="error" reduce={reduce}>
            <div className="space-y-2.5">
              <p role="alert" className="text-[13px] leading-relaxed text-warn">
                {t(
                  failure === "empty"
                    ? "voiceEmpty"
                    : failure === "off"
                      ? "voiceOff"
                      : "voiceFailed",
                  lang,
                )}
              </p>
              {/*
                No retry when the feature is not configured. Offering one would be inviting
                the patient to fail again at something no amount of trying can fix.
              */}
              {failure === "off" ? null : (
                <Button
                  variant="secondary"
                  onClick={() => void begin()}
                  className="min-h-[44px] text-[14px]"
                >
                  <MicIcon /> {t("voiceAgain", lang)}
                </Button>
              )}
            </div>
          </Fade>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/**
 * What the microphone heard and what it wrote, in that order.
 *
 * The transcript is shown FIRST and always, including when nothing matched. A patient
 * whose reply filled nothing needs to know whether they were misheard or misunderstood,
 * and those two have different remedies - say it again, or tap it in. A bare "nothing
 * matched" hides which one they are in.
 */
function Result({
  report,
  lang,
  onAgain,
  onContinue,
}: {
  report: Report;
  lang: Lang;
  onAgain: () => void;
  onContinue?: () => void;
}) {
  const { transcript, plan } = report;
  const total = plan.filled + plan.missing;

  return (
    <div className="space-y-2.5">
      <div className="rounded-xl border border-line bg-paper/60 p-3">
        <p className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">
          {t("voiceHeard", lang)}
        </p>
        <p className="mt-1 text-[13.5px] leading-relaxed text-ink">{transcript}</p>
      </div>

      <p role="status" className="text-[13px] leading-relaxed font-medium text-ink">
        {plan.filled === 0
          ? t("resultNothingMatched", lang)
          : plan.missing === 0
            ? t("resultFilledOf", lang, { got: plan.filled, total })
            : t("resultFilledOfLeft", lang, {
                got: plan.filled,
                total,
                missed: plan.missing,
              })}
      </p>

      {/* One line per closed option, because "PCOS was ignored" needs a reason attached. */}
      {plan.blocked.map((option) => (
        <p key={option} className="text-[12.5px] leading-relaxed text-muted">
          {t("voiceBlocked", lang, { option })}
        </p>
      ))}

      {plan.filled > 0 ? (
        <p className="text-[12.5px] leading-relaxed text-muted">{t("voiceCheckAbove", lang)}</p>
      ) : null}

      {/*
        The way on and the way back, in that order.

        "Done, next question" is here rather than left to the auto-advance because the
        advance was deliberately suppressed: this card stayed open so the patient could
        read what was heard, and a card that stays open owes them a way out of it. It is
        absent on the questions that carry their own version of this button lower down.
      */}
      <div className="flex flex-wrap gap-2">
        {onContinue !== undefined && plan.filled > 0 ? (
          <Button onClick={onContinue} className="min-h-[44px] text-[14px]">
            {t("doneWithThis", lang)}
          </Button>
        ) : null}
        <Button variant="secondary" onClick={onAgain} className="min-h-[44px] text-[14px]">
          <MicIcon /> {t("voiceAgain", lang)}
        </Button>
      </div>
    </div>
  );
}

/**
 * Five bars driven by the real input level from the microphone.
 *
 * Not a canned animation, and the difference is not decorative: a looping animation looks
 * identical whether the mic is live or muted, so a patient in a noisy clinic gets no
 * feedback until the transcript comes back empty. Real levels make "it is not picking me
 * up" obvious in the first second. See `Recorder.getLevel` in lib/audio.ts.
 */
function Meter({ level, reduce }: { level: number; reduce: boolean | null }) {
  const bars = [0.55, 0.8, 1, 0.8, 0.55];
  return (
    <span aria-hidden className="flex h-7 shrink-0 items-center gap-[3px]">
      {bars.map((weight, i) => {
        const height = reduce ? 12 : 5 + Math.round(level * weight * 22);
        return (
          <span
            key={i}
            className="w-[3px] rounded-full bg-brand transition-[height] duration-100"
            style={{ height: `${height}px` }}
          />
        );
      })}
    </span>
  );
}

function Spinner({ reduce }: { reduce: boolean | null }) {
  return (
    <motion.span
      aria-hidden
      className="block size-4 shrink-0 rounded-full border-2 border-line border-t-brand"
      animate={reduce ? undefined : { rotate: 360 }}
      transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
    />
  );
}

function Fade({
  children,
  reduce,
  reveal = false,
}: {
  children: ReactNode;
  reduce: boolean | null;
  /**
   * Scroll this pane clear of the fixed chrome as it appears.
   *
   * It happens HERE, on mount, and the first version did it in the parent on a 150ms timer
   * instead. That version measured nothing, reproducibly: `AnimatePresence mode="wait"`
   * unmounts the outgoing pane before it mounts the incoming one, so at 150ms the wrapper
   * still had the height of the row that was leaving - the tall habits panel was measured
   * as a 44px link and judged already in view. Mounting is the event; a delay chosen to
   * approximate it is a delay that will be wrong on some machine.
   */
  reveal?: boolean;
}) {
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!reveal || box.current === null) return;
    revealBelowChrome(box.current, reduce !== true);
    // Only on mount: a re-render of the same pane must not move the page under the patient.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      ref={box}
      initial={reduce ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
      transition={{ duration: reduce ? 0 : 0.15 }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Scroll an element clear of the chrome that is fixed over the page.
 *
 * `scrollIntoView` is the obvious tool and it does not work here, for two reasons that
 * both had to be measured to be believed. It walks up to the nearest scrollable ancestor,
 * and a question card has TWO `overflow: hidden` wrappers - the card itself and the
 * disclosure region - which it treats as scroll containers, so it moves the page not at
 * all. And even against the window it knows nothing about a fixed app bar or a fixed
 * actions row, so `block: "nearest"` tucks the target neatly underneath one of them.
 *
 * The bounds are read off those two elements rather than hardcoded, because both change
 * height with the comfort scale and one of them is only on screen at some widths.
 */
function revealBelowChrome(el: HTMLElement, smooth: boolean) {
  const behavior: ScrollBehavior = smooth ? "smooth" : "auto";
  const header = document.querySelector("header");
  const actions = [...document.querySelectorAll<HTMLElement>("[data-next-action]")].find(
    (n) => n.getClientRects().length > 0,
  );

  const GAP = 10;
  const top = (header?.getBoundingClientRect().bottom ?? 0) + GAP;
  /*
    The lower bound is whichever comes first: the actions row, or the bottom of the window.
    Both cases are real. On a phone the actions are fixed and sit OVER the page, so they are
    the limit; at desktop widths they are in the flow below the content, so their top can be
    a thousand pixels down and the window is the limit. Taking only the actions row was the
    first version, and it left the desktop panel exactly where it started.
  */
  const bottom =
    Math.min(actions?.getBoundingClientRect().top ?? Infinity, window.innerHeight) - GAP;
  const box = el.getBoundingClientRect();

  if (box.bottom > bottom) {
    /*
      Bring the bottom into view, and never scroll further than putting the top at the top.

      The clamp matters when a pane is taller than the band between the two bars, which the
      habits checklist is at the largest text size. The BOTTOM is what gets priority here
      because that is where the buttons are - "Stop and fill in" unreachable is the failure
      this whole function exists for - and the clamp is what stops that priority from
      scrolling the question itself off the top of the screen.
    */
    window.scrollBy({ top: Math.max(0, Math.min(box.bottom - bottom, box.top - top)), behavior });
  } else if (box.top < top) {
    window.scrollBy({ top: box.top - top, behavior });
  }
}

function MicIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="size-[15px] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 4.5a2.5 2.5 0 0 1 2.5 2.5v4a2.5 2.5 0 0 1-5 0V7A2.5 2.5 0 0 1 12 4.5Z" />
      <path d="M6.5 11a5.5 5.5 0 0 0 11 0M12 16.5V20M9 20h6" />
    </svg>
  );
}
