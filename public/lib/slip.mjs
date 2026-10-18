// The slip, in numbers: one set of rules for the slip being made (投注單,
// its bar and the 下注 button: the same legs, sizes, stake, cost, free bet
// and problems in all three) and for a slip already bought (what it has
// locked in and can still pay, where each pick and the slip stand). Pure:
// the page (app.js, home.js) and the tests both use it.
import { slipErrors, slipSizes, comboCount, settleSlip, slipPayoutTable, combosBySize, boostRate, SLIP_RULES } from './odds.mjs';
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
// Singles are placed one slip a pick (app.js placeButton), so each is its own
// ticket: its own NT$20M cap and its own tax. What each pays when it wins.
export function singlesPays(quote) {
  return quote.legs.map(leg => slipPayoutTable({ legs: [leg], sizes: [1], stake: quote.stake }).net[1]);
}

export function quoteAllPays(quote) {
  if (!quote.sizes.length) return 0;
  if (quote.mode === 'single' && quote.n > 1) return singlesPays(quote).reduce((a, b) => a + b, 0);
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

// Takes picks off a slip ({ parlay: ids, pickedOdds: id -> odds when picked }),
// forgetting the odds they were picked at.
export function dropPicks({ parlay, pickedOdds }, ids) {
  const gone = new Set(ids);
  return { parlay: parlay.filter(id => !gone.has(id)), pickedOdds: Object.fromEntries(Object.entries(pickedOdds).filter(([id]) => !gone.has(id))) };
}

// The pay box's numbers for the slip being made (app.js payoutBox draws them):
// what it costs, what every pick won pays before and after tax (a free bet's
// stake not paid back off the after), the least any win pays, and what the
// boost adds. Singles are one ticket each, each with its own cap and tax.
export function payoutTotals({ legs, sizes, stake, mode, free = 0, boost = 1 }) {
  const n = legs.length;
  const combos = comboCount(legs, sizes);
  const bySize = combosBySize(legs);
  const cost = combos * stake - free;
  const x = mode === 'single' ? 0 : boost;
  const table = slipPayoutTable({ legs, sizes, stake, boost: x });
  const net = free ? table.net.map(v => Math.max(0, v - free)) : table.net;
  const all = (1 << n) - 1;
  let least = Infinity;
  for (let won = 1; won < table.gross.length; won++) if (table.gross[won] > 0) least = Math.min(least, net[won]);
  const each = mode === 'single' ? singlesPays({ legs, stake }) : null;
  let allGross = table.gross[all];
  let allTaxed = table.net[all];
  if (each && n > 1) {
    allGross = legs.reduce((sum, l) => sum + Math.min(SLIP_RULES.maxPayout, stake * l.odds), 0);
    allTaxed = each.reduce((a, b) => a + b, 0);
    least = Math.min(...each);
  }
  const allNet = free ? Math.max(0, allTaxed - free) : allTaxed;
  const rate = mode === 'single' ? 0 : boostRate(Math.max(...sizes, 0), boost);
  const boostMore = rate > 0 ? Math.max(0, Math.round(table.net[all] - slipPayoutTable({ legs, sizes, stake, boost: 0 }).net[all])) : 0;
  return { n, combos, bySize, cost, each, allGross, allTaxed, allNet, least, boostRate: rate, boostMore, taxed: allGross - allTaxed > 0.5 };
}
