import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCryptoTools } from "./crypto.js";
import { registerForexTools } from "./forex.js";
import { registerLastTools } from "./last.js";
import { registerWsTools } from "./ws.js";

/** Live snapshots, historical OHLCV bars, and the live WebSocket stream. */
export function registerPricesTools(server: McpServer): void {
  registerLastTools(server);
  registerCryptoTools(server);
  registerForexTools(server);
  registerWsTools(server);
}
