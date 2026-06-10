import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient } from "../../client.js";
import { tool } from "../../util.js";

/** Register `/v1/fnd/filers/*` 13F holdings tools. */
export function registerFilersTools(server: McpServer): void {
  tool(
    server,
    "filers_holdings",
    {
      title: "13F holdings",
      description: "Latest 13F-HR positions for an institutional filer.",
      inputSchema: {
        filer: z.string().describe("Filer CIK (numeric) or ticker."),
        cursor: z.string().optional().describe("Opaque cursor from a previous response's meta.next_cursor."),
        limit: z.number().int().positive().optional().describe("Page size."),
      },
    },
    ({ filer, ...params }) => getClient().filers.holdings(filer, params),
  );
}
