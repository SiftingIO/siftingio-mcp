import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient } from "../../client.js";
import { REGIONS } from "../../enums/index.js";
import { tool } from "../../util.js";

const region = z
  .string()
  .optional()
  .describe(`Region filter: ${REGIONS.join(", ")}.`);
const market = z.string().describe("Market slug, e.g. nyse, us_equities, forex, crypto.");

/** Register `/v1/fnd/markets/*` tools. */
export function registerMarketsTools(server: McpServer): void {
  tool(
    server,
    "markets_list",
    {
      title: "List markets",
      description: "List all supported markets in the catalog.",
      inputSchema: { region },
    },
    (params) => getClient().markets.list(params),
  );

  tool(
    server,
    "markets_status_all",
    {
      title: "All market statuses",
      description: "Open/closed snapshot for every market.",
      inputSchema: { region },
    },
    (params) => getClient().markets.statusAll(params),
  );

  tool(
    server,
    "markets_status",
    {
      title: "Market status",
      description: "Open/closed snapshot for one market.",
      inputSchema: { market },
    },
    ({ market }) => getClient().markets.status(market),
  );

  tool(
    server,
    "markets_hours",
    {
      title: "Market hours",
      description: "Weekly trading-hours schedule for a market.",
      inputSchema: { market },
    },
    ({ market }) => getClient().markets.hours(market),
  );

  tool(
    server,
    "markets_calendar",
    {
      title: "Market calendar",
      description: "Holiday/half-day calendar for a market over a date range.",
      inputSchema: {
        market,
        from: z.string().optional().describe("Inclusive lower bound, YYYY-MM-DD. Default: today."),
        to: z
          .string()
          .optional()
          .describe("Inclusive upper bound, YYYY-MM-DD. Default: from + 90 days. Max range 730 days."),
      },
    },
    ({ market, ...params }) => getClient().markets.calendar(market, params),
  );
}
