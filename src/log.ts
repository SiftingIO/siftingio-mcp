import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/** MCP log severities we emit (a subset of the protocol's syslog-style levels). */
export type LogLevel = "debug" | "info" | "notice" | "warning" | "error";

// Connected servers that should receive log notifications. Usually one (stdio),
// but the HTTP transport registers one per active session.
const servers = new Set<McpServer>();

/** Start sending logs to a connected server. */
export function addLogServer(s: McpServer): void {
  servers.add(s);
}

/** Stop sending logs to a server (e.g. when its session closes). */
export function removeLogServer(s: McpServer): void {
  servers.delete(s);
}

/**
 * Emit a structured log: mirrored to stderr (stdout is reserved for the
 * protocol) and sent to every connected client as `notifications/message`.
 * Best-effort — it never throws if a client isn't ready or doesn't log.
 */
export function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  console.error(`[${level}] ${message}${data ? ` ${JSON.stringify(data)}` : ""}`);
  for (const s of servers) {
    try {
      void s
        .sendLoggingMessage({ level, logger: "siftingio-mcp", data: { message, ...data } })
        .catch(() => {});
    } catch {
      // Client not initialized yet or logging unsupported — stderr already has it.
    }
  }
}
