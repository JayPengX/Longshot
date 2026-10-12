// Slips settled by the Worker (Shared-Proxy settle.js, /play): Play hands it
// each open slip, the Worker reads each game once when it should be over,
// pays the pass's wallet (the ledger's own ids, `payout-<slip>`: never twice)
// and keeps each slip's results here for Play to apply. Cash out first takes
// the slip from the Worker, so a slip is never both cashed out and settled.
export const PLAY_URL = 'https://orbit-workers-proxy.pengzjay.workers.dev/play';

let tokenOf = () => '';
export const useSettleToken = fn => (tokenOf = fn);
const signed = () => `${PLAY_URL}?qt=${encodeURIComponent(tokenOf())}`;
async function call(method, body) {
  if (!tokenOf()) throw new Error('signed out');
  const res = await fetch(signed(), { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

// What the Worker keeps of a slip: what settling needs, and its picks' names
// for the notice.
export const slipSpec = slip => ({
  id: slip.id,
  t: slip.t,
  status: 'open',
  mode: slip.mode,
  sizes: slip.sizes,
  stake: slip.stake,
  cost: slip.cost,
  legs: slip.legs,
  ...(slip.boost ? { boost: slip.boost } : {}),
  ...(slip.free ? { free: slip.free, freeValue: slip.freeValue } : {})
});

// Open slips this device has handed over already (kept: one hand-over a slip).
const WATCHED_KEY = 'odds.watched.v1';
const readWatched = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(WATCHED_KEY) || '[]'));
  } catch {
    return new Set();
  }
};
// Every open slip not handed over yet (placed here, or on another device, or
// before the Worker settled them).
export async function watchOpen(account) {
  const open = (account?.slips || []).filter(s => s.status === 'open' && !s.recovered && s.legs?.length);
  const watched = readWatched();
  const todo = open.filter(s => !watched.has(s.id));
  if (!todo.length) return 0;
  for (let i = 0; i < todo.length; i += 40) await call('POST', { op: 'open', slips: todo.slice(i, i + 40).map(slipSpec) });
  const keep = new Set(open.map(s => s.id));
  try {
    localStorage.setItem(WATCHED_KEY, JSON.stringify([...watched, ...todo.map(s => s.id)].filter(id => keep.has(id))));
  } catch {}
  return todo.length;
}

// The Worker's results: { slipId: { results, finals, settled, payout, at } }.
export const readSettled = async () => (await call('GET')).settled || {};
// Applied: the Worker forgets them.
export const ackSettled = ids => (ids.length ? call('POST', { op: 'ack', ids }) : null);
// Cash out: { ok } (go ahead) or { settled: record } (it was settled first).
export const takeForCashOut = id => call('POST', { op: 'cashout', id });
