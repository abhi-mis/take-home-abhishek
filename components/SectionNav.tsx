"use client";

/**
 * The desktop sidebar: the six steps of the form, and where the patient is in them.
 *
 * This replaces SectionRail, which was the same idea rendered as a decoration beside a
 * phone column. The difference is that the nav is now part of the layout rather than
 * something filling space next to it: it is fixed, full height, and the content pane is
 * inset to make room, which is what makes the app read as an application on a desktop
 * instead of a website with a wide margin.
 *
 * Every step is reachable. This is the patient's own form, not a wizard that owns them, and
 * someone who remembers getting a treatment date wrong should be able to go straight back to
 * Treatments rather than press Back five times. A step that cannot be completed yet is still
 * a link, because there is nothing dangerous about reading ahead.
 *
 * The current step gets a filled left edge as well as a background: colour alone is not a
 * state (WCAG 1.4.1), and on a form a patient may be filling in at a stranger's desk, the
 * shape is what carries at a glance.
 */
import { sectionLabel, t, type Lang } from "@/lib/i18n";
import type { Section } from "@/lib/sections";
import { cn } from "@/lib/utils";
import { APP_BAR_PAD } from "./AppBar";
import { SectionIcon, hasSectionIcon } from "./SectionIcons";

export interface NavProgress {
  answered: number;
  visible: number;
}

export function SectionNav({
  sections,
  currentId,
  progress,
  lang,
  onJump,
}: {
  sections: Section[];
  currentId: string;
  /** answered / visible per section id, computed by the page. */
  progress: Record<string, NavProgress>;
  lang: Lang;
  onJump: (id: string) => void;
}) {
  const labels = sectionLabel(lang);
  const totalAnswered = sections.reduce((n, s) => n + (progress[s.id]?.answered ?? 0), 0);
  const totalVisible = sections.reduce((n, s) => n + (progress[s.id]?.visible ?? 0), 0);

  return (
    <nav
      aria-label={t("railNav", lang)}
      className={cn(
        "fixed bottom-0 left-0 top-0 z-30 hidden w-[264px] flex-col border-r border-line bg-card/40 desk:flex",
        APP_BAR_PAD,
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3.5 py-6">
        <p className="mb-2 px-2.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted">
          {t("landingKickerRail", lang)}
        </p>

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
                "group relative flex items-center gap-3 rounded-xl py-2.5 pl-3.5 pr-3 text-left transition-colors",
                current ? "bg-brand-soft/70" : "hover:bg-brand-soft/30",
              )}
            >
              {/* The shape half of "you are here". */}
              {current ? (
                <span
                  aria-hidden
                  className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-brand"
                />
              ) : null}

              {/*
                Three states in one 26px box: done is a tick on the green fill, the current
                step is the numeral on ink, and everything else is the section's own icon.
                The icon is the resting state rather than the selected one on purpose - a
                patient scanning for "the one about treatments" is looking at the steps they
                have NOT reached yet.
              */}
              <span
                aria-hidden
                className={cn(
                  "grid size-[26px] shrink-0 place-items-center rounded-lg text-[11px] font-bold tabular-nums transition-colors",
                  done
                    ? // accent-icon-ok: the done fill carries a tick, never a word.
                      "rounded-full bg-done text-white"
                    : current
                      ? "rounded-full bg-ink text-paper"
                      : "text-muted group-hover:text-brand-ink",
                )}
              >
                {done ? <Tick /> : current ? i + 1 : hasSectionIcon(s.id) ? (
                  <SectionIcon id={s.id} className="size-[18px]" />
                ) : (
                  i + 1
                )}
              </span>

              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-[13.5px] leading-snug",
                  current ? "font-bold text-ink" : "font-medium text-muted",
                )}
              >
                {labels[s.id] ?? s.id}
              </span>

              {p.visible > 0 && !done ? (
                <span
                  className={cn(
                    "shrink-0 text-[11px] font-semibold tabular-nums",
                    current ? "text-brand-ink" : "text-muted/70",
                  )}
                >
                  {p.answered}/{p.visible}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="shrink-0 border-t border-line px-5 py-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
          {t("answeredOf", lang, { n: totalAnswered, total: totalVisible })}
        </p>

        {/*
          The reassurance, where a patient looks for it: next to the thing that would worry
          them. "Can I stop and come back" is the most common question a long form raises,
          and answering it in the chrome costs nothing.
        */}
        <p className="mt-3 flex gap-2 text-[11.5px] leading-relaxed text-muted">
          <ShieldIcon />
          <span className="min-w-0">{t("saveNote", lang)}</span>
        </p>

        {/*
          The keyboard legend is on screen rather than in a help page, because a shortcut
          nobody knows about is not a feature. It only renders here, where a keyboard is
          likely.
        */}
        <dl className="mt-4 flex flex-col gap-1.5 text-[11px] text-muted">
          <Row keys={["1", "9"]} label={t("keysChoose", lang)} joiner="-" />
          <Row keys={["Enter"]} label={t("keysNextQuestion", lang)} />
          <Row keys={["Shift", "Enter"]} label={t("keysNextSection", lang)} joiner="+" />
          <Row keys={["Up", "Down"]} label={t("keysMove", lang)} joiner="/" />
        </dl>
      </div>
    </nav>
  );
}

function Row({ keys, label, joiner }: { keys: string[]; label: string; joiner?: string }) {
  return (
    <div className="flex items-center gap-2">
      <dt className="flex shrink-0 items-center gap-1">
        {keys.map((k, i) => (
          <span key={k} className="flex items-center gap-1">
            {i > 0 && joiner !== undefined ? <span aria-hidden>{joiner}</span> : null}
            <kbd className="rounded border border-line bg-card px-1.5 py-0.5 text-[10px] font-semibold text-ink">
              {k}
            </kbd>
          </span>
        ))}
      </dt>
      <dd className="min-w-0 leading-snug">{label}</dd>
    </div>
  );
}

function ShieldIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="mt-px size-[13px] shrink-0"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3l7 3v5.5c0 4.3-2.9 7.7-7 9.5-4.1-1.8-7-5.2-7-9.5V6l7-3Z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function Tick() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className="size-3 shrink-0"
      stroke="currentColor"
      strokeWidth={3.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 10.5 8 14.5 16 6" />
    </svg>
  );
}
