import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { ZodRawShape } from "zod";

/** Configuration accepted by the `tool` helper when registering an MCP tool. */
export interface ToolConfig<Shape extends ZodRawShape> {
  title?: string;
  description: string;
  inputSchema: Shape;
  /**
   * Optional output schema (a Zod raw shape). When set, the tool's result also
   * carries `structuredContent` (the handler's returned object) for machine-
   * readable consumption, and the runtime validates it against this schema.
   */
  outputSchema?: ZodRawShape;
  /**
   * Behaviour hints for clients. The `tool` helper defaults to
   * `{ readOnlyHint: true, openWorldHint: true }` (a read-only external fetch);
   * pass this to override — e.g. connection-mutating tools set `readOnlyHint: false`.
   */
  annotations?: ToolAnnotations;
}
