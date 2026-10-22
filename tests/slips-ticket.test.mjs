// A ticket as the page shows it: each pick's chances, decided or not, and the ticket's state.
import test from 'node:test';
import assert from 'node:assert/strict';
import { legView, slipView, openLegs, nextRead, isNear, applyGames, gameOver, earliest, specOf, repriceBlank, guessOdds, optionOf } from '../public/slips/lib/ticket.mjs';
import { SPORT } from '../public/slips/lib/model.mjs';

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
const team = (en, zh) => ({ en, zh, short: zh, abbr: '', logo: '' });
let n = 0;
const game = (extra = {}) => ({ id: `nba:${++n}`, league: 'nba', start: '2036-10-18T00:00:00Z', home: team('Boston Celtics', '塞爾提克'), away: team('New York Knicks', '尼克'), state: 'pre', score: null, period: 0, clock: '', detail: '', market: null, ...extra });
const leg = (game, kind = 'ml', side = 'home', odds = 1.8, line) => ({ id: `l${++n}`, game, kind, side, odds, ...(line != null ? { line } : {}) });
const ticket = (legs, mode = 'parlay', sizes = [legs.length], stake = 100) => ({ id: `s${++n}`, created: '2026-10-17T00:00:00Z', mode, sizes, stake, legs });

test('a pick before its game: the market where it prices it, else its odds less the cut (said to be an estimate)', () => {
  const g = game({ market: { win: { home: 0.6, away: 0.4 } } });
  const v = legView(leg(g));
  assert.deepEqual(v.pre, { win: 0.6, push: 0 });
  assert.equal(v.estimated, false);
  assert.equal(v.result, null);
  const e = legView(leg(game(), 'ml', 'home', 1.8));
  near(e.pre.win, 1 / (1.8 * 1.158));
  assert.equal(e.estimated, true);
  // Soccer's 不讓分 has three ways: the bigger cut.
  near(legView(leg(game({ league: 'epl' }), 'ml', 'home', 2.4)).pre.win, 1 / (2.4 * 1.2));
});

test('a pick graded on the final: won, lost, void (a whole line exactly, or a game called off)', () => {
  const final = game({ state: 'post', score: { home: 101, away: 98 } });
  assert.equal(legView(leg(final, 'ml', 'home')).result, 'won');
  assert.deepEqual(legView(leg(final, 'ml', 'home')).now, { win: 1, push: 0 });
  assert.equal(legView(leg(final, 'spread', 'home', 1.9, -3)).result, 'void');
  assert.deepEqual(legView(leg(final, 'spread', 'home', 1.9, -3)).now, { win: 0, push: 1 });
  assert.equal(legView(leg(final, 'total', 'over', 1.9, 200.5)).result, 'lost');
  assert.equal(legView(leg(game({ state: 'void' }))).result, 'void');
  // A final with no score yet isn't graded (nor over: it's read again).
  const bare = game({ state: 'post', score: null });
  assert.equal(legView(leg(bare)).result, null);
  assert.equal(gameOver(bare), false);
  assert.equal(gameOver(game({ state: 'void' })), true);
});

test('a pick in play: how it stands, its chance from the score and the time left', () => {
  const g = game({ state: 'in', period: 4, clock: '0:30', score: { home: 110, away: 90 }, market: { spread: { line: -2, home: 0.5 } } });
  const v = legView(leg(g, 'ml', 'home'));
  assert.equal(v.live, true);
  assert.equal(v.ahead, 'won');
  assert.ok(v.now.win > 0.999);
  // Under a total already passed is lost for good; the over won.
  const t = game({ state: 'in', period: 3, clock: '5:00', score: { home: 120, away: 110 } });
  assert.deepEqual(legView(leg(t, 'total', 'under', 1.9, 220.5)).now, { win: 0, push: 0 });
  assert.equal(legView(leg(t, 'total', 'under', 1.9, 220.5)).early, 'lost');
  assert.deepEqual(legView(leg(t, 'total', 'over', 1.9, 220.5)).now, { win: 1, push: 0 });
  // On, but no score yet: the pregame chance.
  const noScore = game({ state: 'in', market: { win: { home: 0.55, away: 0.45 } } });
  assert.deepEqual(legView(leg(noScore)).now, { win: 0.55, push: 0 });
});

test('a parlay is lost the moment a pick loses, its other games whatever they do', () => {
  const lost = game({ state: 'post', score: { home: 90, away: 100 } });
  const v = slipView(ticket([leg(lost, 'ml', 'home'), leg(game())]));
  assert.equal(v.done, true);
  assert.equal(v.status, 'lost');
  assert.deepEqual(v.paid, { gross: 0, net: 0, taxed: 0 });
  // …and lost early by a total passed in play.
  const t = game({ state: 'in', period: 3, clock: '5:00', score: { home: 120, away: 110 } });
  assert.equal(slipView(ticket([leg(t, 'total', 'under', 1.9, 220.5), leg(game())])).status, 'lost');
});

test('a pick far behind late is still on: over only when no combination can pay', () => {
  // (Before, a chance under 1e-9 by the model closed the ticket with its game still on.)
  const g = game({ state: 'in', period: 4, clock: '1:00', score: { home: 80, away: 120 }, market: { spread: { line: 0, home: 0.5 } } });
  const v = slipView(ticket([leg(g, 'spread', 'home', 1.9, -30.5), leg(game())]));
  assert.equal(v.done, false);
  assert.equal(v.status, 'live');
  assert.equal(v.paid, null);
});

test('3串4 with one pick lost still pays its 2串1; a ticket all void pays the stake back', () => {
  const win = () => game({ state: 'post', score: { home: 100, away: 90 } });
  const lose = game({ state: 'post', score: { home: 80, away: 90 } });
  const v = slipView(ticket([leg(win(), 'ml', 'home', 2), leg(win(), 'ml', 'home', 3), leg(lose, 'ml', 'home', 4)], 'system', [2, 3]));
  assert.equal(v.done, true);
  assert.equal(v.status, 'won');
  assert.equal(v.pre.cost, 400);
  assert.equal(v.paid.gross, 600);
  const off = slipView(ticket([leg(game({ state: 'void' })), leg(game({ state: 'void' }))], 'parlay', [2]));
  assert.equal(off.paid.gross, 100);
});

test('statuses: to come, on, part decided', () => {
  assert.equal(slipView(ticket([leg(game())], 'single', [1])).status, 'pre');
  assert.equal(slipView(ticket([leg(game({ state: 'in', score: { home: 1, away: 0 } })), leg(game())])).status, 'live');
  const won = game({ state: 'post', score: { home: 100, away: 90 } });
  assert.equal(slipView(ticket([leg(won), leg(game())])).status, 'part');
});

test('what to read: open tickets, games not over; how soon', () => {
  const now = Date.parse('2026-10-18T00:00:00Z');
  const later = game({ start: '2026-10-18T05:00:00Z' });
  const over = game({ state: 'post', score: { home: 1, away: 2 } });
  const s1 = ticket([leg(later), leg(over, 'ml', 'away')]);
  const s2 = ticket([leg(over, 'ml', 'home'), leg(game())]);
  assert.deepEqual(openLegs([s1, s2]).map(l => l.game.id), [later.id]);
  assert.equal(nextRead([], now), null);
  // The next game in 5 hours: read 10 minutes before it, at most every 30 minutes.
  assert.equal(nextRead(openLegs([s1]), now), 30 * 60_000);
  assert.equal(nextRead([leg(game({ start: '2026-10-18T00:20:00Z' }))], now), 10 * 60_000);
  assert.equal(nextRead([leg(game({ start: '2026-10-18T00:10:20Z' }))], now), 30_000);
  // On: ESPN's every 15 s, Asia's every minute.
  assert.equal(nextRead([leg(game({ state: 'in' }))], now), 15_000);
  assert.equal(nextRead([leg(game({ state: 'in', league: 'cpbl' }))], now), 60_000);
});

test("a game read again replaces each pick's copy; the closing line stays once the market's go", () => {
  const g = game({ market: { win: { home: 0.6, away: 0.4 } } });
  const a = leg(g);
  const b = leg(g, 'total', 'over', 1.9, 220.5);
  const s = [ticket([a]), ticket([b])];
  const fresh = { [g.id]: { ...g, state: 'in', score: { home: 2, away: 0 }, market: null } };
  assert.equal(applyGames(s, fresh), true);
  assert.equal(a.game.state, 'in');
  assert.deepEqual(b.game.market, g.market);
  assert.equal(applyGames(s, fresh), false, 'nothing new: nothing changed');
  assert.equal(applyGames(s, {}), false);
});

test("a ticket's first game; a league's timing", () => {
  assert.equal(earliest(ticket([leg(game({ start: '2026-10-19T00:00:00Z' })), leg(game({ start: '2026-10-18T03:00:00Z' }))])), '2026-10-18T03:00:00Z');
  assert.equal(specOf('epl'), SPORT.soccer);
  assert.equal(specOf('cpbl'), SPORT.cpbl);
  assert.equal(specOf('nope'), SPORT.nba);
});

test('every pick void: the ticket is a refund (退款), its stake back; one void among wins still pays as won', () => {
  const off = () => game({ state: 'void' });
  const v = slipView(ticket([leg(off()), leg(off())]));
  assert.equal(v.status, 'refund');
  assert.equal(v.paid.gross, 100);
  const won = game({ state: 'post', score: { home: 101, away: 98 } });
  assert.equal(slipView(ticket([leg(off()), leg(won, 'ml', 'home')])).status, 'won');
});

// Put off, stopped, called off: as 台灣運彩 (投注規範 32-33) and Play's settling (the kit's) rule it.
const mlb = (extra = {}) => game({ league: 'mlb', start: '2026-10-18T23:05:00Z', home: team('Los Angeles Dodgers', '道奇'), away: team('San Diego Padres', '教士'), ...extra });
// 16:05 in Los Angeles on the 18th: its day ends at local midnight, 07:00 UTC on the 19th.
const T = iso => Date.parse(iso);

// A pick's game as read at `at` (applyGames: void when its time is up unplayed).
const readAt = (l, at) => (applyGames([ticket([l])], { [l.game.id]: { ...l.game } }, at), l);

test('a stopped game waits, not refunded; finished before its time, it settles on the real score', () => {
  const stopped = mlb({ state: 'in', off: 'suspended', score: { home: 3, away: 2 }, period: 6 });
  const l = readAt(leg(stopped, 'ml', 'home'), T('2026-10-19T06:00:00Z'));
  const v = legView(l);
  assert.deepEqual([v.result, v.held, v.live], [null, 'suspended', false]);
  assert.equal(slipView(ticket([l], 'single', [1])).status, 'held');
  assert.equal(gameOver(l.game), false);
  assert.equal(isNear(l, T('2026-10-19T06:00:00Z')), false, 'not read again till its time is up');
  const finished = mlb({ state: 'post', score: { home: 3, away: 5 } });
  assert.equal(legView(leg(finished, 'ml', 'home')).result, 'lost');
});

test('a stopped game read past its time: void, but a pick the score already decided keeps its result', () => {
  const stopped = () => mlb({ state: 'in', off: 'suspended', score: { home: 5, away: 4 }, period: 7 });
  const at = T('2026-10-19T07:01:00Z');
  assert.equal(legView(readAt(leg(stopped(), 'total', 'over', 1.9, 8.5), at)).result, 'won');
  assert.equal(legView(readAt(leg(stopped(), 'total', 'under', 1.9, 8.5), at)).result, 'lost');
  assert.equal(legView(readAt(leg(stopped(), 'total', 'over', 1.9, 9.5), at)).result, 'void');
  const l = readAt(leg(stopped(), 'ml', 'home'), at);
  assert.equal(legView(l).result, 'void');
  assert.equal(gameOver(l.game), true);
});

test('a put-off baseball game is void once its local day ends (the league\'s time zone), not before', () => {
  const l = leg(mlb({ off: 'postponed' }), 'ml', 'home');
  const s = ticket([l], 'single', [1]);
  readAt(l, T('2026-10-19T06:59:00Z'));
  assert.equal(slipView(s).status, 'held');
  readAt(l, T('2026-10-19T07:01:00Z'));
  assert.equal(slipView(s).status, 'refund');
  // Elsewhere 48 hours from the start; and a ticket's time to read again is when that's up.
  const soccer = () => leg(game({ league: 'epl', start: '2026-10-18T14:00:00Z', off: 'postponed' }));
  assert.equal(legView(readAt(soccer(), T('2026-10-20T13:59:00Z'))).result, null);
  assert.equal(legView(readAt(soccer(), T('2026-10-20T14:01:00Z'))).result, 'void');
  assert.equal(nextRead([soccer()], T('2026-10-20T13:50:00Z')), 10 * 60_000);
});

test('called off: void at once', () => {
  const s = ticket([leg(mlb({ state: 'void' }), 'ml', 'home')], 'single', [1]);
  assert.equal(slipView(s).status, 'refund');
});

test('a put-off game played again in its time is found and kept with its first start; the time still runs from that', async () => {
  const { refresh, useReader } = await import('../public/slips/lib/feed.mjs');
  const ev = (id, date, name, state, completed = false) => ({ id, date, competitions: [{ date, competitors: [{ homeAway: 'home', score: '4', team: { displayName: 'Los Angeles Dodgers' } }, { homeAway: 'away', score: '1', team: { displayName: 'San Diego Padres' } }], status: { type: { name, state, completed } } }] });
  const boards = {
    20261018: { events: [ev('1', '2026-10-18T23:05Z', 'STATUS_POSTPONED', 'post')] },
    20261019: { events: [ev('2', '2026-10-19T02:10Z', 'STATUS_FINAL', 'post', true)] }
  };
  useReader(async url => boards[/dates=(\d+)/.exec(url)[1]] ?? { events: [] });
  const l = leg(mlb({ id: 'mlb:1' }), 'ml', 'home');
  assert.equal(applyGames([ticket([l])], await refresh([l], T('2026-10-19T05:00:00Z')), T('2026-10-19T05:00:00Z')), true);
  assert.deepEqual([l.game.id, l.game.state, l.game.sched], ['mlb:2', 'post', '2026-10-18T23:05:00Z']);
  assert.equal(legView(l).result, 'won');
  // Played again after its day ended: not this game; it stays put off, then void.
  boards[20261019] = { events: [ev('3', '2026-10-19T08:00Z', 'STATUS_FINAL', 'post', true)] };
  const late = leg(mlb({ id: 'mlb:1' }), 'ml', 'home');
  applyGames([ticket([late])], await refresh([late], T('2026-10-19T09:00:00Z')), T('2026-10-19T09:00:00Z'));
  assert.deepEqual([late.game.id, late.game.off, late.game.sched, late.game.state], ['mlb:1', 'postponed', '2026-10-18T23:05:00Z', 'void']);
  assert.equal(legView(late).result, 'void');
  useReader(null);
});

test('a stopped game kept from before its time is read again once it is up, and settles on that reading: finished in time, its real score', () => {
  // Last read while stopped, looked at long after its day: it may have been finished since.
  const was = mlb({ start: '2020-10-18T23:05:00Z', state: 'in', off: 'suspended', score: { home: 3, away: 2 }, period: 6 });
  const l = leg(was, 'ml', 'home');
  const s = ticket([l], 'single', [1]);
  assert.equal(slipView(s).status, 'held');
  assert.equal(isNear(l), true, 'its time is up: read again');
  assert.deepEqual(openLegs([s]).map(x => x.id), [l.id]);
  applyGames([s], { [was.id]: { ...was, state: 'post', off: undefined, score: { home: 5, away: 4 } } });
  assert.equal(slipView(s).status, 'won');
});

test('a put-off game moved by ESPN to a later day under the same event, played in its time, is found; one gone from every board past its time is void', async () => {
  const { refresh, useReader } = await import('../public/slips/lib/feed.mjs');
  const ev = (id, date, name, state, completed = false) => ({ id, date, competitions: [{ date, competitors: [{ homeAway: 'home', score: '2', team: { displayName: 'Arsenal' } }, { homeAway: 'away', score: '1', team: { displayName: 'Chelsea' } }], status: { type: { name, state, completed } } }] });
  const boards = { 20261019: { events: [ev('7', '2026-10-19T19:00Z', 'STATUS_FULL_TIME', 'post', true)] } };
  useReader(async url => boards[/dates=(\d+)/.exec(url)[1]] ?? { events: [] });
  const epl = () => game({ id: 'epl:7', league: 'epl', start: '2026-10-18T14:00:00Z', home: team('Arsenal', '兵工廠'), away: team('Chelsea', '切爾西'), off: 'postponed' });
  const l = leg(epl(), 'ml', 'home');
  const at = T('2026-10-19T21:00:00Z');
  applyGames([ticket([l])], await refresh([l], at), at);
  assert.deepEqual([l.game.state, l.game.score, l.game.sched], ['post', { home: 2, away: 1 }, '2026-10-18T14:00:00Z']);
  assert.equal(legView(l).result, 'won');
  // Gone from every board and its 48 hours up: void, not waiting for ever.
  delete boards[20261019];
  const gone = leg(epl(), 'ml', 'home');
  const s = ticket([gone], 'single', [1]);
  const late = T('2026-10-20T15:00:00Z');
  applyGames([s], await refresh([gone], late), late);
  assert.equal(slipView(s).status, 'refund');
  useReader(null);
});

test('a blank (估) pick on a game over: priced again once on its closing lines, its ticket paying the new estimate', async () => {
  const final = game({ state: 'post', score: { home: 101, away: 98 } });
  const blank = { ...leg(final, 'ml', 'home', 1.62), est: true };
  const typed = leg(final, 'ml', 'away', 2.2);
  const s = ticket([blank], 'single', [1]);
  const t = ticket([typed], 'single', [1]);
  const market = { win: { home: 0.7, away: 0.3 } };
  let reads = 0;
  const closing = async () => (reads++, market);
  assert.equal(await repriceBlank([s, t], { closing, sectionsOf: async () => [] }), true);
  assert.equal(blank.odds, guessOdds(blank, market));
  assert.ok(blank.odds > 1 && blank.odds < 1.43, String(blank.odds));
  assert.equal(blank.closing, true);
  assert.deepEqual(blank.game.market, market);
  // Odds typed are the ticket's own: never touched; nor read again once done.
  assert.equal(typed.odds, 2.2);
  assert.equal(await repriceBlank([s, t], { closing, sectionsOf: async () => [] }), false);
  assert.equal(reads, 1);
  assert.equal(slipView(s).paid.gross, Math.floor(100 * blank.odds));
  // No closing lines to be had: left as it was, tried again next time.
  const other = { ...leg(game({ state: 'post', score: { home: 1, away: 0 } }), 'ml', 'home', 1.8), est: true };
  assert.equal(await repriceBlank([ticket([other], 'single', [1])], { closing: async () => null, sectionsOf: async () => [] }), false);
  assert.equal(other.odds, 1.8);
  assert.equal(other.closing, undefined);
  // A game not over yet waits.
  const later = { ...leg(game(), 'ml', 'home', 1.8), est: true };
  assert.equal(await repriceBlank([ticket([later], 'single', [1])], { closing, sectionsOf: async () => [] }), false);
});

test('a blank 更多 pick priced again on its own option of the board', async () => {
  const final = game({ state: 'post', score: { home: 101, away: 98 } });
  const blank = { ...leg(final, 'q1total', 'over', 1.7, 55.5), period: 1, est: true };
  const sections = [{ kind: 'q1total', options: [{ leg: { kind: 'q1total', side: 'under', line: 55.5, period: 1, fair: 0.45 }, est: 2.0 }, { leg: { kind: 'q1total', side: 'over', line: 55.5, period: 1, fair: 0.55 }, est: 1.55 }] }];
  assert.equal(optionOf(blank, sections).est, 1.55);
  await repriceBlank([ticket([blank], 'single', [1])], { closing: async () => ({ win: { home: 0.6, away: 0.4 } }), sectionsOf: async () => sections });
  assert.equal(blank.odds, 1.55);
  assert.equal(blank.fair, 0.55);
});
