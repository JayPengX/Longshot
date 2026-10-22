// Slips placed and settled by the Worker (Shared-Proxy settle.js, /play):
// each slip is placed there, the Worker reads each game once when it should be over,
// pays the pass's wallet (the ledger's own ids, `payout-<slip>`: never twice)
// and keeps each slip's results here for Play to apply. (No cash out since
// 2026-10-21; a slip cashed before still comes back as `cashedOut`.)
const PLAY_URL = 'https://longshot.pengzjay.workers.dev/play';

// The pass's session token: `tokenOf(renew)`, a string or a promise of one
// (the kit's q.ensureToken: a fresh one when the held one is old, a new one
// on `renew`). The session token lives 20 minutes: Play used the one held
// as it was, so a phone back from sleep or open a while had its slips
// turned away (401) and every bet said 現在無法下注 until something else
// renewed it (Jay 2026-10-22).
let tokenOf = () => '';
export const useSettleToken = fn => (tokenOf = fn);
// How long an answer is waited for: placing a live pick waits the house's 5
// seconds and reads the live board again, so it gets longer.
const WAIT_MS = 15_000;
const PLACE_WAIT_MS = 30_000;
async function call(method, body, wait = WAIT_MS) {
  const send = async token => {
    if (!token) throw new Error('signed out');
    return fetch(`${PLAY_URL}?qt=${encodeURIComponent(token)}`, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(wait) });
  };
  let res = await send(await tokenOf(false));
  // Turned away for its token: once more with a new one.
  if (res.status === 401) res = await send(await tokenOf(true));
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
export const placeSlips = slips => call('POST', { op: 'place', slips: slips.map(slipSpec) }, PLACE_WAIT_MS);

// The lottery (Shared-Proxy lotto.js): tickets sold { tickets, wallet }, a
// scratch card bought { ticket, wallet } (its prize drawn there), scratched
// { prize, wallet }; { refused: { problem } } when not.
export const buyTickets = tickets => call('POST', { op: 'tickets', tickets });
export const buyCard = (id, card) => call('POST', { op: 'scratch', id, card });
// Several at once ({ tickets, wallet }: one charge, all or none).
export const buyCardsAt = list => call('POST', { op: 'scratch', cards: list.map(({ id, card }) => ({ id, card })) });
export const revealCard = id => call('POST', { op: 'reveal', id });

// Scratched cards whose prize the pass doesn't have yet (the Worker's
// reveal didn't get through): asked again.
export async function revealPending(account, wallet) {
  const have = new Set((wallet?.entries || []).map(e => e.id));
  for (const x of (account?.tickets || []).filter(x => x.card && x.status === 'settled' && x.prize > 0 && !have.has(`odds:prize-${x.id}`)).slice(0, 5)) await revealCard(x.id).catch(() => null);
}

// The Worker's results: { slipId: { results, finals, settled, payout, at } }.
export const readSettled = async () => (await call('GET')).settled || {};
// Slips whose game this phone saw end: the Worker looks at them now (it reads
// the games itself) and answers with the records, as readSettled.
export const settleNow = async ids => (await call('POST', { op: 'settle', ids })).settled || {};
// Applied: the Worker forgets them.
export const ackSettled = async ids => (ids.length ? call('POST', { op: 'ack', ids }) : null);
