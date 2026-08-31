"use client";

/**
 * Scalp diagrams for Q4 - one drawing per schema pattern option.
 *
 * Why pictures instead of text chips: "Diffuse thinning" and "Widening part line" are
 * clinician's words. A patient looking at their own scalp in a mirror recognises a
 * shape long before they recognise the term, and picking the wrong one here sends the
 * doctor down the wrong diagnostic path. So each option gets a small head drawing with
 * the affected area marked, and the exact schema string stays as the label.
 *
 * All six share one head outline and one visual language:
 *  - four are TOP-DOWN views (crown, part line, diffuse, patchy) because that is how
 *     you would see them in a mirror or a photo taken from above;
 *  - the receding hairline is a FRONT view, since that is where it reads;
 *  - shedding shows loose strands, because it is an event, not a location.
 * The affected region always uses the same warm accent, so "this is the bit we mean"
 * needs no legend. Inline SVG - no image files, no network, scales with the card.
 */

const HAIR = "var(--color-ink)";
const SCALP = "#f0e6d8";
const AFFECTED = "#c2683f";
const OUTLINE = "var(--color-muted)";

/** Shared top-down head: an egg shape with the nose notch at the top for orientation. */
function TopHead({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* scalp base */}
      <ellipse cx="50" cy="52" rx="30" ry="36" fill={SCALP} stroke={OUTLINE} strokeWidth="1.5" />
      {/* nose notch - tells the viewer which way the head faces */}
      <path d="M46 17 L50 10 L54 17" fill="none" stroke={OUTLINE} strokeWidth="1.5" strokeLinecap="round" />
      {/* ears */}
      <path d="M20 48 q-4 4 0 8" fill="none" stroke={OUTLINE} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M80 48 q4 4 0 8" fill="none" stroke={OUTLINE} strokeWidth="1.5" strokeLinecap="round" />
      {children}
    </>
  );
}

/** Full head of hair, drawn as dense short strokes. Used as the "healthy" baseline. */
function Hair({ opacity = 1, color = HAIR }: { opacity?: number; color?: string }) {
  const strokes: React.ReactNode[] = [];
  let i = 0;
  for (let ring = 0; ring < 4; ring++) {
    const rx = 26 - ring * 6.5;
    const ry = 31 - ring * 7.5;
    const count = 22 - ring * 4;
    for (let k = 0; k < count; k++) {
      const t = (k / count) * Math.PI * 2;
      const x = 50 + Math.cos(t) * rx;
      const y = 52 + Math.sin(t) * ry;
      strokes.push(
        <line
          key={i++}
          x1={x}
          y1={y}
          x2={x + Math.cos(t) * 2.6}
          y2={y + Math.sin(t) * 2.6}
          stroke={color}
          strokeWidth="1.7"
          strokeLinecap="round"
          opacity={opacity}
        />,
      );
    }
  }
  return <g>{strokes}</g>;
}

function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden focusable="false">
      {children}
    </svg>
  );
}

/**
 * Receding hairline - top view, like the other five.
 *
 * The first version drew a front-facing face with arrows. Side by side with five
 * top-down scalps it read as a different kind of picture entirely (and the arrows
 * looked like antennae), which is exactly the confusion these diagrams exist to
 * remove. Same head, same shading: the bare region is the front, with the temples
 * pushed further back than the middle - the classic M, seen from above.
 */
const RECEDED_FRONT =
  "M22 50 C28 45 33 43 38 41 C44 39 47 36 50 32 C53 36 56 39 62 41 " +
  "C67 43 72 45 78 50 C77 30 66 16 50 16 C34 16 23 30 22 50 Z";

function RecedingHairline() {
  return (
    <Svg>
      <TopHead>
        <Hair />
        <path d={RECEDED_FRONT} fill={SCALP} />
        <path d={RECEDED_FRONT} fill={AFFECTED} opacity="0.32" />
        <path
          d={RECEDED_FRONT}
          fill="none"
          stroke={AFFECTED}
          strokeWidth="1.6"
          strokeDasharray="3 2.5"
        />
      </TopHead>
    </Svg>
  );
}

/** Thinning at crown - top view, a bald disc at the back of the head. */
function ThinningAtCrown() {
  return (
    <Svg>
      <TopHead>
        <Hair />
        <ellipse cx="50" cy="68" rx="14" ry="13" fill={SCALP} />
        <ellipse cx="50" cy="68" rx="14" ry="13" fill={AFFECTED} opacity="0.32" />
        <ellipse
          cx="50"
          cy="68"
          rx="14"
          ry="13"
          fill="none"
          stroke={AFFECTED}
          strokeWidth="1.6"
          strokeDasharray="3 2.5"
        />
      </TopHead>
    </Svg>
  );
}

/** Widening part line - top view, a broad bare stripe down the middle. */
function WideningPartLine() {
  return (
    <Svg>
      <TopHead>
        <Hair />
        <path d="M50 20 q6 26 0 62 q-6 -36 0 -62 z" fill={SCALP} />
        <path d="M50 20 q7 26 0 62 q-7 -36 0 -62 z" fill={AFFECTED} opacity="0.34" />
        {/* width markers, to say "wider than before" */}
        <path d="M41 50 h-6 M59 50 h6" stroke={AFFECTED} strokeWidth="2" strokeLinecap="round" />
      </TopHead>
    </Svg>
  );
}

/** Diffuse thinning - top view, hair present everywhere but sparse. */
function DiffuseThinning() {
  return (
    <Svg>
      <TopHead>
        {/* fewer, fainter strokes across the whole scalp */}
        <Hair opacity={0.32} />
        <ellipse cx="50" cy="52" rx="30" ry="36" fill={AFFECTED} opacity="0.14" />
      </TopHead>
    </Svg>
  );
}

/** Patchy loss - top view, discrete round bald spots. */
function PatchyLoss() {
  const spots = [
    { cx: 38, cy: 38, r: 7 },
    { cx: 62, cy: 58, r: 8.5 },
    { cx: 46, cy: 72, r: 5.5 },
  ];
  return (
    <Svg>
      <TopHead>
        <Hair />
        {spots.map((s) => (
          <g key={`${s.cx}-${s.cy}`}>
            <circle cx={s.cx} cy={s.cy} r={s.r} fill={SCALP} />
            <circle cx={s.cx} cy={s.cy} r={s.r} fill={AFFECTED} opacity="0.34" />
            <circle cx={s.cx} cy={s.cy} r={s.r} fill="none" stroke={AFFECTED} strokeWidth="1.5" />
          </g>
        ))}
      </TopHead>
    </Svg>
  );
}

/** Sudden excessive shedding - an event, so: a head plus falling strands. */
function SuddenShedding() {
  return (
    <Svg>
      <TopHead>
        <Hair opacity={0.75} />
      </TopHead>
      {/* loose hairs coming away */}
      <g stroke={AFFECTED} strokeWidth="1.8" strokeLinecap="round" fill="none">
        <path d="M84 30 q7 6 3 14" />
        <path d="M90 52 q7 4 5 13" />
        <path d="M16 34 q-7 6 -4 14" />
        <path d="M10 58 q-6 5 -3 12" />
      </g>
    </Svg>
  );
}

/** Diagram lookup, keyed by the EXACT schema option string. */
export const SCALP_DIAGRAMS: Record<string, () => React.ReactNode> = {
  "Receding hairline": RecedingHairline,
  "Thinning at crown": ThinningAtCrown,
  "Widening part line": WideningPartLine,
  "Diffuse thinning": DiffuseThinning,
  "Patchy loss": PatchyLoss,
  "Sudden excessive shedding": SuddenShedding,
};

export function ScalpDiagram({ option }: { option: string }) {
  const Draw = SCALP_DIAGRAMS[option];
  return Draw ? <>{Draw()}</> : null;
}
