import type { Metadata, Viewport } from "next";
import { Hind, Newsreader, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

/**
 * Two faces, one voice.
 *
 * The app used to run entirely on the platform's own fonts, on the argument that nothing
 * downloads faster than a font already installed. That argument does not survive
 * `next/font`: these are fetched at BUILD time, self-hosted from our own origin, subset,
 * and preloaded - so there is no third-party request, no runtime dependency on Google, and
 * no unstyled flash on a slow clinic connection. The reason for the system stack was real;
 * the mechanism that made it necessary is gone.
 *
 * Plus Jakarta Sans for Latin: a tall x-height and open apertures, which is what makes
 * 13px option glosses readable on a cheap phone, without the corporate neutrality of the
 * usual UI sans. Its digits are unambiguous, which matters on a form full of ages and
 * dosages.
 *
 * Hind for Devanagari, from Indian Type Foundry, designed for exactly this - UI text at
 * small sizes in Indian languages. Jakarta has no Devanagari glyphs, so the browser falls
 * back to Hind per character and the two scripts sit at compatible weights and heights
 * inside one stack. That is why there is no longer any language-specific font rule.
 */
const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans-latin",
  display: "swap",
});

/**
 * The question voice.
 *
 * The warm direction sets questions in a serif so that a question reads as something a
 * person is asking rather than a field label. Newsreader is a text serif with a large
 * x-height, which is what keeps it legible at 21px on a phone where a display serif would
 * turn spindly.
 *
 * It has no Devanagari, so Hind carries Hindi in both roles. That is why the Devanagari
 * leading rules in globals.css and the clipping guard in the smoke test still apply after
 * this change: the Hindi question is set in a different face from the English one.
 */
const display = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-display-serif",
  display: "swap",
});

const devanagari = Hind({
  subsets: ["devanagari", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans-devanagari",
  display: "swap",
});

export const metadata: Metadata = {
  title: "GenoRoot - Hair & Scalp Intake",
  description: "A 2-minute hair and scalp intake you can finish with one thumb.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Zoom stays enabled - a 55-year-old patient may need it.
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf7f2" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1513" },
  ],
};

/**
 * Applied before first paint so a dark-mode patient never sees a white flash. It is
 * deliberately tiny and synchronous; anything async would paint first and defeat it.
 * Wrapped in try/catch because localStorage throws outright in some privacy modes.
 */
const THEME_INIT = `try{var t=localStorage.getItem("genoroot-theme");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en-IN"
      suppressHydrationWarning
      className={`${sans.variable} ${devanagari.variable} ${display.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
