// Slips placed and settled by the Worker (Shared-Proxy settle.js, /play):
// each slip is placed there, the Worker reads each game once when it should be over,
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

// Placed: { placed: [id…], wallet } or { refused: { problem, moved: [{ id, odds }] } }.
export const placeSlips = slips => call('POST', { op: 'place', slips: slips.map(slipSpec) });

// The lottery (Shared-Proxy lotto.js): tickets sold { tickets, wallet }, a
// scratch card bought { ticket, wallet } (its prize drawn there), scratched
// { prize, wallet }; { refused: { problem } } when not.
export const buyTickets = tickets => call('POST', { op: 'tickets', tickets });
export const buyCard = (id, card) => call('POST', { op: 'scratch', id, card });
export const revealCard = id => call('POST', { op: 'reveal', id });

// Scratched cards whose prize the pass doesn't have yet (the Worker's
// reveal didn't get through): asked again.
export async function revealPending(account, wallet) {
  const have = new Set((wallet?.entries || []).map(e => e.id));
  for (const x of (account?.tickets || []).filter(x => x.card && x.status === 'settled' && x.prize > 0 && !have.has(`odds:prize-${x.id}`)).slice(0, 5)) await revealCard(x.id).catch(() => null);
}

// The Worker's results: { slipId: { results, finals, settled, payout, at } }.
export const readSettled = async () => (await call('GET')).settled || {};
// Applied: the Worker forgets them.
export const ackSettled = async ids => (ids.length ? call('POST', { op: 'ack', ids }) : null);
// Cash out at `value`: { cashedOut, wallet } (paid by the Worker),
// { settled: record } (it was settled first) or { refused: { value } } (the
// house's value now, null: paused).
export const takeForCashOut = (id, value) => call('POST', { op: 'cashout', id, value });
