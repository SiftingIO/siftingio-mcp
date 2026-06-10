import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCompanyPrompts } from "./company.js";
import { registerMarketPrompts } from "./market.js";

/** Register all guided prompts (multi-tool workflows) on the server. */
export function registerAllPrompts(server: McpServer): void {
  registerCompanyPrompts(server);
  registerMarketPrompts(server);
}
