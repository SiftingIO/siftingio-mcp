import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient } from "../../client.js";
import { CHAINS } from "../../enums/index.js";
import { tool } from "../../util.js";

/** Register `/v1/fnd/dex/*` tools. */
export function registerDexTools(server: McpServer): void {
  tool(
    server,
    "dex_wallet",
    {
      title: "DEX wallet portfolio",
      description: "Token holdings for a wallet on an EVM chain.",
      inputSchema: {
        chain: z.string().describe(`EVM chain: ${CHAINS.join(", ")}.`),
        address: z.string().describe("Wallet address, e.g. 0x...."),
      },
    },
    ({ chain, address }) => getClient().dex.wallet(chain, address),
  );
}
