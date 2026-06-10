import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// getClient() caches a module-level singleton, so reset the module between tests
// to exercise fresh construction each time.
describe("getClient", () => {
  const original = process.env.SIFTING_API_KEY;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.SIFTING_API_KEY;
    delete process.env.SIFTING_BASE_URL;
    delete process.env.SIFTING_WS_URL;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.SIFTING_API_KEY;
    else process.env.SIFTING_API_KEY = original;
  });

  it("throws MissingApiKeyError when no key is set", async () => {
    const { getClient, MissingApiKeyError } = await import("../src/client.js");
    expect(() => getClient()).toThrow(MissingApiKeyError);
  });

  it("returns a SiftingClient and caches it across calls", async () => {
    process.env.SIFTING_API_KEY = "sft_test";
    const { getClient } = await import("../src/client.js");
    const a = getClient();
    const b = getClient();
    expect(a).toBeDefined();
    expect(a).toBe(b);
  });

  it("constructs successfully with optional URL overrides", async () => {
    process.env.SIFTING_API_KEY = "sft_test";
    process.env.SIFTING_BASE_URL = "https://example.test";
    process.env.SIFTING_WS_URL = "wss://example.test/ws";
    const { getClient } = await import("../src/client.js");
    expect(() => getClient()).not.toThrow();
  });
});
