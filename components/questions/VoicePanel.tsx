"use client";

/**
 * The mic affordance used by Q11/12/13/14.
 *
 * State machine: idle -> recording -> transcribing -> extracting -> filled | error.
 * Every terminal state (including every error) leaves the tap grid underneath fully
 * usable — voice is an accelerator, never a gate. If the browser has no usable
 * MediaRecorder (older iOS, desktop without a mic) the panel renders nothing at all
 * rather than a dead button.
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MAX_RECORDING_MS, micSupported, startRecording, type Recorder } from "@/lib/audio";
import type { ExtractResult } from "@/lib/extractPrompt";
import { UI_COPY } from "@/lib/copy";
import { cn, tick } from "@/lib/utils";

type Phase = "idle" | "recording" | "transcribing" | "extracting" | "done" | "error";

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
   * Count up while we wait on the two APIs. Measured round trip on the free NVIDIA
   * tier is 8-19s depending on how many columns the slice has — long enough that a
   * static "Filling it in…" reads as frozen. A ticking number reads as working, and
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

  return (
    <div className="mb-5 overflow-hidden rounded-3xl border-2 border-brand/25 bg-card">
      <div className="flex items-center gap-3.5 p-4">
        <button
          type="button"
          onClick={phase === "recording" ? stop : begin}
          disabled={busy}
          aria-label={phase === "recording" ? UI_COPY.recordStop : UI_COPY.recordCta}
          className={cn(
            "relative grid size-16 shrink-0 place-items-center rounded-full transition-colors",
            "active:scale-95 disabled:opacity-60",
            phase === "recording" ? "bg-warn text-white" : "bg-brand text-white",
          )}
        >
          {phase === "recording" ? (
            <>
              <motion.span
                aria-hidden
                className="absolute inset-0 rounded-full bg-warn/35"
                animate={{ scale: [1, 1.45], opacity: [0.6, 0] }}
                transition={{ duration: 1.3, repeat: Infinity, ease: "easeOut" }}
              />
              <StopIcon />
            </>
          ) : busy ? (
            <Spinner />
          ) : (
            <MicIcon />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-snug text-ink">
            {phase === "recording"
              ? UI_COPY.recordListening
              : busy
                ? UI_COPY.recordThinking
                : phase === "done"
                  ? UI_COPY.recordFilled
                  : UI_COPY.recordCta}
          </p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-muted">
            {phase === "recording" ? (
              <span className="tabular-nums">
                {(elapsed / 1000).toFixed(0)}s · tap to stop
              </span>
            ) : busy ? (
              <span className="tabular-nums">
                {(elapsed / 1000).toFixed(0)}s
                {elapsed > 12_000 ? " · taking a while — you can also tap the answers below" : ""}
              </span>
            ) : phase === "error" ? (
              <span className="text-warn">{error}</span>
            ) : (
              UI_COPY.recordLanguages
            )}
          </p>
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
