import { SiftingClient } from "@siftingio/sdk";
import type { SiftingClientOptions } from "@siftingio/sdk";

/**
 * Thrown when a tool runs but no API key is configured. Caught by the tool
 * wrapper and surfaced to the MCP client as a readable error.
 */
export class MissingApiKeyError extends Error {
  constructor() {
    super(
      "SIFTING_API_KEY is not set. Configure it in the MCP server's environment " +
        "(get a key at https://sifting.io).",
    );
    this.name = "MissingApiKeyError";
  }
}

let cached: SiftingClient | undefined;

/**
 * Lazily build a single {@link SiftingClient} from the environment and reuse it
 * across tool calls. Reads `SIFTING_API_KEY` (required) plus optional
 * `SIFTING_BASE_URL` and `SIFTING_WS_URL` overrides.
 */
export function getClient(): SiftingClient {
  if (cached) return cached;

  const apiKey = process.env.SIFTING_API_KEY;
  if (!apiKey) throw new MissingApiKeyError();

  const opts: SiftingClientOptions = { apiKey };
  const baseUrl = process.env.SIFTING_BASE_URL;
  if (baseUrl) opts.baseUrl = baseUrl;
  const wsUrl = process.env.SIFTING_WS_URL;
  if (wsUrl) opts.wsUrl = wsUrl;

  cached = new SiftingClient(opts);
  return cached;
}
