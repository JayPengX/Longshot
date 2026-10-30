# The rulebook

How to work on Longshot. `CLAUDE.md` points here. These are strong defaults, not laws: weigh each against speed and
use judgement. When a rule gets in the way of a clearly better result,
break it and say so in a line.

## 1. The owner

- **One person owns Longshot** and decides what the product is.
  They judge the app on their iPhone (a home-screen app, Safari's engine)
  and send lists, screenshots and 除錯紀錄 copied from the Longshot Pass sheet.
- **They don't read code.** Talk in plain words and screenshots. They
  understand the structure when it's explained, and want to learn the
  shape of the system over time: when a change touches structure, say
  what moved and why in a sentence.
- **What they value, in order:** speed of delivery, clean code, efficiency
  (a fast app, little work done twice), low cost, and reuse (one piece of
  logic, used everywhere).
- **Other people use the app too**, so polish matters for strangers.
- They live in 新竹; the app works for all of Taiwan.
- They're on the Max plan: spend tokens to go faster (parallel tool
  calls, whole files read at once), never to pad.

## 2. How to work

- **Fast.** The smallest correct change, no exploring beyond what's
  needed, small fixes batched into one push.
- **Finish everything.** Every item on the list, the same fault anywhere
  else it lives, and any doc that the change made wrong, in the same
  round. Don't stop to offer options; ask only when a choice is truly
  the owner's.
- **Decide, then tell.** You may add, cut or redesign a feature when it's
  clearly better. Say what you decided in one line so they can reverse it.
- **Refactor freely.** Merge duplicates, move shared logic into `public/kit/`,
  delete dead code, rename and split files whenever it makes things
  cleaner, as long as the tests pass. No need to ask.
- **Find the real cause.** Say why it broke in a sentence before fixing
  it. Fix the rule, not the case: no hard-coded exception for the place
  the owner tested.
- **Prune whole.** What goes is deleted everywhere (code, tests, help,
  proxy, data). No `off` flags, nothing kept "in case".

## 3. Shipping

- **`npm test`, then push straight to `main`** (`git push origin
  HEAD:main`). `main` deploys: GitHub Pages for the app, Cloudflare for
  the Worker. No PRs.
- **Check what a person would see:** if the change is visible, screenshot
  every page it touches at 320 and 390, light and dark, with real data
  (`node tools/preview.mjs --both`, `--webkit` when the bug is about
  Safari), and look at them. No wraps, cuts or sideways scrolling.
- **Tests for logic only:** money, data, ranking, planning and settling,
  where a bug is silent. None for layout or wording.
- **Commits:** one plain line of what a person sees, numbers when there
  are numbers.
- **Replies:** a few lines. What changed, what they'll notice, any product
  call you made, anything not checked.

## 4. Code structure

- **The kit** (`public/kit/`) is the logic the page and the Worker both
  run (pricing, settling, the catalogue) and the UI core. One copy: the
  Worker imports it as `#kit/…`, the page by relative paths.
- **One rule, one function**, used by every view that shows it, so
  screens (and the Worker) can't disagree.
- **UI from the kit** (`core.css`, `ui.mjs`: tab bar, sheets, segmented,
  lists, toasts, `ask` / `tell`). Draw your own only for what is truly the
  app's (a pitch, a map, a chart).
- **Ids never change with a name**: storage keys, cache names and the
  manifests' `id` survive renames.
- **Saved data:** a failed read is a failure, never "nothing there", and
  is never saved. Saved copies carry a version in their key (`longshot.slips.v1`);
  bump it when the meaning changes. Never save an older copy over a newer
  one.

## 5. Data, cost and safety

- **Cheap by design.** Cloudflare's $5 Workers plan and free tiers
  elsewhere.
- **Read on demand.** Nothing is prefetched that nobody opens. What
  doesn't change in a day comes from R2 (the board, built by the Worker's
  clock); the sports proxy is for what's live.
- **Jobs run on the Worker's clock** (a Durable Object alarm each minute,
  the even and odd minute crons as a backup). New Cron Triggers registered
  in October 2026 never ran.
- **Test against real data through the dev door,** not by signing in: the
  deployed Worker answers `Origin: http://localhost:<port>` with no pass.
- **Secrets** live only as GitHub or Cloudflare secrets, never in a repo.
- **The money:** only the Worker adds money (the opening NT$30,000 and
  NT$10,000 on the 1st of each month; nothing when a balance hits zero). Close any exploit with a test that tries it.
- **No hooks.** The owner found the app addictive: no push notices, loans,
  levels, streak rewards or anything that pulls people back.

## 6. Product principles

- **Chinese (Traditional, Taiwan) first**, in Taiwan's words; English
  second. Teams in Chinese (`kit/names.mjs`), people in their own names.
- **Native iOS look from the kit**, for a phone held upright at 375 px.
  Phones only: 320 px to a Pro Max's 440; an iPad or a computer shows the
  same phone layout in a centred column (core.css `--q-col-max`), with no
  tablet or wide layouts anywhere. No unplanned wrap, ellipsis or clipped edge on anything a row is *for*
  (a name, a score): lay it out for its longest real content. Nothing
  wider than the screen. Respect the safe areas.
- **Real data, no guessing.** A dash, not a made-up 0; 待定 when a time
  isn't set. Rules on real data decide what people see, not AI.
- **Taiwan-real.** Only what's real for a person in Taiwan: TV it can
  watch, its brokers' rules, its buses and trains.
- **Opens fast, never jumps.** Open on what the phone has and refresh
  behind it. The loading screen lifts once onto a finished screen, and
  nothing pops in after it. Live numbers fade in place. Offline, the board is covered
  (never old odds); 注單 opens on what it kept.
- **Less text.** No hints for what's obvious, no source names or back-end
  notes on screen. Automatic over buttons. Pictures for everything that
  has one (faces, logos, flags). Emoji only as standalone icons.
- **One question per tab.**

## 7. Docs

- **This file**, each repo's `CLAUDE.md` (a pointer here plus what's
  special to that repo), each repo's README (the short public front page: what it is, the link,
  the stack) and its MAP.md: a short map with what the
  app is, where the code is, how to run and test it, and the decisions
  still in force.
- Update a doc only when the change made it wrong. No handoffs, plans or
  logs: the git log is the history.
