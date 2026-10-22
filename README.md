# Quadra Play

A plain sportsbook and Taiwan Lottery's games, on the one Orbit balance
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
  - the house's own model (kit `play-house.mjs`) when nobody prices a game yet.

  A bookmaker's line replaces the house's as soon as one is posted.
- **Markets** (`lib/board.mjs`, one pricing path for the page and the Worker):
  winners, spreads, totals, team totals, margins, halves and
  periods, soccer's full set, players' markets (Kambi's, else the model's).
  Every market past the winner comes from two numbers: the win chance and
  the expected total (kit `play-lines.mjs`).
- **F1:** the race winner (冠軍) alone, as 台灣運彩 sells it (pole, podium,
  top six/ten, teammates, team and the safety-car markets were removed
  2026-10-21; an old slip holding one still settles).
- **冠軍 boards** list only who can still win (kit `play-alive.mjs`): ESPN's
  'e' (out of the play-offs), a lost play-off series (MLB's list), a soccer
  club that can't catch the leader on points, an F1 driver or team that
  can't with every race left won.
- **Live** (`lib/live.mjs`): modelled from the pregame lines and the live
  state, blended with Polymarket where liquid. One 5 s beat (`playLive`).
- **Pricing:** fair chances from the sources with margins removed, then one
  cut per kind of market (`BASE_CUT` in `lib/rules.mjs`), as measured
  from Taiwan Sports Lottery (two-way 1.158, three-way 1.20, live 1.16…).
  House rules (`HOUSE_RULES`): far-out odds are locked and longshots are
  shaded. 限2關 / 限3關 is 運彩's own per game or market (`eventMinLegs`,
  「這場比賽限串」), else the house's price bands (「賠率 x 偏低」).
- **The slip:** the lottery's ticket rules: singles, parlays and systems;
  1–12 picks; NT$100–100,000; a 20 M cap; 20% of a slip's whole payout
  over NT$5,000 withheld (the owner's rule, stricter than 運彩's per-注 one;
  no stamp duty for members). No parlay boost and no free bets: a 運彩
  ticket pays its odds and is paid for in full.
- **Markets as 台灣運彩 sells them:** hockey on 60 minutes (不讓分 three
  ways, 勝分差 with 和局), 過關組合 from 2 games with 過1關, a postponed game
  void after 48 hours. Markets it doesn't sell are not made by the kit; a
  slip already holding one still settles. The kit's 運彩 lists: basketball
  勝分差 in 運彩's bands (1-5 … 26+) and 勝分差（6 項）; American football
  半場讓分 and 達陣數大小, no 勝分差; hockey 正確進球數 (no 兩隊都進球 or
  總進球數); soccer no 和局退款, its 讓分 three ways on whole goals (主-1 /
  讓分和 / 客+1, `hcap3`), no Asian half-goal line; baseball [第1局]大小, [第1局]不讓分 and
  [1-5局]讓分 in place of 首局得分. Tennis, volleyball, badminton, table
  tennis and esports (單盤不讓分, 讓盤, 讓局, 大小, 正確比數) are named and
  settle but have no league on the board yet.
- **限2關 / 限3關:** the house's price bands (under 1.25 → 2+, under 1.12 →
  3+), or a game's own minimum where the kit reads one (`eventMinLegs`). The
  slip says which: 「賠率 1.06 偏低：只能串 3 關以上」 or 「這場比賽限串 3 關以上」.
- **A bet is final:** as at 台灣運彩, no cash out, cancel or edit (cash out
  was removed 2026-10-21; the Worker refuses one).
- **The proxy places and settles** (`Shared-Proxy/settle.js`):
  - Placing re-prices every pick and takes the stake, or says the price
    moved. Live bets wait 5 s.
  - When a game should be over, it is read once for every slip on it, and
    the wallet is paid with a notice. Play only applies the results.
  - Lottery tickets and scratch cards are bought there too.
- **Lottery** (`lib/lottery.mjs`, `scratch.mjs`): 8 draw games settled
  against the real draws, and scratch cards. As each game's 投注方式 has it
  (`lottery-labels.mjs` `gameLimits`, the kit's `limits()`):
  倍數 none on 威力彩/大樂透/今彩539, ×10 樂合彩, ×50 3星/4星/賓果; 多期 (期數)
  and 包牌 (系統組合: more numbers in a zone, its 注數 and cost shown); a 多期 buy is a ticket a draw
  (`<id>`, `<id>-2` …), shown once while open. Sales close at 20:00
  (`closesAt`), the next 期別 and 頭獎上看/保證 come from Taiwan Lottery
  (`drawTerm`, `upcoming()`), the last draw shows 大小順序 and 開出順序, and a
  ticket whose pool prize isn't announced yet stays open (「等待派彩公告」).
  Scratch cards: the kit's `CARD_ORDER` (Taiwan Lottery's own, in their
  words: 幸運號碼, 大力士分數); a `retired` card is never sold but one bought
  before still scratches. A kit export added from now on is used with a
  `?.` fallback until phones have it (the rulebook's §4).
  The counter (`lottery-ui.js`): a shelf a price, each card its whole ticket
  (`art/ticket/s/`, 360 px) with 頭獎 and 中獎率; a card's page has 玩法 as
  steps, every prize with its odds (1/N of 發行張數) and buys 1 to 10. The
  scratch sheet shows the whole ticket (never cut at a side), a
  fingertip-wide coin, and a tap on a small scratch-off opens it whole.
- **紀錄:** 投注單 opens on one hero (the net, 回收率, the tax withheld with the Pass's 真相 a tap away, the record as a 2×2), 每月損益 bars (a tap shows that month's slips, `monthsOf` in `lib/history.mjs`) and filter chips; open slips are whole tickets (live progress, cash out), settled ones passes (sport colour, each pick's logo marked right or wrong, the net) that open to the ticket. Then 我的彩券 (draws and scratch cards) and 戰績 (wins only).
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
- No promotions on the ticket: no boosts, free bets or cash out (2026-10-21).
- Empty passive document-wide touch listeners fix iOS's double-tap. Don't
  remove them.
- Not betting advice; real lottery tickets are 18+, and overseas betting
  is illegal in Taiwan.

## Files

Most of `lib/` is the shared kit's logic (`export * from '#kit/play-*.mjs'`):
`board`, `bets`, `odds`, `rules`, `live`, `players`, `props`, `recommend`,
`lottery`, `scratch`, `teams`. Tests of other kit parts (`house`,
`kambi`, `lines`, `markets`, `offers`, `propmodel`, `schedules`) import
`#kit/play-*.mjs` directly.

| File | What |
| --- | --- |
| `public/app.js`, `home.js`, `lottery-ui.js`, `stats-ui.js` | Rendering and the tabs |
| `lib/sources.mjs`, `boardstart.mjs` | Reading ESPN, Polymarket, Kambi, F1; start-up on the proxy's board |
| `lib/slip.mjs` | The slip's one quote and rules (cost, most it pays, the cap, singles judged one slip each, as `price.js` checks them) |
| `lib/account.mjs`, `settled.mjs`, `history.mjs` | The ledger; the Worker's placing and settling; the account card |
| `lib/stats.mjs` | 戰績's numbers |
| `lib/foryou.mjs`, `codec.mjs`, `i18n.mjs` | 為你推薦; saves; text |

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
| A cut or rule | The kit's `truth.mjs` and `help.mjs`, `tools/economy.mjs` |
| A market | Its settling |
| F1 markets or settling | `kit/f1live.mjs`, Shared-Proxy's `f1-live.js`, Orbit Sports |
| Ledger ids | Merging, the Worker's `ENTRY_APPS` and VIP stakes |
| The slip's rules (`lib/slip.mjs`) | Shared-Proxy `price.js` `checkSlip`: the phone must say what the Worker will |
| The league list | `kit/catalog.mjs` (shared with Orbit Sports) |
