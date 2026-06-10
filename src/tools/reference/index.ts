import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDexTools } from "./dex.js";
import { registerMarketsTools } from "./markets.js";

/** Market catalog/status/hours/calendar and on-chain wallet lookups. */
export function registerReferenceTools(server: McpServer): void {
  registerMarketsTools(server);
  registerDexTools(server);
}
