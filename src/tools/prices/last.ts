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
        "Latest trade snapshot (price and size) for a symbol on a venue, read straight from the live engine and never cached. For the best bid/ask instead use last_quote; for historical bars use stocks_bars / crypto_bars / forex_bars. Returns structuredContent alongside the text.",
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
      description:
        "Top-of-book quote — best bid and ask with their sizes — for a symbol on a venue, read live from the engine and never cached. For the last traded price use last_trade instead. Returns structuredContent alongside the text.",
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
      description:
        "Current aggregated total value locked (TVL) for a DEX trading pair on an EVM chain, read live. Provide the canonical pair (e.g. WETH-USDC); for a wallet's token balances use dex_wallet. Returns structuredContent alongside the text.",
      inputSchema: {
        chain: z.string().describe(`EVM chain: ${CHAINS.join(", ")}.`),
        pair: z.string().describe("Canonical pair, e.g. WETH-USDC."),
      },
      outputSchema: lastTvlOutput,
    },
    ({ chain, pair }) => getClient().last.tvl(chain, pair),
  );
}
