"use client";

/**
 * The raw JSON, in a dialog that scrolls itself.
 *
 * It used to be a `<pre>` appended to the review screen. On a completed form that is about 90
 * lines of JSON, so opening it turned a two-screen review into a six-screen one and the button
 * that closed it again was somewhere off the bottom - the whole page scrolled to show
 * something the patient wanted a look at, not a tour of.
 *
 * A dialog keeps it in one place: capped at 82% of the viewport with the JSON scrolling inside
 * its own box, so the page behind never moves and the way out is always in the same corner.
 *
 * The dialog parts that are not decoration: focus moves in on open and the page behind cannot
 * scroll, Escape closes, and the backdrop is a real button so a pointer user can dismiss it by
 * clicking away. `aria-modal` with a labelled heading, and the JSON itself is a `<pre>` inside
 * a scrollable region marked `tabIndex={0}` - a scrollable box that cannot be focused is a box
 * a keyboard user cannot scroll.
 */
import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Button } from "./ui/Button";
import { t, type Lang } from "@/lib/i18n";

export function JsonDialog({
  json,
  lang,
  onClose,
}: {
  json: string;
  lang: Lang;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <motion.button
        type="button"
        aria-label={t("jsonClose", lang)}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/50 backdrop-blur-[2px]"
      />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="json-title"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        className="relative flex max-h-[82dvh] w-full max-w-2xl flex-col rounded-t-3xl border-t border-line bg-paper shadow-[0_-8px_40px_rgba(28,26,23,0.28)] sm:rounded-3xl sm:border"
      >
        <header className="flex items-center gap-3 border-b border-line px-5 py-3.5">
          <h2 id="json-title" className="font-display min-w-0 flex-1 text-[17px] text-ink">
            {t("jsonTitle", lang)}
          </h2>
          <Button ref={closeRef} variant="ghost" onClick={onClose} className="shrink-0">
            {t("jsonClose", lang)}
          </Button>
        </header>

        {/*
          The scroll lives here, not on the page. `min-h-0` is what makes it work inside a
          flex column: without it the box grows to its content and the cap on the dialog does
          nothing, which is the same bug as a `<pre>` on the page just in a smaller frame.
        */}
        <div
          tabIndex={0}
          role="region"
          aria-label={t("jsonTitle", lang)}
          className="min-h-0 flex-1 overflow-auto px-5 py-4"
        >
          <pre className="rounded-2xl bg-code-bg p-4 text-[11.5px] leading-relaxed text-code-fg">
            {json}
          </pre>
        </div>
      </motion.div>
    </div>
  );
}
