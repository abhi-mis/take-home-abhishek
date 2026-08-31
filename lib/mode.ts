"use client";

/**
 * Which of the two ways the patient last used - chat, or the form.
 *
 * Deliberately NOT in the Zustand store. The store's persisted shape is what the wizard
 * renders and what the Zod validator reads on the way out; the last screen someone
 * happened to be on is a UI convenience with no place in the doctor's output. One less
 * field there is one less thing that can break the part of the app that must not break.
 *
 * Every access is wrapped: sessionStorage throws outright in some private modes, and a
 * forgotten preference is not worth a crashed landing page.
 */
export type Mode = "chat" | "form";

const KEY = "genoroot-mode";

export function rememberMode(mode: Mode): void {
  try {
    sessionStorage.setItem(KEY, mode);
  } catch {
    /* private mode - the choice simply is not remembered */
  }
}

export function lastMode(): Mode {
  try {
    return sessionStorage.getItem(KEY) === "chat" ? "chat" : "form";
  } catch {
    return "form";
  }
}
