"use client";

/**
 * Text size, as a control the patient can actually find.
 *
 * Cycles standard, larger, largest. The default comes from the age they gave on the first
 * screen, and touching this freezes it - an automatic default that keeps overriding a
 * deliberate choice is a bug with good intentions.
 *
 * It is a labelled "Aa" rather than an icon because this is the one control in the app
 * whose meaning has to survive being read by someone who is struggling to read: the glyph
 * demonstrates what the button does.
 *
 * The scale is applied by writing `data-comfort` on <html> and letting one CSS rule zoom
 * the page (see globals.css). Zoom rather than a font scale, because it takes the tap
 * targets with it - bigger text on 44px buttons helps someone who cannot see the screen
 * and does nothing for someone whose hands shake.
 */
import { useEffect } from "react";
import { comfortName, type Comfort } from "@/lib/patient";
import { t, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { tick } from "@/lib/utils";

const ORDER: Comfort[] = ["standard", "large", "xl"];

export function ComfortToggle({
  comfort,
  onChange,
  lang,
  className,
}: {
  comfort: Comfort;
  onChange: (c: Comfort) => void;
  lang: Lang;
  className?: string;
}) {
  // The store is the source of truth; the DOM attribute is a projection of it. Written in
  // an effect so a resumed session (age already answered) scales on arrival.
  useEffect(() => {
    const root = document.documentElement;
    if (comfort === "standard") root.removeAttribute("data-comfort");
    else root.dataset.comfort = comfort;
  }, [comfort]);

  const next = ORDER[(ORDER.indexOf(comfort) + 1) % ORDER.length]!;

  return (
    <button
      type="button"
      onClick={() => {
        tick();
        onChange(next);
      }}
      aria-label={t("comfortToggleAria", lang, {
        current: comfortName(comfort, lang),
        next: comfortName(next, lang),
      })}
      title={comfortName(comfort, lang)}
      className={cn(
        "grid h-9 shrink-0 place-items-center rounded-full border px-2.5 transition-colors",
        comfort === "standard"
          ? "border-line bg-card text-muted hover:border-brand/50 hover:text-brand-ink"
          : "border-brand/45 bg-brand-soft text-brand-ink",
        "active:scale-95",
        className,
      )}
    >
      <span aria-hidden className="flex items-baseline gap-[1px] font-bold leading-none">
        <span className="text-[13px]">A</span>
        <span className={cn(comfort === "xl" ? "text-[15px]" : "text-[11px]")}>a</span>
        {comfort !== "standard" ? <span className="ml-0.5 text-[10px]">+</span> : null}
      </span>
    </button>
  );
}
