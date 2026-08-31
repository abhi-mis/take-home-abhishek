/**
 * Thin wrapper over zustand/middleware so the sessionStorage choice lives in one
 * place. sessionStorage (not localStorage) is deliberate: an intake left open on a
 * shared clinic phone should not be readable by the next patient in the queue.
 */
"use client";

import { persist as zustandPersist, createJSONStorage as zCreate } from "zustand/middleware";

export const persist = zustandPersist;

export function createJSONStorage() {
  return zCreate(() => {
    if (typeof window === "undefined") return noopStorage;
    try {
      window.sessionStorage.getItem("__probe__");
      return window.sessionStorage;
    } catch {
      return noopStorage; // private mode / storage blocked — the form still works
    }
  });
}

const noopStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};
