"use client";

/**
 * One icon per section of the intake.
 *
 * Keyed by section id, which is the schema's own ("0", "A".."E"), so adding a section to
 * `lib/sections.ts` shows up here as a missing key rather than a wrong picture. A section
 * without an icon renders its number instead - the sidebar already had that path.
 *
 * They are here because a clinical form is a list of categories, and a list of categories
 * with a glyph per row is how every health record a patient has ever seen presents itself.
 * The icon is not doing work the label cannot do; it is making the label findable at a
 * glance, which on a six-item nav is the whole job.
 */

const S = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Glyph({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? "size-[17px]"} aria-hidden focusable="false" {...S}>
      {children}
    </svg>
  );
}

/** About you: a person. */
const About = (c?: string) => (
  <Glyph className={c}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" />
  </Glyph>
);

/** Your history: a clock turned back. */
const History = (c?: string) => (
  <Glyph className={c}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 7.5V12l3 2" />
  </Glyph>
);

/** Health: the clipboard a doctor holds. */
const Health = (c?: string) => (
  <Glyph className={c}>
    <path d="M8 4.5h8a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 16 20.5H8A1.5 1.5 0 0 1 6.5 19V6A1.5 1.5 0 0 1 8 4.5Z" />
    <path d="M9.5 3.5h5v2h-5z" />
    <path d="M12 10.5v4M10 12.5h4" />
  </Glyph>
);

/** Lifestyle: a leaf, for habits and daily care. */
const Lifestyle = (c?: string) => (
  <Glyph className={c}>
    <path d="M5 19c0-7 4.5-11 14-11 0 8-5 12-11 12H5Z" />
    <path d="M8.5 15.5c2-2.5 4.5-4.2 7.5-5" />
  </Glyph>
);

/** Treatments: a bottle of something taken for it. */
const Treatments = (c?: string) => (
  <Glyph className={c}>
    <path d="M9.5 3.5h5v3h-5z" />
    <path d="M8 6.5h8v12A1.5 1.5 0 0 1 14.5 20h-5A1.5 1.5 0 0 1 8 18.5v-12Z" />
    <path d="M8 12h8" />
  </Glyph>
);

/** Sample and consent: the vial, plus the tick that authorises it. */
const Consent = (c?: string) => (
  <Glyph className={c}>
    <path d="M9 3.5h6M10 3.5v9.5a2 2 0 0 0 4 0V3.5" />
    <path d="M15.5 17.5 17 19l3-3.5" />
  </Glyph>
);

const BY_SECTION: Record<string, (c?: string) => React.ReactElement> = {
  "0": About,
  A: History,
  B: Health,
  C: Lifestyle,
  D: Treatments,
  E: Consent,
};

export function SectionIcon({ id, className }: { id: string; className?: string }) {
  const Draw = BY_SECTION[id];
  return Draw === undefined ? null : Draw(className);
}

export function hasSectionIcon(id: string): boolean {
  return id in BY_SECTION;
}
