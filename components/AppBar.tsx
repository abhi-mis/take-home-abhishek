"use client";

/**
 * The bar across the top, in exactly the same place on every screen of the form.
 *
 * It is `fixed` at a constant height, and it holds only things that are true for the whole
 * session: who this form belongs to, the three accessibility controls, and how far through
 * the patient is. What it deliberately does NOT hold is anything that changes size with the
 * question - that was the bug. The old header lived inside a vertically centred content
 * column, so its height changed with the section (one line of title here, two there) and the
 * column re-centred underneath it: the chrome appeared to jump on every question. A patient
 * cannot build a mental model of a control that moves.
 *
 * It carries the patient's POSITION ("section 3 of 6") but not the section's NAME, and that
 * split was a correction. The first version put the name here on a phone and in the page on a
 * desktop, which meant two `h1` elements in the document with one of them `display: none`.
 * Valid, and exposed correctly to a screen reader - but the first `h1` in document order was
 * then the hidden one, so anything reaching for "the heading" got an invisible element. The
 * browser smoke found it by hanging on `waitForSelector("h1")`. One heading, in the page, at
 * every width; the bar answers "where am I in the list", which the name does not.
 *
 * The progress line is the bottom edge of the bar rather than a bar of its own, so it costs
 * no vertical space on a phone and still answers "how much is left" from anywhere.
 */
import { ProgressBar } from "./ProgressBar";
import { ComfortToggle } from "./ComfortToggle";
import { LangToggle } from "./LangToggle";
import { ThemeToggle } from "./ThemeToggle";
import { t, type Lang } from "@/lib/i18n";
import type { Comfort } from "@/lib/patient";

/**
 * The bar's height, and the padding that clears it. ONE pair of numbers, always true.
 *
 * These used to describe only the top row (60/68px) while the bar also rendered a progress
 * line under it, so the real thing measured 73/81px and the constant understated it by 13.
 * Nothing looked broken because every caller happened to add enough content padding of its
 * own to cover the difference - the section screens by 20px, the sidebar by 24px. That is not
 * a layout, it is three accidents agreeing.
 *
 * So the header is a fixed height and the progress line lives inside it: the slot is reserved
 * whether or not a screen has progress to show, which also means the chrome does not change
 * height between the form and the review screen.
 */
export const APP_BAR_H = "h-[72px] desk:h-[80px]";
export const APP_BAR_PAD = "pt-[72px] desk:pt-[80px]";

export function AppBar({
  index,
  total,
  fractions,
  lang,
  comfort,
  onComfort,
  onLang,
}: {
  /**
   * Position in the six sections. Omitted on the review screen, which is not one of them -
   * a bar reading "section 7 of 6" is worse than a bar that stops counting.
   */
  index?: number;
  total?: number;
  /** One 0-to-1 completion figure per section. Omitted on the review screen. */
  fractions?: number[];
  lang: Lang;
  comfort: Comfort;
  onComfort: (c: Comfort) => void;
  onLang: (l: Lang) => void;
}) {
  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 ${APP_BAR_H} flex flex-col justify-center border-b border-line bg-paper/90 backdrop-blur-md`}
    >
      <div className="flex items-center gap-3 px-4 desk:px-7">
        <Wordmark />

        {/*
          The phone's orientation line. `truncate` and `min-w-0` matter: "Sample & consent"
          in Hindi is long enough to push the controls off a 320px screen otherwise, and the
          controls are the half a patient cannot do without.
        */}
        <div className="min-w-0 flex-1">
          {index === undefined || total === undefined ? null : (
            <p className="truncate text-[11px] font-bold uppercase tracking-[0.1em] text-muted desk:hidden">
              {t("sectionOf", lang, { n: index + 1, total })}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <ComfortToggle comfort={comfort} onChange={onComfort} lang={lang} />
          <LangToggle lang={lang} onChange={onLang} />
          <ThemeToggle />
        </div>
      </div>

      {/*
        Inside the bar's own height rather than added to it, so a screen with no progress to
        show (the review) has a bar exactly as tall as one that does.
      */}
      {index === undefined || fractions === undefined ? null : (
        <div className="px-4 pt-2 desk:px-7">
          <ProgressBar index={index} fractions={fractions} lang={lang} />
        </div>
      )}
    </header>
  );
}

/**
 * The mark. A sprout over a root line - the one thing this form is about, drawn rather
 * than written, so it reads at 28px and in either theme.
 */
export function Wordmark({ withText = true }: { withText?: boolean }) {
  return (
    <span className="flex shrink-0 items-center gap-2.5">
      <span
        aria-hidden
        className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-brand-soft text-brand-ink desk:size-9"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="size-[19px] desk:size-5"
          stroke="currentColor"
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* the shaft */}
          <path d="M12 21v-9" />
          {/* two leaves */}
          <path d="M12 12c0-3.3 2.2-5.6 5.5-6-.3 3.6-2.3 5.7-5.5 6Z" />
          <path d="M12 13.5c0-2.9-1.9-4.9-4.8-5.3.3 3.2 2 5 4.8 5.3Z" />
          {/* the follicle it grows from */}
          <path d="M8.5 21h7" />
        </svg>
      </span>
      {withText ? (
        <span className="font-display hidden text-[17px] leading-none text-ink desk:block">
          GenoRoot
        </span>
      ) : null}
    </span>
  );
}
