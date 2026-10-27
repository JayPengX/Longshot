# Longshot: the map

A Taiwan sportsbook and Taiwan Lottery's games on play money, and the real
台灣運彩 tickets you bought, followed live. It prices and settles like a
real sportsbook: the house never loses on its own prices. Its own account
(the Longshot Pass) and its own Worker; it shares nothing with any other app.

Live: https://longshot.jaypengx.com/ · the owner's panel:
https://longshot.jaypengx.com/admin/ (the first visit makes the
admin pass, once; after that it signs in with it).

## How it works

- **Tabs:** 首頁 (the strongest pick for you, 場中焦點, 為你推薦, 焦點賽事, open bets, jackpots) ·
  賽事 (sport tiles, league chips, day strip, search) · 彩券 · 注單 (your real
  運彩 tickets) · 紀錄. 投注單 (the play-money slip) is a sheet over any tab.
- **What's sold:** every catalogue league with a `bet` key, games within
  14 days (`SOLD_DAYS`), priced by:
  - ESPN with DraftKings' lines (the US leagues, top soccer);
  - Kambi (NPB, KBO, CPBL, EuroLeague, NBL, K League);
  - Polymarket (win chances, championships, F1);
  - the house's own model (`kit/play-house.mjs`) when nobody prices a game yet.

  A bookmaker's line replaces the house's as soon as one is posted.
- **Markets** (`lib/board.mjs`, one pricing path for the page and the Worker):
  winners, spreads, totals, team totals, margins, halves and
  periods, soccer's full set, players' markets (Kambi's, else the model's).
  Every market past the winner comes from two numbers: the win chance and
  the expected total (kit `play-lines.mjs`).
- **F1:** the race winner (冠軍) alone, as 台灣運彩 sells it (pole, podium,
  top six/ten, teammates, team and the safety-car markets were removed
  2026-10-21).
- **冠軍 boards** list only who can still win (kit `play-alive.mjs`): ESPN's
  'e' (out of the play-offs), a lost play-off series (MLB's list), a soccer
  club that can't catch the leader on points, an F1 driver or team that
  can't with every race left won. Leagues and their conferences, as 運彩
  sells them: NBA/NHL 西區・東區, NFL AFC/NFC beside each league's title.
- **系列賽正確結果** (kit `play-series.mjs`): every MLB play-off series
  (wild card to World Series) once MLB lists both clubs, each result still
  possible. Priced from one game's chance (the pennant/World Series market,
  else the next game's moneyline); off sale from 10 minutes before a game
  until it's final; settled from MLB's postseason list.
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
- **A bet is final:** as at 台灣運彩, no cash out, cancel or edit.
- **The Worker places and settles** (`worker/settle.js`):
  - Placing re-prices every pick and takes the stake, or says the price
    moved. Live bets wait 5 s.
  - When a game should be over, it is read once for every slip on it, and
    the wallet is paid. The page only applies the results.
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
  before still scratches.
  The counter (`lottery-ui.js`): a shelf a price, each card its whole ticket
  (`art/ticket/s/`, 360 px) with 頭獎 and 中獎率; a card's page has 玩法 as
  steps, every prize with its odds (1/N of 發行張數) and buys 1 to 10. The
  scratch sheet shows the whole ticket (never cut at a side), a
  fingertip-wide coin, and a tap on a small scratch-off opens it whole.
- **紀錄:** a true record, plain figures, no lessons (those are 真相's): every bet and ticket stays listed, win or lose, nothing folded or filtered out by default. 投注單 opens on one hero over bets and lottery alike (the net, 回收率, the tax withheld with the Pass's 真相 a tap away, 投入 · 拿回 · 進行中 · 全中最多可拿), 每月損益 bars (bets and tickets; a tap shows that month's slips, `monthsOf` in `lib/history.mjs`) and chips 全部 · 進行中 · 贏 · 輸; open slips are whole tickets (live progress), settled ones passes (sport colour, each pick's logo marked right or wrong, the net) that open to the ticket. Then 我的彩券 (投入 · 中獎 · 淨損益, every day and every 注 with its net) and 戰績 (wins only).
- **Top right:** the account capsule shows the money left (`accountButton`'s `balance`, the app's own figure).
- **注單** (`slips/`): the real 台灣運彩 tickets you bought,
  read from a photo (Gemini, through the Worker's `/slip-scan`, 30 a day)
  or picked by hand, followed live: what each is worth now, every pick as
  it happens, 戰績 of the settled ones. Only what Longshot follows well:
  the board's leagues and the ESPN cups (英格蘭社區盾 and the like), no set
  sports. The match picker's days are only days with games (a soccer
  league's a year back, the rest two months). Every 運彩 market, graded by the
  same `kit/settle.mjs`; F1 is 冠軍 only. Names all in Chinese
  (`slips/lib/zh.mjs`). Odds left blank (估) are priced again from the
  closing lines once the games are over. 用模擬金下注 puts a ticket's picks
  on the play-money slip. Its rules are scoped to `.sl-app` (the tab and
  its sheets).
- **Opens fast:** on the saved board (3 days, `SNAPSHOT_V`); the loading
  screen lifts once today's board, the balance and the live games are in
  (2 s at most). Model fits are kept by their inputs, so a reopen prices
  in a quarter of the time.
- **Offline:** covered (`onlineOnly`); never old odds.
- **Saved:** on the Longshot Pass, one session for both: Play's ledger under
  app `odds` (`gz1:`), the tickets under `slip` (`slips/lib/sync.mjs`). The
  balance is the wallet's entries (the Worker's `pass:start`, `pass:pay:<YYYY-MM>`,
  and the account's `odds:<id>`), so copies merge by union.

## The Longshot Pass

`public/kit/core.mjs` (`passSession`, the sign-in screen), `kit/pass.mjs` (the
account sheet: 帳戶 and 真相), the Worker's `/pass` (`worker/pass.js`).

- Open sign-up (開新帳號, rate-limited); a 10-character 通行碼 is the only key,
  shown once. Sign out others, a new 通行碼, sign out here.
- Money, sized like a real 運彩 customer's budget so a loss is felt and
  nothing invites chasing it: NT$30,000 to open, NT$10,000 on the 1st of each
  month (Taiwan time), paid by the Worker. Broke waits for the 1st (no relief
  or top-up); a ticket is still 台灣運彩's NT$100–100,000. Only the Worker adds money.
- 真相: the house's edge for 1 to 7 legs, your bets' and tickets' payback,
  the lottery's and scratch cards'.
- One device live at a time; the other says 已在其他裝置使用.

## Decisions in force

- A plain sportsbook: prices and the slip, no analysis tags. Calm home:
  no banners, hot parlays or nags.
- 戰績 shows only wins, slips show what they paid, the lottery shows
  prizes; the house's edge is one tap away in the Pass's 真相, never pushed.
- No hooks (2026-10-22, the owner found Play addictive): no push notices,
  loans, relief, levels, streak rewards or anything that calls people back.
- 為你推薦 picks are on the team cared about, never against it. Each game's pick is its best return against the whole board at 1.35-4.00 (no pick wins on average; the best lose least), up to 12, one card a team; the strongest leads 首頁 as the hero, with its chance and how its return ranks.
- Only what Taiwan can watch. No edit-slip.
- No promotions on the ticket: no boosts, free bets or cash out (2026-10-21).
- Phones only (2026-10-23): one layout, 320 px to 440; anything wider shows it
  in a centred 440 px column (`--q-vw`, `--q-side` in `kit/core.css`; fixed bars
  and sheets sit inside it). No tablet or wide layouts.
- Empty passive document-wide touch listeners fix iOS's double-tap. Don't
  remove them.
- Not betting advice; real lottery tickets are 18+, and overseas betting
  is illegal in Taiwan.

## Files

The page is static: `index.html` loads `kit/core.css`, `styles.css`,
`slips/slips.css`, `kit/boot.js` (the loading screen and first update
check) and `app.js`; everything else by relative imports. `public/kit/` is
the shared logic the page and the Worker both run (`play-*.mjs`,
`settle.mjs`, `catalog.mjs`…) plus the UI core (`core.mjs`, `ui.mjs`,
`core.css`). Most of `lib/` re-exports it.

| File | What |
| --- | --- |
| `public/app.js`, `home.js`, `lottery-ui.js`, `stats-ui.js` | Rendering and the tabs |
| `public/slips/slips.mjs`, `slips/lib/` | 注單 (mounted the first time its tab opens) |
| `public/kit/core.mjs`, `pass.mjs`, `truth.mjs`, `ui.mjs` | Session, sign-in, account sheet, 真相, the iOS components |
| `lib/session.mjs` | The one Pass session (`odds`, and `q.view('slip')`) |
| `lib/sources.mjs`, `boardstart.mjs` | Reading ESPN, Polymarket, Kambi, F1; start-up on the Worker's board |
| `lib/slip.mjs` | The slip's one quote and rules (as `worker/price.js` checks them) |
| `lib/account.mjs`, `settled.mjs`, `history.mjs` | The ledger; the Worker's placing and settling; the account card |
| `lib/stats.mjs`, `foryou.mjs`, `codec.mjs`, `i18n.mjs` | 戰績's numbers; 為你推薦; saves; text |
| `worker/` | The Worker (see `worker/README.md`) |
| `scripts/stamp-version.mjs`, `hash.mjs` | The Pages build: minify, content-hash every file, version.json |

## Run and test

```bash
npm test
cd public && python3 -m http.server 8000   # http://localhost:8000
```

Tests include real lottery prices and ESPN/Kambi answers as fixtures.
A push to `main` tests and deploys: Pages (`.github/workflows/deploy.yml`)
and the Worker (`worker.yml`, needs the `CLOUDFLARE_API_TOKEN` secret).

## If you change…

| This | Also check |
| --- | --- |
| A cut or rule | `kit/truth.mjs` (真相) |
| A market | Its settling (`kit/settle.mjs`), and 注單's grading |
| F1 markets or settling | `kit/f1live.mjs`, `worker/f1-live.js` |
| Ledger ids | Merging, the Worker's entry checks |
| The slip's rules (`lib/slip.mjs`) | `worker/price.js` `checkSlip`: the phone must say what the Worker will |
| The league list | `kit/catalog.mjs` |
