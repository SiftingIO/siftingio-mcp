import type { z, ZodRawShape } from "zod";

/** The parsed-args object a Zod raw shape produces. */
export type InferShape<Shape extends ZodRawShape> = { [K in keyof Shape]: z.infer<Shape[K]> };
