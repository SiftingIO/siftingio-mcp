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
        "Fetch historical OHLC bars for a 6-character FX pair (e.g. EURUSD) over a time range at a chosen interval (default 1m); volume is always 0 for OTC spot forex. Large ranges are size-capped (watch for the _truncated note) — narrow the range or paginate with cursor/limit. For the current rate use last_quote.",
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
