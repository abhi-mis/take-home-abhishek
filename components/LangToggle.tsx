"use client";

/**
 * English / Hindi, as a switch you can find without reading the language you cannot read.
 *
 * Two things make this work for the patient it is for. First, each side is labelled in
 * ITS OWN script - "EN" and "हिं" - so someone who reads only Devanagari can find their
 * half without parsing an English word like "Language". Second, it is a visible segmented
 * control rather than a cycling button: a patient who has landed in the wrong language
 * needs to see where to go, not discover it by pressing something twice.
 *
 * It also writes `lang` on <html>, which is what a screen reader uses to pick its voice.
 * Without it, a screen reader reads Devanagari with an English voice - the accessibility
 * equivalent of not translating at all.
 */
import { useEffect } from "react";
import { HTML_LANG, LANG_SHORT, LANGS, t, type Lang } from "@/lib/i18n";
import { cn, tick } from "@/lib/utils";

export function LangToggle({
  lang,
  onChange,
  className,
}: {
  lang: Lang;
  onChange: (l: Lang) => void;
  className?: string;
}) {
  useEffect(() => {
    document.documentElement.lang = HTML_LANG[lang];
  }, [lang]);

  return (
    <div
      role="radiogroup"
      aria-label={lang === "hi" ? "भाषा" : "Language"}
      className={cn(
        "flex shrink-0 items-center gap-0.5 rounded-full border border-line bg-card p-0.5",
        className,
      )}
    >
      {LANGS.map((l) => {
        const active = l === lang;
        return (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={active}
            // The label of the OTHER language is written in that language, so the
            // instruction is legible to the person who needs it.
            aria-label={l === "hi" ? t("langSwitchToHindi", "hi") : t("langSwitchToEnglish", "en")}
            onClick={() => {
              if (active) return;
              tick();
              onChange(l);
            }}
            className={cn(
              "min-h-8 rounded-full px-2 text-[12px] font-bold leading-none transition-colors",
              active
                ? "bg-brand text-white"
                : "text-muted hover:bg-brand-soft hover:text-brand-ink",
            )}
          >
            {LANG_SHORT[l]}
          </button>
        );
      })}
    </div>
  );
}
