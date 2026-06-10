import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { WS_PRODUCTS } from "../../enums/index.js";
import { tool } from "../../util.js";
import { wsManager } from "../../ws.js";

const product = z
  .enum(WS_PRODUCTS)
  .describe("Channel: cex (crypto), dex (DEX trades), fx (forex), us (US stocks), tvl (DEX pool TVL).");
const symbols = z.array(z.string()).min(1).describe("Symbols to (un)subscribe, e.g. ['BTCUSD','ETHUSD'].");

/**
 * Register live WebSocket tools. The server keeps one persistent connection and
 * buffers frames; tools subscribe, poll the buffer, or collect a short window.
 */
export function registerWsTools(server: McpServer): void {
  tool(
    server,
    "ws_subscribe",
    {
      title: "Subscribe to live stream",
      description:
        "Open (if needed) the live WebSocket and subscribe to symbols on a channel. Incoming ticks are buffered; read them with ws_poll. Returns current connection status.",
      inputSchema: { product, symbols },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    ({ product, symbols }) => wsManager.subscribe(product, symbols),
  );

  tool(
    server,
    "ws_unsubscribe",
    {
      title: "Unsubscribe from live stream",
      description: "Stop receiving symbols on a channel. Returns current connection status.",
      inputSchema: { product, symbols },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ product, symbols }) => wsManager.unsubscribe(product, symbols),
  );

  tool(
    server,
    "ws_poll",
    {
      title: "Poll buffered ticks",
      description:
        "Read buffered live frames. Omit after_seq to get the most recent frames (a tail snapshot); then pass the returned next_seq on subsequent calls to get only newer frames. Non-blocking.",
      inputSchema: {
        after_seq: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe("Return only frames with seq greater than this (from a prior poll's next_seq)."),
        symbol: z.string().optional().describe("Filter to a single symbol, e.g. BTCUSD."),
        limit: z.number().int().min(1).max(500).optional().describe("Max frames to return. Default 100."),
      },
      // Reads the local buffer only — no new external call.
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ after_seq, symbol, limit }) =>
      wsManager.poll({ afterSeq: after_seq, symbol, limit: limit ?? 100 }),
  );

  tool(
    server,
    "ws_collect",
    {
      title: "Collect a live window",
      description:
        "One-shot: subscribe, wait up to duration_ms collecting matching ticks (or until max reached), then return them. Subscriptions this call newly creates are removed afterwards. Use this for a quick 'sample N seconds of live data' request.",
      inputSchema: {
        product,
        symbols,
        duration_ms: z
          .number()
          .int()
          .min(100)
          .max(15000)
          .optional()
          .describe("How long to collect, in ms. Default 3000, max 15000."),
        max: z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .describe("Stop early after this many frames. Default 50."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    ({ product, symbols, duration_ms, max }) =>
      wsManager.collect(product, symbols, duration_ms ?? 3000, max ?? 50),
  );

  tool(
    server,
    "ws_status",
    {
      title: "Live stream status",
      description: "Report connection state, active subscriptions, buffered frame count, and the last error.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => wsManager.status(),
  );

  tool(
    server,
    "ws_disconnect",
    {
      title: "Disconnect live stream",
      description: "Close the WebSocket, clear all subscriptions and the buffer.",
      inputSchema: {},
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => wsManager.disconnect(),
  );
}
