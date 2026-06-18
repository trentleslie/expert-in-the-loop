import { describe, it, expect, beforeEach } from "vitest";
import {
  getArchivedSectionCollapsed,
  setArchivedSectionCollapsed,
  ARCHIVED_COLLAPSED_KEY,
} from "./adminPreferences";

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

describe("adminPreferences archived-section collapsed", () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it("defaults to collapsed (true) when nothing is stored", () => {
    expect(getArchivedSectionCollapsed()).toBe(true);
  });

  it("returns false (expanded) only for the literal 'false'", () => {
    localStorage.setItem(ARCHIVED_COLLAPSED_KEY, "false");
    expect(getArchivedSectionCollapsed()).toBe(false);
    localStorage.setItem(ARCHIVED_COLLAPSED_KEY, "true");
    expect(getArchivedSectionCollapsed()).toBe(true);
  });

  it("round-trips via the setter", () => {
    setArchivedSectionCollapsed(false);
    expect(getArchivedSectionCollapsed()).toBe(false);
    setArchivedSectionCollapsed(true);
    expect(getArchivedSectionCollapsed()).toBe(true);
  });

  it("defaults to collapsed when localStorage access throws", () => {
    (globalThis as { localStorage?: Storage }).localStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    expect(getArchivedSectionCollapsed()).toBe(true);
  });
});
