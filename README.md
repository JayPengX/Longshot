# Quadra Play

**https://jaypengx.github.io/Quadra-Play/**

The place to play in **Quadra**: sports bets on every game the sources
carry, and Taiwan Lottery's draw games and scratch cards. It uses the one
Quadra balance and is play money only. It prices and settles like a real
sportsbook: the house never loses on its own prices.

> Not betting advice. Lottery tickets in Taiwan are 18+ only, and betting
> on overseas sites (Polymarket included) is illegal in Taiwan.

The family's rules are `Shared-Proxy/docs/TRUTH.md` (they win over
anything here). The Quadra Pass, the money pool, Plus, VIP and free bets
are the kit's and the Worker's (Shared-Proxy README §5–6).

## Contents

- [The tabs](#the-tabs)
- [What's sold](#whats-sold)
- [A game's sheet and its markets](#a-games-sheet-and-its-markets)
- [F1](#f1)
- [Live (場中)](#live-場中)
- [Pricing: the house's cut, rules and models](#pricing-the-houses-cut-rules-and-models)
- [The slip](#the-slip)
- [Cash out](#cash-out)
- [Settling](#settling)
- [The account, money and Plus](#the-account-money-and-plus)
- [The lottery (彩券)](#the-lottery-彩券)
- [紀錄: slips, tickets, 戰績 and stats](#紀錄-slips-tickets-戰績-and-stats)
- [Recommendations](#recommendations)
- [The simulated crowd](#the-simulated-crowd)
- [Data sources](#data-sources)
- [Opening fast, staying still](#opening-fast-staying-still)
- [Files](#files)
- [Develop, test, deploy](#develop-test-deploy)
- [What depends on what](#what-depends-on-what)

## The tabs

Four tabs from the kit's tab bar: 首頁, 賽事, 彩券, 紀錄. **投注單 (the
slip) is a sheet over any tab**, opened from the slip bar above the tab bar
(while it has picks: how many, the stake, the most it pays). At the top
right are 說明 · 重新整理 · the account.

### 首頁 Home (`home.js`)

Calm on purpose: no banners, no one-tap "hot" parlays, no nags.

- **The balance.** It shows what's out in open bets and what they'd cash
  out for now, plus this month's VIP tier, its cashback so far and the next
  tier (kit `vipStatus`).
- **場中焦點.** Games on now with live prices. A tap on a price puts it on
  the slip; the card opens its live markets.
- **為你推薦** (`lib/foryou.mjs`). One pick a game on the teams and leagues
  followed in Orbit Sports (the wallet's `follows:match`) and bet on here,
  the next games of teams already backed, and the best prices. Picks are on
  the team cared about, never against it. Its top three are offered as a
  ready-made parlay.
- **焦點賽事.** The games worth betting on, drawn like the board. They're
  ranked by the kit's `rank`: affinity × the league's tier (`leagueTier`:
  the majors first, thin leagues last) × how soon it starts.
- **你的投注.** Open slips, each with its cash-out price and a few words on
  where it stands.
- **The lottery's jackpots**, and Quadra Plus once for a non-member.

### 賽事 Games

- **Filters.** One tile per kind of sport (棒球, 籃球, 足球, 美式足球, 冰球,
  F1), then that sport's leagues as chips, then a day strip (Taiwan time;
  today stays on it while games are on). With every sport shown, thinly
  traded leagues fold behind "其他 N 場".
- **Search.** Teams (Chinese or English) and leagues across every day and
  sport.
- **A game card.** Teams with logos and the win prices for one-tap picks.
  A tap elsewhere opens its sheet.
- **Championship and F1 boards** (one board each).

### 彩券 Lottery

See [The lottery](#the-lottery-彩券).

### 紀錄 History

See [紀錄](#紀錄-slips-tickets-戰績-and-stats).

## What's sold

Every league in the shared catalogue with a `bet` key (`lib/teams.mjs` reads
`kit/catalog.mjs`). Every game starting within **14 days** (`SOLD_DAYS`) is
sold, whoever prices it:

| Source | Leagues |
| --- | --- |
| ESPN (schedules, results) with DraftKings' lines through ESPN | MLB, NBA, NFL, NHL, the top soccer leagues and cups (Premier League, LaLiga, Serie A, Bundesliga, Ligue 1, Champions/Europa/Conference League, MLS, Scotland, Belgium, Turkey, Saudi Pro League, Libertadores, Sudamericana, Nations League, World Cup qualifying, EFL Cup, Copa del Rey, AFC Champions League Elite, Asian Cup, friendlies…) |
| Kambi (prices, live scores) | NPB, KBO, CPBL (with the leagues' own month lists: every game on them), EuroLeague, NBL, K League 1 |
| Polymarket | Win chances (MLB, Premier League, NBA), championships, F1's markets, the F1 flags |
| The house (`lib/house.mjs`) | Any game no bookmaker prices yet (preseason, weeks out, a small league) |

A bookmaker's line replaces the house's as soon as one is posted. An ESPN
league with a Kambi path is priced by Kambi first, with DraftKings as the
cross-check. Tennis and UFC were removed on 2026-10-11; a pick still open
on one is void.

## A game's sheet and its markets

A game opens in a sheet (like Orbit Sports' match sheet), so the board
under it never moves. The sheet has a tab per kind of market, players'
markets (球員) next, and the long shots under 更多. The slip bar sits at
its foot.
- **Waiting.** The markets are drawn once Kambi's list and the players are
  in, or after 4 s with what there is.
- **Height.** The markets keep the tallest height they've had, so a
  shorter tab never pulls the page up.

| Sport | Markets |
| --- | --- |
| Baseball | 不讓分, 大小分, 讓分 (run lines to ±4.5), 單隊大小, 單雙, 勝分差, 首局得分, 前五局, 得分最高單局, 首分 (who scores first); live 第N分 |
| Football, basketball | 讓分, 大小分, 單隊總分, 單雙, 勝分差, 上半場, 上半場大小, 第一節 |
| Hockey | Puck lines, totals, 單隊大小, 60 分鐘勝負, 單雙 |
| Soccer | 1X2, 讓球, 大小, 單隊大小, 雙方進球, 波膽, 上半場, 上半場大小, 雙重機會, 半全場, 總進球數 (0–1, 2–3, 4–6, 7+), corners (Kambi) |
| Players (球員) | Kambi's (to score, first goalscorer, shots on target, points, rebounds…, `lib/offers.mjs`, `lib/props.mjs`) and the house's own model for everyone else (`lib/propmodel.mjs`, priced at `MODEL_CUT` 1.25), settled from ESPN's box score |

**Where the prices come from.**
- **Kambi**: a game's own markets (`betoffer/event/<id>.json`, the
  `kambi-offers` trim), read when the game is opened, replace the model's
  where Kambi prices them.
- **Our own lines** (`lib/lines.mjs`): every market past the winner comes
  from two numbers, the win chance and the expected total. When no total
  is posted, the model makes one:
  - soccer: each side's goals fitted to the 1X2 chances, scaled up 12% and
    blended 70/30 with the league's average;
  - everything else: the league's average (`LEAGUE_TOTALS`) nudged for
    one-sided games.

  Measured against the bookmakers' totals: MLB 0.7 runs, NPB 0.45, KBO
  0.9, CPBL 0.6, MLS 0.2 goals, unbiased.

## F1

One card, a tab per market:

| Market | How |
| --- | --- |
| 冠軍 (winner) | The sources' chances at their most (`mergeF1Boards`: Polymarket, Kambi), priced at the outright cut 1.2, up to the lottery's 500 |
| 排位賽第一 (pole) | Until qualifying starts: our estimate (season's qualifying form and the race's chances) with Polymarket's or Kambi's prices counted as far as they're traded (`f1PoleModel`) |
| 前三名, 前六名, 前十名 (podium, top six, points) | Finishing orders drawn from the win chances (Harville, 40,000 draws, fixed seed, `f1Markets`) |
| 車手對決 (teammates head to head) | The same draws |
| 冠軍車隊 (winning team) | The same draws |
| 安全車, 虛擬安全車, 紅旗 (yes/no) | Polymarket's market where traded, else history; priced like a two-way line |

The drivers are named in English as the apps name them. Before or after
qualifying is said beside the prices.

## Live (場中)

Live markets are on today's board only.

- **The model** (`lib/live.mjs`): a game in progress is modelled from its
  pregame lines and the live state.
  - baseball: each team's remaining runs (negative binomial) scaled to the
    half-innings left;
  - soccer by the minute;
  - hockey, football and basketball by the clock left.
- **The win chance** is averaged with Polymarket's live price when enough
  money is behind it.
- **Kambi's sports** use Kambi's own live prices, its margin taken out.
- **Lines**: the lottery posts the lines closest to 50/50, and the model
  picks them the same way.
- **The cut**: live is 1.16 (soccer's winner at the three-way cut), more
  for leagues the house knows less.
- **Suspended**: a rain delay suspends live odds.
- **Refresh**: everything live (the board's games in play, open bets'
  scores and cash-out values) refreshes on one beat, `playLive` (5 s), and
  at once on coming back.

## Pricing: the house's cut, rules and models

**One cut per kind of market** (`BASE_CUT` in `lib/rules.mjs`), whoever
priced the game. These are what Taiwan Sports Lottery was measured taking:

| Kind | Overround |
| --- | --- |
| Two-way (win, totals, run lines, team totals) | 1.158 (81 markets, 2026-09-25) |
| Three-way | 1.20 |
| Bands | 1.35 |
| Correct scores | 1.50 |
| Top-scoring inning | 1.92 (the lottery's own table) |
| 第N分 (live) | 1.31 |
| Live | 1.16 |
| Outrights (F1, pole) | 1.20 |
| Players by the model | 1.25 |

A fair chance is DraftKings, Polymarket and Kambi with their margins
removed (proportional, or the power method for N outcomes), then averaged.
The estimated odds are `1 ÷ (fair × cut)`.

**What it costs to open** (every game's ~60 options are priced on the
phone as the board is drawn, once for the saved board and again for
today's): a game's options are kept by its contents (`optionsOf` in
`app.js`), F1's top six, top ten, teammates and teams (40,000 drawn races,
`f1Markets`) once per field of prices (`f1MarketsMemo`), and soccer's 半全場
summed by each half's goal difference (`goalMarkets`), not every score of
one half against every score of the other. A model change keeps these
cheap: profile an opening (Chromium's profiler, the second opening) before
and after. Today's board is read while the sign-in is on its way (`boot`),
not under a `#qh=` sign-in link.

**House rules** (`HOUSE_RULES`, for the slip and the simulated crowd alike):

| Rule | When |
| --- | --- |
| Locked 🔒 | Odds of 1.03 or less; 30+ on an ordinary market, 150+ on a many-outcome one; outrights under 1.12 |
| 限3關 | Under 1.12: only in a parlay of 3+ games |
| 限2關 | Under 1.25 (outrights under 1.30): only in a parlay of 2+ games |
| Longshot shade | Past odds of 6, an ordinary market pays only 85% of the rest (`LONG_FROM`, `LONG_SHARE`) |

**The house's own prices** (`lib/house.mjs`): each team's share of wins in
ESPN's standings. Last season counts as 30% of a season, pulled a third of
the way to even, with this season's games on top. The two sides meet by
log5, plus the home edge. Soccer takes a draw out (27% between even
sides). The preseason is pulled halfway to even.

## The slip

The slip follows the lottery's ticket rules:
- **Modes**: 一關 (singles, the default), 全部過關, 過關組合 (過2關 …
  過11關, 全過). A second pick turns it into a parlay unless another way
  was chosen.
- **Picks**: 1–12, one per game in a parlay or system; singles may hold
  picks of one game.
- **Stakes**: NT$100–100,000 a ticket, typed in NT$10 units (10 = NT$100).
  Quick stakes run NT$100–5,000, and the last stake is remembered on the
  device (`play.stake`).
- **Limits**: a NT$20 million payout cap, and 20% income tax plus 0.4%
  stamp duty on any combination paying over NT$5,000.

**Each pick** shows its market as a coloured tag, the pick, its game and
start, and its odds (and how they moved since it was picked).

**派彩試算.** For a parlay it shows the odds multiplied out; for singles,
each pick's return; for a system, each size and its combinations. Then
the cost, what all correct pays after tax, the tax withheld, the least a
winning ticket pays, and the parlay boost in money.

**The parlay boost** (`PARLAY_BOOST`): the winnings of a winning
combination of 3+ picks grow by 5% (3), 8%, 12%, 15%, up to 20% (7+).
Quadra Plus multiplies it by 1.5. The slip keeps its boost from when it
was bought, and what Plus adds is paid as its own entry, `plus-<slip>`
(kind `plusboost`).

**Free bets** (Plus's weekly NT$200, the welcome NT$200; the kit's
`FREEBET`):
- **Use**: one tap above the stake. Every pick must be at 1.50 or longer
  (a parlay's together).
- **Payout**: only the winnings come back. A free bet's slip is never
  cashed out.
- **Spent**: marked with `odds:fb-<token>`.

**Buying** (模擬下注) asks first (the cost and the most it pays), buys at
the board's odds now, and syncs at once. Picks on a game that has started
drop off; live picks stay. The slip being made is kept on the device under
the pass.

## Cash out

`lib/cashout.mjs`. An open slip can be sold back at a sportsbook's own
price:
1. Each undecided pick's fair chance now is cut by the house's margin
   (`LEG_CUT`: 4% before its game, 6% in play).
2. Every way those picks can still land is weighed by those chances.
3. Each way is multiplied by what the slip would pay then (tax, cap and
   boost included).
4. The house keeps 3% (`CASHOUT_KEEP`; Plus 2%, `PLUS.odds.cashOutKeep`).

A parlay's offer drops with each pick still to play, and nothing is worth
more cashed out than held.

**Paused, with why** (`cashOutState`): a pick has no price now, two
undecided picks are on one game, there are too many undecided picks, or
it's a free bet. If the price moved since it was shown, it asks again.

It is paid as `payout-<slip>` (kind `cashout`), so a result arriving later
on another device never pays twice.

## Settling

**The Worker settles** (Shared-Proxy `settle.js`, `/play`; the owner,
2026-10-12), whether Play is open or not. Play hands it each open slip
(`lib/settled.mjs watchOpen`: after placing, and any open slip this device
hasn't handed over yet, at each sync). When a slip's soonest undecided game
should be over (its start plus its kind's usual length), the Worker reads
that game once for every slip on it (the kit's `readOutcomes`, the same code
below), decides each pick (`legResult`), and once the slip is settled
(`applyResults`) pays the pass's wallet `odds:payout-<slip>` (and
`odds:plus-<slip>`) and sends the won / lost notice. A game not over is
looked at again 15 minutes later.

Play applies the Worker's results (`applySettled`: on each sync and with
紀錄's check, at most once a minute): `applyResults` with the same ids, so
the payout already in the wallet comes back into the ledger and is never
paid twice; then tells the Worker to forget them. Cash out first takes the
slip from the Worker (`takeForCashOut`): a slip it settled meanwhile keeps
its result (這張已經結算了), and a cashed-out slip is never settled.

On 紀錄 (and home's 你的投注) the open picks' games are still read, at most
every 90 s, for what's shown: live scores and cash out. This device settles
a slip itself only when the Worker hasn't 30 hours after its games began
(`BACKSTOP_MS`: the Worker unreachable), by the same rules and ids.

| What | Settled from |
| --- | --- |
| ESPN's leagues | ESPN's final scores (innings for the top inning); players from ESPN's box score |
| Kambi's leagues | Kambi's live score once decided; when Kambi drops a match, the Worker's copy (`/kambi`, kept every 2 minutes); none kept: void within hours |
| Asian baseball | The leagues' own month lists' final scores (`scoreOnly` markets: winner, totals, run lines, team totals, odd/even, margin) |
| F1 race, pole, places | **F1's own timing first** (`kit/f1live.mjs f1Outcome`: a session over settles at once; one on stands as it is now, 目前會中), else ESPN's results |
| F1 safety car, VSC, red flag | OpenF1's race control messages; no race within a week of its date: void |
| Championships | Polymarket once it resolves |

Each pick is won, lost or void. Once all are decided, the slip pays like a
real ticket:
- a postponed or cancelled game counts at 1.00;
- tax and the cap apply;
- a game still without a result three days after its start counts as
  void;
- a parlay with a lost pick settles at once.

Each pick keeps its final score (or winner) as it's decided, so old slips
never depend on the sources keeping old games.

**Notices** (the kit's `odds` kinds): `slip` (a slip settled), `ticket` (a
lottery win), `plus` (Plus's weekly bet and renewal). While Play is
closed, the Worker tells how a slip went once it settles it (中獎 NT$…,
投注單沒中).

## The account, money and Plus

**Where it's kept.** The account is Play's data on the Quadra Pass
(`odds-study-accounts`), with a gzip copy on the device (`lib/codec.mjs`:
JSON → gzip → base64, `gz1:`, 8–10× smaller).
- **The ledger.** The balance is never stored: it's the sum of a ledger of
  entries with fixed ids (`start`, `stake-<slip>`, `payout-<slip>`,
  `lotto-<id>`, `prize-<id>`, `plus-<slip>`). Two copies merge by union,
  and nothing counts twice.
- **Saves.** Writes go one after another, so a slower save never lands
  after a newer one. A copy that can't be read is never saved over.
- **Recovered slips.** A bet the account lost but the pass's money records
  hold comes back as a recovered slip (cost, time, payout).

**The money is the pass's one pool.**
- **Income.** Quadra pays the opening NT$30,000 and NT$6,000 every Taiwan
  month. Play's own weekly grants ended with the week of 2026-09-28. Play
  shows the pool, which may be below zero if other apps spent it.
- **VIP.** The month's gaming stakes (bets, lottery, scratch, less refunds)
  set the tier, and the Worker pays the cashback after the month.
- **Plus.** The weekly NT$200 free bet, the boost ×1.5, cash-out keeps 2%.
- **Welcome.** NT$200 free bet after the first paid bet.
- **Stakes.** Play reports its settled result per sport (`snap.odds.pl`)
  for the admin money report.

## The lottery (彩券)

`lib/lottery.mjs`, `lib/scratch.mjs`, `lottery-ui.js`.

**11 computer-drawn games** follow Taiwan Lottery's rules and settle
against the real draws. Taiwan Lottery's public results API sends CORS
headers, so it's read directly.

| Game | What | Price | Draw |
| --- | --- | --- | --- |
| 威力彩 | 6 of 1–38 + 1 of 1–8 | 100 | Mon, Thu 20:30 |
| 大樂透 | 6 of 1–49 (+ special) | 50 | Tue, Fri 20:30 |
| 今彩539 | 5 of 1–39 | 50 | Mon–Sat 20:30 |
| 3星彩 / 4星彩 | 3 / 4 digits (正彩, 組彩, 對彩) | 25 | Mon–Sat 20:30 |
| 38 / 39 / 49 樂合彩 | 2–5 of 38, 2–4 of 39 / 49, on 威力彩's first zone, 今彩539, 大樂透 | 25 a combination | their parent draw |
| 賓果賓果 | 1–10 stars of 1–80, 20 drawn | 25 | every 5 min 07:05–23:55 |
| 雙贏彩 | 12 of 1–24 | 50 | Mon–Sat 20:30 (house draw) |
| 大福彩 | 7 of 1–40 | 100 | Wed, Sat 20:30 (house draw) |

**How it pays.**
- **House draws.** 雙贏彩 and 大福彩 are no longer sold, so their numbers
  come from the real BINGO draw at 20:30, hashed with the game's name;
  nobody can know them before.
- **Pool prizes** (威力彩's first two tiers, 大樂透's first four) pay what
  that draw paid per winner, shared with the real winners. A tier nobody
  won pays its whole pool.
- **Tax** on prizes over NT$5,000 is 20.4%.
- **Sales** close half an hour before an evening draw.

**12 scratch cards** (two at each price, NT$100–2,000), with each price's
table set to Taiwan Lottery's 2026 cards:

| Price | Pays back | Wins | Top prize |
| --- | --- | --- | --- |
| 100 | 63% | 33% | NT$50萬 |
| 200 | 65% | 33% | NT$200萬 |
| 300 | 66% | 36% | NT$300萬 |
| 500 | 70% | 41% | NT$500萬 |
| 1,000 | 74% | 70% | NT$1,200萬 |
| 2,000 | 75% | 69% | NT$2,000萬 |

The prize is fixed when the card is bought (the device's crypto random,
by the table). Scratching on a canvas reveals a face laid out to show
exactly that prize.

**Buying.**
- **The game's slip** has slots that fill as numbers are picked; a full
  zone swaps out its oldest pick; a dot marks the last draw's numbers.
  快選 fills the rest, and +1/+5/+10 add random lines.
- **The buy bar** stays in view (multiple, total, 購買), and the prize
  table folds away.
- **My tickets** lists waiting and drawn tickets, with the total won.

Tickets live on the account beside the slips and pay into the one pool.

## 紀錄: slips, tickets, 戰績 and stats

- **投注單 (slips).**
  - A summary row, filters (all, open, won, lost) and groups: 比賽進行中,
    等待開賽, 已確定沒中, then settled by Taiwan day (the day the last game
    was played).
  - Each slip: its mode, games, when bought; a bar with one segment per
    pick (green won, red lost, grey void, pulsing in play); each pick's
    state, market tag, odds and, in play, its score and whether it's
    winning; the large figures (cost, odds, locked in, most it can pay, or
    payout).
  - A sentence on where it stands ("1 場目前猜錯，這張串關會輸"). It folds
    out what the odds said when bought.
- **彩券 (tickets).**
- **戰績** (`stats-ui.js`): only wins, over all time, 30 or 7 days. A gold
  hero with the total won and its rhythm; tiles; 11 achievements with
  progress; the six biggest moments; the sports that paid most.
- **統計分析** (`lib/history.mjs`):
  - **Money**: key numbers against what the odds said to expect; the
    balance over time; luck against the cut (one standard deviation, how
    rare).
  - **Picks**: won against their fair chances (by band and market); by
    sport, mode and number of picks; streaks and records; week by week.
  - **How you bet** (`lib/profile.mjs`): the same card as the crowd's
    people.
  - **You against 100,000** (§The simulated crowd).
  - **Fun facts.**
- **Nothing that talks people out of it.** 戰績 shows only wins; slips
  show what they paid, never a net or an expected return; the lottery
  shows prizes, not odds.

## Recommendations

`lib/recommend.mjs`. They're tags on each pick, judged by its average back
per NT$100 (fair chance × odds) against the others:

| Tag | When |
| --- | --- |
| 划算 | Top 10% |
| 穩 | 65%+ to win and at least the median return |
| 值博 | 30% or less, in the top quarter |

No tag goes on a locked pick, over 85% or under 5%, a lot under 10 picks,
or a capped pick (a player's, a house-priced game's).

## The simulated crowd

`lib/sim.mjs`, `sim-worker.js`. About 100,000 people bet on this very
board by the same rules, each a mix of traits: how they bet, plus
reactions (chasing losses, cashing out, sulking after a near miss).
- **Only for analysis**: 紀錄's "you against the crowd", run in a worker
  only when it's shown. One 1-year run answers every shorter period.
- **The audit** (`lib/audit.mjs`) checks that no sport or kind of fan does
  better because of how it's modelled (the tests run it on every sport's
  typical week).

## Data sources

All read through the kit's `proxyJson` (the sports proxy; Shared-Data's
season packs and mirror where they hold the read), `lib/sources.mjs`:

| Source | For |
| --- | --- |
| ESPN site API (`dates=YYYYMM` month pages, odds included) | Schedules, DraftKings' lines, results, standings, rosters, players' seasons, box scores |
| Shared-Data season packs and mirror | Seasons, past days, tables, squads, numbers (Play's leagues) |
| Polymarket (Gamma, trimmed) | Win chances, championships, F1 markets and flags |
| Kambi (trimmed) | Asian baseball, EuroLeague, NBL, K League odds and live; a game's own markets |
| The leagues' own month lists (`asia-baseball.quadra`, kit `asiaMonth`) | NPB, KBO, CPBL schedules and finals |
| F1's live timing (`f1-live.quadra`, kit `f1live.mjs`) | F1 settling at the flag |
| OpenF1 | Race control (SC, VSC, red flag) |
| `/kambi` (orbit-workers-proxy) | Kambi matches' last live data after Kambi drops them |
| Taiwan Lottery's results API (direct) | Draws |

Logos, names and photos come from the kit (`logos.mjs`, `names.mjs`,
`photos.mjs`).

## Opening fast, staying still

- **The saved board** (kept 3 days, tied to its shape `SNAPSHOT_V`, not
  the deploy) is drawn while signing in. The loading screen lifts once
  today's board, the balance and the games on now have replaced it (at
  most `SNAPSHOT_WAIT_MS`, 2 s), so nothing reshuffles.
- **The games on now** (`play.live.v1`, 15 minutes) are drawn at once on a
  reopen, prices dimmed and not taken until today's swaps in.
- **The first read** asks for every league at once. The other leagues join
  as each arrives and are swapped in whole.
- **Redraws** keep the pictures already on screen (`recycled`), so logos
  never blink. A game's options are worked out once per contents, never on
  every redraw.
- **The slip bar** and big numbers shrink to fit (60% at most), never wrap.
- **An iOS fix**: empty passive document-wide touch listeners fix iOS's
  "a tap needs two taps" (do not remove).

## Files

| File | What |
| --- | --- |
| `public/app.js` | Rendering: games, sheets, markets, live, F1 and championship boards, the slip, the account, cash out, settling, history, boot, tabs |
| `public/home.js`, `lottery-ui.js`, `stats-ui.js` | The home tab, the lottery tab, 戰績 |
| `lib/sources.mjs` | Fetching and parsing ESPN, Polymarket, Kambi, F1; results for settling |
| `lib/board.mjs` | Every priced option of a game (one pricing path for the page and the crowd); F1's markets |
| `lib/odds.mjs` | Devig, estimated odds, the slip's rules and analysis, `PARLAY_BOOST` |
| `lib/rules.mjs` | `BASE_CUT`, `HOUSE_RULES`, the longshot shade, league tiers |
| `lib/markets.mjs` | Every sport's side markets from a score model |
| `lib/lines.mjs` | Our own totals |
| `lib/live.mjs` | Live odds |
| `lib/house.mjs` | The house's prices from standings |
| `lib/kambi.mjs`, `offers.mjs` | Kambi's lists, live prices, a game's own markets |
| `lib/players.mjs`, `props.mjs`, `propmodel.mjs` | Players' markets: rosters and seasons, Kambi's props, the house's model |
| `lib/schedules.mjs` | Kambi leagues' own schedules |
| `lib/cashout.mjs` | Cash out |
| `lib/account.mjs` | The ledger, placing and settling, merging |
| `lib/settled.mjs` | The Worker's settling: handing it open slips, its results, cash out's lock |
| `lib/history.mjs`, `profile.mjs` | Stats and a bettor's profile |
| `lib/recommend.mjs`, `foryou.mjs` | Tags and 為你推薦 |
| `lib/lottery.mjs`, `scratch.mjs` | Draw games and scratch cards |
| `lib/sim.mjs`, `audit.mjs`, `sim-worker.js` | The crowd and its audit |
| `lib/teams.mjs` | Leagues (from the catalogue), names, logos, the F1 grid |
| `lib/codec.mjs` | gzip saves |
| `lib/i18n.mjs` | Chinese and English |
| `scripts/stamp-version.mjs` | `?v=` on every file, `version.json` |

## Develop, test, deploy

```bash
npm test
```

```bash
node ../Shared-Proxy/tools/preview.mjs play --webkit
```

- **Tests**: the odds, cuts and rules, markets, lines, live, house, Kambi,
  offers, players, F1 (flags, pole), the account and its merging, cash
  out, the lottery, scratch, the simulator and its audit, postseason, and
  sources (on fixtures, including real lottery prices:
  `tests/fixtures/lottery-mlb-2026-09-25.json`,
  `lottery-f1-2026-09-26.json`, `lottery-live-2026-09-26.json`).
- **Deploy**: a push to `main` runs the tests and deploys `public/` to
  Pages, stamped with versions; the kit puts a new deploy in place at once.

## What depends on what

| If you change… | Also check |
| --- | --- |
| A cut, a rule or the boost | The crowd (`sim.mjs` uses the same `board.mjs`), the audit, the kit's `truth.mjs` (it mirrors Play's prices), `help.mjs`'s money topics |
| A market | Its settling (`market-result`, `props.mjs`), cash out's price for it (`livePrice`), the slip's names, `history.mjs` by market |
| F1 markets or settling | `kit/f1live.mjs`, Shared-Proxy's `f1-live.js`, Orbit Sports (the same feed) |
| Kambi's trims | Shared-Proxy's `sports-proxy-worker.js` and `kambi.js` (`/kambi`), Shared-Data's mirror |
| The account's ledger ids | Merging, the Worker's `ENTRY_APPS`/VIP stakes (kinds `stake`, `lottery`, `refund`), the money report |
| The league list | `kit/catalog.mjs` (shared with Orbit Sports) |
