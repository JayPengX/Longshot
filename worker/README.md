# Longshot's Worker

One Cloudflare Worker, **longshot** (`wrangler.toml`, `worker.js`), deployed by `.github/workflows/worker.yml` on a push to main that touches `worker/` or `public/kit/`. It runs in Taiwan (`[placement] region = "gcp:asia-east1"`), because Gemini refuses Hong Kong.

Kit modules are imported as `#kit/<file>`, which package.json maps to `public/kit/`.

## Routes

| Path | Module | What it does |
|---|---|---|
| `/pass` | pass.js | The Longshot Pass: create, login, refresh, GET/PATCH/DELETE (`qt`), signout-all, rotate, device codes (pair-create/redeem), passkeys (passkey.js: passkey-begin/login/add-begin/add/remove). One session serves app `odds` (Play) and app `slip` (Slips). |
| `/play` | settle.js, price.js, lotto.js | Slips placed, settled and acknowledged; the lottery and scratch cards. A localhost page may `check` a slip without a pass. |
| `/kambi` | kambi.js | Kambi matches watched for settling. Needs a session. |
| `/slip-scan` | slip.js | A 台灣運彩 ticket photo read by Gemini. Answers 503 MISSING_API_KEY without the key. |
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

- NT$30,000 at sign-up (entry `pass:start`).
- NT$10,000 on the 1st of each month, Taiwan time (entry `pass:pay:<YYYY-MM>`), from the month after sign-up; missed months are paid on the next visit.
- Nothing else: no relief or top-up when a balance hits zero.

## Storage and secrets

- **D1 `longshot-store`** (binding `STORE`): passes, wallets, the apps' data, day counts and the token secret.
- **R2 `longshot-data`** (binding `DATA`): the board and the proxy's kept copies.
- **Token secret:** no secret is needed. The Worker makes its own token secret once and keeps it in D1 (token.js). `TOKEN_SECRET`, if set, takes its place.
- **GEMINI_API_KEY:** a secret on longshot, for /slip-scan.

## Local

```sh
npm test                                            # tests/worker-*.test.mjs among them
cd worker && npx --yes wrangler@4 deploy --dry-run --outdir /tmp/ls-build
```
