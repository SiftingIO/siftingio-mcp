import { afterEach, describe, expect, it, vi } from "vitest";

// A fake SiftingSocket whose listeners we can drive from tests. Shared with the
// `client.js` mock via vi.hoisted so the mock factory can reach it.
const h = vi.hoisted(() => {
  const sockets: FakeSocket[] = [];

  interface FakeSocket {
    subscribeCalls: [string, string[]][];
    unsubscribeCalls: [string, string[]][];
    closeCalled: boolean;
    on(ev: string, fn: (p: unknown) => void): () => void;
    connect(): Promise<void>;
    close(): void;
    subscribe(p: string, s: string[]): void;
    unsubscribe(p: string, s: string[]): void;
    readonly connected: boolean;
    emit(ev: string, payload: unknown): void;
  }

  function makeFakeSocket(): FakeSocket {
    const listeners: Record<string, ((p: unknown) => void)[]> = {};
    let connected = false;
    const s: FakeSocket = {
      subscribeCalls: [],
      unsubscribeCalls: [],
      closeCalled: false,
      on(ev, fn) {
        (listeners[ev] ??= []).push(fn);
        return () => {};
      },
      connect() {
        connected = true;
        return Promise.resolve();
      },
      close() {
        connected = false;
        s.closeCalled = true;
      },
      subscribe(p, sym) {
        s.subscribeCalls.push([p, sym]);
      },
      unsubscribe(p, sym) {
        s.unsubscribeCalls.push([p, sym]);
      },
      get connected() {
        return connected;
      },
      emit(ev, payload) {
        (listeners[ev] ?? []).forEach((fn) => fn(payload));
      },
    };
    sockets.push(s);
    return s;
  }

  return { sockets, makeFakeSocket };
});

vi.mock("../src/client.js", () => ({
  getClient: () => ({ ws: () => h.makeFakeSocket() }),
  MissingApiKeyError: class MissingApiKeyError extends Error {},
}));

const { wsManager } = await import("../src/ws.js");

const current = () => h.sockets[h.sockets.length - 1]!;
const tick = (s: string, p = "1") => ({ f: "tick", s, p, t: Date.now() });

afterEach(() => {
  wsManager.disconnect();
  h.sockets.length = 0;
  vi.useRealTimers();
});

describe("subscribe / unsubscribe", () => {
  it("connects and records the subscription", async () => {
    const status = await wsManager.subscribe("cex", ["BTCUSD", "ETHUSD"]);
    expect(status.connected).toBe(true);
    expect(status.subscriptions).toEqual([{ product: "cex", symbols: ["BTCUSD", "ETHUSD"] }]);
    expect(current().subscribeCalls).toEqual([["cex", ["BTCUSD", "ETHUSD"]]]);
  });

  it("removes symbols and forwards to the socket", async () => {
    await wsManager.subscribe("cex", ["BTCUSD", "ETHUSD"]);
    const status = wsManager.unsubscribe("cex", ["BTCUSD"]);
    expect(status.subscriptions).toEqual([{ product: "cex", symbols: ["ETHUSD"] }]);
    expect(current().unsubscribeCalls).toEqual([["cex", ["BTCUSD"]]]);
  });
});

describe("poll", () => {
  it("returns the most recent frames as a tail when no after_seq is given", async () => {
    await wsManager.subscribe("cex", ["BTCUSD"]);
    current().emit("tick", tick("BTCUSD", "1"));
    current().emit("tick", tick("BTCUSD", "2"));
    current().emit("tick", tick("BTCUSD", "3"));

    const r = wsManager.poll({ limit: 100 });
    expect(r.frames).toHaveLength(3);
    expect(r.frames[0]!.kind).toBe("tick");
    expect(r.frames[0]!.s).toBe("BTCUSD");
    expect(r.next_seq).toBe(3);
    expect(r.latest_seq).toBe(3);
    expect(r.has_more).toBe(false);
    expect(r.gap).toBe(false);
  });

  it("returns only frames newer than after_seq, paging with limit", async () => {
    await wsManager.subscribe("cex", ["BTCUSD"]);
    for (let i = 0; i < 5; i++) current().emit("tick", tick("BTCUSD", String(i)));

    const all = wsManager.poll({ afterSeq: 2, limit: 100 });
    expect(all.frames.map((f) => f.seq)).toEqual([3, 4, 5]);
    expect(all.next_seq).toBe(5);
    expect(all.has_more).toBe(false);

    const page = wsManager.poll({ afterSeq: 2, limit: 2 });
    expect(page.frames.map((f) => f.seq)).toEqual([3, 4]);
    expect(page.next_seq).toBe(4);
    expect(page.has_more).toBe(true);
  });

  it("filters by symbol case-insensitively", async () => {
    await wsManager.subscribe("cex", ["BTCUSD", "ETHUSD"]);
    current().emit("tick", tick("BTCUSD"));
    current().emit("tick", tick("ETHUSD"));
    current().emit("tick", tick("BTCUSD"));

    const r = wsManager.poll({ symbol: "btcusd", limit: 100 });
    expect(r.frames).toHaveLength(2);
    expect(r.frames.every((f) => f.s === "BTCUSD")).toBe(true);
  });

  it("reports dropped frames and a gap once the buffer overflows", async () => {
    await wsManager.subscribe("cex", ["BTCUSD"]);
    for (let i = 0; i < 2005; i++) current().emit("tick", tick("BTCUSD"));

    const status = wsManager.status();
    expect(status.buffered).toBe(2000);
    expect(status.dropped).toBe(5);

    const r = wsManager.poll({ afterSeq: 1, limit: 10 });
    expect(r.gap).toBe(true);
    expect(r.dropped).toBe(5);
  });
});

describe("error frames", () => {
  it("records the last server error and buffers it", async () => {
    await wsManager.subscribe("cex", ["BTCUSD"]);
    current().emit("error", { f: "error", code: "limit_exceeded", message: "too many", limit: 50 });

    const status = wsManager.status();
    expect(status.last_error).toMatchObject({ code: "limit_exceeded", message: "too many" });

    const r = wsManager.poll({ limit: 100 });
    expect(r.frames.some((f) => f.kind === "error")).toBe(true);
  });
});

describe("collect", () => {
  it("subscribes, returns matching frames, and removes a newly-added subscription", async () => {
    vi.useFakeTimers();
    const p = wsManager.collect("cex", ["BTCUSD"], 3000, 3);

    // Flush ensureStarted() so startSeq is captured before we emit.
    await vi.advanceTimersByTimeAsync(0);
    current().emit("tick", tick("BTCUSD"));
    current().emit("tick", tick("BTCUSD"));
    current().emit("tick", tick("BTCUSD"));

    // Fire the 100ms poll interval; max (3) reached -> resolves.
    await vi.advanceTimersByTimeAsync(100);
    const res = await p;

    expect(res.count).toBe(3);
    expect(res.frames.every((f) => f.s === "BTCUSD")).toBe(true);
    expect(current().unsubscribeCalls).toEqual([["cex", ["BTCUSD"]]]);
    // collect is ephemeral: it never records a persistent subscription.
    expect(wsManager.status().subscriptions).toEqual([]);
  });
});

describe("disconnect", () => {
  it("closes the socket and clears all state", async () => {
    await wsManager.subscribe("cex", ["BTCUSD"]);
    current().emit("tick", tick("BTCUSD"));
    const socket = current();

    const result = wsManager.disconnect();
    expect(result).toEqual({ ok: true });
    expect(socket.closeCalled).toBe(true);

    const status = wsManager.status();
    expect(status.connected).toBe(false);
    expect(status.buffered).toBe(0);
    expect(status.subscriptions).toEqual([]);
    expect(status.latest_seq).toBe(0);
  });
});
