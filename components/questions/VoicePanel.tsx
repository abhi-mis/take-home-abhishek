"use client";

/**
 * The mic. Used by Q11/12/13/14 - the questions where speaking beats tapping.
 *
 * State machine: idle -> recording -> transcribing -> extracting -> filled | error.
 * Every terminal state (including every error) leaves the tap grid underneath fully
 * usable - voice is an accelerator, never a gate. If the browser has no usable
 * MediaRecorder (older iOS, desktop without a mic) the panel renders nothing at all
 * rather than a dead button.
 *
 * The waveform is driven by REAL microphone levels (Recorder.getLevel), not a canned
 * animation. That distinction is the whole point: a fake animation looks identical
 * whether the mic is live or muted, so a patient gets no signal that they are not being
 * heard until the transcript comes back empty. Real levels make it obvious instantly.
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MAX_RECORDING_MS, micSupported, startRecording, type Recorder } from "@/lib/audio";
import type { ExtractResult } from "@/lib/extractPrompt";
import { UI_COPY } from "@/lib/copy";
import { cn, tick } from "@/lib/utils";

type Phase = "idle" | "recording" | "transcribing" | "extracting" | "done" | "error";

/** Bar count for the meter. 28 fills the width at 380px without looking sparse. */
const BARS = 28;

export function VoicePanel({
  questionKey,
  onResult,
}: {
  questionKey: string;
  onResult: (r: ExtractResult, transcript: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => new Array(BARS).fill(0));
  const recorderRef = useRef<Recorder | null>(null);
  const supported = useSupported();

  // Hard stop at 60s so a forgotten mic can't produce a 10MB upload.
  useEffect(() => {
    if (phase !== "recording") return;
    setElapsed(0);
    const started = Date.now();
    const id = setInterval(() => {
      const ms = Date.now() - started;
      setElapsed(ms);
      if (ms >= MAX_RECORDING_MS) void stop();
    }, 200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  /**
   * Waveform: sample the live level and push it onto a rolling window, so the bars
   * scroll right-to-left like a real recorder. 40ms (25fps) is smooth to the eye and
   * costs one small state update - cheaper than re-rendering 28 nodes at 60fps.
   */
  useEffect(() => {
    if (phase !== "recording") return;
    const id = setInterval(() => {
      const lvl = recorderRef.current?.getLevel() ?? 0;
      setLevels((prev) => [...prev.slice(1), lvl]);
    }, 40);
    return () => clearInterval(id);
  }, [phase]);

  /**
   * Count up while we wait on the two APIs. Transcription plus extraction is a few
   * seconds on a good connection and considerably longer on a bad one - long enough that
   * a static "Filling it in…" reads as frozen. A ticking number reads as working, and
   * after 12s we say out loud that tapping is still an option.
   */
  useEffect(() => {
    if (phase !== "transcribing" && phase !== "extracting") return;
    setElapsed(0);
    const started = Date.now();
    const id = setInterval(() => setElapsed(Date.now() - started), 250);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => () => recorderRef.current?.cancel(), []);

  async function begin() {
    tick(12);
    setError("");
    setTranscript("");
    setLevels(new Array(BARS).fill(0));
    try {
      recorderRef.current = await startRecording();
      setPhase("recording");
    } catch {
      setError("Microphone permission was denied. You can fill this in by tapping below.");
      setPhase("error");
    }
  }

  async function stop() {
    const rec = recorderRef.current;
    if (!rec) return;
    recorderRef.current = null;
    tick(12);
    setPhase("transcribing");
    try {
      const wav = await rec.stop();

      const form = new FormData();
      form.append("audio", wav, "reply.wav");
      const tRes = await fetch("/api/transcribe", { method: "POST", body: form });
      if (!tRes.ok) throw new Error((await safeMsg(tRes)) || "transcribe failed");
      const { transcript: text } = (await tRes.json()) as { transcript: string };

      if (!text?.trim()) {
        setError("Nothing was picked up. Try again, or tap the answers below.");
        setPhase("error");
        return;
      }
      setTranscript(text);
      setPhase("extracting");

      const eRes = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionKey, transcript: text }),
      });
      if (!eRes.ok) throw new Error((await safeMsg(eRes)) || "extract failed");
      const result = (await eRes.json()) as ExtractResult;

      onResult(result, text);
      setPhase("done");
    } catch (e) {
      setError(
        e instanceof Error && e.message.length < 120
          ? e.message
          : "Something went wrong. You can fill this in by tapping below.",
      );
      setPhase("error");
    }
  }

  if (!supported) return null;

  const busy = phase === "transcribing" || phase === "extracting";
  const recording = phase === "recording";

  return (
    <div
      className={cn(
        "mb-5 overflow-hidden rounded-3xl border-2 transition-colors duration-300",
        recording
          ? "border-warn/50 bg-warn/[0.03]"
          : phase === "done"
            ? "border-brand/40 bg-brand-soft/40"
            : "border-brand/25 bg-card",
      )}
    >
      <div className="flex items-center gap-4 p-4">
        <button
          type="button"
          onClick={recording ? stop : begin}
          disabled={busy}
          aria-label={recording ? UI_COPY.recordStop : UI_COPY.recordCta}
          className={cn(
            "group relative grid size-[68px] shrink-0 cursor-pointer place-items-center rounded-full",
            "text-white transition-[transform,background-color,box-shadow] duration-150",
            "hover:scale-[1.04] active:scale-95",
            "disabled:cursor-wait disabled:opacity-70 disabled:hover:scale-100",
            recording
              ? "bg-warn shadow-[0_0_0_6px_rgba(154,52,18,0.12)]"
              : "bg-brand shadow-[0_2px_10px_rgba(13,107,95,0.28)] hover:shadow-[0_4px_18px_rgba(13,107,95,0.36)]",
          )}
        >
          {recording ? (
            <>
              {/* Two offset pulses read as "live" far better than a single ring. */}
              {[0, 0.65].map((delay) => (
                <motion.span
                  key={delay}
                  aria-hidden
                  className="absolute inset-0 rounded-full bg-warn/30"
                  animate={{ scale: [1, 1.55], opacity: [0.55, 0] }}
                  transition={{ duration: 1.3, repeat: Infinity, ease: "easeOut", delay }}
                />
              ))}
              <StopIcon />
            </>
          ) : busy ? (
            <Spinner />
          ) : (
            <MicIcon />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-[15.5px] font-bold leading-snug text-ink">
            {recording
              ? UI_COPY.recordListening
              : busy
                ? UI_COPY.recordThinking
                : phase === "done"
                  ? UI_COPY.recordFilled
                  : UI_COPY.recordCta}
          </p>

          {/* While recording, the live waveform replaces the subtitle. */}
          {recording ? (
            <div className="mt-2">
              <Waveform levels={levels} />
              <p className="mt-1.5 text-[12px] font-medium tabular-nums text-warn">
                {(elapsed / 1000).toFixed(0)}s · tap to stop
              </p>
            </div>
          ) : (
            <p className="mt-0.5 text-[12.5px] leading-snug text-muted">
              {busy ? (
                <span className="tabular-nums">
                  {(elapsed / 1000).toFixed(0)}s
                  {elapsed > 12_000 ? " · taking a while - you can also tap below" : ""}
                </span>
              ) : phase === "error" ? (
                <span className="text-warn">{error}</span>
              ) : (
                UI_COPY.recordLanguages
              )}
            </p>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {transcript ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-line bg-paper"
          >
            {/* Showing the transcript is how the patient (and the demo) can see what
                the model was actually given, rather than trusting a silent fill. */}
            <p className="px-4 py-3 text-[13px] italic leading-snug text-muted">
              &ldquo;{transcript}&rdquo;
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/**
 * Rolling level meter.
 *
 * Two details that make it read as a recorder rather than a bar chart: every bar keeps
 * a 3px floor, so silence still shows a live baseline instead of an empty box that
 * looks broken; and the oldest samples are tapered and faded, so the trail dissolves
 * to the left instead of ending in a hard edge.
 */
function Waveform({ levels }: { levels: number[] }) {
  return (
    <div className="flex h-7 items-center gap-[2.5px]" aria-hidden>
      {levels.map((lvl, i) => {
        const age = i / levels.length;
        const height = Math.max(3, lvl * 28 * (0.35 + age * 0.65));
        return (
          <span
            key={i}
            className="flex-1 rounded-full bg-warn"
            style={{
              height: `${height}px`,
              opacity: 0.28 + age * 0.72,
              transition: "height 60ms linear",
            }}
          />
        );
      })}
    </div>
  );
}

/** Mic capability is client-only; checking during render would break hydration. */
function useSupported() {
  const [ok, setOk] = useState(false);
  useEffect(() => setOk(micSupported()), []);
  return ok;
}

async function safeMsg(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    return j.error ?? "";
  } catch {
    return "";
  }
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className="size-7" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M12 4a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V7a3 3 0 0 1 3-3Z" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="relative size-6 fill-current">
      <rect x="6" y="6" width="12" height="12" rx="2.5" />
    </svg>
  );
}

function Spinner() {
  return (
    <motion.svg
      viewBox="0 0 24 24"
      aria-hidden
      className="size-7"
      animate={{ rotate: 360 }}
      transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
    >
      <path d="M12 3a9 9 0 1 0 9 9" />
    </motion.svg>
  );
}
