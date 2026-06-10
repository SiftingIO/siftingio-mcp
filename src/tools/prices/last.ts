import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient } from "../../client.js";
import { CHAINS, VENUES } from "../../enums/index.js";
import { lastQuoteOutput, lastTradeOutput, lastTvlOutput } from "../../schemas/index.js";
import { tool } from "../../util.js";

const venue = z.string().describe(`Live-data venue: ${VENUES.join(", ")}.`);

/** Register `/v1/last/*` live snapshot tools. */
export function registerLastTools(server: McpServer): void {
  tool(
    server,
    "last_trade",
    {
      title: "Last trade",
      description:
        "Latest trade snapshot (price + size) for a symbol on a venue. Read straight from the live engine; never cached.",
      inputSchema: {
        venue,
        symbol: z.string().describe("Symbol, e.g. BTCUSD, AAPL, EURUSD."),
      },
      outputSchema: lastTradeOutput,
    },
    ({ venue, symbol }) => getClient().last.trade(venue, symbol),
  );

  tool(
    server,
    "last_quote",
    {
      title: "Last quote",
      description: "Top-of-book quote (best bid/ask with sizes) for a symbol on a venue.",
      inputSchema: {
        venue,
        symbol: z.string().describe("Symbol, e.g. BTCUSD, AAPL, EURUSD."),
      },
      outputSchema: lastQuoteOutput,
    },
    ({ venue, symbol }) => getClient().last.quote(venue, symbol),
  );

  tool(
    server,
    "last_tvl",
    {
      title: "Last DEX TVL",
      description: "Aggregated total value locked (TVL) for a DEX pair on a chain.",
      inputSchema: {
        chain: z.string().describe(`EVM chain: ${CHAINS.join(", ")}.`),
        pair: z.string().describe("Canonical pair, e.g. WETH-USDC."),
      },
      outputSchema: lastTvlOutput,
    },
    ({ chain, pair }) => getClient().last.tvl(chain, pair),
  );
}
