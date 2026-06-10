import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerEconomicTools } from "./economic.js";
import { registerFilersTools } from "./filers.js";
import { registerStocksTools } from "./stocks.js";

/** SEC/EDGAR company fundamentals, 13F institutional holdings, and the macro calendar. */
export function registerFundamentalsTools(server: McpServer): void {
  registerStocksTools(server);
  registerFilersTools(server);
  registerEconomicTools(server);
}
