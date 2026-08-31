import type { Metadata, Viewport } from "next";
import "./globals.css";

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
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
