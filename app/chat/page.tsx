"use client";

/**
 * Chat mode: the same intake, as a conversation.
 *
 * It shares EVERYTHING that matters with the form - one Zustand store, one schema, one
 * `validateStep()`, one set of follow-up descriptors, one Zod validator on the way out.
 * This file owns only the conversation: which bubbles exist, what is spoken, and how a
 * reply becomes a store update. All the deciding lives in lib/chatFlow.ts, which is
 * pure and unit-tested.
 *
 * Three rules this screen is built around:
 *
 *  1. TEXT FIRST, VOICE ON TOP. Every line is shown before it is spoken, and speech can
 *     fail in two ways (a browser with no voices, or one that refuses to speak without a
 *     gesture) without the patient losing a single word.
 *
 *  2. NEVER A DEAD END. Every question offers chips. A reply the model cannot read gets
 *     a plain "tap one of these" rather than a retry loop, and a table question that
 *     yields nothing falls back to one small question at a time.
 *
 *  3. NOTHING IS RECORDED SILENTLY. When one sentence fills six medical fields, the
 *     assistant reads them back and asks. Silence is not consent.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useIntake } from "@/lib/store";
import {
  ackLine,
  confirmLine,
  fillSummary,
  interpretLocally,
  nextTurn,
  quickOps,
  ONE_AT_A_TIME,
  stepIdForTurn,
  valueEcho,
  type QuickValue,
  type Turn,
} from "@/lib/chatFlow";
import { clearQuestionOps, extractOps, type Ops } from "@/lib/apply";
import { isExtractKey, type ExtractResult } from "@/lib/extractPrompt";
import { speak, spokenText, stopSpeaking } from "@/lib/speak";
import { CHAT_COPY } from "@/lib/copy";
import { rememberMode } from "@/lib/mode";
import { EXCLUSIVE_OPTIONS } from "@/lib/types";
import { ChatBubble, SectionDivider, Thinking, type ChatMsg } from "@/components/chat/ChatBubble";
import { QuickReplies } from "@/components/chat/QuickReplies";
import { Composer } from "@/components/chat/Composer";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn, tick } from "@/lib/utils";

type Item =
  | { t: "msg"; msg: ChatMsg }
  | { t: "divider"; id: string; title: string };

/** How a reply was resolved - it decides whether the assistant reads it back. */
type Source = "tap" | "local" | "model";

let seq = 0;
const uid = () => `m${++seq}`;

export default function ChatPage() {
  const router = useRouter();

  // Per-field selectors only. A selector that BUILDS a value returns a fresh reference
  // every call, never compares equal under Object.is, and re-renders until React throws
  // "Maximum update depth exceeded".
  const answers = useIntake((s) => s.answers);
  const meta = useIntake((s) => s.meta);
  const explicitNone = useIntake((s) => s.explicitNone);
  const patch = useIntake((s) => s.patch);
  const setSex = useIntake((s) => s.setSex);
  const chooseNone = useIntake((s) => s.chooseNone);
  const markTouched = useIntake((s) => s.markTouched);
  const goTo = useIntake((s) => s.goTo);

  const [items, setItems] = useState<Item[]>([]);
  const [staged, setStaged] = useState<string[]>([]);
  const [thinking, setThinking] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{ key: string; missing: number } | null>(
    null,
  );
  const [preferFields, setPreferFields] = useState<string[]>([]);
  const [voiceOn, setVoiceOn] = useState(true);
  /** The browser refused to play audio without a gesture - offer one. */
  const [needsGesture, setNeedsGesture] = useState(false);

  const askedRef = useRef<string | null>(null);
  const sectionRef = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const turn = useMemo(
    () => nextTurn(answers, meta, explicitNone, { preferFields }),
    [answers, meta, explicitNone, preferFields],
  );

  const push = useCallback((...msgs: Omit<ChatMsg, "id">[]) => {
    setItems((prev) => [...prev, ...msgs.map((m) => ({ t: "msg" as const, msg: { ...m, id: uid() } }))]);
  }, []);

  const say = useCallback(
    (text: string) => {
      if (!voiceOn) return;
      void speak(text).then((outcome) => {
        // "blocked" is a user-activation refusal, not an error: this document has had no
        // gesture yet, because the tap that got here happened on the previous page.
        if (outcome === "blocked") setNeedsGesture(true);
        else if (outcome === "spoken") setNeedsGesture(false);
      });
    },
    [voiceOn],
  );

  /** Ask the current turn: divider if the section changed, bubble, then speak it. */
  useEffect(() => {
    if (pendingConfirm !== null) return; // waiting on the patient to confirm a fill
    if (askedRef.current === turn.id) return;
    askedRef.current = turn.id;
    setStaged([]);

    const next: Item[] = [];
    if (turn.section !== null && turn.section !== sectionRef.current) {
      sectionRef.current = turn.section;
      next.push({ t: "divider", id: uid(), title: turn.section });
    }

    const greeting = items.length === 0 ? intro(turn) : null;
    if (greeting !== null) next.push({ t: "msg", msg: { id: uid(), from: "agent", text: greeting, tone: "note" } });

    next.push({
      t: "msg",
      msg: {
        id: uid(),
        from: "agent",
        text: turn.say,
        points: turn.points,
        detailNote: turn.detailNote,
        example: turn.example,
      },
    });

    setItems((prev) => [...prev, ...next]);
    say([greeting, spokenText(turn)].filter(Boolean).join(" "));
    // `items` is read only to decide the one-time greeting; including it would re-run
    // this effect on every message and re-ask the same question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, pendingConfirm, say]);

  // Keep the newest bubble in view. `end` behaviour rather than smooth scrolling of the
  // window, so the fixed composer never covers the line just added.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [items, thinking, pendingConfirm]);

  useEffect(() => stopSpeaking, []); // silence on unmount, always

  function applyOps(ops: Ops) {
    if (ops.sex !== undefined) setSex(ops.sex);
    if (ops.patch !== undefined) patch(ops.patch);
    // chooseNone AFTER patch: patch retracts a previous "none" when a real option
    // arrives, so running it second would immediately undo a deliberate denial.
    if (ops.none !== undefined) for (const k of ops.none) chooseNone(k);
  }

  /**
   * Everything that happens after an answer is applied.
   *
   * The test for "did that work?" is deliberately not a lookup of the field we hoped to
   * fill - it is whether `nextTurn` still returns the SAME question. That is the same
   * check the form's Next button makes, so the conversation can never accept an answer
   * the form would reject, or reject one it would accept.
   */
  function commit(asked: Turn, ops: Ops, source: Source) {
    const stepId = stepIdForTurn(asked);
    applyOps(ops);

    const st = useIntake.getState();
    const after = nextTurn(st.answers, st.meta, st.explicitNone, { preferFields });
    const stuck = after.id === asked.id;

    // A reply that filled several fields at once gets read back and confirmed.
    if (asked.ask.t === "question" && asked.ask.input === "table") {
      const key = asked.ask.questionKey;
      const summary = fillSummary(key, st.answers);
      const line = confirmLine(summary.filled, summary.missing);
      push({ from: "agent", text: line, lines: summary.lines, tone: "note" });
      say(line);
      if (summary.filled === 0) {
        // Nothing usable. Stop re-reading the six-part question and ask one at a time.
        setPreferFields((p) => (p.includes(key) ? p : [...p, key]));
        askedRef.current = null;
        return;
      }
      setPendingConfirm({ key, missing: summary.missing });
      return;
    }

    if (stuck) {
      const nudge =
        asked.quick.length > 0
          ? CHAT_COPY.nudgeTap
          : CHAT_COPY.nudgeRephrase;
      push({ from: "agent", text: nudge, tone: "warn" });
      return;
    }

    markTouched(stepId);

    // Only a model reading is read back. A tap or a verbatim answer is already visible
    // in the patient's own bubble, and narrating it is noise.
    if (source === "model" && asked.ask.t === "question") {
      const echo = valueEcho(asked.ask.questionKey, st.answers);
      if (echo !== null) {
        const line = `${CHAT_COPY.recorded} ${echo}.`;
        push({ from: "agent", text: line, tone: "note" });
        return;
      }
    }
    if (source === "model") push({ from: "agent", text: ackLine(asked, st.answers), tone: "note" });
  }

  /** A tapped chip. No model, no network, no ambiguity. */
  function onPick(value: QuickValue) {
    if (pendingConfirm !== null) return;
    const label = labelFor(turn, value);
    push({ from: "patient", text: label });

    // "Ask me one at a time" is not an answer - it changes how the question is asked,
    // and it is the tap-only route through the three table questions.
    if (value.t === "fields") {
      setPreferFields((p) => (p.includes(value.questionKey) ? p : [...p, value.questionKey]));
      askedRef.current = null;
      return;
    }
    commit(turn, quickOps(turn, value, answers), "tap");
  }

  /** Staging for multi-selects, with the schema's exclusivity rule applied as you tap. */
  function onStage(option: string) {
    if (turn.ask.t !== "question") return;
    const exclusive = EXCLUSIVE_OPTIONS[turn.ask.questionKey];
    setStaged((prev) => {
      if (exclusive !== undefined && option === exclusive) return [exclusive];
      const kept = exclusive === undefined ? prev : prev.filter((p) => p !== exclusive);
      return kept.includes(option) ? kept.filter((p) => p !== option) : [...kept, option];
    });
  }

  function onDoneStaged() {
    if (turn.ask.t !== "question" || staged.length === 0) return;
    const key = turn.ask.questionKey;
    push({ from: "patient", text: staged.join(", ") });
    const chosen = [...staged];
    setStaged([]);
    commit(turn, { patch: { [key]: chosen } as never }, "tap");
  }

  /** A typed or spoken reply. Local interpretation first; the model only if needed. */
  async function onSend(text: string, viaVoice: boolean) {
    if (pendingConfirm !== null) return;
    const asked = turn;
    push({ from: "patient", text });

    const local = interpretLocally(asked, text, answers);
    if (local !== null) {
      commit(asked, local, "local");
      return;
    }

    /**
     * Which replies are allowed to reach the model.
     *
     * Only a whole question. A conditional detail ("Did it help?") is NOT sent, because
     * its slice covers the entire table and a bare "it helped a bit" carries no clue
     * which row it belongs to - the model would have to guess, and a guess written into
     * the wrong row is a silent wrong answer in a medical form. Those turns always have
     * chips, so "tap one of these" is a complete answer to the situation.
     *
     * Consent and the sex gate never reach the model at all.
     */
    const key = asked.ask.t === "question" ? asked.ask.questionKey : null;
    if (key === null || !isExtractKey(key)) {
      push({ from: "agent", text: CHAT_COPY.nudgeTap, tone: "warn" });
      return;
    }

    setThinking(viaVoice ? CHAT_COPY.thinkingVoice : CHAT_COPY.thinkingText);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionKey: key, transcript: text }),
      });
      if (!res.ok) {
        const msg = await res
          .json()
          .then((j: { error?: string }) => j.error ?? "")
          .catch(() => "");
        push({ from: "agent", text: msg || CHAT_COPY.extractFailed, tone: "warn" });
        return;
      }
      const result = (await res.json()) as ExtractResult;
      commit(asked, extractOps(key, result, useIntake.getState().answers), "model");
    } catch {
      push({ from: "agent", text: CHAT_COPY.extractFailed, tone: "warn" });
    } finally {
      setThinking(null);
    }
  }

  /** "Are these right?" - the answer to which decides whether a fill survives. */
  function resolveConfirm(ok: boolean) {
    const pending = pendingConfirm;
    if (pending === null) return;
    tick();
    push({ from: "patient", text: ok ? CHAT_COPY.confirmYes : CHAT_COPY.confirmNo });
    setPendingConfirm(null);

    if (ok) {
      // Anything still outstanding is asked next, one field at a time.
      askedRef.current = null;
      return;
    }
    applyOps(clearQuestionOps(pending.key, useIntake.getState().answers));
    setPreferFields((p) => (p.includes(pending.key) ? p : [...p, pending.key]));
    askedRef.current = null;
    push({ from: "agent", text: CHAT_COPY.redo, tone: "note" });
    say(CHAT_COPY.redo);
  }

  const done = turn.ask.t === "done";
  const { answered, total } = turn.progress;

  return (
    <div className="mx-auto flex h-dvh w-full max-w-md flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-line bg-paper/95 px-3 py-2.5 backdrop-blur">
        <Link
          href="/"
          aria-label="Back to start"
          className="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-card text-muted transition-colors hover:border-brand/50 hover:text-brand-ink"
        >
          <svg viewBox="0 0 24 24" aria-hidden className="size-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold text-ink">{CHAT_COPY.title}</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-line">
              <motion.span
                className="block h-full rounded-full bg-brand"
                animate={{ width: `${Math.round((answered / total) * 100)}%` }}
                transition={{ duration: 0.35 }}
              />
            </span>
            <span className="shrink-0 text-[10.5px] font-semibold tabular-nums text-muted">
              {answered}/{total}
            </span>
          </div>
        </div>

        {/* Mute is a real control, not a preference screen: a clinic waiting room is
            exactly where someone needs to silence this in one tap. */}
        <button
          type="button"
          onClick={() => {
            const next = !voiceOn;
            setVoiceOn(next);
            if (!next) stopSpeaking();
            else {
              setNeedsGesture(false);
              void speak(spokenText(turn));
            }
          }}
          aria-label={voiceOn ? "Turn the assistant's voice off" : "Turn the assistant's voice on"}
          aria-pressed={voiceOn}
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-full border transition-colors",
            voiceOn
              ? "border-brand/40 bg-brand-soft text-brand-ink"
              : "border-line bg-card text-muted",
          )}
        >
          {voiceOn ? <SpeakerIcon /> : <SpeakerOffIcon />}
        </button>

        <ThemeToggle />
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <div className="flex flex-col gap-3">
          {items.map((it) =>
            it.t === "divider" ? (
              <SectionDivider key={it.id} title={it.title} />
            ) : (
              <ChatBubble key={it.msg.id} msg={it.msg} />
            ),
          )}
          <AnimatePresence>{thinking !== null ? <Thinking label={thinking} /> : null}</AnimatePresence>
          <div ref={endRef} />
        </div>
      </main>

      <footer className="shrink-0 border-t border-line bg-paper/95 px-3 py-3 backdrop-blur">
        {needsGesture && voiceOn ? (
          <button
            type="button"
            onClick={() => {
              setNeedsGesture(false);
              void speak(spokenText(turn));
            }}
            className="mb-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-brand/40 bg-brand-soft px-3 py-2 text-[13px] font-semibold text-brand-ink"
          >
            <SpeakerIcon />
            {CHAT_COPY.tapToHear}
          </button>
        ) : null}

        {done ? (
          <button
            type="button"
            onClick={() => {
              goTo("review");
              router.push("/intake");
            }}
            className="min-h-[56px] w-full rounded-2xl bg-brand text-[16px] font-bold text-white transition-colors hover:bg-brand-strong"
          >
            {CHAT_COPY.review}
          </button>
        ) : pendingConfirm !== null ? (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => resolveConfirm(true)}
              className="min-h-[52px] rounded-2xl bg-brand text-[15px] font-bold text-white transition-colors hover:bg-brand-strong"
            >
              {CHAT_COPY.confirmYes}
            </button>
            <button
              type="button"
              onClick={() => resolveConfirm(false)}
              className="min-h-[48px] rounded-2xl border border-line bg-card text-[14px] font-semibold text-muted transition-colors hover:border-brand/50 hover:text-brand-ink"
            >
              {CHAT_COPY.confirmNo}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            <QuickReplies
              quick={turn.quick}
              multiSelect={turn.multiSelect}
              staged={staged}
              disabled={thinking !== null}
              onStage={onStage}
              onPick={onPick}
              onDone={onDoneStaged}
            />
            {turn.freeText ? (
              <Composer
                disabled={thinking !== null}
                placeholder={turn.multiSelect ? CHAT_COPY.placeholderMulti : CHAT_COPY.placeholder}
                onSend={(text, viaVoice) => void onSend(text, viaVoice)}
                onNotice={(text) => push({ from: "agent", text, tone: "warn" })}
              />
            ) : null}

            {/* The other half of "two ways to answer": switchable at any question, in
                either direction, because both modes are views onto one store. */}
            <button
              type="button"
              onClick={() => {
                stopSpeaking();
                rememberMode("form");
                goTo(stepIdForTurn(turn));
                router.push("/intake");
              }}
              className="text-center text-[12px] font-semibold text-muted underline decoration-line underline-offset-4 transition-colors hover:text-brand-ink"
            >
              {CHAT_COPY.switchToForm}
            </button>
          </div>
        )}
      </footer>
    </div>
  );
}

/** The opening line - different for a fresh start and for a patient carrying on. */
function intro(turn: Turn): string {
  return turn.progress.answered > 0 ? CHAT_COPY.introResume : CHAT_COPY.intro;
}

/** What the patient's own bubble says after they tap a chip. */
function labelFor(turn: Turn, value: QuickValue): string {
  const chip = turn.quick.find((q) => sameValue(q.value, value));
  if (chip !== undefined) return chip.label;
  if (value.t === "bool") return value.b ? "Yes" : "No";
  if (value.t === "option") return value.option;
  if (value.t === "number") return String(value.n);
  if (value.t === "fields") return ONE_AT_A_TIME;
  return "None of these";
}

function sameValue(a: QuickValue, b: QuickValue): boolean {
  if (a.t !== b.t) return false;
  if (a.t === "option" && b.t === "option") return a.option === b.option;
  if (a.t === "bool" && b.t === "bool") return a.b === b.b;
  if (a.t === "number" && b.t === "number") return a.n === b.n;
  if (a.t === "sex" && b.t === "sex") return a.sex === b.sex;
  return true;
}

function SpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10v4h3l4 3.5V6.5L7 10H4Z" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
    </svg>
  );
}

function SpeakerOffIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10v4h3l4 3.5V6.5L7 10H4Z" />
      <path d="M15.5 10l5 4M20.5 10l-5 4" />
    </svg>
  );
}
