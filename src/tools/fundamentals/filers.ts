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
      description:
        "List the latest 13F-HR reported equity positions for an institutional investment manager (a fund), identified by CIK or ticker, with share counts and market values. Paginate with cursor/limit. This is holdings held BY the filer; for a single company's insider or large-stakeholder filings use stocks_insiders / stocks_ownership.",
      inputSchema: {
        filer: z.string().describe("Institutional filer's CIK (numeric) or ticker."),
        cursor: z.string().optional().describe("Opaque cursor from a previous response's meta.next_cursor."),
        limit: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Page size (endpoint default applies if omitted)."),
      },
    },
    ({ filer, ...params }) => getClient().filers.holdings(filer, params),
  );
}
