// A Taiwan Sports Lottery (台灣運彩) ticket: its rules, what it pays for
// every way its picks can land, and how a pick is graded from a score.
// The rules are Longshot's, from the kit (play-odds.mjs: 1-12 games a
// ticket, NT$10 units a combination, NT$100-100,000 a ticket, at most NT$20
// million paid a ticket; two picks of one game never in one combination).
// Here: the payout walk, exact in whole NT$ as the lottery's 投注規範 has it
// (each prize rounded half up to the NT$; 20% income tax, in whole NT$,
// withheld only where one NT$10 單注 pays over NT$5,000), that also counts a
// pick that may be void (a whole line landing exactly), and grading.
import { SLIP_RULES, choose, clashMasks, combosBySize, comboCount, slipSizes, slipErrors as kitSlipErrors } from '../../kit/play-odds.mjs';
import { BASE_CUT } from '../../kit/play-rules.mjs';
import { isSoccer } from '../../kit/play-teams.mjs';

export { SLIP_RULES, choose, clashMasks, combosBySize, comboCount, slipSizes };

// The lottery's overround (implied chances added up), measured on its
// two-way board (Play, 81 markets, 2026-09-25), and on three-way markets.
export const CUT = { twoWay: BASE_CUT.twoWay, threeWay: BASE_CUT.threeWay };

// A new ticket's or pick's id: its prefix, the time and a little chance.
export const newId = prefix => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const clashes = (pick, masks) => masks.some((m, i) => pick & (1 << i) && pick & m);

// The ticket's name as the lottery prints it: 單場, 3串1, 3串4…
export function modeName(mode, legs, sizes, en = false) {
  const n = legs.length;
  if (mode === 'single') return en ? (n > 1 ? `Singles ×${n}` : 'Single') : n > 1 ? `單場 ×${n}` : '單場';
  const combos = comboCount(legs, sizes);
  return en ? `${n} legs · ${combos} bet${combos > 1 ? 's' : ''}` : `${n}串${combos}`;
}

// What's wrong with a ticket, as codes the page turns into words: the kit's
// (Play's) rules, and a price a ticket can't have (odds of 1 or less), once.
export function slipErrors(ticket) {
  const errors = kitSlipErrors(ticket);
  // A 組合 of 過1關 alone is just 單場 (the kit's 組合 takes 過1關 to 過12關,
  // 2 games or more: 2串3, 4串15).
  if (ticket.mode === 'system' && ticket.sizes.length && ticket.sizes.every(k => k === 1)) errors.push('noSizes');
  if (ticket.legs.length && ticket.legs.some(l => !(l.odds > 1)) && !errors.includes('odds')) errors.push('odds');
  return errors;
}

// ---- Exact money -------------------------------------------------------------
// Odds are kept in hundredths (1.85 → 185) and every sum in whole NT$, so no
// float drift: a product past 2^53 goes to BigInt.
const hundredths = odds => Math.round(odds * 100) || 0;
const SAFE = Number.MAX_SAFE_INTEGER;
// n / d rounded half up (n, d ≥ 0 BigInt), as a Number.
const roundDiv = (n, d) => Number(n / d + ((n % d) * 2n >= d ? 1n : 0n));
// One combination (the legs in `pick`, at `mult` hundredths, `k` of them):
// the stake × the odds' product rounded to the NT$ (each prize 四捨五入至元),
// and whether one NT$10 of it pays over NT$5,000 once rounded so (taxed, the
// kit's slipTaxed).
function comboPay(stake, pick, mult, n, k, product) {
  const scale = 100 ** k;
  if (stake * product <= SAFE && scale <= SAFE) {
    const v = stake * product;
    const half = (x, d) => Math.floor(x / d) + ((x % d) * 2 >= d ? 1 : 0);
    return { pay: half(v, scale), taxed: half(SLIP_RULES.unit * product, scale) > SLIP_RULES.taxFree };
  }
  let big = 1n;
  for (let i = 0; i < n; i++) if (pick & (1 << i)) big *= BigInt(mult[i]);
  const bigScale = 100n ** BigInt(k);
  return { pay: roundDiv(BigInt(stake) * big, bigScale), taxed: roundDiv(BigInt(SLIP_RULES.unit) * big, bigScale) > SLIP_RULES.taxFree };
}
// Gross and after-tax pay in whole NT$ (and how many combinations were
// taxed, each its 20% rounded to the NT$, as Play's kit settles) when the legs in `paid` count, each at
// `mult[i]` hundredths (its odds when it won, 100 when it was voided: the
// lottery counts a void at 1.00, so a single gets its stake back and a parlay
// goes on without it). Over NT$20 million the ticket pays that, its tax
// scaled with it.
function pays(paid, mult, sizeSet, masks, stake, n) {
  let gross = 0;
  let tax = 0;
  let taxed = 0;
  for (let pick = paid; pick > 0; pick = (pick - 1) & paid) {
    if (clashes(pick, masks)) continue;
    let size = 0;
    let product = 1;
    for (let i = 0; i < n; i++) if (pick & (1 << i)) (size++, (product *= mult[i]));
    if (!sizeSet.has(size)) continue;
    const c = comboPay(stake, pick, mult, n, size, product);
    gross += c.pay;
    if (c.taxed) (tax += Math.round(c.pay * SLIP_RULES.taxRate)), taxed++;
  }
  const capped = Math.min(gross, SLIP_RULES.maxPayout);
  const income = capped < gross ? roundDiv(BigInt(tax) * BigInt(capped), BigInt(gross)) : tax;
  return { gross: capped, net: capped - income, taxed };
}
// The legs not lost, as a mask.
const notLost = legs => legs.reduce((m, l, i) => (l.result === 'lost' ? m : m | (1 << i)), 0);

// Everything about a ticket over every way its legs can land. Each leg has
// `odds` and its chances `{ win, push }` (the rest is a loss); a decided leg
// has chance 1 of what happened. Legs of different games are independent.
//   cost, combos; best (all win, gross and net); expected gross and net;
//   any (chance of any payout), profit (chance of more back than paid);
//   take (the lottery's share of each NT$ on average), tax, back (after tax).
export function evaluate({ legs, sizes, stake }) {
  const n = legs.length;
  const sizeSet = new Set(sizes);
  const masks = clashMasks(legs);
  const combos = comboCount(legs, sizes);
  const cost = combos * stake;
  const mult = new Array(n).fill(100);
  let gross = 0;
  let net = 0;
  let any = 0;
  let profit = 0;
  // Each leg: won (its odds), void (1) or lost (out of every combination),
  // each branch carrying its chance down the walk.
  const walk = (i, paid, p) => {
    if (p <= 0) return;
    if (i === n) {
      const r = pays(paid, mult, sizeSet, masks, stake, n);
      gross += p * r.gross;
      net += p * r.net;
      if (r.gross > 0) any += p;
      if (r.net > cost) profit += p;
      return;
    }
    const { win = 0, push = 0 } = legs[i].chance || {};
    mult[i] = hundredths(legs[i].odds);
    walk(i + 1, paid | (1 << i), p * win);
    if (push > 0) {
      mult[i] = 100;
      walk(i + 1, paid | (1 << i), p * push);
    }
    walk(i + 1, paid, p * Math.max(0, 1 - win - push));
  };
  walk(0, 0, 1);
  legs.forEach((l, i) => (mult[i] = hundredths(l.odds)));
  const best = pays((1 << n) - 1, mult, sizeSet, masks, stake, n);
  return {
    combos,
    cost,
    best,
    gross,
    net,
    any,
    profit,
    take: cost > 0 ? 1 - gross / cost : 0,
    tax: cost > 0 ? (gross - net) / cost : 0,
    back: cost > 0 ? net / cost : 0
  };
}

// What a finished ticket pays: each leg 'won', 'lost' or 'void'.
export function settle({ legs, sizes, stake }) {
  const mult = legs.map(l => (l.result === 'void' ? 100 : hundredths(l.odds)));
  return pays(notLost(legs), mult, new Set(sizes), clashMasks(legs), stake, legs.length);
}

// Whether some combination the ticket bought has no lost pick (each leg's
// `result` 'won', 'lost', 'void', or not decided yet): a ticket that can't
// is lost, its other games whatever they do.
export function canPay({ legs, sizes }) {
  return pays(notLost(legs), legs.map(() => 100), new Set(sizes), clashMasks(legs), SLIP_RULES.unit, legs.length).gross > 0;
}

// ---- Grading a pick ----------------------------------------------------------

// The pick's markets, as the lottery names them.
export const KINDS = {
  ml: '不讓分',
  spread: '讓分',
  total: '大小',
  oddeven: '單雙'
};
export const KINDS_EN = { ml: 'Moneyline', spread: 'Spread', total: 'Total', oddeven: 'Odd/even' };

// The leagues whose games can end level with no draw on sale: Asian
// baseball (extra innings capped). A 不讓分 pick on a tie there is void, the
// stake back at odds 1, as 台灣運彩's rules say (the owner's call, 2026-10-18).
const TIES_VOID = new Set(['cpbl', 'npb', 'kbo']);

// 'won', 'lost' or 'void' for a pick on a final score (Play's legResult):
// a spread's `line` is the picked side's (湖人 -4.5); a whole line landing
// exactly is void (the stake back), as is a game called off.
export function grade(leg, home, away) {
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
  const win = test => (test ? 'won' : 'lost');
  const push = diff => (diff === 0 ? 'void' : win(diff > 0));
  switch (leg.kind) {
    case 'ml':
      if (home === away && leg.side !== 'draw' && TIES_VOID.has(leg.game?.league)) return 'void';
      return win(leg.side === 'draw' ? away === home : leg.side === 'away' ? away > home : home > away);
    case 'spread': {
      // Soccer's 讓分 on a whole goal is three ways at 台灣運彩: landing on
      // the line is 讓分和 (a draw pick, its `line` the home side's), never a
      // refund, so either team's pick loses it.
      if (isSoccer(leg.game?.league) && Number.isInteger(leg.line)) {
        const d = leg.side === 'draw' ? home + leg.line - away : leg.side === 'away' ? away + leg.line - home : home + leg.line - away;
        return win(leg.side === 'draw' ? d === 0 : d > 0);
      }
      if (leg.side === 'draw') return null;
      return push(leg.side === 'away' ? away + leg.line - home : home + leg.line - away);
    }
    case 'total':
      return push(leg.side === 'over' ? away + home - leg.line : leg.line - away - home);
    case 'oddeven':
      return win((away + home) % 2 === (leg.side === 'odd' ? 1 : 0));
    default:
      return null;
  }
}

// A pick the score already decides while the game is on (scores only go
// up): a total gone past its line is over for good. Null for the rest.
export function decidedEarly(leg, home, away) {
  if (leg.kind !== 'total' || !Number.isFinite(home) || !Number.isFinite(away) || !(home + away > leg.line)) return null;
  return leg.side === 'over' ? 'won' : 'lost';
}
