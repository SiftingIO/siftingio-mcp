import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient } from "../../client.js";
import { BAR_INTERVALS } from "../../enums/index.js";
import { tool } from "../../util.js";

/** Register `/v1/hist/forex/*` tools. */
export function registerForexTools(server: McpServer): void {
  tool(
    server,
    "forex_bars",
    {
      title: "Forex OHLC bars",
      description:
        "Historical OHLC bars for a 6-char FX pair (e.g. EURUSD). Volume is always 0 for OTC spot forex.",
      inputSchema: {
        pair: z.string().describe("6-character FX pair, e.g. EURUSD."),
        start: z.string().describe("Inclusive lower bound, YYYY-MM-DD or RFC3339 (UTC). Required."),
        end: z.string().optional().describe("Inclusive upper bound. Default: now."),
        interval: z.enum(BAR_INTERVALS).optional().describe("Bar interval. Default 1m."),
        cursor: z.string().optional().describe("Opaque pagination cursor."),
        limit: z.number().int().positive().optional().describe("Page size."),
      },
    },
    ({ pair, ...params }) => getClient().forex.bars(pair, params),
  );
}
