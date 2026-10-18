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
  House rules (`HOUSE_RULES`): far-out odds are locked and longshots are
  shaded. 限2關 / 限3關 is 運彩's own per game or market (`eventMinLegs`,
  「這場比賽限串」); a kit before `claude/play-rules-r7` also limited short
  prices to parlays (「賠率 x 偏低」), never shown on that kit or later.
- **The slip:** the lottery's ticket rules: singles, parlays and systems;
  1–12 picks; NT$100–100,000; a 20 M cap; 20% tax when a NT$10 bet wins over NT$5,000 (台灣運彩 §29, no stamp duty for members). A
  parlay boost of 5–20% for 3+ picks (Plus ×1.5). Free bets need picks at
  1.50 or longer.
- **Markets as 台灣運彩 sells them:** hockey on 60 minutes (不讓分 three
  ways, 勝分差 with 和局), 過關組合 from 2 games with 過1關, a postponed game
  void after 48 hours. Markets it doesn't sell are left off the board
  (`NOT_SOLD` in app.js); a slip already holding one still settles.
  With the kit's 運彩 lists (Shared-Proxy `claude/play-rules-r6`): basketball
  勝分差 in 運彩's bands (1-5 … 26+) and 勝分差（6 項）; American football
  半場讓分 and 達陣數大小, no 勝分差; hockey 正確進球數 (no 兩隊都進球 or
  總進球數); soccer no 和局退款; baseball [第1局]大小, [第1局]不讓分 and
  [1-5局]讓分 in place of 首局得分. Tennis, volleyball, badminton, table
  tennis and esports (單盤不讓分, 讓盤, 讓局, 大小, 正確比數) are named and
  settle but have no league on the board yet.
- **限2關 / 限3關:** the house's price bands (under 1.25 → 2+, under 1.12 →
  3+), or a game's own minimum where the kit reads one (`eventMinLegs`). The
  slip says which: 「賠率 1.06 偏低：只能串 3 關以上」 or 「這場比賽限串 3 關以上」.
- **Cash out** (`lib/cashout.mjs`), a Quadra extra (real 運彩 can't cancel,
  cash out or edit a bet): each open pick's fair chance less the house's
  margin, every way they can land, less 3% (Plus 2%). Never worth more than
  holding.
- **The proxy places and settles** (`Shared-Proxy/settle.js`):
  - Placing re-prices every pick and takes the stake, or says the price
    moved. Live bets wait 5 s.
  - When a game should be over, it is read once for every slip on it, and
    the wallet is paid with a notice. Play only applies the results.
  - Lottery tickets and scratch cards are bought there too.
- **Lottery** (`lib/lottery.mjs`, `scratch.mjs`): 8 draw games settled
  against the real draws, and scratch cards. As each game's 投注方式 has it
  (`lottery-labels.mjs` `gameLimits`, the kit's `limits()` when it has one):
  倍數 none on 威力彩/大樂透/今彩539, ×10 樂合彩, ×50 3星/4星/賓果; 多期 (期數)
  and 包牌 (系統組合: more numbers in a zone, its 注數 and cost shown) only on a
  kit that sells them (`claude/play-rules-r7`); a 多期 buy is a ticket a draw
  (`<id>`, `<id>-2` …), shown once while open. Sales close at 20:00
  (`closesAt`), the next 期別 and 頭獎上看/保證 come from Taiwan Lottery
  (`drawTerm`, `upcoming()`), the last draw shows 大小順序 and 開出順序, and a
  ticket whose pool prize isn't announced yet stays open (「等待派彩公告」).
  Scratch cards: the kit's `CARD_ORDER` (Taiwan Lottery's 5 since
  play-rules-r7, in their words: 幸運號碼, 大力士分數); a `retired` card is
  never sold but one bought before still scratches. Every kit-only export is
  read off the module with a fallback, so Play runs on kit `main` too, and
  the tests pass on both.
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
| `lib/slip.mjs` | The slip's one quote and rules (cost, most it pays, the cap, singles judged one slip each, as `price.js` checks them) |
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
| The slip's rules (`lib/slip.mjs`) | Shared-Proxy `price.js` `checkSlip`: the phone must say what the Worker will |
| Refunds of lost slips | `account.mjs` `LOCK_SINCE` = Shared-Proxy `eco.js` `LOCK_SINCE` |
| The league list | `kit/catalog.mjs` (shared with Orbit Sports) |
