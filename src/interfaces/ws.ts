import type { WsProduct } from "@siftingio/sdk";
import type { FrameKind } from "../enums/index.js";

/** A buffered frame flattened for tool callers (its `data` fields merged in). */
export interface OutFrame {
  seq: number;
  kind: FrameKind;
  received_at: number;
  [key: string]: unknown;
}

/** Result of a buffer read via `ws_poll`. */
export interface PollResult {
  frames: OutFrame[];
  /** Pass back as `after_seq` on the next poll to get only newer frames. */
  next_seq: number;
  /** True when more matching frames remain past `limit` (advance with `next_seq`). */
  has_more: boolean;
  /** Highest sequence number currently buffered. */
  latest_seq: number;
  /** True when frames after `after_seq` were dropped from the buffer before this poll. */
  gap: boolean;
  /** Total frames dropped from the buffer over the connection's lifetime. */
  dropped: number;
}

/** Snapshot of the live connection reported by `ws_status`. */
export interface WsStatus {
  connected: boolean;
  reconnect_attempts: number;
  subscriptions: { product: WsProduct; symbols: string[] }[];
  buffered: number;
  latest_seq: number;
  dropped: number;
  last_error?: { code: string; message: string; at: number };
  last_close?: string;
}
