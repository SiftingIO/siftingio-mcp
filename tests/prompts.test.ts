import { describe, expect, it } from "vitest";
import { registerAllPrompts } from "../src/prompts/index.js";

type PromptResult = { messages: { content: { text: string } }[] };
type PromptCb = (args: Record<string, string>) => PromptResult;

function capturePrompts() {
  const prompts = new Map<string, PromptCb>();
  const server = {
    registerPrompt(name: string, _config: unknown, cb: PromptCb) {
      prompts.set(name, cb);
      return {};
    },
  };
  registerAllPrompts(server as never);
  return prompts;
}

const textOf = (r: PromptResult) => r.messages[0]!.content.text;

describe("prompts", () => {
  const prompts = capturePrompts();

  it("registers the expected prompts", () => {
    expect([...prompts.keys()].sort()).toEqual(["company_snapshot", "compare_companies", "market_now"]);
  });

  it("company_snapshot references the ticker and the orchestrated tools", () => {
    const text = textOf(prompts.get("company_snapshot")!({ ticker: "AAPL" }));
    expect(text).toContain("AAPL");
    for (const t of ["stocks_profile", "stocks_ratios", "stocks_filings", "last_trade"]) {
      expect(text).toContain(t);
    }
  });

  it("market_now references market status and the economic calendar", () => {
    const text = textOf(prompts.get("market_now")!({}));
    expect(text).toContain("markets_status_all");
    expect(text).toContain("economic_calendar_list");
  });
});
