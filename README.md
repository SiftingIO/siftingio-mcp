# siftingio-mcp

This is a [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server
that puts the [SiftingIO market-data SDK](https://github.com/SiftingIO/sdk-typescript)
(`@siftingio/sdk`) in reach of your AI assistant. Once it's running, the model can
pull live prices, dig through SEC/EDGAR fundamentals, fetch OHLCV bars, look up 13F
holdings, check market status, and scan the macro economic calendar — all as tools.

## Setup

```bash
npm install
npm run build
```

You'll need an API key, which you can grab at <https://sifting.io>:

```bash
export SIFTING_API_KEY=sft_...
```

If you need to point at a different backend, `SIFTING_BASE_URL` and `SIFTING_WS_URL`
are there to override the defaults.

Working locally? Copy `.env.example` to `.env` instead — `npm run dev` and `npm start`
pick it up automatically (Node does the loading via `--env-file-if-exists`). When you
wire this into an actual MCP client, though, pass the key through the server's `env`
block rather than a file (there's an example further down).

## Run

Here's the toolbox:

- `npm run build` — compile TypeScript into `dist/`.
- `npm start` — run the compiled server (`node dist/index.js`) over **stdio**.
- `npm run start:http` — run it over **Streamable HTTP** (`node dist/http.js`).
- `npm run dev` / `npm run dev:http` — run straight from source with `tsx`, no build step.
- `npm test` — run the [vitest](https://vitest.dev) suite (add `npm run test:watch` to keep it running).
- `npm run lint` / `npm run format` — ESLint (typescript-eslint) and Prettier.
- `npm run typecheck` — `tsc --noEmit`.

On every push and PR, CI (`.github/workflows/ci.yml`) walks through the same gauntlet:
format check → lint → typecheck → build → test.

One thing worth knowing: the server talks JSON-RPC over **stdio**, so stdout belongs
entirely to the protocol. Anything diagnostic goes to stderr to stay out of the way.

### Inspect interactively

Want to poke at it by hand? The MCP inspector is the easiest way:

```bash
SIFTING_API_KEY=sft_... npx @modelcontextprotocol/inspector node dist/index.js
```

### HTTP (Streamable HTTP) transport

If you're running this somewhere remote or hosted, use MCP's Streamable HTTP transport
instead of stdio:

```bash
SIFTING_API_KEY=sft_... PORT=3000 npm run start:http
# → MCP endpoint at http://127.0.0.1:3000/mcp  (POST messages, GET SSE, DELETE session)
```

It's **stateful**: every client gets its own session (tracked by the `mcp-session-id`
header) and its own `McpServer`, while the upstream SiftingIO connection is shared
across the whole process. As a safety measure it only binds to **loopback** and turns
away non-local browser `Origin`s — that's the DNS-rebinding protection. Set the port
with `PORT` (or `MCP_HTTP_PORT`); it defaults to `3000`.

If you want auth, set **`MCP_AUTH_TOKEN`** and the server will demand
`Authorization: Bearer <token>` on every request (anything missing or wrong gets a
401). Pair that with a reverse proxy handling TLS and the token, and you can safely
expose the server past localhost:

```bash
MCP_AUTH_TOKEN=s3cret SIFTING_API_KEY=sft_... npm run start:http
```

Then just point any HTTP-capable MCP client at `http://127.0.0.1:3000/mcp`:

```bash
claude mcp add --transport http siftingio http://127.0.0.1:3000/mcp
```

## Use with an MCP client

Drop this into your client config — Claude Desktop's `claude_desktop_config.json`,
say, or use `claude mcp add` if you're on Claude Code:

```json
{
  "mcpServers": {
    "siftingio": {
      "command": "node",
      "args": ["/absolute/path/to/siftingio-mcp/dist/index.js"],
      "env": { "SIFTING_API_KEY": "sft_..." }
    }
  }
}
```

## Tools (36)

| Namespace | Tools |
| --- | --- |
| Live (snapshot) | `last_trade`, `last_quote`, `last_tvl` |
| Stocks | `stocks_search`, `stocks_profile`, `stocks_filings`, `stocks_filing`, `stocks_sections`, `stocks_section`, `stocks_risk_factors_diff`, `stocks_ratios`, `stocks_earnings`, `stocks_financials`, `stocks_financial_concept`, `stocks_insiders`, `stocks_ownership`, `stocks_events`, `stocks_compensation`, `stocks_screener`, `stocks_bars` |
| Crypto / Forex | `crypto_bars`, `forex_bars` |
| DEX | `dex_wallet` |
| Markets | `markets_list`, `markets_status_all`, `markets_status`, `markets_hours`, `markets_calendar` |
| Filers | `filers_holdings` |
| Macro | `economic_calendar_list` |
| Live (stream) | `ws_subscribe`, `ws_unsubscribe`, `ws_poll`, `ws_collect`, `ws_status`, `ws_disconnect` |

A few patterns are worth calling out:

Paginated tools take `cursor`/`limit` and hand back a `meta.next_cursor` to fetch the
next page. The `stocks_*` list tools — `stocks_filings`, `stocks_earnings`,
`stocks_insiders`, `stocks_ownership`, `stocks_events`, `stocks_compensation` — also
understand **`max_items`**: set it and they'll auto-paginate, gathering up to that many
items across pages in a single call.

The high-traffic tools (`last_trade`, `last_quote`, `last_tvl`, `stocks_profile`,
`stocks_search`) come with an **output schema** and return `structuredContent`
alongside the human-readable text, so clients can read them machine-side too.

Every tool also carries MCP **annotations**. The data tools are `readOnlyHint: true`
(and `openWorldHint: true`, since they reach out to the external API), while the
WebSocket tools that change connection state are `readOnlyHint: false`,
`destructiveHint: false`.

Results are **size-capped** at roughly 60k characters (see `MAX_RESULT_CHARS` in
`src/util.ts`). When a heavy endpoint — full XBRL financials, screeners, OHLCV bars —
returns more than that, the server trims its largest array and tacks on a `_truncated`
note explaining how to narrow the query.

### Live WebSocket streaming

Streaming is the awkward case: it doesn't fit neatly into a single request/response.
So the server holds **one persistent WebSocket** open, buffers the frames as they
arrive, and the tools just read from that buffer. Channels (the `product` field) are
`cex` (crypto), `dex` (DEX trades), `fx` (forex), `us` (US stocks), and `tvl` (DEX
pool TVL).

There are two ways to work with it:

- **Subscribe + poll**, for ongoing streams: call `ws_subscribe` once, then keep
  calling `ws_poll`. The first poll gives you a recent tail; feed the returned
  `next_seq` back in as `after_seq` and you'll only get newer frames from then on.
  `ws_status` shows you the connection and what's subscribed, and `ws_disconnect`
  tears the whole thing down.
- **Collect**, for a quick one-shot: `ws_collect` subscribes, waits up to `duration_ms`
  (or until it's seen `max` frames), returns what it caught, and cleans up any
  subscription it had to create. Perfect for "grab me a few seconds of BTCUSD."

The connection reconnects on its own and replays your subscriptions when it does. The
buffer is a rolling window, so the oldest frames eventually fall off — and when they
do, you'll hear about it through `dropped`/`gap`.

## Prompts

These are guided, multi-tool workflows your client can surface as slash-commands:

- **`company_snapshot`** `(ticker)` — pulls `stocks_profile`, `stocks_ratios`, the
  latest `stocks_filings`, and `last_trade` together into one briefing.
- **`compare_companies`** `(tickers)` — lines up several tickers side by side across
  the key ratios.
- **`market_now`** — what's open and closed right now, plus the high-impact macro
  events coming up.

## Logging & shutdown

The server advertises the MCP **logging** capability and pushes structured
`notifications/message` to the client whenever something happens with the connection
(WebSocket open/close/reconnect/error) or on shutdown — and it mirrors all of that to
stderr too.

When it catches a **SIGINT or SIGTERM**, it closes the live WebSocket and shuts the
server down cleanly before exiting.
