import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllPrompts } from "./prompts/index.js";
import { registerAllTools } from "./tools/index.js";

/** Build an McpServer with every tool and prompt registered and logging enabled. */
export function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: "siftingio-mcp", version: "1.0.0" },
    { capabilities: { logging: {} } },
  );
  registerAllTools(server);
  registerAllPrompts(server);
  return server;
}
