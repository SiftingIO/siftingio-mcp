/** OHLCV bar intervals accepted by the historical `*_bars` endpoints. */
export const BAR_INTERVALS = ["1m", "5m", "15m", "30m", "1h"] as const;
export type BarInterval = (typeof BAR_INTERVALS)[number];
