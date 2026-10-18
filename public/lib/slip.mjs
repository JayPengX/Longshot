// The slip, in numbers: one set of rules for the slip being made (投注單,
// its bar and the 下注 button: the same legs, sizes, stake, cost, free bet
// and problems in all three) and for a slip already bought (what it has
// locked in and can still pay, where each pick and the slip stand). Pure:
// the page (app.js, home.js) and the tests both use it.
import { slipErrors, slipSizes, comboCount, settleSlip, slipPayoutTable } from './odds.mjs';
import { freeOddsOk } from './account.mjs';
import { taipeiDayKey } from './sources.mjs';

// A board's bet as the ticket rules read it (odds.mjs slipErrors, the
// Worker's price.js checkSlip): its game, market, odds and the house's own
// limits on it (locked, parlay-only, a capped ticket).
export const ruleLeg = bet => ({
  gameId: bet.gameId,
  market: bet.market ?? bet.kind,
  odds: bet.estOdds,
  fairChance: bet.fairChance,
  minLegs: bet.minLegs ?? 1,
  lock: bet.lock ?? null,
  cap: bet.cap ?? null
});

// What stops a ticket, as the Worker will judge it: singles are placed as one
// slip a pick (app.js placeButton), so each is checked on its own (its own
// minimum, maximum and cap; NT$50 on two singles is two NT$50 slips, not one
// of NT$100); a free bet's stake isn't held to the stake unit or the minimum
// (the token's value is its stake).
export function ticketErrors({ mode, legs, sizes, stake, free = false }) {
  const keep = e => !(free && (e === 'stakeUnit' || e === 'ticketMin'));
  const whole = slipErrors({ mode, legs, sizes, stake });
  if (mode !== 'single' || legs.length <= 1) return whole.filter(keep);
  const out = new Set(whole.filter(e => e === 'empty' || e === 'tooManyLegs'));
  for (const leg of legs) for (const e of slipErrors({ mode: 'single', legs: [leg], sizes: [1], stake })) out.add(e);
  return [...out].filter(keep);
}

// The slip being made: `bets` (the board's, at their odds now), the mode,
// the 過關組合 sizes chosen ('all' for 全過), the stake per combination, the
// free bet chosen (or null) and the parlay boost's multiplier.
// A free bet takes one single or one parlay whose odds together are long
// enough; its stake is the usual one, never below the free bet, and only the
// rest is paid from the balance.
export function slipQuote({ bets, mode, chosen = [], stake, free = null, boost = 1 }) {
  const n = bets.length;
  const legs = bets.map(ruleLeg);
  const sizes = slipSizes(mode, n, [...chosen].map(k => (k === 'all' ? n : k)));
  const freeShape = Boolean(free) && (mode === 'parlay' || (mode === 'single' && n === 1));
  const freeOn = freeShape && freeOddsOk(legs);
  const at = freeOn ? Math.max(free.value, stake) : stake;
  const cost = freeOn ? at - free.value : comboCount(legs, sizes) * at;
  const errors = n ? ticketErrors({ mode, legs, sizes, stake: at, free: freeOn }) : ['empty'];
  return { n, mode, legs, sizes, stake: at, cost, freeShape, freeOn, free: freeOn ? free : null, freePart: freeOn ? free.value : 0, boost: mode === 'single' ? 0 : boost, errors };
}

// What the slip being made pays with every pick won: after tax and the cap,
// the boost in, the free bet's own stake out.
export function quoteAllPays(quote) {
  if (!quote.sizes.length) return 0;
  const table = slipPayoutTable({ legs: quote.legs, sizes: quote.sizes, stake: quote.stake, boost: quote.boost });
  return Math.max(0, table.net[(1 << quote.n) - 1] - quote.freePart);
}

// ---- A slip bought --------------------------------------------------------------

// What an open slip has locked in (every undecided pick lost) and the most it
// can still pay (every undecided pick won). A free bet pays its winnings
// only, not the stake.
export function slipRange(slip) {
  const as = result => slip.legs.map(leg => ({ gameId: leg.gameId, odds: leg.odds, result: leg.result ?? result }));
  const less = x => (slip.free ? Math.max(0, x - (slip.freeValue ?? slip.stake)) : x);
  const net = result => settleSlip({ legs: as(result), sizes: slip.sizes, stake: slip.stake, boost: slip.boost ?? 0 }).net;
  return { locked: less(net('lost')), most: less(net('won')) };
}

// The most a list of open slips can still pay.
export const slipsMost = slips => slips.reduce((n, s) => n + Math.max(0, slipRange(s).most), 0);

// Where a pick stands: won / lost / void, 'live' (its game has started) or
// 'waiting'.
export function legState(leg, now = Date.now()) {
  if (leg.result) return leg.result;
  return leg.start && Date.parse(leg.start) <= now ? 'live' : 'waiting';
}

// When a settled slip's last game was played: the day it's filed under, not
// the day it happened to be settled (an F1 result days after the race, a
// slip settled when the app was next opened).
export function slipEndedAt(slip) {
  const last = slip.legs.map(leg => leg.start || '').filter(Boolean).sort().at(-1);
  if (last && slip.settledAt && last < slip.settledAt) return last;
  return slip.settledAt ?? slip.t;
}

// 紀錄's group for a slip: 'live' (a game on), 'waiting', 'dead' (open, but
// nothing left can pay: a parlay with a pick lost), 'recovered' (no picks),
// or `day|YYYY-MM-DD` (settled, by the Taiwan day its last game was played).
export function slipGroupKey(slip, now = Date.now()) {
  if (slip.recovered || !slip.legs.length) return 'recovered';
  if (slip.status === 'settled') return `day|${taipeiDayKey(slipEndedAt(slip))}`;
  if (slipRange(slip).most <= 0) return 'dead';
  return slip.legs.some(leg => legState(leg, now) === 'live') ? 'live' : 'waiting';
}
