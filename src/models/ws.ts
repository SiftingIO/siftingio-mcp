import type { WsErrorFrame, WsTVL, WsTick } from "@siftingio/sdk";

/** A buffered server frame, tagged with a monotonic sequence number. */
export type BufferedFrame =
  | { seq: number; kind: "tick"; receivedAt: number; data: WsTick }
  | { seq: number; kind: "tvl"; receivedAt: number; data: WsTVL }
  | { seq: number; kind: "error"; receivedAt: number; data: WsErrorFrame };
