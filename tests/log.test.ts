import { describe, expect, it, vi } from "vitest";
import { addLogServer, log, removeLogServer } from "../src/log.js";

describe("log", () => {
  it("does not throw when no server is connected", () => {
    expect(() => log("info", "hello")).not.toThrow();
  });

  it("forwards a structured message to connected servers", () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const server = { sendLoggingMessage: send } as never;
    addLogServer(server);
    log("warning", "careful", { code: 1 });
    expect(send).toHaveBeenCalledWith({
      level: "warning",
      logger: "siftingio-mcp",
      data: { message: "careful", code: 1 },
    });
    removeLogServer(server);
  });

  it("stops sending after a server is removed", () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const server = { sendLoggingMessage: send } as never;
    addLogServer(server);
    removeLogServer(server);
    log("info", "after removal");
    expect(send).not.toHaveBeenCalled();
  });

  it("swallows send failures", () => {
    const server = { sendLoggingMessage: () => Promise.reject(new Error("boom")) } as never;
    addLogServer(server);
    expect(() => log("error", "x")).not.toThrow();
    removeLogServer(server);
  });
});
