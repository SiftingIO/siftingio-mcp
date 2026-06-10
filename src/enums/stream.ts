/** Subscribable live WebSocket channels. */
export const WS_PRODUCTS = ["cex", "dex", "fx", "us", "tvl"] as const;
export type WsProductName = (typeof WS_PRODUCTS)[number];

/** Kinds of buffered WebSocket frame. */
export const FRAME_KINDS = ["tick", "tvl", "error"] as const;
export type FrameKind = (typeof FRAME_KINDS)[number];
