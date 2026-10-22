# Longshot's Worker

Two Cloudflare Workers, deployed by `.github/workflows/worker.yml` on a push to main that touches `worker/` or `public/kit/`:

- **longshot** (`wrangler.toml`, `worker.js`), at https://longshot.pengzjay.workers.dev
- **longshot-gemini** (`wrangler.gemini.toml`, `gemini.js`): the Gemini relay, pinned to Taiwan. It has no address of its own; longshot reaches it through the service binding `GEMINI`.

Kit modules are imported as `#kit/<file>`, which package.json maps to `public/kit/`.

## Routes

| Path | Module | What it does |
|---|---|---|
| `/pass` | pass.js | The Longshot Pass: create, login, refresh, GET/PATCH/DELETE (`qt`), signout-all, rotate. One session serves app `odds` (Play) and app `slip` (Slips). |
| `/play` | settle.js, price.js, lotto.js | Slips placed, settled and acknowledged; the lottery and scratch cards. A localhost page may `check` a slip without a pass. |
| `/kambi` | kambi.js | Kambi matches watched for settling. Needs a session. |
| `/slip-scan` | slip.js | A 台灣運彩 ticket photo read by Gemini through the relay. Answers 503 when the relay or its key is missing. |
| `/sports-proxy` | sports.js | The data proxy: only the hosts and trims Play and Slips read. Needs a session, or a localhost page. |
| `/data/<path>` | data.js | What the Worker builds, from R2 (`play/board.json`). |

## Jobs

The jobs run on one Durable Object, `Clock` (clock.js), with a minute alarm. Any request wakes it, and so do the two crons, which are its backup. Each minute runs once, and every job is safe to run twice.

| Job | When |
|---|---|
| Settling | Odd minutes |
| Lottery | Minutes where m % 4 = 3 |
| Kambi | Even minutes |
| Board | Minutes where m % 10 = 8 |

## Money

Only the Worker adds money:

- NT$200,000 at sign-up (entry `pass:start`).
- NT$10,000 every Monday, Taiwan time (entry `pass:pay:<Monday>`), from the first Monday after sign-up.

## Storage and secrets

- **D1 `longshot-store`** (binding `STORE`): passes, wallets, the apps' data, day counts and the token secret.
- **R2 `longshot-data`** (binding `DATA`): the board and the proxy's kept copies.
- **Token secret:** no secret is needed. The Worker makes its own token secret once and keeps it in D1 (token.js). `TOKEN_SECRET`, if set, takes its place.
- **GEMINI_API_KEY:** goes only on longshot-gemini.

## Local

```sh
npm test                                            # tests/worker-*.test.mjs among them
cd worker && npx --yes wrangler@4 deploy --dry-run --outdir /tmp/ls-build
cd worker && npx --yes wrangler@4 deploy --dry-run --config wrangler.gemini.toml --outdir /tmp/ls-build
```
