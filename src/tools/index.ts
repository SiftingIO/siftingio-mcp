import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerFundamentalsTools } from "./fundamentals/index.js";
import { registerPricesTools } from "./prices/index.js";
import { registerReferenceTools } from "./reference/index.js";

/** Register every SiftingIO tool group on the server. */
export function registerAllTools(server: McpServer): void {
  registerPricesTools(server);
  registerFundamentalsTools(server);
  registerReferenceTools(server);
}
