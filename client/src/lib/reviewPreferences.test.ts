import { describe, it, expect, beforeEach } from "vitest";
import {
  getConfirmBeforeSubmit,
  setConfirmBeforeSubmit,
  CONFIRM_BEFORE_SUBMIT_KEY,
} from "./reviewPreferences";

// jsdom isn't configured for this project's vitest run, so stub a minimal
// localStorage backed by a Map.
function installLocalStorage(): Map<string, string> {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
  return store;
}

describe("reviewPreferences confirm-before-submit", () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it("defaults to true (confirm) when nothing is stored", () => {
    expect(getConfirmBeforeSubmit()).toBe(true);
  });

  it("returns false only for the literal 'false'", () => {
    localStorage.setItem(CONFIRM_BEFORE_SUBMIT_KEY, "false");
    expect(getConfirmBeforeSubmit()).toBe(false);
    localStorage.setItem(CONFIRM_BEFORE_SUBMIT_KEY, "true");
    expect(getConfirmBeforeSubmit()).toBe(true);
  });

  it("round-trips via the setter", () => {
    setConfirmBeforeSubmit(false);
    expect(getConfirmBeforeSubmit()).toBe(false);
    setConfirmBeforeSubmit(true);
    expect(getConfirmBeforeSubmit()).toBe(true);
  });

  it("defaults to true when localStorage access throws", () => {
    (globalThis as { localStorage?: Storage }).localStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    expect(getConfirmBeforeSubmit()).toBe(true);
  });
});
