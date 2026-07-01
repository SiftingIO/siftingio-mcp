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
      description:
        "Fetch the current token holdings — balances and identified tokens — for a wallet address on an EVM chain (e.g. ethereum, base). Both chain and address are required. For a DEX pair's pooled liquidity use last_tvl.",
      inputSchema: {
        chain: z.string().describe(`EVM chain: ${CHAINS.join(", ")}.`),
        address: z.string().describe("Wallet address, e.g. 0x...."),
      },
    },
    ({ chain, address }) => getClient().dex.wallet(chain, address),
  );
}
