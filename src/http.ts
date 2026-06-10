#!/usr/bin/env node
import { randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { addLogServer, log, removeLogServer } from "./log.js";
import { createMcpServer } from "./server.js";
import { wsManager } from "./ws.js";

const MCP_PATH = "/mcp";
const MAX_BODY_BYTES = 4_000_000;

export interface HttpServerOptions {
  /** Return plain JSON responses instead of SSE streams (simpler clients/tests). */
  enableJsonResponse?: boolean;
  /**
   * If set, every request must send `Authorization: Bearer <token>`.
   * Defaults to `process.env.MCP_AUTH_TOKEN`. When unset, no auth is enforced
   * (fine for the loopback default; set a token before exposing via a proxy).
   */
  authToken?: string;
}

const rpcError = (code: number, message: string) => ({
  jsonrpc: "2.0" as const,
  error: { code, message },
  id: null,
});

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > MAX_BODY_BYTES) reject(new Error("Request body too large"));
    });
    req.on("end", () => {
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

const headerValue = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/** Reject cross-origin browser requests (DNS-rebinding protection for a loopback server). */
function originAllowed(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser clients (curl, MCP CLIs) send no Origin
  try {
    const host = new URL(origin).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

/** Constant-time bearer-token check. Always allows when no token is configured. */
function authorized(req: IncomingMessage, token: string | undefined): boolean {
  if (!token) return true;
  const header = headerValue(req.headers.authorization);
  const prefix = "Bearer ";
  if (!header || !header.startsWith(prefix)) return false;
  const provided = Buffer.from(header.slice(prefix.length));
  const expected = Buffer.from(token);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

/**
 * Build (but do not start) an HTTP server exposing the MCP Streamable HTTP
 * transport at POST/GET/DELETE `/mcp`. Each client gets its own session and
 * McpServer; the upstream SiftingIO connection (`wsManager`) is process-wide.
 */
export function createHttpServer(opts: HttpServerOptions = {}): Server {
  const transports = new Map<string, StreamableHTTPServerTransport>();
  const authToken = opts.authToken ?? process.env.MCP_AUTH_TOKEN;

  async function handlePost(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body: unknown;
    try {
      body = await readBody(req);
    } catch {
      sendJson(res, 400, rpcError(-32700, "Parse error: invalid JSON body"));
      return;
    }

    const sessionId = headerValue(req.headers["mcp-session-id"]);
    let transport = sessionId ? transports.get(sessionId) : undefined;

    if (!transport) {
      if (sessionId || !isInitializeRequest(body)) {
        sendJson(res, 400, rpcError(-32000, "Bad Request: no valid session ID provided"));
        return;
      }
      // New session: a fresh transport + McpServer, tracked once initialized.
      const server = createMcpServer();
      addLogServer(server);
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: opts.enableJsonResponse ?? false,
        onsessioninitialized: (id) => {
          transports.set(id, transport!);
        },
      });
      transport.onclose = () => {
        if (transport!.sessionId) transports.delete(transport!.sessionId);
        removeLogServer(server);
      };
      await server.connect(transport);
    }

    await transport.handleRequest(req, res, body);
  }

  async function handleSession(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const sessionId = headerValue(req.headers["mcp-session-id"]);
    const transport = sessionId ? transports.get(sessionId) : undefined;
    if (!transport) {
      sendJson(res, 400, rpcError(-32000, "Bad Request: invalid or missing session ID"));
      return;
    }
    await transport.handleRequest(req, res);
  }

  return createServer((req, res) => {
    void (async () => {
      try {
        if (!originAllowed(req)) {
          sendJson(res, 403, rpcError(-32000, "Forbidden: origin not allowed"));
          return;
        }
        if (!authorized(req, authToken)) {
          res.writeHead(401, { "content-type": "application/json", "www-authenticate": "Bearer" });
          res.end(JSON.stringify(rpcError(-32001, "Unauthorized")));
          return;
        }
        const path = new URL(req.url ?? "/", "http://localhost").pathname;
        if (path !== MCP_PATH) {
          sendJson(res, 404, rpcError(-32601, "Not found"));
          return;
        }
        if (req.method === "POST") await handlePost(req, res);
        else if (req.method === "GET" || req.method === "DELETE") await handleSession(req, res);
        else sendJson(res, 405, rpcError(-32000, "Method not allowed"));
      } catch (err) {
        log("error", "HTTP request failed", {
          error: err instanceof Error ? err.message : String(err),
        });
        if (!res.headersSent) sendJson(res, 500, rpcError(-32603, "Internal server error"));
      }
    })();
  });
}

/** Start the HTTP server on the configured port (loopback) with graceful shutdown. */
export function startHttpServer(): Server {
  const port = Number(process.env.PORT ?? process.env.MCP_HTTP_PORT ?? 3000);
  const httpServer = createHttpServer();

  let closing = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (closing) return;
    closing = true;
    log("info", `Received ${signal}, shutting down HTTP server`);
    wsManager.disconnect();
    httpServer.closeAllConnections();
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref(); // failsafe if close hangs
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  const auth = process.env.MCP_AUTH_TOKEN ? "enabled" : "disabled — loopback only";
  httpServer.listen(port, "127.0.0.1", () => {
    console.error(`siftingio-mcp HTTP server on http://127.0.0.1:${port}${MCP_PATH} (auth ${auth})`);
  });
  return httpServer;
}

// Run only when invoked directly (not when imported by tests).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startHttpServer();
}
