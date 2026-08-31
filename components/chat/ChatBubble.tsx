"use client";

/**
 * One line of the conversation.
 *
 * The assistant's bubble is the question - and in a medical intake the question has to
 * be complete, so it is not always one sentence. A table question carries its
 * enumerated rows (`points`) and its conditional layer (`detailNote`) inside the same
 * bubble, because that IS the question: "tell us about your habits" without the six
 * items is a question a patient cannot answer correctly.
 *
 * `example` is shown but never spoken. Reading an example answer aloud invites the
 * patient to repeat it back as if it were the expected reply.
 */
import { motion } from "framer-motion";
import { UI_COPY } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { CheckIcon } from "../ui/Button";

export interface ChatMsg {
  id: string;
  from: "agent" | "patient";
  text: string;
  points?: string[];
  detailNote?: string;
  example?: string;
  /** Label/value pairs read back after a reply filled several fields at once. */
  lines?: string[];
  /** A correction or fallback notice, styled as a caution rather than a question. */
  tone?: "note" | "warn";
  /** Was this line spoken aloud, or only shown? */
  spoken?: boolean;
}

export function ChatBubble({ msg }: { msg: ChatMsg }) {
  const isAgent = msg.from === "agent";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={cn("flex w-full", isAgent ? "justify-start" : "justify-end")}
    >
      <div
        className={cn(
          "max-w-[88%] rounded-3xl px-4 py-3",
          isAgent
            ? msg.tone === "warn"
              ? "rounded-bl-lg border border-warn/40 bg-warn/[0.06] text-ink"
              : "rounded-bl-lg border border-line bg-card text-ink"
            : "rounded-br-lg bg-brand text-white",
        )}
      >
        <p
          className={cn(
            "whitespace-pre-wrap text-[15px] leading-snug",
            // Questions are bold; acknowledgements and cautions are not, so the
            // patient's eye lands on the thing that needs answering.
            isAgent && msg.tone === undefined ? "font-semibold" : "",
          )}
        >
          {msg.text}
        </p>

        {/* Enumerated, never prose: a paragraph reads well and drops rows. */}
        {msg.points && msg.points.length > 0 ? (
          <ol className="mt-2.5 flex flex-col gap-1.5">
            {msg.points.map((p, i) => (
              <li key={p} className="flex gap-2.5">
                <span
                  aria-hidden
                  className="mt-[1px] grid size-[18px] shrink-0 place-items-center rounded-full bg-brand/15 text-[10px] font-bold tabular-nums text-brand-ink"
                >
                  {i + 1}
                </span>
                <span className="text-[14px] font-normal leading-snug text-ink">{p}</span>
              </li>
            ))}
          </ol>
        ) : null}

        {msg.detailNote ? (
          <p className="mt-2.5 rounded-xl border border-brand/20 bg-brand-soft/40 px-3 py-2 text-[13px] font-normal leading-snug text-ink">
            <span className="font-semibold text-brand-ink">{UI_COPY.speakDetailLabel}:</span>{" "}
            {msg.detailNote}
          </p>
        ) : null}

        {/* The read-back after a multi-field fill. */}
        {msg.lines && msg.lines.length > 0 ? (
          <ul className="mt-2.5 divide-y divide-line overflow-hidden rounded-xl border border-line bg-paper/60">
            {msg.lines.map((l) => (
              <li key={l} className="flex items-start gap-2 px-3 py-2">
                <CheckIcon className="mt-[3px] size-3.5 shrink-0 text-brand" />
                <span className="text-[13px] font-normal leading-snug text-ink">{l}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {msg.example ? (
          <p className="mt-2.5 border-t border-line pt-2 text-[12.5px] font-normal leading-snug text-muted">
            <span className="font-semibold">{UI_COPY.speakExampleLabel}:</span>{" "}
            <span className="italic">&ldquo;{msg.example}&rdquo;</span>
          </p>
        ) : null}
      </div>
    </motion.div>
  );
}

/** The assistant is working: three dots, so a 2s model call does not read as frozen. */
export function Thinking({ label }: { label: string }) {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-2.5 rounded-3xl rounded-bl-lg border border-line bg-card px-4 py-3">
        <span className="flex gap-1" aria-hidden>
          {[0, 0.15, 0.3].map((d) => (
            <motion.span
              key={d}
              className="size-1.5 rounded-full bg-brand"
              animate={{ opacity: [0.25, 1, 0.25], y: [0, -2, 0] }}
              transition={{ duration: 0.9, repeat: Infinity, delay: d }}
            />
          ))}
        </span>
        <span className="text-[13px] font-medium text-muted">{label}</span>
      </div>
    </div>
  );
}

/** Section divider, so a 16-question conversation still feels sectioned like a form. */
export function SectionDivider({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span aria-hidden className="h-px flex-1 bg-line" />
      <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted">
        {title}
      </span>
      <span aria-hidden className="h-px flex-1 bg-line" />
    </div>
  );
}
