// The slip, in numbers: one set of rules for the slip being made (投注單,
// its bar and the 下注 button: the same legs, sizes, stake, cost
// and problems in all three) and for a slip already bought (what it has
// locked in and can still pay, where each pick and the slip stand). Pure:
// the page (app.js, home.js) and the tests both use it.
import { slipErrors, slipSizes, comboCount, settleSlip, slipPayoutTable, combosBySize, SLIP_RULES } from './odds.mjs';
import { taipeiDayKey } from './sources.mjs';
import * as rules from './rules.mjs';

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

// Why a pick is sold only in a parlay of `n`+ games, or null: its game's (or
// market's) own 限關 when the kit knows one (play-rules.mjs eventMinLegs, 運彩's
// 投注規範 §21), else the house's price bands with the odds that put it there.
export function minLegsWhy(bet, odds = bet?.estOdds) {
  const n = bet?.minLegs ?? 1;
  if (!(n > 1)) return null;
  // 運彩's usual 限關, estimated (kit play-rules estimatedMinLegs): said as an estimate.
  if (bet.minLegsEst) return { from: 'est', n };
  const event = rules.eventMinLegs(bet);
  return event > 0 ? { from: 'event', n } : { from: 'odds', n, odds };
}

// What stops a ticket, as the Worker will judge it: singles are placed as one
// slip a pick (app.js placeButton), so each is checked on its own (its own
// minimum, maximum and cap; NT$50 on two singles is two NT$50 slips, not one
// of NT$100).
export function ticketErrors({ mode, legs, sizes, stake }) {
  const whole = slipErrors({ mode, legs, sizes, stake });
  if (mode !== 'single' || legs.length <= 1) return whole;
  const out = new Set(whole.filter(e => e === 'empty' || e === 'tooManyLegs'));
  for (const leg of legs) for (const e of slipErrors({ mode: 'single', legs: [leg], sizes: [1], stake })) out.add(e);
  return [...out];
}

// The slip being made: `bets` (the board's, at their odds now), the mode,
// the 過關組合 sizes chosen ('all' for 全過) and the stake per combination.
// A 台灣運彩 ticket is paid in full and pays its odds (no free bet, no boost).
export function slipQuote({ bets, mode, chosen = [], stake }) {
  const n = bets.length;
  const legs = bets.map(ruleLeg);
  const sizes = slipSizes(mode, n, [...chosen].map(k => (k === 'all' ? n : k)));
  const cost = comboCount(legs, sizes) * stake;
  const errors = n ? ticketErrors({ mode, legs, sizes, stake }) : ['empty'];
  return { n, mode, legs, sizes, stake, cost, errors };
}

// What the slip being made pays with every pick won: after tax and the cap.
// Singles are placed one slip a pick (app.js placeButton), so each is its own
// ticket: its own NT$20M cap and its own tax. What each pays when it wins.
export function singlesPays(quote) {
  return quote.legs.map(leg => slipPayoutTable({ legs: [leg], sizes: [1], stake: quote.stake }).net[1]);
}

export function quoteAllPays(quote) {
  if (!quote.sizes.length) return 0;
  if (quote.mode === 'single' && quote.n > 1) return singlesPays(quote).reduce((a, b) => a + b, 0);
  return slipPayoutTable({ legs: quote.legs, sizes: quote.sizes, stake: quote.stake }).net[(1 << quote.n) - 1];
}

// ---- A slip bought --------------------------------------------------------------

// 台灣運彩's void pick (投注規範 第 34 條): in a parlay its odds are 1 and it
// counts as passed; a slip with every pick void just has its stake refunded.
export const parlayOdds = slip => slip.legs.reduce((p, l) => p * (l.result === 'void' ? 1 : Number(l.odds) || 1), 1);
export const allVoid = slip => slip.legs.length > 0 && slip.legs.every(l => l.result === 'void');

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
// 'waiting'. Past its listed start, its game's outcome as read (settle.mjs)
// can say more: 'off', called off (postponed, cancelled, no result: void at
// odds 1 once settled, 台灣運彩 投注規範 第 32、34 條), or 'late', not begun
// yet (betting closed at the listed start all the same, 第 20 條).
export function legState(leg, now = Date.now(), outcome = null) {
  if (leg.result) return leg.result;
  if (!(leg.start && Date.parse(leg.start) <= now)) return 'waiting';
  if (outcome?.status === 'void') return 'off';
  if (outcome?.status === 'pending' && outcome.state === 'pre') return 'late';
  return 'live';
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
// `outcomeOf(legId)`: its game's outcome as read, if any (see legState).
export function slipGroupKey(slip, now = Date.now(), outcomeOf = () => null) {
  if (slip.recovered || !slip.legs.length) return 'recovered';
  if (slip.status === 'settled') return `day|${taipeiDayKey(slipEndedAt(slip))}`;
  if (slipRange(slip).most <= 0) return 'dead';
  return slip.legs.some(leg => legState(leg, now, outcomeOf(leg.id)) === 'live') ? 'live' : 'waiting';
}

// Takes picks off a slip ({ parlay: ids, pickedOdds: id -> odds when picked }),
// forgetting the odds they were picked at.
export function dropPicks({ parlay, pickedOdds }, ids) {
  const gone = new Set(ids);
  return { parlay: parlay.filter(id => !gone.has(id)), pickedOdds: Object.fromEntries(Object.entries(pickedOdds).filter(([id]) => !gone.has(id))) };
}

// The pay box's numbers for the slip being made (app.js payoutBox draws them):
// what it costs, what every pick won pays before and after tax, and the
// least any win pays. Singles are one ticket each, each with its own cap and tax.
export function payoutTotals({ legs, sizes, stake, mode }) {
  const n = legs.length;
  const combos = comboCount(legs, sizes);
  const bySize = combosBySize(legs);
  const cost = combos * stake;
  const table = slipPayoutTable({ legs, sizes, stake });
  const all = (1 << n) - 1;
  let least = Infinity;
  for (let won = 1; won < table.gross.length; won++) if (table.gross[won] > 0) least = Math.min(least, table.net[won]);
  const each = mode === 'single' ? singlesPays({ legs, stake }) : null;
  let allGross = table.gross[all];
  let allTaxed = table.net[all];
  if (each && n > 1) {
    allGross = legs.reduce((sum, l) => sum + Math.min(SLIP_RULES.maxPayout, stake * l.odds), 0);
    allTaxed = each.reduce((a, b) => a + b, 0);
    least = Math.min(...each);
  }
  return { n, combos, bySize, cost, each, allGross, allTaxed, allNet: allTaxed, least, taxed: allGross - allTaxed > 0.5 };
}
