#!/usr/bin/env node
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { addLogServer, log } from "./log.js";
import { createMcpServer } from "./server.js";
import { wsManager } from "./ws.js";

/** Close the live WebSocket and the server on SIGINT/SIGTERM, then exit. */
function installShutdown(server: McpServer): void {
  let closing = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (closing) return;
    closing = true;
    log("info", `Received ${signal}, shutting down`);
    try {
      wsManager.disconnect();
      await server.close();
    } catch (err) {
      console.error("Error during shutdown:", err);
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

async function main(): Promise<void> {
  const server = createMcpServer();
  addLogServer(server);
  installShutdown(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stdout is reserved for the JSON-RPC protocol; log to stderr only.
  console.error("siftingio-mcp server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting siftingio-mcp:", err);
  process.exit(1);
});
