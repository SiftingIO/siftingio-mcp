import { z } from "zod";

/**
 * Output schemas (as Zod raw shapes) for the high-traffic tools. They mirror the
 * SDK's response types — required where the SDK guarantees a field, optional
 * otherwise — so the MCP runtime can validate `structuredContent` without
 * rejecting valid responses. Unknown extra fields are tolerated (and preserved).
 *
 * Prices/sizes are decimal strings (exact, no float rounding); `t` is epoch ms.
 */

/** `last_trade` → LastTrade. */
export const lastTradeOutput = {
  s: z.string().describe("Symbol, normalized to the venue's canonical form."),
  p: z.string().describe("Last trade price."),
  P: z.string().describe("Last trade size."),
  t: z.number().describe("Timestamp, Unix epoch milliseconds."),
};

/** `last_quote` → LastQuote. */
export const lastQuoteOutput = {
  b: z.string().describe("Bid price."),
  B: z.string().describe("Bid size."),
  a: z.string().describe("Ask price."),
  A: z.string().describe("Ask size."),
  t: z.number().describe("Timestamp, Unix epoch milliseconds."),
};

/** `last_tvl` → LastTVL. */
export const lastTvlOutput = {
  chain: z.string().describe("Canonical lowercase chain."),
  pair: z.string().describe("Canonical uppercase pair, e.g. WETH-USDC."),
  usd: z.string().describe("Total value locked, USD."),
  r0: z.string().describe("Reserve of token0."),
  r1: z.string().describe("Reserve of token1."),
  n: z.number().describe("Number of pools aggregated."),
  v: z.number().describe("Version/volume counter."),
  t: z.number().describe("Timestamp, Unix epoch milliseconds."),
};

/** `stocks_profile` → CompanyProfile. */
export const companyProfileOutput = {
  ticker: z.string(),
  cik: z.string(),
  name: z.string(),
  exchanges: z.array(z.string()).optional(),
  other_tickers: z.array(z.string()).optional(),
  sic_code: z.string().optional().describe("4-digit SIC industry code."),
  sic_description: z.string().optional(),
  entity_type: z.string().optional(),
  fiscal_year_end: z.string().optional().describe("Fiscal year end, MMDD (e.g. 0930)."),
};

/** `stocks_search` → ListResponse<StockSearchResult>. */
export const stockSearchOutput = {
  data: z.array(
    z.object({
      ticker: z.string(),
      name: z.string(),
      cik: z.string().describe("10-digit zero-padded CIK."),
      exchange: z.string().optional(),
    }),
  ),
  meta: z.object({ as_of: z.string() }),
};
