import type { McpServer, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { isSiftingApiError, SiftingConnectionError } from "@siftingio/sdk";
import type { ZodRawShape } from "zod";
import { MissingApiKeyError } from "./client.js";
import type { ToolConfig } from "./interfaces/index.js";
import type { InferShape } from "./models/index.js";

/**
 * Max characters in a tool's JSON text result. Heavy endpoints (full XBRL
 * financials, screeners, OHLCV bars) can return payloads large enough to blow
 * the model's context budget, so oversized results are trimmed with a note.
 */
const MAX_RESULT_CHARS = 60_000;

/** Reserve room for the appended truncation note. */
const NOTE_HEADROOM = 512;

/**
 * Shrink the longest top-level array until the object serializes within
 * `maxChars`, attaching a `_truncated` note describing what was dropped.
 * Returns the value unchanged when there's no array to trim.
 */
function capLargestArray(data: unknown, maxChars: number): unknown {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return data;
  const obj = data as Record<string, unknown>;

  let key: string | undefined;
  let bestLen = 0;
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v) && v.length > bestLen) {
      bestLen = v.length;
      key = k;
    }
  }
  if (key === undefined) return data;

  const arr = obj[key] as unknown[];
  // Binary-search the largest prefix that fits (leaving room for the note).
  let lo = 0;
  let hi = arr.length;
  let keep = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const size = JSON.stringify({ ...obj, [key]: arr.slice(0, mid) }, null, 2).length;
    if (size <= maxChars - NOTE_HEADROOM) {
      keep = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return {
    ...obj,
    [key]: arr.slice(0, keep),
    _truncated: {
      field: key,
      returned: keep,
      total: arr.length,
      note: "Result truncated to fit the response budget. Narrow your query (smaller date range, lower limit, or paginate with cursor) to retrieve the rest.",
    },
  };
}

/** Serialize to JSON, trimming oversized results structurally then, if needed, hard. */
function serialize(data: unknown): string {
  const full = JSON.stringify(data, null, 2);
  if (full.length <= MAX_RESULT_CHARS) return full;

  const capped = JSON.stringify(capLargestArray(data, MAX_RESULT_CHARS), null, 2);
  if (capped.length <= MAX_RESULT_CHARS) return capped;

  return `${capped.slice(0, MAX_RESULT_CHARS - NOTE_HEADROOM)}\n… [truncated: result exceeded ${MAX_RESULT_CHARS} characters; narrow your query]`;
}

/** Wrap any JSON-serializable value as a successful MCP text result (size-capped). */
export function textResult(data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: serialize(data) }],
  };
}

/** Wrap a message as an MCP error result (the model sees it and can react). */
export function errorResult(message: string): CallToolResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

/**
 * Turn any thrown value into a readable MCP error result, mapping the SDK's
 * typed errors (HTTP API errors, connection failures, missing key) to clear
 * messages and letting everything else fall through to its message.
 */
function toErrorResult(err: unknown): CallToolResult {
  if (err instanceof MissingApiKeyError) return errorResult(err.message);

  if (isSiftingApiError(err)) {
    const parts = [`SiftingIO API error ${err.status} (${err.code}): ${err.message}`];
    if (err.retryAfter !== undefined) parts.push(`Retry after ${err.retryAfter}s.`);
    if (err.requestId) parts.push(`Request ID: ${err.requestId}.`);
    return errorResult(parts.join(" "));
  }

  if (err instanceof SiftingConnectionError) {
    return errorResult(`SiftingIO connection error${err.timeout ? " (timeout)" : ""}: ${err.message}`);
  }

  return errorResult(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
}

/**
 * Register a tool whose handler returns plain data. The data is JSON-stringified
 * (and size-capped) into a text result on success; any thrown error is mapped to
 * an MCP error result. Tools default to read-only, open-world annotations; pass
 * `config.annotations` to override (e.g. connection-mutating WebSocket tools).
 */
export function tool<Shape extends ZodRawShape>(
  server: McpServer,
  name: string,
  config: ToolConfig<Shape>,
  handler: (args: InferShape<Shape>) => Promise<unknown>,
): void {
  const cb = (async (args: InferShape<Shape>): Promise<CallToolResult> => {
    try {
      const data = await handler(args);
      const result = textResult(data);
      // When an output schema is declared, also surface the structured object.
      if (config.outputSchema) result.structuredContent = data as { [key: string]: unknown };
      return result;
    } catch (err) {
      return toErrorResult(err);
    }
  }) as unknown as ToolCallback<Shape>;

  server.registerTool(
    name,
    { ...config, annotations: { readOnlyHint: true, openWorldHint: true, ...config.annotations } },
    cb,
  );
}
