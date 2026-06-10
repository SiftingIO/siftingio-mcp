import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHttpServer } from "../src/http.js";

let server: Server;
let url: string;

const HEADERS = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
};

beforeAll(async () => {
  server = createHttpServer({ enableJsonResponse: true });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  url = `http://127.0.0.1:${port}/mcp`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

function post(body: unknown, sessionId?: string) {
  return fetch(url, {
    method: "POST",
    headers: sessionId ? { ...HEADERS, "mcp-session-id": sessionId } : HEADERS,
    body: JSON.stringify(body),
  });
}

const initialize = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "0" } },
};

describe("Streamable HTTP transport", () => {
  it("completes the handshake and lists tools over HTTP", async () => {
    const initRes = await post(initialize);
    expect(initRes.status).toBe(200);
    const sessionId = initRes.headers.get("mcp-session-id");
    expect(sessionId).toBeTruthy();
    const initBody = (await initRes.json()) as { result: { serverInfo: { name: string } } };
    expect(initBody.result.serverInfo.name).toBe("siftingio-mcp");

    await post({ jsonrpc: "2.0", method: "notifications/initialized" }, sessionId!);

    const listRes = await post({ jsonrpc: "2.0", id: 2, method: "tools/list" }, sessionId!);
    const listBody = (await listRes.json()) as { result: { tools: unknown[] } };
    expect(listBody.result.tools).toHaveLength(36);
  });

  it("rejects a non-initialize request without a session", async () => {
    const res = await post({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(res.status).toBe(400);
  });

  it("404s on unknown paths", async () => {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/nope`, {
      method: "POST",
      headers: HEADERS,
      body: "{}",
    });
    expect(res.status).toBe(404);
  });
});

describe("Streamable HTTP transport with auth", () => {
  let authServer: Server;
  let authUrl: string;

  beforeAll(async () => {
    authServer = createHttpServer({ enableJsonResponse: true, authToken: "s3cret" });
    await new Promise<void>((resolve) => authServer.listen(0, "127.0.0.1", resolve));
    const { port } = authServer.address() as AddressInfo;
    authUrl = `http://127.0.0.1:${port}/mcp`;
  });

  afterAll(() => new Promise<void>((resolve) => authServer.close(() => resolve())));

  it("rejects requests without a valid bearer token", async () => {
    const res = await fetch(authUrl, { method: "POST", headers: HEADERS, body: JSON.stringify(initialize) });
    expect(res.status).toBe(401);
  });

  it("accepts requests with the correct bearer token", async () => {
    const res = await fetch(authUrl, {
      method: "POST",
      headers: { ...HEADERS, authorization: "Bearer s3cret" },
      body: JSON.stringify(initialize),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("mcp-session-id")).toBeTruthy();
  });
});
