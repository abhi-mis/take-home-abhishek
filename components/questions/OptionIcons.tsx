"use client";

/**
 * Small line icons for the option lists where a picture removes real doubt.
 *
 * Not decoration. Two specific cases:
 *  - Q15 sample type: "needle or no needle" is the thing patients actually care about,
 *    and a drop vs a vial answers it before they read the gloss.
 *  - Q3 family history: father / mother / sibling / nobody scan instantly as figures,
 *    which matters on a question people answer quickly.
 *
 * Keyed by the EXACT schema option string, so an option with no icon simply renders
 * without one rather than breaking.
 */

const S = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="size-7" aria-hidden focusable="false" {...S}>
      {children}
    </svg>
  );
}

/** A saliva drop. */
const Saliva = () => (
  <Icon>
    <path d="M12 3.5c3 4 5 6.4 5 9a5 5 0 0 1-10 0c0-2.6 2-5 5-9Z" />
    <path d="M9.8 14.2a2.4 2.4 0 0 0 2 1.6" />
  </Icon>
);

/** A blood collection vial. */
const Blood = () => (
  <Icon>
    <path d="M9 3h6M10 3v13a2 2 0 0 0 4 0V3" />
    <path d="M10 11h4" />
    <path d="M12 18.5v2" />
  </Icon>
);

/** Either — two paths converging on one choice. */
const Either = () => (
  <Icon>
    <path d="M4 8h5l3 4 3-4h5" />
    <path d="M17 5.5 20 8l-3 2.5" />
    <path d="M12 12v7" />
  </Icon>
);

function Person({ tall = false }: { tall?: boolean }) {
  return (
    <>
      <circle cx="12" cy={tall ? 7 : 8} r={tall ? 3.1 : 2.8} />
      <path d={tall ? "M6.5 20v-4a5.5 5.5 0 0 1 11 0v4" : "M7 20v-3.6a5 5 0 0 1 10 0V20"} />
    </>
  );
}

const Father = () => (
  <Icon>
    <Person tall />
    {/* receding hairline hinted on the figure */}
    <path d="M9.4 5.2q2.6-1.2 5.2 0" />
  </Icon>
);

const Mother = () => (
  <Icon>
    <Person />
    <path d="M9 6.4q3-2 6 0" />
    <path d="M9.2 9.6q-1.4 2.4-1 4.4M14.8 9.6q1.4 2.4 1 4.4" />
  </Icon>
);

const Siblings = () => (
  <Icon>
    <circle cx="8.5" cy="8" r="2.4" />
    <path d="M4.4 20v-3.2a4.1 4.1 0 0 1 8.2 0V20" />
    <circle cx="16.5" cy="9.5" r="2" />
    <path d="M13.2 20v-2.6a3.4 3.4 0 0 1 6.8 0V20" />
  </Icon>
);

const Nobody = () => (
  <Icon>
    <Person />
    <path d="M4 4l16 16" />
  </Icon>
);

/** Option string -> icon. Missing entries are fine; the row just has no icon. */
export const OPTION_ICONS: Record<string, () => React.ReactNode> = {
  Saliva,
  Blood,
  Either,
  "Father had hair loss": Father,
  "Mother had hair loss": Mother,
  "Siblings with thinning or baldness": Siblings,
  "No known family history": Nobody,
};

export function OptionIcon({ option }: { option: string }) {
  const Draw = OPTION_ICONS[option];
  return Draw ? <>{Draw()}</> : null;
}

export function hasOptionIcon(option: string): boolean {
  return option in OPTION_ICONS;
}
