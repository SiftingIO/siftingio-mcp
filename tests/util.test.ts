import { SiftingApiError, SiftingConnectionError } from "@siftingio/sdk";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MissingApiKeyError } from "../src/client.js";
import { errorResult, textResult, tool } from "../src/util.js";

/** A minimal McpServer stand-in that captures the registered callback + config. */
function capture() {
  let cb: ((args: unknown) => Promise<{ content: { text: string }[]; isError?: boolean }>) | undefined;
  let config: unknown;
  const server = {
    registerTool(_name: string, cfg: unknown, fn: typeof cb) {
      config = cfg;
      cb = fn;
      return {};
    },
  };
  // The real signature is stricter; the shape is all `tool` touches.
  return { server: server as never, run: (args: unknown) => cb!(args), getConfig: () => config };
}

const textOf = (r: { content: { text: string }[] }) => r.content[0]!.text;

describe("textResult / errorResult", () => {
  it("pretty-prints data as JSON text", () => {
    const r = textResult({ a: 1, b: ["x"] });
    expect(r.content[0]).toEqual({ type: "text", text: JSON.stringify({ a: 1, b: ["x"] }, null, 2) });
    expect(r.isError).toBeUndefined();
  });

  it("flags error results", () => {
    const r = errorResult("boom");
    expect(r).toEqual({ content: [{ type: "text", text: "boom" }], isError: true });
  });
});

describe("tool() wrapper", () => {
  it("passes the config through to registerTool", () => {
    const { server, getConfig } = capture();
    tool(server, "demo", { description: "d", inputSchema: { x: z.string() } }, async () => ({}));
    expect(getConfig()).toMatchObject({ description: "d" });
  });

  it("wraps a successful handler result as JSON text", async () => {
    const { server, run } = capture();
    tool(server, "demo", { description: "d", inputSchema: {} }, async () => ({ ok: true }));
    const r = await run({});
    expect(JSON.parse(textOf(r))).toEqual({ ok: true });
    expect(r.isError).toBeUndefined();
  });

  it("forwards parsed args to the handler", async () => {
    const { server, run } = capture();
    tool(server, "echo", { description: "d", inputSchema: { name: z.string() } }, async (args) => args);
    const r = await run({ name: "AAPL" });
    expect(JSON.parse(textOf(r))).toEqual({ name: "AAPL" });
  });

  it("maps SiftingApiError to a readable error result", async () => {
    const { server, run } = capture();
    tool(server, "demo", { description: "d", inputSchema: {} }, async () => {
      throw new SiftingApiError({
        status: 429,
        code: "rate_limit_exceeded",
        message: "slow down",
        requestId: "req_123",
        retryAfter: 5,
      });
    });
    const r = await run({});
    expect(r.isError).toBe(true);
    const text = textOf(r);
    expect(text).toContain("429");
    expect(text).toContain("rate_limit_exceeded");
    expect(text).toContain("slow down");
    expect(text).toContain("Retry after 5s.");
    expect(text).toContain("req_123");
  });

  it("maps SiftingConnectionError, noting timeouts", async () => {
    const { server, run } = capture();
    tool(server, "demo", { description: "d", inputSchema: {} }, async () => {
      throw new SiftingConnectionError("network down", { timeout: true });
    });
    const r = await run({});
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain("timeout");
    expect(textOf(r)).toContain("network down");
  });

  it("maps a missing API key to the configuration hint", async () => {
    const { server, run } = capture();
    tool(server, "demo", { description: "d", inputSchema: {} }, async () => {
      throw new MissingApiKeyError();
    });
    const r = await run({});
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain("SIFTING_API_KEY");
  });

  it("falls back to a generic message for unknown errors", async () => {
    const { server, run } = capture();
    tool(server, "demo", { description: "d", inputSchema: {} }, async () => {
      throw new Error("kaboom");
    });
    const r = await run({});
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain("Unexpected error: kaboom");
  });
});

describe("tool() annotations", () => {
  it("defaults to read-only, open-world hints", () => {
    const { server, getConfig } = capture();
    tool(server, "demo", { description: "d", inputSchema: {} }, async () => ({}));
    expect((getConfig() as { annotations: unknown }).annotations).toEqual({
      readOnlyHint: true,
      openWorldHint: true,
    });
  });

  it("merges caller overrides over the defaults", () => {
    const { server, getConfig } = capture();
    tool(
      server,
      "demo",
      { description: "d", inputSchema: {}, annotations: { readOnlyHint: false, destructiveHint: false } },
      async () => ({}),
    );
    expect((getConfig() as { annotations: unknown }).annotations).toEqual({
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    });
  });
});

describe("textResult size cap", () => {
  it("returns small payloads unchanged", () => {
    const r = textResult({ a: 1 });
    expect(JSON.parse(r.content[0]!.text)).toEqual({ a: 1 });
  });

  it("truncates an oversized array payload to valid JSON with a note", () => {
    const data = { data: Array.from({ length: 5000 }, (_, i) => ({ i, label: "x".repeat(40) })) };
    const text = textResult(data).content[0]!.text;
    expect(text.length).toBeLessThanOrEqual(60_000);
    const parsed = JSON.parse(text) as {
      data: unknown[];
      _truncated: { total: number; returned: number };
    };
    expect(parsed._truncated.total).toBe(5000);
    expect(parsed._truncated.returned).toBeLessThan(5000);
    expect(parsed.data).toHaveLength(parsed._truncated.returned);
  });
});
