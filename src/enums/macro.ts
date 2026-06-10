/** Economic-event / market-impact levels. */
export const IMPACTS = ["low", "medium", "high"] as const;
export type Impact = (typeof IMPACTS)[number];

/** Issuing agencies for US macro releases. */
export const AGENCIES = ["BLS", "BEA", "Census", "Fed", "DOL", "EIA"] as const;
export type Agency = (typeof AGENCIES)[number];
