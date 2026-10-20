// Play's account: play money only, on the Quadra Pass (its money is the
// pass's one pool; Quadra pays the opening money and the monthly pay). It
// buys slips and lottery tickets through the Worker (settled.mjs), which
// settles them and pays into the pool; this keeps them and their ledger.
//
// The balance is never stored: it's the sum of a ledger of entries with fixed
// ids ('start' and 'grant-<Monday>' on older accounts, 'stake-<slip>',
// 'payout-<slip>', 'plus-<slip>', 'refund-<slip>', 'fb-<token>',
// 'lotto-<id>', 'prize-<id>'), so two devices' copies merge by taking the
// union, and nothing counts twice.
import { mergeTickets, ticketPrize } from './lottery.mjs';
import { settleSlip, prizeAfterTax } from './odds.mjs';

// What Play itself gave before Quadra paid into the pool (a pass made since
// gets its opening money from Quadra; Play's own weekly grants, 'grant-<week>'
// entries on older accounts, ended with the week of 2026-09-28).
export const START_BALANCE = 10_000;

// start: false for an account funded by the Quadra pool alone.
export function newAccount(now = new Date(), { start = true } = {}) {
  const t = now.toISOString();
  return { v: 1, created: t, updated: t, ledger: start ? [{ id: 'start', t, kind: 'start', amount: START_BALANCE }] : [], slips: [] };
}

// A new account for a pass: Play's own opening money only for a pass whose
// wallet is known and has none of Quadra's ('eco:start'). Every pass made
// since the Quadra pool opens with Quadra's; a wallet not read yet (offline,
// signing in) is never taken for one without it (Play's NT$10,000 'start'
// went into the ledger then, money the pool never had).
export function accountFor(wallet, now = new Date()) {
  const known = Array.isArray(wallet?.entries);
  return newAccount(now, { start: known && !wallet.entries.some(e => e.id === 'eco:start') });
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

// Every saved pick compacted (older accounts saved empty fields too).
export function compactAccount(account) {
  return { ...account, slips: account.slips.map(slip => ({ ...slip, legs: slip.legs.map(compactLeg) })) };
}

// Buys a slip: { id, mode, sizes, stake, cost, legs }. The cost comes off the
// balance at once. `extra`: money in the shared Quadra pool beyond this
// account's own ledger (Securities' cash, the pay), spendable here too.
// Returns { account } or { error: 'funds' }.
export function placeSlip(account, slip, now = new Date(), { extra = 0 } = {}) {
  if (!(slip.cost > 0) || slip.cost > balance(account) + extra) return { error: 'funds' };
  const t = now.toISOString();
  const saved = { ...slip, t, status: 'open', legs: slip.legs.map(leg => compactLeg({ ...leg, result: null })) };
  const entry = { id: `stake-${slip.id}`, t, kind: 'stake', amount: -slip.cost, slipId: slip.id };
  return { account: touched({ ...account, ledger: [...account.ledger, entry], slips: [saved, ...account.slips] }, now) };
}

// Buys a slip with a free bet (the welcome offer or a weekly bonus bet issued earlier, kit freeBets): the token's
// value is (part of) the stake; only a top-up beyond it comes off the
// balance, and the token is marked spent ('fb-<token id>', so the same token
// is never staked twice). Winning pays all but the free part's stake
// (applyResults): a top-up's stake comes back as usual.
// Like a sportsbook's free bet terms: odds of FREE_MIN_ODDS or longer (no
// near-certain bet) — a single's pick, a parlay's odds all together (a
// recommended parlay with a 1.43 in it still qualifies) — and never cashed
// out early.
export const FREE_MIN_ODDS = 1.5;
export const freeOddsOk = legs => legs.length > 0 && legs.reduce((x, l) => x * Number(l.odds), 1) >= FREE_MIN_ODDS - 1e-9;
export function placeFreeSlip(account, slip, token, now = new Date(), { extra = 0 } = {}) {
  if (!token?.id || !(token.value > 0) || account.ledger.some(e => e.id === `fb-${token.id}`)) return { error: 'token' };
  if (!freeOddsOk(slip.legs || [])) return { error: 'freeOdds' };
  // More than the free bet on it: the rest from the balance (the free bet
  // a cut off the stake).
  const cash = Math.max(0, Math.round((Number(slip.stake) || 0) - token.value));
  if (cash > 0 && cash > balance(account) + extra) return { error: 'funds' };
  const t = now.toISOString();
  const saved = { ...slip, stake: token.value + cash, cost: cash, free: token.id, freeValue: token.value, t, status: 'open', legs: slip.legs.map(leg => compactLeg({ ...leg, result: null })) };
  const entries = [
    { id: `stake-${slip.id}`, t, kind: 'stake', amount: -cash, slipId: slip.id },
    { id: `fb-${token.id}`, t, kind: 'freebet', amount: 0, slipId: slip.id }
  ];
  return { account: touched({ ...account, ledger: [...account.ledger, ...entries], slips: [saved, ...account.slips] }, now) };
}

// The pick rules and slip settling: the shared kit's (settle.mjs), one copy
// for Play and the Worker.
export { topInning, legResult, applyResults } from '#kit/settle.mjs';

// Cashes out an open slip for `amount` (cashout.mjs prices it): settled at
// once, paid in as its payout (`payout-<slip>`, so a result coming in later
// on another device can never pay it twice). Picks not yet decided stay
// undecided.
export function cashOut(account, slipId, amount, now = new Date()) {
  const slip = account.slips.find(s => s.id === slipId);
  if (!slip || slip.status !== 'open' || slip.recovered || slip.free || !(amount > 0)) return account;
  const t = now.toISOString();
  // Paid already (the Worker's cash out, come back from the wallet): the slip
  // shows what it paid, nothing paid again.
  const paid = account.ledger.find(e => e.id === `payout-${slip.id}`);
  if (paid && paid.kind !== 'cashout') return account;
  const payout = paid ? paid.amount : Math.floor(amount);
  const updated = { ...slip, status: 'settled', settledAt: t, cashedOut: true, gross: payout, payout };
  const ledger = paid ? account.ledger : [...account.ledger, { id: `payout-${slip.id}`, t, kind: 'cashout', amount: payout, slipId: slip.id }];
  return touched({ ...account, ledger, slips: account.slips.map(s => (s.id === slipId ? updated : s)) }, now);
}

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

// Another, separate account folded into this one (the Quadra merge tool):
// both accounts' money and slips, kept apart where their fixed ids ('start',
// 'grant-<Monday>') would collide.
export function mergeDistinct(a, b) {
  if (!a) return b;
  if (!b) return a;
  const tag = `m${Date.parse(b.created).toString(36)}`;
  const have = new Set(a.ledger.map(e => e.id));
  const ledger = b.ledger.map(e => (have.has(e.id) && !/^(stake|payout|refund|plus)-/.test(e.id) ? { ...e, id: `${e.id}-${tag}` } : e));
  return mergeAccounts(a, { ...b, created: a.created, ledger });
}

// The ledger as the shared pool's entries.
export function poolEntries(account) {
  return account.ledger.map(e => ({ id: `odds:${e.id}`, t: Date.parse(e.t), app: 'odds', kind: e.kind, amount: e.amount }));
}

// What the government withheld from this account's winnings, whole NT$ (sent
// in the wallet's `snap.odds.gov` for the Quadra Pass's 真相 › 政府): 運彩's
// 20% income tax on a big combination (a settled slip's prize before tax
// less after; a free bet's stake, never paid back, isn't tax), and the
// lottery's and scratch cards' 20% tax and 0.4% stamp duty on a prize over
// NT$5,000 (a settled ticket's gross less what it paid).
//
// All time, from the whole history: a slip or ticket settled before `gross`
// was kept has its tax worked out again from its picks' results (a slip) or
// its draw (a ticket), the same way it was settled. Totals, never sums of
// what was sent before, so a sync can't count anything twice.
export function taxPaid(account) {
  let sports = 0;
  for (const slip of account?.slips || []) {
    if (slip.status !== 'settled') continue;
    if (slip.gross > 0) {
      const back = slip.payout + (slip.free && slip.payout > 0 ? (slip.freeValue ?? slip.stake) : 0);
      sports += Math.max(0, slip.gross - back);
    } else if (slip.gross == null && !slip.cashedOut && slip.payout > 0) sports += slipTaxAgain(slip);
  }
  let lottery = 0;
  for (const x of account?.tickets || []) {
    if (x.status !== 'settled') continue;
    if (x.gross > 0) lottery += Math.max(0, x.gross - (x.prize || 0));
    else if (x.gross == null && x.prize > 0) lottery += ticketTaxAgain(x);
  }
  // The sports tax back charged on payouts from before it went to the whole
  // slip (the Worker's `odds:tax-<slip>` entries).
  // (A slip that took it in counts it above, as its gross less its payout.)
  const took = new Set((account?.slips || []).filter(x => x.backTax).map(x => x.id));
  for (const e of account?.ledger || []) if (e.kind === 'tax' && e.amount < 0 && !took.has(e.slipId)) sports -= e.amount;
  return { sports: Math.round(sports), lottery: Math.round(lottery) };
}
// An older slip's tax: its payout table again, before tax less after.
function slipTaxAgain(slip) {
  try {
    if (!slip.legs?.length || !slip.sizes?.length || !(slip.stake > 0) || slip.legs.some(l => !l.result || !(l.odds > 0))) return 0;
    const r = settleSlip({ legs: slip.legs, sizes: slip.sizes, stake: slip.stake, boost: slip.boost ?? 0 });
    // Only when the rule gives back what the slip was paid (one paid before
    // the tax went to the whole slip owes its back charge, counted apart).
    return r.taxed > 0 && r.gross > r.net && Math.abs(r.net - slip.payout) < 1 ? r.gross - r.net : 0;
  } catch {
    return 0;
  }
}
// An older ticket's tax: a drawn one's prizes again from its draw, each bet
// taxed on its own; a scratch card's from its prize when that is before tax.
function ticketTaxAgain(ticket) {
  try {
    if (ticket.card) return 0;
    if (!ticket.drawn) return 0;
    const r = ticketPrize(ticket, ticket.drawn);
    if (!r || r.pending || !r.wins?.length) return 0;
    const m = ticket.multiple || 1;
    const gross = m * r.wins.reduce((s, w) => s + w.n * w.prize, 0);
    const net = m * r.wins.reduce((s, w) => s + w.n * prizeAfterTax(w.prize), 0);
    // Only when the draw gives back what the ticket was paid.
    return Math.abs(net - ticket.prize) < 1 ? gross - net : 0;
  } catch {
    return 0;
  }
}

// The account's settled money by market, for the admin page's totals (sent
// in the wallet's `snap.odds.pl`): each settled slip's net under its sport
// ('mixed' across sports, 'other' with no picks left), lottery draws and
// scratch cards each their own; money on open slips and tickets isn't in yet.
export function resultByMarket(account) {
  const slips = new Map(account.slips.map(x => [x.id, x]));
  const tickets = new Map((account.tickets || []).map(x => [x.id, x]));
  const out = {};
  for (const e of account.ledger) {
    let key = null;
    const slipId = e.slipId || /^(?:stake|payout|refund|plus|tax)-(.+)$/.exec(e.id)?.[1];
    if (['stake', 'payout', 'cashout', 'refund', 'plusboost', 'tax'].includes(e.kind) && slipId) {
      const slip = slips.get(slipId);
      if (slip?.status !== 'settled') continue;
      const sports = new Set(slip.legs.map(l => l.sport).filter(Boolean));
      key = sports.size === 1 ? [...sports][0] : sports.size ? 'mixed' : 'other';
    } else if (e.kind === 'lottery' || e.kind === 'prize') {
      const ticket = tickets.get(e.id.replace(/^(?:lotto|prize)-/, ''));
      if (ticket?.status === 'open') continue;
      key = String(ticket?.game || '').startsWith('scratch:') ? 'scratch' : 'lottery';
    } else continue;
    out[key] = (out[key] || 0) + e.amount;
  }
  for (const k of Object.keys(out)) out[k] = Math.round(out[k]);
  return out;
}

// What the pass's wallet still records of this account that the account
// itself lost (every ledger entry goes to the wallet as `odds:<id>`, and the
// wallet never drops one): the missing ledger entries come back as they
// were, and each bet with no slip left comes back as a recovered slip with
// its cost, time and payout but no picks (`recovered: true`).
export function recoverFromWallet(account, wallet) {
  // (An entry that can't be dated or counted is no money to bring back: one
  // malformed entry stopped every sync with a RangeError.)
  const mine = (wallet?.entries || []).filter(e => e?.app === 'odds' && typeof e.id === 'string' && e.id.startsWith('odds:') && Number.isFinite(e.amount) && Number.isFinite(new Date(e.t).getTime()));
  const have = new Set(account.ledger.map(e => e.id));
  const ledger = [];
  for (const e of mine) {
    const id = e.id.slice(5);
    if (have.has(id)) continue;
    const entry = { id, t: new Date(e.t).toISOString(), kind: e.kind, amount: e.amount };
    const slipId = /^(?:stake|payout|refund|tax)-(.+)$/.exec(id)?.[1];
    if (slipId) entry.slipId = slipId;
    ledger.push(entry);
  }
  const all = [...account.ledger, ...ledger];
  const slipIds = new Set(account.slips.map(s => s.id));
  const paid = new Map(all.filter(e => (e.kind === 'payout' || e.kind === 'cashout') && e.slipId).map(e => [e.slipId, e]));
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
