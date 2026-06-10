import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/** Register market-overview prompts. */
export function registerMarketPrompts(server: McpServer): void {
  server.registerPrompt(
    "market_now",
    {
      title: "Market overview",
      description: "Summarize which major markets are open and the next high-impact US macro events.",
    },
    () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Give me a current market overview by calling:\n\n` +
              `1. \`markets_status_all\` {} — which markets are open or closed right now.\n` +
              `2. \`economic_calendar_list\` { impact: "high" } — upcoming high-impact US macro events.\n\n` +
              `Summarize which major equity venues (plus forex and crypto) are open, and list the next few ` +
              `high-impact events with their scheduled times.`,
          },
        },
      ],
    }),
  );
}
