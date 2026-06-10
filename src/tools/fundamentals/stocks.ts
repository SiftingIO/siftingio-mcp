import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { collectAll } from "@siftingio/sdk";
import type { ListResponse } from "@siftingio/sdk";
import { z } from "zod";
import { getClient } from "../../client.js";
import { BAR_INTERVALS } from "../../enums/index.js";
import { companyProfileOutput, stockSearchOutput } from "../../schemas/index.js";
import { tool } from "../../util.js";

const ticker = z.string().describe("US equity ticker, e.g. AAPL.");
const accession = z.string().describe("SEC accession number, e.g. 0000320193-24-000123.");
const cursor = z.string().optional().describe("Opaque cursor from a previous response's meta.next_cursor.");
const limit = z
  .number()
  .int()
  .positive()
  .optional()
  .describe("Page size (endpoint-specific default and max).");
const maxItems = z
  .number()
  .int()
  .min(1)
  .max(1000)
  .optional()
  .describe("If set, auto-paginate across pages and return up to this many items (ignores cursor).");

/** Collect up to `max` items across pages, returning a flat envelope. */
async function paginate<T>(
  fetchPage: (cursor?: string) => Promise<ListResponse<T>>,
  max: number,
): Promise<{ data: T[]; count: number; auto_paginated: true }> {
  const data = await collectAll(fetchPage, max);
  return { data, count: data.length, auto_paginated: true };
}

/** Register `/v1/fnd/stocks/*` and `/v1/hist/stocks/*` tools. */
export function registerStocksTools(server: McpServer): void {
  tool(
    server,
    "stocks_search",
    {
      title: "Search stocks",
      description: "Ticker/company lookup by ticker, name, or CIK substring.",
      inputSchema: {
        q: z.string().describe("Search string: ticker, company name, or CIK substring."),
        limit: z.number().int().positive().max(100).optional().describe("Max results, default 25, max 100."),
      },
      outputSchema: stockSearchOutput,
    },
    (params) => getClient().stocks.search(params),
  );

  tool(
    server,
    "stocks_profile",
    {
      title: "Company profile",
      description: "Company profile assembled from SEC submissions metadata.",
      inputSchema: { ticker },
      outputSchema: companyProfileOutput,
    },
    ({ ticker }) => getClient().stocks.profile(ticker),
  );

  tool(
    server,
    "stocks_filings",
    {
      title: "List filings",
      description: "Paginated SEC filings list for a company.",
      inputSchema: {
        ticker,
        form: z.string().optional().describe('Comma-separated exact form types, e.g. "10-K,10-Q".'),
        from: z.string().optional().describe("Lower bound on filed_at, YYYY-MM-DD."),
        to: z.string().optional().describe("Upper bound on filed_at, YYYY-MM-DD."),
        cursor,
        limit,
        max_items: maxItems,
      },
    },
    ({ ticker, max_items, cursor, ...params }) =>
      max_items === undefined
        ? getClient().stocks.filings(ticker, { ...params, cursor })
        : paginate((c) => getClient().stocks.filings(ticker, { ...params, cursor: c }), max_items),
  );

  tool(
    server,
    "stocks_filing",
    {
      title: "Filing detail",
      description: "A single filing's detail, including its document file list.",
      inputSchema: { ticker, accession },
    },
    ({ ticker, accession }) => getClient().stocks.filing(ticker, accession),
  );

  tool(
    server,
    "stocks_sections",
    {
      title: "Filing sections",
      description: "All extracted text sections of a filing.",
      inputSchema: { ticker, accession },
    },
    ({ ticker, accession }) => getClient().stocks.sections(ticker, accession),
  );

  tool(
    server,
    "stocks_section",
    {
      title: "Filing section text",
      description: "One extracted section's full text.",
      inputSchema: {
        ticker,
        accession,
        section: z
          .string()
          .describe("Section code: business, risk-factors, legal-proceedings, mda, market-risk, ..."),
      },
    },
    ({ ticker, accession, section }) => getClient().stocks.section(ticker, accession, section),
  );

  tool(
    server,
    "stocks_risk_factors_diff",
    {
      title: "Risk-factors diff",
      description: "Year-over-year risk-factor (Item 1A) diff between two 10-Ks.",
      inputSchema: { ticker },
    },
    ({ ticker }) => getClient().stocks.riskFactorsDiff(ticker),
  );

  tool(
    server,
    "stocks_ratios",
    {
      title: "Financial ratios",
      description: "Fundamental ratios (latest period plus full history).",
      inputSchema: { ticker },
    },
    ({ ticker }) => getClient().stocks.ratios(ticker),
  );

  tool(
    server,
    "stocks_earnings",
    {
      title: "Earnings history",
      description: "Earnings-release history (8-K item 2.02).",
      inputSchema: { ticker, cursor, limit, max_items: maxItems },
    },
    ({ ticker, max_items, cursor, ...params }) =>
      max_items === undefined
        ? getClient().stocks.earnings(ticker, { ...params, cursor })
        : paginate((c) => getClient().stocks.earnings(ticker, { ...params, cursor: c }), max_items),
  );

  tool(
    server,
    "stocks_financials",
    {
      title: "XBRL financials",
      description: "Full XBRL financials bundle for a company (all concepts and periods).",
      inputSchema: { ticker },
    },
    ({ ticker }) => getClient().stocks.financials(ticker),
  );

  tool(
    server,
    "stocks_financial_concept",
    {
      title: "Financial concept series",
      description: "One XBRL concept's full reported time series for a company.",
      inputSchema: {
        ticker,
        concept: z.string().describe("XBRL concept name, e.g. Revenues, NetIncomeLoss."),
        taxonomy: z.string().optional().describe("Concept namespace. Default us-gaap."),
      },
    },
    ({ ticker, concept, taxonomy }) => getClient().stocks.financialConcept(ticker, concept, { taxonomy }),
  );

  tool(
    server,
    "stocks_insiders",
    {
      title: "Insider transactions",
      description: "Form 3/4/5 insider transactions (limit default 10, max 25).",
      inputSchema: { ticker, cursor, limit, max_items: maxItems },
    },
    ({ ticker, max_items, cursor, ...params }) =>
      max_items === undefined
        ? getClient().stocks.insiders(ticker, { ...params, cursor })
        : paginate((c) => getClient().stocks.insiders(ticker, { ...params, cursor: c }), max_items),
  );

  tool(
    server,
    "stocks_ownership",
    {
      title: "Ownership filings",
      description: "Schedule 13D/13G beneficial-ownership filings.",
      inputSchema: { ticker, cursor, limit, max_items: maxItems },
    },
    ({ ticker, max_items, cursor, ...params }) =>
      max_items === undefined
        ? getClient().stocks.ownership(ticker, { ...params, cursor })
        : paginate((c) => getClient().stocks.ownership(ticker, { ...params, cursor: c }), max_items),
  );

  tool(
    server,
    "stocks_events",
    {
      title: "Material events",
      description: "8-K material events, optionally filtered by item code.",
      inputSchema: {
        ticker,
        item: z.string().optional().describe('Filter by 8-K item code, e.g. "2.02".'),
        cursor,
        limit,
        max_items: maxItems,
      },
    },
    ({ ticker, max_items, cursor, ...params }) =>
      max_items === undefined
        ? getClient().stocks.events(ticker, { ...params, cursor })
        : paginate((c) => getClient().stocks.events(ticker, { ...params, cursor: c }), max_items),
  );

  tool(
    server,
    "stocks_compensation",
    {
      title: "Compensation filings",
      description: "DEF 14A proxy/compensation filings.",
      inputSchema: { ticker, cursor, limit, max_items: maxItems },
    },
    ({ ticker, max_items, cursor, ...params }) =>
      max_items === undefined
        ? getClient().stocks.compensation(ticker, { ...params, cursor })
        : paginate((c) => getClient().stocks.compensation(ticker, { ...params, cursor: c }), max_items),
  );

  tool(
    server,
    "stocks_screener",
    {
      title: "Fundamentals screener",
      description: "Cross-sectional screener: one concept/period across all filers.",
      inputSchema: {
        concept: z.string().describe("XBRL concept name, e.g. Revenues."),
        period: z.string().describe("Fiscal period, e.g. FY2023 or 2023Q4 (as documented)."),
        taxonomy: z.string().optional().describe("Concept namespace. Default us-gaap."),
        unit: z.string().optional().describe("Unit filter. Default USD."),
        cursor,
        limit,
      },
    },
    ({ concept, period, ...params }) => getClient().stocks.screener(concept, period, params),
  );

  tool(
    server,
    "stocks_bars",
    {
      title: "Stock OHLCV bars",
      description: "Historical OHLCV bars for a US equity.",
      inputSchema: {
        ticker,
        start: z
          .string()
          .optional()
          .describe("Inclusive lower bound: YYYY-MM-DD (NYSE local) or RFC3339 (UTC)."),
        end: z.string().optional().describe("Inclusive upper bound. Default: now."),
        interval: z.enum(BAR_INTERVALS).optional().describe("Bar interval. Default 1m."),
        cursor,
        limit,
      },
    },
    ({ ticker, ...params }) => getClient().stocks.bars(ticker, params),
  );
}
