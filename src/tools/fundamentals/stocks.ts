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
      description:
        "Search the US equity universe by ticker, company name, or CIK substring, returning matching companies with their ticker, name, and CIK. Start here to resolve a name or partial symbol into the exact ticker the other stocks_* tools require. Returns structuredContent alongside the text.",
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
      description:
        "Fetch a company's reference profile — name, CIK, SIC/industry, exchange, and address — assembled from SEC EDGAR submissions metadata. Use it for company identity details; for financial statements use stocks_financials and for the filing history use stocks_filings. Returns structuredContent alongside the text.",
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
      description:
        "List a company's SEC EDGAR filings (most recent first), optionally filtered by form type and filed-date range. Paginate with cursor/limit, or set max_items to auto-collect across pages in one call. Returns filing metadata and accession numbers; pass an accession to stocks_filing for its document list, or to stocks_sections / stocks_section for its extracted text.",
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
      description:
        "Fetch one SEC filing's detail — header metadata plus its list of document files — identified by ticker and accession number. Get accession numbers from stocks_filings; for the filing's extracted narrative text use stocks_sections (all sections) or stocks_section (one section's body).",
      inputSchema: { ticker, accession },
    },
    ({ ticker, accession }) => getClient().stocks.filing(ticker, accession),
  );

  tool(
    server,
    "stocks_sections",
    {
      title: "Filing sections",
      description:
        "Fetch every extracted narrative section of one SEC filing at once — e.g. business, risk-factors, mda, legal-proceedings — each with its section code and full text, identified by ticker and accession. Use this to pull a whole filing's readable text; when you only need one section, stocks_section returns far less. Large filings may be size-capped (watch for the _truncated note). Get accession numbers from stocks_filings.",
      inputSchema: { ticker, accession },
    },
    ({ ticker, accession }) => getClient().stocks.sections(ticker, accession),
  );

  tool(
    server,
    "stocks_section",
    {
      title: "Filing section text",
      description:
        "Fetch the full text of a single narrative section from one SEC filing, selected by section code (e.g. business, risk-factors, mda). Prefer this over stocks_sections when you need just one section — it returns far less text. Discover the available section codes with stocks_sections and get accession numbers from stocks_filings.",
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
      description:
        "Compute the year-over-year diff of a company's risk factors (10-K Item 1A), highlighting added, removed, and changed language between its two most recent annual reports. Use it to see how disclosed risks evolved; for the raw text use stocks_section with section 'risk-factors'.",
      inputSchema: { ticker },
    },
    ({ ticker }) => getClient().stocks.riskFactorsDiff(ticker),
  );

  tool(
    server,
    "stocks_ratios",
    {
      title: "Financial ratios",
      description:
        "Fetch a company's fundamental financial ratios (valuation, profitability, liquidity, leverage) for the latest reporting period plus the full historical series, derived from its XBRL financials. For raw statement line items use stocks_financials or stocks_financial_concept.",
      inputSchema: { ticker },
    },
    ({ ticker }) => getClient().stocks.ratios(ticker),
  );

  tool(
    server,
    "stocks_earnings",
    {
      title: "Earnings history",
      description:
        "List a company's earnings-release history, sourced from 8-K Item 2.02 filings, most recent first. Paginate with cursor/limit, or set max_items to auto-collect across pages. For all 8-K material events (not just earnings) use stocks_events.",
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
      description:
        "Fetch a company's complete XBRL financials bundle — every reported concept across every period — from its SEC filings. This is a large payload and may be size-capped (watch for the _truncated note); for a single line item's time series use stocks_financial_concept, and for computed ratios use stocks_ratios.",
      inputSchema: { ticker },
    },
    ({ ticker }) => getClient().stocks.financials(ticker),
  );

  tool(
    server,
    "stocks_financial_concept",
    {
      title: "Financial concept series",
      description:
        "Fetch the full reported time series for one XBRL concept (e.g. Revenues, NetIncomeLoss) for a single company. Use this instead of stocks_financials when you need one line item rather than the whole statement bundle; to screen the same concept across all companies use stocks_screener.",
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
      description:
        "List a company's insider transactions from SEC Form 3/4/5 filings (officers, directors, 10% owners), most recent first. Paginate with cursor/limit (default 10, max 25), or set max_items to auto-collect across pages. For large outside stakeholders (13D/13G) use stocks_ownership.",
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
      description:
        "List a company's Schedule 13D/13G beneficial-ownership filings (holders of large stakes), most recent first. Paginate with cursor/limit, or set max_items to auto-collect across pages. For officer/director trades use stocks_insiders; for institutional 13F positions use filers_holdings.",
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
      description:
        "List a company's 8-K material-event filings, optionally filtered to a single item code (e.g. 2.02). Most recent first; paginate with cursor/limit, or set max_items to auto-collect across pages. For earnings releases specifically use stocks_earnings.",
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
      description:
        "List a company's DEF 14A proxy statements, which cover executive compensation and shareholder-vote matters, most recent first. Paginate with cursor/limit, or set max_items to auto-collect across pages.",
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
      description:
        "Screen one XBRL concept for a single fiscal period across all filers at once (e.g. Revenues for FY2023), returning each company's reported value. This is the cross-sectional counterpart to stocks_financial_concept, which returns one company's series over time. Paginate with cursor/limit.",
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
      description:
        "Fetch historical OHLCV bars for a US equity over a date/time range at a chosen interval (default 1m). Large ranges are size-capped (watch for the _truncated note) — narrow the window or paginate with cursor/limit. For a live price snapshot use last_trade or last_quote instead.",
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
