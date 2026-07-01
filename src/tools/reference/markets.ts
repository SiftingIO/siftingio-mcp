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
      description:
        "List every market in the catalog — exchanges and asset classes such as nyse, us_equities, forex, crypto — optionally filtered by region. Use it to discover the market slug the other markets_* tools expect.",
      inputSchema: { region },
    },
    (params) => getClient().markets.list(params),
  );

  tool(
    server,
    "markets_status_all",
    {
      title: "All market statuses",
      description:
        "Return the current open/closed status for every market at once, optionally filtered by region. Use markets_status when you already know the single market slug you care about.",
      inputSchema: { region },
    },
    (params) => getClient().markets.statusAll(params),
  );

  tool(
    server,
    "markets_status",
    {
      title: "Market status",
      description:
        "Return the current open/closed status for a single market by slug (e.g. nyse). For a snapshot across all markets use markets_status_all; for the recurring weekly schedule use markets_hours.",
      inputSchema: { market },
    },
    ({ market }) => getClient().markets.status(market),
  );

  tool(
    server,
    "markets_hours",
    {
      title: "Market hours",
      description:
        "Return the regular weekly trading-hours schedule (open/close times per weekday, with time zone) for a market by slug. This is the recurring schedule, not today's state — use markets_status for whether it's open right now, and markets_calendar for holidays and half-days.",
      inputSchema: { market },
    },
    ({ market }) => getClient().markets.hours(market),
  );

  tool(
    server,
    "markets_calendar",
    {
      title: "Market calendar",
      description:
        "List the holidays and half-day (early-close) sessions for a market over a date range (defaults to the next ~90 days, max 730). Use markets_hours for the normal weekly schedule and markets_status for the live open/closed state.",
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
