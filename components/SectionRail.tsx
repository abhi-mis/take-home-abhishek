"use client";

/**
 * The desktop rail: where you are in the form, and what the keyboard can do.
 *
 * It exists because of a measurement, not a hunch. At 1440x900 the old layout put a 448px
 * column in the middle of the viewport with 992px unused, a header band that stopped
 * mid-page and a footer rule that spanned the whole width - the two disagreeing about how
 * wide the app was. The answer is not a wider column: 448px is close to the ideal measure
 * for reading, and stretching the questions would make them harder to read, not easier.
 * What the column needed was company.
 *
 * Every section is reachable from here. This is a patient's own form, not a wizard that
 * owns them, and someone who remembers they got a treatment date wrong should be able to go
 * straight back to Treatments.
 */
import { sectionLabel, t, type Lang } from "@/lib/i18n";
import type { Section } from "@/lib/sections";
import { cn } from "@/lib/utils";

export interface RailProgress {
  answered: number;
  visible: number;
}

export function SectionRail({
  sections,
  currentId,
  progress,
  lang,
  onJump,
  className,
}: {
  sections: Section[];
  currentId: string;
  /** answered / visible per section id, computed by the page. */
  progress: Record<string, RailProgress>;
  lang: Lang;
  onJump: (id: string) => void;
  className?: string;
}) {
  const labels = sectionLabel(lang);

  return (
    <aside
      className={cn("border-r border-line px-6 py-8", className)}
      aria-label={t("railNav", lang)}
    >
      <p className="font-display text-[21px] leading-tight text-ink">GenoRoot</p>
      <p className="mt-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted">
        {t("landingKickerRail", lang)}
      </p>

      <nav className="mt-7 flex flex-col gap-0.5">
        {sections.map((s, i) => {
          const p = progress[s.id] ?? { answered: 0, visible: 0 };
          const done = p.visible > 0 && p.answered === p.visible;
          const current = s.id === currentId;
          return (
            <button
              key={s.id}
              type="button"
              aria-current={current ? "step" : undefined}
              onClick={() => onJump(s.id)}
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13.5px] transition-colors",
                current
                  ? "bg-card font-bold text-ink shadow-[0_1px_2px_rgba(60,45,25,0.07)]"
                  : done
                    ? "text-muted hover:bg-card/60"
                    : "text-muted/80 hover:bg-card/60",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-[18px] shrink-0 place-items-center rounded-full text-[10px] font-bold tabular-nums",
                  done
                    ? // accent-icon-ok: a tick, no label.
                      "bg-done text-white"
                    : current
                      ? // A numeral is text, so this fill is ink: paper on the accent is
                        // 4.01:1 and white on it is 4.35:1, both under the 4.5:1 text owes.
                        "bg-ink text-paper"
                      : "border border-line text-muted",
                )}
              >
                {done ? <Tick /> : i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate">{labels[s.id] ?? s.id}</span>
              {current && p.visible > 0 ? (
                <span className="shrink-0 text-[11.5px] font-semibold tabular-nums text-muted">
                  {p.answered}/{p.visible}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {/*
        The keyboard legend is on screen rather than hidden in a help page, because a
        shortcut nobody knows about is not a feature. It only renders where a keyboard is
        likely - this whole rail is desktop-only.
      */}
      <dl className="mt-7 flex flex-col gap-1.5 text-[11.5px] text-muted">
        <Row keys={["1", "9"]} label={t("keysChoose", lang)} joiner="-" />
        <Row keys={["Enter"]} label={t("keysNextQuestion", lang)} />
        <Row keys={["Shift", "Enter"]} label={t("keysNextSection", lang)} joiner="+" />
        <Row keys={["Up", "Down"]} label={t("keysMove", lang)} joiner="/" />
      </dl>

      <p className="mt-6 rounded-xl bg-card px-3.5 py-3 text-[12px] leading-relaxed text-muted shadow-[0_1px_2px_rgba(60,45,25,0.06)]">
        {t("saveNote", lang)}
      </p>
    </aside>
  );
}

function Row({ keys, label, joiner }: { keys: string[]; label: string; joiner?: string }) {
  return (
    <div className="flex items-center gap-2">
      <dt className="flex shrink-0 items-center gap-1">
        {keys.map((k, i) => (
          <span key={k} className="flex items-center gap-1">
            {i > 0 && joiner !== undefined ? <span aria-hidden>{joiner}</span> : null}
            <kbd className="rounded border border-line bg-card px-1.5 py-0.5 text-[10.5px] font-semibold text-ink">
              {k}
            </kbd>
          </span>
        ))}
      </dt>
      <dd className="min-w-0 leading-snug">{label}</dd>
    </div>
  );
}

function Tick() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className="size-[11px] shrink-0"
      stroke="currentColor"
      strokeWidth={3.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 10.5 8 14.5 16 6" />
    </svg>
  );
}
