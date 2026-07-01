import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient } from "../../client.js";
import { BAR_INTERVALS } from "../../enums/index.js";
import { tool } from "../../util.js";

/** Register `/v1/hist/crypto/*` tools. */
export function registerCryptoTools(server: McpServer): void {
  tool(
    server,
    "crypto_bars",
    {
      title: "Crypto OHLCV bars",
      description:
        "Fetch historical OHLCV bars for a USD-quoted crypto symbol (e.g. BTCUSD) over a time range at a chosen interval (default 1m); volume is fractional base-asset volume. Large ranges are size-capped (watch for the _truncated note) — narrow the range or paginate with cursor/limit (max 5000/page). For the current price use last_trade.",
      inputSchema: {
        symbol: z.string().describe("USD-quoted crypto symbol, e.g. BTCUSD."),
        start: z.string().describe("Inclusive lower bound, YYYY-MM-DD or RFC3339 (UTC). Required."),
        end: z.string().optional().describe("Inclusive upper bound. Default: now."),
        interval: z.enum(BAR_INTERVALS).optional().describe("Bar interval. Default 1m."),
        cursor: z.string().optional().describe("Opaque pagination cursor."),
        limit: z.number().int().positive().max(5000).optional().describe("Page size, max 5000."),
      },
    },
    ({ symbol, ...params }) => getClient().crypto.bars(symbol, params),
  );
}
