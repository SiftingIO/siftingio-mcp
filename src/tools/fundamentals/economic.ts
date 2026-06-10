import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient } from "../../client.js";
import { AGENCIES, IMPACTS } from "../../enums/index.js";
import { tool } from "../../util.js";

/** Register `/v1/fnd/economic-calendar` tools. */
export function registerEconomicTools(server: McpServer): void {
  tool(
    server,
    "economic_calendar_list",
    {
      title: "Economic calendar",
      description: "Upcoming and released macro economic events (actual/previous/consensus).",
      inputSchema: {
        from: z.string().optional().describe("Lower bound, YYYY-MM-DD or RFC3339. Default: now."),
        to: z.string().optional().describe("Upper bound, YYYY-MM-DD or RFC3339. Default: from + 30 days."),
        country: z.string().optional().describe("Two-letter country code. Default: US."),
        impact: z
          .string()
          .optional()
          .describe(`Impact level: ${IMPACTS.join(", ")}.`),
        agency: z
          .string()
          .optional()
          .describe(`Issuing agency: ${AGENCIES.join(", ")}.`),
        event_id: z.string().optional().describe("Filter to a single recurring event, e.g. us_cpi."),
        limit: z.number().int().min(1).max(500).optional().describe("1-500. Default 100."),
      },
    },
    (params) => getClient().economicCalendar.list(params),
  );
}
