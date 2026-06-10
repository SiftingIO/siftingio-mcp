import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  companyProfileOutput,
  lastQuoteOutput,
  lastTradeOutput,
  lastTvlOutput,
  stockSearchOutput,
} from "../src/schemas/index.js";

const cases: [string, z.ZodRawShape, unknown][] = [
  ["lastTradeOutput", lastTradeOutput, { s: "BTCUSD", p: "100.5", P: "0.1", t: 1_700_000_000_000 }],
  ["lastQuoteOutput", lastQuoteOutput, { b: "1", B: "2", a: "3", A: "4", t: 1 }],
  [
    "lastTvlOutput",
    lastTvlOutput,
    { chain: "eth", pair: "WETH-USDC", usd: "1", r0: "1", r1: "2", n: 3, v: 4, t: 5 },
  ],
  [
    "companyProfileOutput",
    companyProfileOutput,
    { ticker: "AAPL", cik: "0000320193", name: "Apple Inc.", exchanges: ["NASDAQ"], sic_code: "3571" },
  ],
  [
    "stockSearchOutput",
    stockSearchOutput,
    { data: [{ ticker: "AAPL", name: "Apple Inc.", cik: "0000320193" }], meta: { as_of: "2024-01-01" } },
  ],
];

describe("output schemas", () => {
  for (const [name, shape, sample] of cases) {
    it(`${name} accepts a representative payload`, () => {
      expect(z.object(shape).safeParse(sample).success).toBe(true);
    });
  }

  it("tolerates unknown extra fields (so real responses are never rejected)", () => {
    const r = z.object(lastTradeOutput).safeParse({ s: "X", p: "1", P: "1", t: 1, extra: "ignored" });
    expect(r.success).toBe(true);
  });
});
