"use client";

/**
 * Type it or say it - the same input box does both, which is the promise the landing
 * page makes ("talk and type with the assistant").
 *
 * The microphone owns the whole record -> WAV -> transcribe hop and then hands the
 * parent a plain string, so as far as the conversation is concerned there is no
 * difference between a spoken reply and a typed one. That is what keeps one code path
 * for interpretation: `interpretLocally()` then, only if needed, the model. A separate
 * "voice pipeline" would be a second place for the rules to live.
 *
 * The level meter is driven by REAL microphone levels (Recorder.getLevel), not a canned
 * animation. A fake animation looks identical whether the mic is live or muted, so the
 * patient gets no signal that nothing is being heard until an empty transcript comes
 * back. Real levels make it obvious in the first half second.
 */
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { MAX_RECORDING_MS, micSupported, startRecording, type Recorder } from "@/lib/audio";
import { cn, tick } from "@/lib/utils";

type Phase = "idle" | "recording" | "transcribing";
const BARS = 18;

export function Composer({
  disabled,
  placeholder,
  onSend,
  onNotice,
}: {
  disabled: boolean;
  placeholder: string;
  /** A reply, however it was produced. `viaVoice` is used only for the transcript note. */
  onSend: (text: string, viaVoice: boolean) => void;
  onNotice: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [levels, setLevels] = useState<number[]>(() => new Array(BARS).fill(0));
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<Recorder | null>(null);
  const [micOk, setMicOk] = useState(false);

  // Mic capability is client-only; checking during render would break hydration.
  useEffect(() => setMicOk(micSupported()), []);
  useEffect(() => () => recorderRef.current?.cancel(), []);

  useEffect(() => {
    if (phase !== "recording") return;
    setElapsed(0);
    const started = Date.now();
    const id = setInterval(() => {
      const ms = Date.now() - started;
      setElapsed(ms);
      // Hard stop, so a forgotten mic cannot produce a 10MB upload.
      if (ms >= MAX_RECORDING_MS) void stopRecording();
    }, 200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    if (phase !== "recording") return;
    const id = setInterval(() => {
      const lvl = recorderRef.current?.getLevel() ?? 0;
      setLevels((prev) => [...prev.slice(1), lvl]);
    }, 40);
    return () => clearInterval(id);
  }, [phase]);

  async function beginRecording() {
    tick(12);
    setLevels(new Array(BARS).fill(0));
    try {
      recorderRef.current = await startRecording();
      setPhase("recording");
    } catch {
      onNotice("I could not get microphone access. You can type your answer instead.");
      setPhase("idle");
    }
  }

  async function stopRecording() {
    const rec = recorderRef.current;
    if (!rec) return;
    recorderRef.current = null;
    tick(12);
    setPhase("transcribing");
    try {
      const wav = await rec.stop();
      const form = new FormData();
      form.append("audio", wav, "reply.wav");
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      if (!res.ok) {
        const msg = await res
          .json()
          .then((j: { error?: string }) => j.error ?? "")
          .catch(() => "");
        onNotice(msg || "I could not hear that. Please try again, or type your answer.");
        setPhase("idle");
        return;
      }
      const { transcript } = (await res.json()) as { transcript: string };
      setPhase("idle");
      if (!transcript.trim()) {
        onNotice("Nothing was picked up. Please try again, or type your answer.");
        return;
      }
      onSend(transcript.trim(), true);
    } catch {
      setPhase("idle");
      onNotice("Something went wrong with the recording. You can type your answer instead.");
    }
  }

  function send() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    onSend(text, false);
  }

  const recording = phase === "recording";
  const busy = phase === "transcribing";

  if (recording || busy) {
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-3xl border-2 px-3 py-2.5",
          recording ? "border-warn/50 bg-warn/[0.04]" : "border-brand/30 bg-card",
        )}
      >
        <button
          type="button"
          onClick={recording ? stopRecording : undefined}
          disabled={busy}
          aria-label={recording ? "Stop recording" : "Working"}
          className={cn(
            "relative grid size-12 shrink-0 cursor-pointer place-items-center rounded-full text-white",
            "transition-transform active:scale-95 disabled:cursor-wait",
            recording ? "bg-warn" : "bg-brand",
          )}
        >
          {recording ? (
            <>
              <motion.span
                aria-hidden
                className="absolute inset-0 rounded-full bg-warn/30"
                animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                transition={{ duration: 1.3, repeat: Infinity, ease: "easeOut" }}
              />
              <svg viewBox="0 0 24 24" aria-hidden className="relative size-5 fill-current">
                <rect x="6" y="6" width="12" height="12" rx="2.5" />
              </svg>
            </>
          ) : (
            <Spinner />
          )}
        </button>

        <div className="min-w-0 flex-1">
          {recording ? (
            <>
              <div className="flex h-6 items-center gap-[2.5px]" aria-hidden>
                {levels.map((lvl, i) => {
                  const age = i / levels.length;
                  return (
                    <span
                      key={i}
                      className="flex-1 rounded-full bg-warn"
                      style={{
                        height: `${Math.max(3, lvl * 24 * (0.35 + age * 0.65))}px`,
                        opacity: 0.3 + age * 0.7,
                        transition: "height 60ms linear",
                      }}
                    />
                  );
                })}
              </div>
              <p className="mt-1 text-[12px] font-semibold tabular-nums text-warn">
                {(elapsed / 1000).toFixed(0)}s · tap to stop
              </p>
            </>
          ) : (
            <p className="text-[13.5px] font-semibold text-muted">Writing that down…</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-2">
      <div className="flex min-h-[52px] flex-1 items-center rounded-3xl border-2 border-line bg-card px-4 focus-within:border-brand">
        <textarea
          rows={1}
          value={draft}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter is a newline. On a phone the on-screen keyboard
            // shows a newline key either way, which is why Send is always visible too.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          className="max-h-28 w-full resize-none bg-transparent py-3.5 text-[15px] leading-snug text-ink outline-none placeholder:text-muted/70 disabled:opacity-60"
        />
      </div>

      {draft.trim() || !micOk ? (
        <button
          type="button"
          onClick={send}
          disabled={disabled || !draft.trim()}
          aria-label="Send"
          className="grid size-[52px] shrink-0 cursor-pointer place-items-center rounded-full bg-brand text-white transition-colors hover:bg-brand-strong active:scale-95 disabled:bg-line disabled:text-muted"
        >
          <svg viewBox="0 0 24 24" aria-hidden className="size-5" fill="currentColor">
            <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12 2-12 2z" />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          onClick={beginRecording}
          disabled={disabled}
          aria-label="Answer by speaking"
          className="grid size-[52px] shrink-0 cursor-pointer place-items-center rounded-full bg-brand text-white shadow-[0_2px_10px_rgba(13,107,95,0.28)] transition-colors hover:bg-brand-strong active:scale-95 disabled:bg-line disabled:text-muted"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            className="size-6"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          >
            <path d="M12 4a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V7a3 3 0 0 1 3-3Z" />
            <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" />
          </svg>
        </button>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <motion.svg
      viewBox="0 0 24 24"
      aria-hidden
      className="size-6"
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
