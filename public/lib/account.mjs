// Play's account: play money only, on the Longshot Pass (its money is the
// pass's wallet: the Worker pays the opening money and each month's deposit). It
// buys slips and lottery tickets through the Worker (settled.mjs), which
// settles them and pays into the wallet; this keeps them and their ledger.
//
// The balance is never stored: it's the sum of a ledger of entries with fixed
// ids ('stake-<slip>', 'payout-<slip>', 'refund-<slip>', 'lotto-<id>',
// 'prize-<id>'), so two devices' copies merge by taking the union, and
// nothing counts twice.
import { mergeTickets } from './lottery.mjs';

// A new account: an empty ledger (the money is the wallet's).
export function newAccount(now = new Date()) {
  const t = now.toISOString();
  return { v: 1, created: t, updated: t, ledger: [], slips: [] };
}

export function balance(account) {
  return account.ledger.reduce((sum, entry) => sum + entry.amount, 0);
}

function touched(account, now) {
  return { ...account, updated: now.toISOString() };
}

export function newSlipId(now = new Date()) {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return `${now.getTime().toString(36)}${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`;
}

// A pick as saved: empty fields left out, so years of slips stay small.
export function compactLeg(leg) {
  return Object.fromEntries(Object.entries(leg).filter(([key, v]) => v != null || key === 'result'));
}

// Buys a slip: { id, mode, sizes, stake, cost, legs }. The cost comes off the
// balance at once. `extra`: the wallet's money beyond this account's own
// ledger (the opening money and the monthly deposits), spendable here too.
// Returns { account } or { error: 'funds' }.
export function placeSlip(account, slip, now = new Date(), { extra = 0 } = {}) {
  if (!(slip.cost > 0) || slip.cost > balance(account) + extra) return { error: 'funds' };
  const t = now.toISOString();
  const saved = { ...slip, t, status: 'open', legs: slip.legs.map(leg => compactLeg({ ...leg, result: null })) };
  const entry = { id: `stake-${slip.id}`, t, kind: 'stake', amount: -slip.cost, slipId: slip.id };
  return { account: touched({ ...account, ledger: [...account.ledger, entry], slips: [saved, ...account.slips] }, now) };
}

// The pick rules and slip settling: kit/settle.mjs, one copy for the app
// and the Worker.
export { topInning, legResult, applyResults } from '../kit/settle.mjs';

// Two copies of one account (this device's and the synced one) as one: every
// ledger entry and slip from either, a settled slip over an open one, and
// leg results known on either side.
export function mergeAccounts(a, b) {
  if (!a) return b;
  if (!b) return a;
  const ledger = new Map();
  for (const entry of [...a.ledger, ...b.ledger]) if (!ledger.has(entry.id)) ledger.set(entry.id, entry);
  const slips = new Map();
  for (const slip of [...a.slips, ...b.slips]) {
    const other = slips.get(slip.id);
    if (!other) slips.set(slip.id, slip);
    // A slip recovered from the wallet (no picks) gives way to the real one.
    else if (other.recovered || slip.recovered) {
      if (other.recovered && !slip.recovered) slips.set(slip.id, slip);
    } else if (other.status !== 'settled' && slip.status === 'settled') slips.set(slip.id, slip);
    else if (other.status !== 'settled') slips.set(slip.id, { ...other, legs: other.legs.map((leg, i) => ({ ...leg, result: leg.result ?? slip.legs[i]?.result ?? null, ...(leg.final ?? slip.legs[i]?.final ? { final: leg.final ?? slip.legs[i]?.final } : {}) })) });
  }
  const out = {
    v: 1,
    created: a.created < b.created ? a.created : b.created,
    updated: a.updated > b.updated ? a.updated : b.updated,
    ledger: [...ledger.values()].sort((x, y) => x.t.localeCompare(y.t)),
    slips: [...slips.values()].sort((x, y) => y.t.localeCompare(x.t))
  };
  // Lottery tickets (lottery.mjs): a settled copy wins over an open one.
  if (a.tickets || b.tickets) out.tickets = mergeTickets(a.tickets, b.tickets);
  return out;
}

// The ledger as the wallet's entries.
export function poolEntries(account) {
  return account.ledger.map(e => ({ id: `odds:${e.id}`, t: Date.parse(e.t), app: 'odds', kind: e.kind, amount: e.amount }));
}

// What the government withheld from this account's winnings, whole NT$:
// 運彩's 20% income tax on a big combination (a settled slip's prize before
// tax less after; a free bet's stake, never paid back, isn't tax), and the
// lottery's and scratch cards' 20% tax and 0.4% stamp duty on a prize over
// NT$5,000 (a settled ticket's gross less what it paid). Totals from the
// whole history, never sums of what was counted before.
export function taxPaid(account) {
  let sports = 0;
  for (const slip of account?.slips || []) {
    if (slip.status !== 'settled' || !(slip.gross > 0)) continue;
    const back = slip.payout + (slip.free && slip.payout > 0 ? (slip.freeValue ?? slip.stake) : 0);
    sports += Math.max(0, slip.gross - back);
  }
  let lottery = 0;
  for (const x of account?.tickets || []) if (x.status === 'settled' && x.gross > 0) lottery += Math.max(0, x.gross - (x.prize || 0));
  return { sports: Math.round(sports), lottery: Math.round(lottery) };
}

// What the pass's wallet still records of this account that the account
// itself lost (every ledger entry goes to the wallet as `odds:<id>`, and the
// wallet never drops one): the missing ledger entries come back as they
// were, and each bet with no slip left comes back as a slip with its cost,
// time and payout but no picks (`recovered: true`).
export function recoverFromWallet(account, wallet) {
  // (An entry that can't be dated or counted is no money to bring back.)
  const mine = (wallet?.entries || []).filter(e => e?.app === 'odds' && typeof e.id === 'string' && e.id.startsWith('odds:') && Number.isFinite(e.amount) && Number.isFinite(new Date(e.t).getTime()));
  const have = new Set(account.ledger.map(e => e.id));
  const ledger = [];
  for (const e of mine) {
    const id = e.id.slice(5);
    if (have.has(id)) continue;
    const entry = { id, t: new Date(e.t).toISOString(), kind: e.kind, amount: e.amount };
    const slipId = /^(?:stake|payout|refund)-(.+)$/.exec(id)?.[1];
    if (slipId) entry.slipId = slipId;
    ledger.push(entry);
  }
  const all = [...account.ledger, ...ledger];
  const slipIds = new Set(account.slips.map(s => s.id));
  const paid = new Map(all.filter(e => e.kind === 'payout' && e.slipId).map(e => [e.slipId, e]));
  const refunds = new Set(all.filter(e => e.kind === 'refund' && e.slipId).map(e => e.slipId));
  const slips = [];
  for (const e of all) {
    if (e.kind !== 'stake' || !e.slipId || slipIds.has(e.slipId)) continue;
    const payout = paid.get(e.slipId);
    const cost = -e.amount;
    const refunded = !payout && refunds.has(e.slipId);
    slips.push({ id: e.slipId, t: e.t, mode: 'single', sizes: [1], stake: cost, cost, legs: [], status: 'settled', payout: payout ? payout.amount : refunded ? cost : 0, settledAt: payout ? payout.t : e.t, recovered: true, ...(refunded ? { refunded: true } : {}) });
  }
  // A recovered slip the Worker has paid since (it held the real slip and
  // settled it): it shows what it paid, not the nothing it showed before.
  const kept = account.slips.map(s => {
    if (!s.recovered || s.refunded || !paid.has(s.id)) return s;
    const payout = paid.get(s.id).amount;
    return s.payout === payout ? s : { ...s, payout, settledAt: paid.get(s.id).t };
  });
  if (!ledger.length && !slips.length && kept.every((s, i) => s === account.slips[i])) return account;
  return {
    ...account,
    ledger: all.sort((x, y) => x.t.localeCompare(y.t)),
    slips: [...kept, ...slips].sort((x, y) => y.t.localeCompare(x.t))
  };
}

// Whether a stored value looks like an account (from storage or the sync).
export function isAccount(value) {
  return Boolean(value && value.v === 1 && Array.isArray(value.ledger) && Array.isArray(value.slips) && typeof value.created === 'string');
}
