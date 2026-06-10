import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ filings: vi.fn() }));

vi.mock("../src/client.js", () => ({
  getClient: () => ({ stocks: { filings: h.filings } }),
  MissingApiKeyError: class MissingApiKeyError extends Error {},
}));

const { registerStocksTools } = await import("../src/tools/fundamentals/stocks.js");

type Cb = (args: unknown) => Promise<{ content: { text: string }[] }>;

function captureServer() {
  const tools = new Map<string, Cb>();
  const server = {
    registerTool(name: string, _config: unknown, cb: Cb) {
      tools.set(name, cb);
      return {};
    },
  };
  return { server: server as never, tools };
}

function filingsTool(): Cb {
  const { server, tools } = captureServer();
  registerStocksTools(server);
  return tools.get("stocks_filings")!;
}

const parse = (r: { content: { text: string }[] }) => JSON.parse(r.content[0]!.text);

describe("stocks_filings pagination", () => {
  beforeEach(() => h.filings.mockReset());

  it("auto-paginates across pages when max_items is set", async () => {
    h.filings
      .mockResolvedValueOnce({
        data: [{ accession: "1" }, { accession: "2" }],
        meta: { next_cursor: "c2", as_of: "x" },
      })
      .mockResolvedValueOnce({ data: [{ accession: "3" }, { accession: "4" }], meta: { as_of: "x" } });

    const out = parse(await filingsTool()({ ticker: "AAPL", max_items: 3 }));

    expect(out).toMatchObject({ count: 3, auto_paginated: true });
    expect(out.data).toHaveLength(3);
    expect(h.filings).toHaveBeenCalledTimes(2);
    expect(h.filings.mock.calls[1]![1]).toMatchObject({ cursor: "c2" });
  });

  it("returns a single page (no auto-pagination) when max_items is omitted", async () => {
    h.filings.mockResolvedValueOnce({ data: [{ accession: "1" }], meta: { as_of: "x" } });

    const out = parse(await filingsTool()({ ticker: "AAPL" }));

    expect(out).toMatchObject({ data: [{ accession: "1" }] });
    expect(out.auto_paginated).toBeUndefined();
    expect(h.filings).toHaveBeenCalledTimes(1);
  });
});
