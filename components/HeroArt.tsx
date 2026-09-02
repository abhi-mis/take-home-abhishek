"use client";

/**
 * The landing illustration.
 *
 * Drawn as inline SVG rather than shipped as an image, for four reasons that all matter here:
 * it costs no network request on a clinic's phone signal, it stays sharp on any density of
 * screen, it inherits the palette so it is correct in both themes without a second asset, and
 * there is no licence to get wrong on a medical product.
 *
 * What it shows is a cross-section of skin with three follicles in it - the thing the form is
 * actually about. That choice is deliberate over the alternatives a health landing page
 * usually reaches for: a photograph of a model with good hair sets up the wrong expectation
 * for an intake form, and a stock doctor-with-clipboard says nothing a patient did not already
 * know. An anatomical drawing says "this is a clinical instrument", which is what this is.
 *
 * `aria-hidden`, and no text inside it. It illustrates the heading beside it rather than
 * adding anything, so a screen reader should skip it: an alt description of a decorative
 * cross-section would be noise between the title and the button.
 */
export function HeroArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 260"
      className={className}
      aria-hidden
      focusable="false"
      role="presentation"
    >
      {/* The ground: a soft disc so the drawing sits on something in either theme. */}
      <circle cx="160" cy="130" r="118" className="fill-brand-soft/70" />

      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={2.1}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-brand-ink"
      >
        {/* The skin surface, and the dermis line beneath it. */}
        <path d="M44 168h232" />
        <path d="M44 186h232" strokeDasharray="5 7" opacity={0.5} />

        {/* Follicle one: healthy, anchored deep, in growth. */}
        <path d="M96 168v34a13 13 0 0 0 26 0v-34" />
        <path d="M109 168V86" />
        <path d="M109 96c0-13 8-23 21-26-1 14-9 24-21 26Z" />
        <path d="M109 116c0-11-7-20-18-22 1 12 7 20 18 22Z" />

        {/* Follicle two: the one being asked about - shorter, thinner, still there. */}
        <path d="M148 168v28a12 12 0 0 0 24 0v-28" />
        <path d="M160 168v-52" opacity={0.85} />
        <path d="M160 128c0-10 6-18 16-20-1 11-7 18-16 20Z" opacity={0.85} />

        {/* Follicle three: resting, ready to regrow. */}
        <path d="M200 168v30a12 12 0 0 0 24 0v-30" />
        <path d="M212 168v-30" strokeDasharray="4 6" />
        <circle cx="212" cy="132" r="4.5" />
      </g>

      {/*
        The reading marks: this is a form that produces a record, so the drawing carries the
        two things a record has - a measurement and a tick.
      */}
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={2.1}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-done"
      >
        <circle cx="248" cy="70" r="18" />
        <path d="M240 70l6 6 11-13" />
      </g>
      <g className="text-muted" fill="none" stroke="currentColor" strokeWidth={1.6} opacity={0.7}>
        <path d="M62 60h44M62 74h30M62 88h38" strokeLinecap="round" />
      </g>
    </svg>
  );
}
