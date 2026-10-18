# Quadra Play

A plain sportsbook and Taiwan Lottery's games, on the one Quadra balance
(play money). It prices and settles like a real sportsbook: the house
never loses on its own prices.

Live: https://jaypengx.github.io/Quadra-Play/

## How it works

- **Tabs:** 首頁 (balance, 場中焦點, 為你推薦, 焦點賽事, open bets, jackpots) ·
  賽事 (sport tiles, league chips, day strip, search) · 彩券 · 紀錄. 投注單
  (the slip) is a sheet over any tab.
- **What's sold:** every catalogue league with a `bet` key, games within
  14 days (`SOLD_DAYS`), priced by:
  - ESPN with DraftKings' lines (the US leagues, top soccer);
  - Kambi (NPB, KBO, CPBL, EuroLeague, NBL, K League);
  - Polymarket (win chances, championships, F1);
  - the house's own model (`lib/house.mjs`) when nobody prices a game yet.

  A bookmaker's line replaces the house's as soon as one is posted.
- **Markets** (`lib/board.mjs`, one pricing path for page and crowd):
  winners, spreads, totals, team totals, odd/even, margins, halves and
  periods, soccer's full set, players' markets (Kambi's, else the model's).
  Every market past the winner comes from two numbers: the win chance and
  the expected total (`lib/lines.mjs`).
- **F1:** winner, pole, podium/top six/top ten (Harville draws), teammates,
  team, safety car/VSC/red flag.
- **Live** (`lib/live.mjs`): modelled from the pregame lines and the live
  state, blended with Polymarket where liquid. One 5 s beat (`playLive`).
- **Pricing:** fair chances from the sources with margins removed, then one
  cut per kind of market (`BASE_CUT` in `lib/rules.mjs`), as measured
  from Taiwan Sports Lottery (two-way 1.158, three-way 1.20, live 1.16…).
  House rules (`HOUSE_RULES`): very short odds are locked or parlay-only,
  and longshots are shaded.
- **The slip:** the lottery's ticket rules: singles, parlays and systems;
  1–12 picks; NT$100–100,000; a 20 M cap; 20.4% tax over NT$5,000. A
  parlay boost of 5–20% for 3+ picks (Plus ×1.5). Free bets need picks at
  1.50 or longer.
- **Cash out** (`lib/cashout.mjs`): each open pick's fair chance less the
  house's margin, every way they can land, less 3% (Plus 2%). Never worth
  more than holding.
- **The proxy places and settles** (`Shared-Proxy/settle.js`):
  - Placing re-prices every pick and takes the stake, or says the price
    moved. Live bets wait 5 s.
  - When a game should be over, it is read once for every slip on it, and
    the wallet is paid with a notice. Play only applies the results.
  - Lottery tickets and scratch cards are bought there too.
- **Lottery** (`lib/lottery.mjs`, `scratch.mjs`): 11 draw games settled
  against the real draws, and 12 scratch cards with Taiwan Lottery's 2026
  tables.
- **紀錄:** slips (live progress), tickets, 戰績 (wins only), 統計分析 (luck
  against the cut, you against a simulated crowd of 100,000:
  `lib/sim.mjs`).
- **Opens fast:** on the saved board (3 days, `SNAPSHOT_V`); the loading
  screen lifts once today's board, the balance and the live games are in
  (2 s at most). Model fits are kept by their inputs, so a reopen prices
  in a quarter of the time.
- **Offline:** covered (`onlineOnly`); never old odds.
- **Saved:** the ledger on the Pass (`odds-study-accounts`, `gz1:`). The
  balance is the sum of entries with fixed ids, so copies merge by union.

## Decisions in force

- A plain sportsbook: prices and the slip, no analysis tags. Calm home:
  no banners, hot parlays or nags.
- Nothing talks people out of it: 戰績 shows only wins, slips show what
  they paid, the lottery shows prizes, not odds.
- 為你推薦 picks are on the team cared about, never against it.
- Only what Taiwan can watch. Tennis and UFC were removed; no edit-slip.
- Promotions and free bets stay under 30% of the take.
- Empty passive document-wide touch listeners fix iOS's double-tap. Don't
  remove them.
- Not betting advice; real lottery tickets are 18+, and overseas betting
  is illegal in Taiwan.

## Files

| File | What |
| --- | --- |
| `public/app.js`, `home.js`, `lottery-ui.js`, `stats-ui.js` | Rendering and the tabs |
| `lib/sources.mjs`, `kambi.mjs`, `offers.mjs`, `schedules.mjs` | Reading ESPN, Polymarket, Kambi, F1 |
| `lib/board.mjs`, `odds.mjs`, `rules.mjs`, `markets.mjs`, `lines.mjs` | Pricing: every option, devig, cuts and rules, side markets, totals |
| `lib/live.mjs`, `house.mjs`, `players.mjs`, `props.mjs`, `propmodel.mjs` | Live; the house's prices; players' markets |
| `lib/cashout.mjs`, `account.mjs`, `settled.mjs` | Cash out; the ledger; the Worker's placing and settling |
| `lib/lottery.mjs`, `scratch.mjs` | Draw games and scratch cards |
| `lib/history.mjs`, `profile.mjs`, `sim.mjs`, `audit.mjs` | Stats; the crowd and its audit |
| `lib/recommend.mjs`, `foryou.mjs`, `teams.mjs`, `codec.mjs`, `i18n.mjs` | Tags and 為你推薦; leagues; saves; text |

## Run and test

```bash
npm test
```

```bash
node ../Shared-Proxy/tools/preview.mjs play --live --width 375
```

Tests include real lottery prices as fixtures. A push to `main` tests and
deploys to Pages.

## If you change…

| This | Also check |
| --- | --- |
| A cut, rule or the boost | The crowd and audit, the kit's `truth.mjs` and `help.mjs`, `tools/economy.mjs` |
| A market | Its settling, cash out's price, `history.mjs` |
| F1 markets or settling | `kit/f1live.mjs`, Shared-Proxy's `f1-live.js`, Orbit Sports |
| Ledger ids | Merging, the Worker's `ENTRY_APPS` and VIP stakes |
| The league list | `kit/catalog.mjs` (shared with Orbit Sports) |
