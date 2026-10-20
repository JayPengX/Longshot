// The account card's numbers over the practice account's slips and tickets.
// Pure: the page and the tests both use it.

// The money riding on an open slip: what it cost, and a free bet's whole
// stake (its cost is nothing: "NT$0 · 1 張" said nothing was in play).
export const slipAtStake = slip => (slip.free ? Number(slip.stake ?? slip.freeValue) || 0 : Number(slip.cost) || 0);

// The account card's four numbers, over everything played with the money:
// bets and lottery tickets alike. `open`: riding now (slips and tickets not
// drawn yet, a free bet at its stake); `won`: everything paid back (payouts, cash-outs, prizes);
// `net` and `back` over what's been decided only (a slip settled, a ticket
// drawn), losses as they are: null while nothing's decided, never a NT$0
// or 0% that only means "nothing yet" (a lottery prize won counted in
// 累計中獎 while 淨損益 stayed NT$0 and 回收率 — for good).
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
  const won = (account?.ledger || []).filter(e => e.kind === 'payout' || e.kind === 'cashout' || e.kind === 'prize' || e.kind === 'plusboost').reduce((n, e) => n + Math.max(0, e.amount), 0);
  return {
    open: openSlips.reduce((n, s) => n + slipAtStake(s), 0) + openTickets.reduce((n, x) => n + (Number(x.cost) || 0), 0),
    openCount: openSlips.length + openTickets.length,
    won,
    decided,
    net: decided ? paid - spent : null,
    back: spent > 0 ? (paid / spent) * 100 : null
  };
}

