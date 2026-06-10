import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/** Wrap text as a single-message prompt result. */
function userText(text: string) {
  return { messages: [{ role: "user" as const, content: { type: "text" as const, text } }] };
}

/** Register company-oriented multi-tool workflow prompts. */
export function registerCompanyPrompts(server: McpServer): void {
  server.registerPrompt(
    "company_snapshot",
    {
      title: "Company snapshot",
      description:
        "Build a concise fundamental snapshot of a US-listed company by combining profile, ratios, the latest filing, and the live price.",
      argsSchema: { ticker: z.string().describe("US equity ticker, e.g. AAPL.") },
    },
    ({ ticker }) =>
      userText(
        `Build a fundamental snapshot of ${ticker} by calling these tools and synthesizing the results:\n\n` +
          `1. \`stocks_profile\` { ticker: "${ticker}" } — identity, exchange, industry (SIC).\n` +
          `2. \`stocks_ratios\` { ticker: "${ticker}" } — latest margins, returns, leverage, liquidity; note trends vs history.\n` +
          `3. \`stocks_filings\` { ticker: "${ticker}", form: "10-K,10-Q", limit: 1 } — the most recent periodic filing.\n` +
          `4. \`last_trade\` { venue: "stocks", symbol: "${ticker}" } — current price.\n\n` +
          `Present a short briefing: what the company is, how it's performing (key ratios), its latest filing, and the live price. ` +
          `Flag anything unusual. If a tool errors (e.g. unknown ticker), say so and continue with what you have.`,
      ),
  );

  server.registerPrompt(
    "compare_companies",
    {
      title: "Compare companies",
      description: "Compare several US-listed companies across key fundamental ratios.",
      argsSchema: { tickers: z.string().describe("Comma-separated tickers, e.g. AAPL,MSFT,GOOGL.") },
    },
    ({ tickers }) =>
      userText(
        `Compare these companies side by side: ${tickers}.\n\n` +
          `For each ticker, call \`stocks_profile\` and \`stocks_ratios\`. Then build a table comparing ` +
          `gross / operating / net margin, return on equity, debt-to-equity, and current ratio. ` +
          `Highlight the strongest and weakest on each metric and summarize which looks healthiest overall.`,
      ),
  );
}
