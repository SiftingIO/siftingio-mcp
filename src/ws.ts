import type { SiftingSocket, WsProduct } from "@siftingio/sdk";
import { getClient } from "./client.js";
import type { OutFrame, PollResult, WsStatus } from "./interfaces/index.js";
import { log } from "./log.js";
import type { BufferedFrame } from "./models/index.js";

/** Max frames retained in the rolling buffer. Oldest are dropped past this. */
const MAX_BUFFER = 2000;

function frameSymbol(f: BufferedFrame): string | undefined {
  return f.kind === "error" ? undefined : f.data.s;
}

function toOut(f: BufferedFrame): OutFrame {
  return { seq: f.seq, kind: f.kind, received_at: f.receivedAt, ...f.data };
}

/**
 * Single long-lived SiftingIO WebSocket connection shared across tool calls.
 * It auto-reconnects (the SDK replays subscriptions), buffers incoming frames
 * in a rolling window, and hands them to tools by sequence-number watermark.
 */
class WsManager {
  private socket?: SiftingSocket;
  private startPromise?: Promise<void>;
  private connected = false;
  private buffer: BufferedFrame[] = [];
  private seq = 0;
  private dropped = 0;
  private reconnectAttempts = 0;
  private readonly subscriptions = new Map<WsProduct, Set<string>>();
  private lastError?: { code: string; message: string; at: number };
  private lastClose?: string;

  private push(frame: BufferedFrame): void {
    this.buffer.push(frame);
    if (this.buffer.length > MAX_BUFFER) {
      const removed = this.buffer.splice(0, this.buffer.length - MAX_BUFFER);
      this.dropped += removed.length;
    }
  }

  private createSocket(): SiftingSocket {
    // Throws MissingApiKeyError when no key is configured (surfaced to caller).
    const socket = getClient().ws();
    socket.on("open", () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      log("info", "WebSocket connected");
    });
    socket.on("close", (e) => {
      this.connected = false;
      this.lastClose = `${e.code}${e.reason ? ` ${e.reason}` : ""}`;
      log("warning", "WebSocket closed", { code: e.code, reason: e.reason });
    });
    socket.on("reconnect", (e) => {
      this.reconnectAttempts = e.attempt;
      log("info", "WebSocket reconnecting", { attempt: e.attempt });
    });
    socket.on("socketError", (e) => {
      this.lastError = { code: "socket_error", message: String(e), at: Date.now() };
      log("error", "WebSocket transport error", { error: String(e) });
    });
    socket.on("error", (f) => {
      this.lastError = { code: f.code, message: f.message, at: Date.now() };
      this.push({ seq: ++this.seq, kind: "error", receivedAt: Date.now(), data: f });
      log("error", "WebSocket server error frame", { code: f.code, message: f.message });
    });
    socket.on("tick", (t) => {
      this.push({ seq: ++this.seq, kind: "tick", receivedAt: Date.now(), data: t });
    });
    socket.on("tvl", (t) => {
      this.push({ seq: ++this.seq, kind: "tvl", receivedAt: Date.now(), data: t });
    });
    return socket;
  }

  /** Open the connection once; subsequent calls reuse it (autoReconnect handles drops). */
  private async ensureStarted(): Promise<SiftingSocket> {
    if (this.socket) {
      if (this.startPromise) await this.startPromise;
      return this.socket;
    }
    const socket = this.createSocket();
    this.socket = socket;
    this.startPromise = socket.connect().then(() => {
      this.connected = socket.connected;
    });
    await this.startPromise;
    return socket;
  }

  private recordSubscribe(product: WsProduct, symbols: string[]): void {
    const set = this.subscriptions.get(product) ?? new Set<string>();
    for (const s of symbols) set.add(s);
    this.subscriptions.set(product, set);
  }

  async subscribe(product: WsProduct, symbols: string[]): Promise<WsStatus> {
    const socket = await this.ensureStarted();
    socket.subscribe(product, symbols);
    this.recordSubscribe(product, symbols);
    return this.status();
  }

  unsubscribe(product: WsProduct, symbols: string[]): WsStatus {
    this.socket?.unsubscribe(product, symbols);
    const set = this.subscriptions.get(product);
    if (set) {
      for (const s of symbols) set.delete(s);
      if (set.size === 0) this.subscriptions.delete(product);
    }
    return this.status();
  }

  /**
   * Read buffered frames. With `afterSeq`, returns frames newer than it
   * (forward streaming). Without it, returns the most recent `limit` frames
   * (a tail snapshot); poll again with the returned `next_seq` for only newer.
   */
  poll(opts: { afterSeq?: number; symbol?: string; limit: number }): PollResult {
    const sym = opts.symbol?.toUpperCase();
    let candidates = this.buffer;
    if (sym) candidates = candidates.filter((f) => frameSymbol(f)?.toUpperCase() === sym);

    const oldestSeq = this.buffer[0]?.seq;
    let frames: BufferedFrame[];
    let hasMore = false;
    let gap = false;

    if (opts.afterSeq !== undefined) {
      gap = oldestSeq !== undefined && opts.afterSeq + 1 < oldestSeq;
      const newer = candidates.filter((f) => f.seq > opts.afterSeq!);
      frames = newer.slice(0, opts.limit);
      hasMore = newer.length > frames.length;
    } else {
      frames = candidates.slice(-opts.limit);
    }

    const last = frames[frames.length - 1];
    return {
      frames: frames.map(toOut),
      next_seq: last ? last.seq : (opts.afterSeq ?? this.seq),
      has_more: hasMore,
      latest_seq: this.seq,
      gap,
      dropped: this.dropped,
    };
  }

  /**
   * One-shot: subscribe, collect matching tick/tvl frames for up to `durationMs`
   * (or until `max` reached), then return them. Subscriptions this call newly
   * created are removed afterwards so the collect is ephemeral.
   */
  async collect(
    product: WsProduct,
    symbols: string[],
    durationMs: number,
    max: number,
  ): Promise<{ count: number; frames: OutFrame[]; truncated: boolean }> {
    const socket = await this.ensureStarted();
    const existing = this.subscriptions.get(product) ?? new Set<string>();
    const newlyAdded = symbols.filter((s) => !existing.has(s));
    const wanted = new Set(symbols.map((s) => s.toUpperCase()));
    const startSeq = this.seq;

    socket.subscribe(product, symbols);

    const collected = await new Promise<BufferedFrame[]>((resolve) => {
      const deadline = Date.now() + durationMs;
      const timer = setInterval(() => {
        const got = this.buffer.filter((f) => {
          if (f.seq <= startSeq) return false;
          const s = frameSymbol(f);
          return s !== undefined && wanted.has(s.toUpperCase());
        });
        if (got.length >= max || Date.now() >= deadline) {
          clearInterval(timer);
          resolve(got);
        }
      }, 100);
    });

    if (newlyAdded.length) socket.unsubscribe(product, newlyAdded);

    const frames = collected.slice(0, max).map(toOut);
    return { count: frames.length, frames, truncated: collected.length > max };
  }

  status(): WsStatus {
    const status: WsStatus = {
      connected: this.connected,
      reconnect_attempts: this.reconnectAttempts,
      subscriptions: [...this.subscriptions].map(([product, symbols]) => ({
        product,
        symbols: [...symbols],
      })),
      buffered: this.buffer.length,
      latest_seq: this.seq,
      dropped: this.dropped,
    };
    if (this.lastError) status.last_error = this.lastError;
    if (this.lastClose) status.last_close = this.lastClose;
    return status;
  }

  disconnect(): { ok: true } {
    this.socket?.close();
    this.socket = undefined;
    this.startPromise = undefined;
    this.connected = false;
    this.buffer = [];
    this.subscriptions.clear();
    this.seq = 0;
    this.dropped = 0;
    this.reconnectAttempts = 0;
    return { ok: true };
  }
}

/** Process-wide singleton; tools share one connection. */
export const wsManager = new WsManager();
