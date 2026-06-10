/** Live-data venues for `last_*` price lookups. */
export const VENUES = ["stocks", "crypto", "forex", "dex"] as const;
export type Venue = (typeof VENUES)[number];

/** EVM chains supported by the DEX/TVL endpoints. */
export const CHAINS = ["eth", "base", "arbitrum", "bsc", "polygon"] as const;
export type Chain = (typeof CHAINS)[number];

/** Geographic groupings for market filters. */
export const REGIONS = ["north_america", "europe", "asia_pacific", "latam", "global"] as const;
export type Region = (typeof REGIONS)[number];
