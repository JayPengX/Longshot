// A ticket as the page shows it: each pick's chance before its game and now,
// whether it's decided, and the ticket's payout, state and worth. No DOM, so
// it's tested.
import { LEAGUES, voidAtOf, isSetSport } from './feed.mjs';
import { lateOutcome, decidedSoFar } from '../../kit/settle.mjs';
import { evaluate, settle, grade, canPay, decidedEarly } from './slip.mjs';
import { fitGame, pickChance, marketChance, leftOf, sportOf, chanceFromOdds, lotteryOdds } from './model.mjs';
import { isF1, isChamp, f1LegView, f1Guess } from './f1.mjs';
import { isExtra, gradeExtra, needsSummary } from './board.mjs';

// A league's sport, and how its games are timed and scored (model.mjs SPORT).
export const sportOfLeague = league => LEAGUES[league]?.sport;
export const specOf = league => sportOf(league, sportOfLeague(league));

// A game's model from its market (or the ticket's own picks on it).
export const modelFor = (game, legsOnGame = []) => fitGame(game.league, sportOfLeague(game.league), game.market, legsOnGame);

// A game void for good: called off, or put off, stopped or never started and
// still so when read after its time was up (applyGames, the kit's
// lateOutcome: 台灣運彩 投注規範 32-33). Never from a copy read before then:
// the game may have been played since. { sofar }: the score so far
// ({ awayScore, homeScore }, or null), which still decides a pick it already
// has (an over past its line).
export function calledOff(g) {
  return g?.state === 'void' ? { sofar: g.score ? { awayScore: g.score.away, homeScore: g.score.home } : null } : null;
}
// Read after its time, still put off, stopped or not started: void now.
function lapsed(g, now) {
  // (The championship waits for its standings to count the last race.)
  if ((g.state !== 'pre' && !g.off) || isChamp(g)) return false;
  const sofar = g.score ? { awayScore: g.score.away, homeScore: g.score.home } : {};
  return lateOutcome({ sport: g.league, start: g.sched ?? g.start }, { status: 'pending', state: g.state, postponed: g.off === 'postponed', suspended: g.off === 'suspended', ...sofar }, new Date(now)).status === 'void';
}

// A game is over for good: final with its score, or void (calledOff).
export const gameOver = g => (g?.state === 'post' && Boolean(isF1(g) ? g.order?.length : g.score)) || Boolean(calledOff(g));

const CERTAIN = { won: { win: 1, push: 0 }, void: { win: 0, push: 1 }, lost: { win: 0, push: 0 } };

// One pick on a ticket (`legs`: the ticket's picks, for its game's model when
// the market has none): { result ('won', 'lost', 'void' once its game is
// over), pre and now (its chances { win, push } before the game and now),
// live, held (its game put off or stopped, waiting: 'postponed',
// 'suspended'), ahead (how it stands on the score now), estimated (no market
// priced it: its odds less the lottery's cut) }.
export function legView(leg, legs = [leg]) {
  const g = leg.game;
  if (isF1(g)) return f1LegView(leg);
  if (isExtra(leg)) return extraLegView(leg);
  const model = modelFor(g, legs.filter(l => l.game.id === g.id));
  // Before the game: the market's price for this pick, else the model's
  // where the market priced the game, else the ticket's own odds less the
  // lottery's cut (an estimate, said so).
  const priced = marketChance(leg, g.market);
  const pre = priced ?? (model.from === 'market' ? pickChance(leg, model) : { win: chanceFromOdds(leg.odds, leg.kind === 'ml' && sportOfLeague(g.league) === 'soccer'), push: 0 });
  let result = null;
  const off = calledOff(g);
  if (off) result = (off.sofar && decidedSoFar({ kind: leg.kind, side: leg.side, line: leg.line }, off.sofar)) || 'void';
  else if (g.state === 'post' && g.score) result = grade(leg, g.score.home, g.score.away);
  const held = !result && g.off ? g.off : null;
  let now = pre;
  let ahead = null;
  let early = null;
  if (result) now = CERTAIN[result];
  else if (g.state === 'in' && g.score) {
    early = decidedEarly(leg, g.score.home, g.score.away);
    now = early ? CERTAIN[early] : pickChance(leg, model, g.score, leftOf(specOf(g.league), g));
    ahead = grade(leg, g.score.home, g.score.away);
  }
  return { result, early, pre, now, live: g.state === 'in' && !held, held, ahead, estimated: !priced && model.from !== 'market' };
}

// One of the lottery's other bets (board.mjs: 半場, 波膽…): before the game
// the chance the board priced it at when it was added (else its odds less
// the cut, an estimate); decided once its part of the game is played.
function extraLegView(leg) {
  const g = leg.game;
  const priced = marketChance(leg, g.market);
  const pre = priced ?? (leg.fair > 0 ? { win: leg.fair, push: 0 } : { win: chanceFromOdds(leg.odds), push: 0 });
  const result = gradeExtra(leg);
  const held = !result && g.off ? g.off : null;
  const decided = g.state === 'post' || g.state === 'void';
  return { result: decided ? result : null, early: decided ? null : result, pre, now: result ? CERTAIN[result] : pre, live: g.state === 'in' && !held, held, ahead: null, estimated: !priced && !(leg.fair > 0) };
}

// A ticket: { legs (each leg's view, with `leg`), pre and now (evaluate's
// numbers before the games and now), done, paid (settle's, once done),
// status ('pre', 'live', 'held': every pick left waits on a game put off or
// stopped, 'part': some decided, 'won', 'lost', 'refund': every pick void,
// the stake back), estimated }.
// It's over once every pick is decided, or the moment no combination it
// bought can pay any more (a parlay with a pick lost): the lottery's ticket
// is lost then.
export function slipView(slip) {
  const legs = slip.legs.map(l => ({ leg: l, ...legView(l, slip.legs) }));
  const { sizes, stake } = slip;
  const withGame = slip.legs.map(l => ({ ...l, gameId: l.game.id }));
  const pre = evaluate({ legs: withGame.map((l, i) => ({ ...l, chance: legs[i].pre })), sizes, stake });
  const now = evaluate({ legs: withGame.map((l, i) => ({ ...l, chance: legs[i].now })), sizes, stake });
  const decided = legs.every(x => x.result);
  const done = decided || !canPay({ legs: withGame.map((l, i) => ({ ...l, result: legs[i].result || legs[i].early })), sizes });
  const paid = decided ? settle({ legs: withGame.map((l, i) => ({ ...l, result: legs[i].result })), sizes, stake }) : done ? { gross: 0, net: 0, taxed: 0 } : null;
  const refund = decided && legs.every(x => x.result === 'void');
  const status = done ? (refund ? 'refund' : paid.gross > 0 ? 'won' : 'lost') : legs.some(x => x.live) ? 'live' : legs.every(x => x.result || x.held) ? 'held' : legs.some(x => x.result) ? 'part' : 'pre';
  return { legs, pre, now, done, paid, status, estimated: legs.some(x => x.estimated) };
}

// When a ticket's first game starts (ISO): of those not put off or stopped, while there are any.
export const earliest = slip => {
  const on = slip.legs.filter(l => !l.game.off);
  return (on.length ? on : slip.legs).map(l => l.game.start).sort()[0];
};

// The picks still worth reading: those of tickets not over (`viewOf(slip)`:
// its slipView), on games not over for good, or over and still waiting on
// their summary (corners, touchdowns, who scored first: two days at most).
export const openLegs = (slips, viewOf = slipView, now = Date.now()) =>
  slips
    .filter(s => !viewOf(s).done)
    .flatMap(s => s.legs)
    .filter(l => !gameOver(l.game) || (l.game.state === 'post' && needsSummary(l) && now - Date.parse(l.game.start) < 2 * 86_400_000));

// How soon to read again (ms), or null for not at all: every 15 s while an
// ESPN game or F1 race of an open ticket is on or about to start (10
// minutes before), a minute for the Asian leagues alone (they cost the proxy); else 10
// minutes before the next one starts (a game put off or stopped: when its
// time is up, then read until it settles), between 30 s and 30 minutes from now.
export const NEAR = 10 * 60_000;
export const isNear = (leg, now = Date.now()) => (leg.game.off ? now >= voidAtOf(leg.game) : leg.game.state === 'in' || Date.parse(leg.game.start) - now < NEAR);
export function nextRead(legs, now = Date.now()) {
  if (!legs.length) return null;
  // A game over, its summary still to come: every 5 minutes.
  const over = legs.filter(l => l.game.state === 'post');
  if (over.length === legs.length) return 5 * 60_000;
  legs = legs.filter(l => l.game.state !== 'post');
  const on = legs.filter(l => isNear(l, now));
  if (on.length) return on.some(l => LEAGUES[l.game.league]?.data !== 'asia') ? 15_000 : 60_000;
  const wait = l => (l.game.off ? voidAtOf(l.game) - now : Date.parse(l.game.start) - now - NEAR);
  return Math.min(over.length ? 5 * 60_000 : 30 * 60_000, Math.max(30_000, Math.min(...legs.map(wait))));
}

// The picks' games read again: each leg's game replaced by its fresh copy
// (the closing line kept once the market's lines go at the start), void when
// it's read past its time unplayed (`now`: when it was read). True when
// anything changed.
export function applyGames(slips, fresh, now = Date.now()) {
  let changed = false;
  for (const s of slips)
    for (const l of s.legs) {
      const g = fresh[l.game.id];
      if (!g) continue;
      // A game put off or moved keeps the start it had (its time runs from it).
      const sched = l.game.sched ?? (g.off || g.id !== l.game.id ? l.game.start : null);
      const next = { ...g, market: g.market || l.game.market, ...(sched ? { sched } : {}) };
      // What its summary added once it was over (corners, touchdowns…) stays.
      if (!next.extras && l.game.extras) next.extras = l.game.extras;
      if (lapsed(next, now)) next.state = 'void';
      if (JSON.stringify(next) !== JSON.stringify(l.game)) (l.game = next), (changed = true);
      // An estimated F1 price (odds left blank) as it stood before the start: its grid once known.
      if (l.est && l.kind === 'f1' && !isChamp(next)) {
        const o = f1Guess(next, l.driver);
        if (o > 1 && o !== l.odds) (l.odds = o), (changed = true);
      }
    }
  return changed;
}

// ---- Blank odds (估) priced again ------------------------------------------------

// A blank pick's estimate as the pick sheet makes it (odds left empty, marked
// 估): the market's chance where it prices the pick, else the model fitted to
// the market, at the lottery's cut. Null where there's none.
export function guessOdds(leg, market) {
  const sport = sportOfLeague(leg.game.league);
  const c = marketChance(leg, market) ?? pickChance(leg, fitGame(leg.game.league, sport, market, []));
  if (!(c?.win > 0)) return null;
  return Math.round(lotteryOdds(c.win + c.push / 2, (sport === 'soccer' || sport === 'hockey') && leg.kind === 'ml') * 100) / 100;
}

// A 更多 pick's option on the kit's board for its game (`sections`: board.mjs
// sectionsFor): the same kind, side and what settles it. Null where it's gone.
const OPTION_KEYS = ['side', 'lo', 'hi', 'score', 'listed', 'team', 'ht', 'ft', 'period', 'line', 'inning'];
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
export const optionOf = (leg, sections) => sections.flatMap(s => s.options).find(o => o.leg.kind === leg.kind && OPTION_KEYS.every(k => same(o.leg[k], leg[k]))) ?? null;

// Picks left blank (估) on games now over, priced again once as a new one is
// (the closing lines from its summary), so a ticket added before the
// estimate got better pays what it says now; marked `closing` when done.
// `closing(game)`: its closing market or null (feed.mjs closingMarket);
// `sectionsOf(game)`: its board's sections (for 更多 picks). True when
// anything changed. (F1's are priced on their grid: applyGames.)
export async function repriceBlank(slips, { closing, sectionsOf }) {
  const legs = slips.flatMap(s => s.legs).filter(l => l.est && !l.closing && l.game?.state === 'post' && !isF1(l.game) && !isSetSport(l.game.league));
  let changed = false;
  await Promise.all(
    legs.map(async l => {
      const market = await closing(l.game).catch(() => null);
      if (!market) return;
      let odds = null;
      let fair = null;
      if (isExtra(l)) {
        const o = optionOf(l, (await sectionsOf({ ...l.game, market }).catch(() => null)) || []);
        if (!o) return;
        (odds = o.est > 1 ? o.est : null), (fair = o.leg.fair ?? null);
      } else odds = guessOdds(l, market);
      if (!l.game.market) l.game.market = market;
      if (odds > 1 && odds !== l.odds) l.odds = odds;
      if (fair > 0) l.fair = fair;
      l.closing = true;
      changed = true;
    })
  );
  return changed;
}
