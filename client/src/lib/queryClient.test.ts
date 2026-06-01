import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getQueryFn } from "./queryClient";

// Regression coverage for the #5 config-editor clobber: the default query
// function builds the fetch URL from queryKey[0] only. A single-string key must
// resolve to the detail endpoint; a multi-segment key silently drops the extra
// segments (the footgun) and must warn in dev.

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("getQueryFn URL construction", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ ok: true })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("fetches a single-string key as the URL (detail endpoint)", async () => {
    const fn = getQueryFn<{ ok: boolean }>({ on401: "returnNull" });
    await fn({ queryKey: ["/api/campaigns/abc-123"] } as any);
    expect(fetch).toHaveBeenCalledWith(
      "/api/campaigns/abc-123",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("drops extra key segments and warns (documents the footgun)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fn = getQueryFn<{ ok: boolean }>({ on401: "returnNull" });
    await fn({ queryKey: ["/api/campaigns", "abc-123"] } as any);
    // Only queryKey[0] is fetched — the id is silently dropped. This is exactly
    // why the config dialog must use a single-string key.
    expect(fetch).toHaveBeenCalledWith(
      "/api/campaigns",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(warn).toHaveBeenCalledOnce();
  });

  it("returns null on 401 when on401=returnNull", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 401 })));
    const fn = getQueryFn<unknown>({ on401: "returnNull" });
    const result = await fn({ queryKey: ["/api/me"] } as any);
    expect(result).toBeNull();
  });

  it("throws on a non-ok response when on401=throw", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    const fn = getQueryFn<unknown>({ on401: "throw" });
    await expect(fn({ queryKey: ["/api/me"] } as any)).rejects.toThrow(/500/);
  });
});
