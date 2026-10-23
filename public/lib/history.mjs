// The account card's numbers over the practice account's slips and tickets.
// Pure: the page and the tests both use it.
import { slipEndedAt } from './slip.mjs';

// The money riding on an open slip: what it cost.
export const slipAtStake = slip => Number(slip.cost) || 0;

// The account card's numbers, over everything played with the money:
// bets and lottery tickets alike. `open`: riding now (slips and tickets not
// drawn yet, a free bet at its stake); `won`: what the decided ones paid back (payouts, prizes);
// `net` and `back` over what's been decided only (a slip settled, a ticket
// drawn), losses as they are: null while nothing's decided, never a NT$0
// or 0% that only means "nothing yet". `spent`: what the decided ones cost.
export function accountRecord(account) {
  const slips = account?.slips || [];
  const tickets = account?.tickets || [];
  const openSlips = slips.filter(s => s.status === 'open');
  const openTickets = tickets.filter(x => x.status === 'open');
  const settledSlips = slips.filter(s => s.status === 'settled');
  const drawn = tickets.filter(x => x.status === 'settled');
  const spent = settledSlips.reduce((n, s) => n + (Number(s.cost) || 0), 0) + drawn.reduce((n, x) => n + (Number(x.cost) || 0), 0);
  const paid = settledSlips.reduce((n, s) => n + (Number(s.payout) || 0), 0) + drawn.reduce((n, x) => n + (Number(x.prize) || 0), 0);
  const decided = settledSlips.length + drawn.length;
  return {
    open: openSlips.reduce((n, s) => n + slipAtStake(s), 0) + openTickets.reduce((n, x) => n + (Number(x.cost) || 0), 0),
    openCount: openSlips.length + openTickets.length,
    // (What the decided ones paid: the same set as 已結算, 淨損益 and 回收率.)
    spent,
    won: paid,
    decided,
    net: decided ? paid - spent : null,
    back: spent > 0 ? (paid / spent) * 100 : null
  };
}


// 紀錄's months: what was decided in each Taiwan month (a slip by the day its
// last game was played, a ticket by its draw), newest last, the last `n`
// months up to `now` and back no further than the first one played.
// { key: 'YYYY-MM', spent, paid, net, n }; months with nothing decided are
// kept (an even row of bars), all zero.
const TAIPEI = 8 * 3_600_000;
export const monthKey = at => new Date(new Date(at).getTime() + TAIPEI).toISOString().slice(0, 7);
const ticketAt = x => x.draw?.at ?? x.settledAt ?? x.t;
export function slipMonth(slip) {
  return monthKey(slip.status === 'settled' ? slipEndedAt(slip) : slip.t);
}
export function monthsOf(account, { n = 6, now = Date.now() } = {}) {
  const decided = [
    ...(account?.slips || []).filter(s => s.status === 'settled').map(s => ({ key: slipMonth(s), spent: Number(s.cost) || 0, paid: Number(s.payout) || 0 })),
    ...(account?.tickets || []).filter(x => x.status === 'settled').map(x => ({ key: monthKey(ticketAt(x)), spent: Number(x.cost) || 0, paid: Number(x.prize) || 0 }))
  ];
  if (!decided.length) return [];
  const first = decided.reduce((m, x) => (x.key < m ? x.key : m), monthKey(now));
  const keys = [];
  let [y, m] = monthKey(now).split('-').map(Number);
  for (let i = 0; i < n; i++) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    if (key < first && keys.length >= 3) break;
    keys.unshift(key);
    [y, m] = m === 1 ? [y - 1, 12] : [y, m - 1];
  }
  return keys.map(key => {
    const in_ = decided.filter(x => x.key === key);
    const spent = in_.reduce((s, x) => s + x.spent, 0);
    const paid = in_.reduce((s, x) => s + x.paid, 0);
    return { key, spent, paid, net: paid - spent, n: in_.length };
  });
}
