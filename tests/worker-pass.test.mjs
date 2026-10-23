// /pass (worker/pass.js) against an in-memory store: no network, no real credentials.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { handlePassRequest, openAccount, mergeWallet, poolBalance, cleanPatch, emptyWallet, paydayEntries, PAY, WALLET_COLLECTION, PASS_COLLECTION, APPS, foldWallet, FOLD_AT, updateWallet, monthStart, monthId, nextMonth } from '../worker/pass.js';
import { signToken, readToken, tokenSecret, READ_GRACE_MS } from '../worker/token.js';
import { fakeD1 } from './fixtures/worker/fake-d1.mjs';

let ips = 0;
function setup({ start = 1_700_000_000_000 } = {}) {
  const store = new Map();
  let clock = start;
  let n = 0;
  let codeN = 0;
  const days = new Map();
  const key = (c, id) => `${c}/${id}`;
  const deps = {
    json: (data, status) => ({ status, data }),
    errorJson: (code, status) => ({ status, data: { error: { code } } }),
    upstreamFailed: error => ({ status: 502, data: { error: { code: 'UPSTREAM_FAILED', message: error.message } } }),
    readJsonBody: req => Promise.resolve(req.body),
    INVALID_BODY: Symbol('bad'),
    fsGet: async (env, c, id) => {
      const d = store.get(key(c, id));
      return d ? { exists: true, ...d } : { exists: false, payload: '', updateTime: '' };
    },
    fsWrite: async (env, c, id, payload, pre) => {
      const had = store.get(key(c, id));
      if (pre?.exists === false && had) throw Object.assign(new Error('exists'), { precondition: true });
      if (pre?.updateTime && had?.updateTime !== pre.updateTime) throw Object.assign(new Error('stale'), { precondition: true });
      const d = { payload, updateTime: `u${++n}` };
      store.set(key(c, id), d);
      return { updateTime: d.updateTime };
    },
    fsDelete: async (env, c, id) => void store.delete(key(c, id)),
    countDay: async (env, k) => (days.set(k, (days.get(k) || 0) + 1), days.get(k)),
    sha256Hex: async text => createHash('sha256').update(text).digest('hex'),
    generateCode: len => {
      codeN++;
      const a = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
      return Array.from({ length: len }, (_, i) => a[(codeN * 5 + i * 11) % 32]).join('');
    },
    now: () => (clock += 1000)
  };
  const env = { STORE: {}, TOKEN_SECRET: 'test-secret' };
  // (Each setup its own address: sign-ups are counted per address.)
  const ip = `10.0.0.${++ips}`;
  const call = (method, query = '', body, from = ip) => handlePassRequest({ method, url: `https://w/pass${query}`, body }, env, {}, from, deps);
  const qt = token => `?qt=${encodeURIComponent(token)}`;
  const accountOf = wallet => [...store.keys()].find(k => k.startsWith(`${WALLET_COLLECTION}/`) && JSON.parse(store.get(k).payload).created === wallet.created)?.slice(WALLET_COLLECTION.length + 1);
  return { store, deps, env, call, qt, days, accountOf, advance: ms => (clock += ms) };
}

// A pass handed out (admin.js), then signed in with.
async function newPass(t, app = 'odds') {
  const { passcode } = await openAccount(t.env, t.deps);
  const made = await t.call('POST', '', { op: 'login', passcode, app });
  assert.equal(made.status, 200, JSON.stringify(made.data));
  return { ...made.data, passcode };
}
const claimsOf = token => JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());

test('a handed-out pass: signed in and live, with NT$30,000 and nothing else', async () => {
  const t = setup();
  const acct = await newPass(t);
  assert.match(acct.passcode, /^[2-9A-HJ-NP-Z]{10}$/);
  assert.ok(acct.token && acct.refresh);
  assert.equal(acct.active, true);
  assert.equal(acct.pool, PAY.start);
  assert.deepEqual(acct.wallet.entries.map(e => [e.id, e.app, e.amount]), [['pass:start', 'pass', 30_000]]);
  assert.equal(acct.wallet.sec, undefined);
  // The pass itself is never stored: only its hash, which names the account.
  assert.ok(![...t.store.keys()].some(k => k.includes(acct.passcode)));
  const hash = createHash('sha256').update(acct.passcode).digest('hex');
  const account = JSON.parse(t.store.get(`${PASS_COLLECTION}/${hash}`).payload).account;
  assert.match(account, /^[2-9A-HJ-NP-Z]{16}$/);
  // The tokens name that account (the app reads its first 16 characters), and no app.
  assert.equal(claimsOf(acct.refresh).d, account);
  assert.equal('a' in claimsOf(acct.token), false);
});

test('no sign-up: passes are only handed out', async () => {
  const t = setup();
  const r = await t.call('POST', '', { op: 'create', app: 'odds' });
  assert.equal(r.status, 400);
  assert.equal(r.data.error.code, 'UNKNOWN_OP');
});

test('a handed-out pass waiting weeks starts at its first sign-in: no pay for the weeks it waited', async () => {
  const t = setup();
  const { passcode } = await openAccount(t.env, t.deps);
  t.advance(30 * 86_400_000);
  const made = await t.call('POST', '', { op: 'login', passcode, app: 'odds' });
  assert.equal(made.data.pool, PAY.start);
});

test('one session works for both apps: Play (odds) and the tickets followed (slip)', async () => {
  const t = setup();
  const acct = await newPass(t);
  const play = await t.call('POST', '?app=odds', { op: 'write', qt: acct.token, payload: 'gz1:play' });
  assert.equal(play.status, 200);
  const slips = await t.call('POST', '?app=slip', { op: 'write', qt: play.data.token, payload: 'gz1:slips' });
  assert.equal(slips.status, 200);
  assert.equal((await t.call('GET', `${t.qt(slips.data.token)}&app=odds`)).data.payload, 'gz1:play');
  assert.equal((await t.call('GET', `${t.qt(slips.data.token)}&app=slip`)).data.payload, 'gz1:slips');
  // Each in its own collection; anything else is no app.
  assert.ok([...t.store.keys()].some(k => k.startsWith(`${APPS.slip.collection}/`)));
  assert.equal((await t.call('GET', `${t.qt(slips.data.token)}&app=stock`)).data.error.code, 'UNKNOWN_APP');
  // Too big for its app: refused.
  assert.equal((await t.call('POST', '?app=slip', { op: 'write', qt: slips.data.token, payload: 'x'.repeat(APPS.slip.maxPayload + 1) })).data.error.code, 'MISSING_PAYLOAD');
});

test('read and write with the session; the pass itself opens nothing; a forged token nothing either', async () => {
  const t = setup();
  const acct = await newPass(t);
  const w = await t.call('PATCH', `${t.qt(acct.token)}&app=odds`, { payload: 'gz1:abc', wallet: { entries: [{ id: 'odds:stake-1', t: 1, app: 'odds', kind: 'stake', amount: -30 }] } });
  assert.equal(w.status, 200);
  assert.equal(w.data.pool, acct.pool - 30);
  const again = await t.call('PATCH', `${t.qt(acct.token)}&app=odds`, { wallet: { entries: [{ id: 'odds:stake-1', t: 1, app: 'odds', kind: 'stake', amount: -99 }] } });
  assert.equal(again.data.pool, w.data.pool, 'the same id counts once');
  assert.equal((await t.call('GET', `${t.qt(acct.token)}&app=odds`)).data.payload, 'gz1:abc');
  assert.equal((await t.call('GET', `?passcode=${acct.passcode}&app=odds`)).data.error.code, 'TOKEN_INVALID');
  assert.equal((await t.call('GET', '?qt=nope.nope')).status, 401);
  assert.equal((await t.call('GET', `?qt=${acct.token.split('.')[0]}.AAAA`)).status, 401);
  assert.equal((await t.call('POST', '', { op: 'merge', qt: acct.token })).data.error.code, 'UNKNOWN_OP');
});

test("only the Worker adds money: an app's entries are what it spends, and the pass's own ids are the Worker's", async () => {
  const p = cleanPatch({
    entries: [
      { id: 'pass:pay:2026-10-19', t: 1, app: 'odds', kind: 'pay', amount: 10_000 },
      { id: 'x', t: 1, app: 'pass', kind: 'start', amount: 1e6 },
      { id: 'y', t: 1, app: 'odds', kind: 'payout', amount: 30 },
      { id: 'z', t: 1, app: 'slip', kind: 'other', amount: -5 }
    ]
  });
  assert.deepEqual(p.entries.map(e => e.id), ['y'], 'only Play writes entries');
  const t = setup();
  const acct = await newPass(t);
  const send = entries => t.call('PATCH', `${t.qt(acct.token)}&app=odds`, { wallet: { entries } });
  const r = await send([
    { id: 'odds:payout-forged', t: 2, app: 'odds', kind: 'payout', amount: 1_000_000 },
    { id: 'odds:refund-x', t: 2, app: 'odds', kind: 'refund', amount: 300 },
    { id: 'odds:stake-new', t: 2, app: 'odds', kind: 'stake', amount: -300 }
  ]);
  assert.equal(r.data.pool, acct.pool - 300);
  // Dated by the Worker, not the phone.
  assert.ok(r.data.wallet.entries.find(e => e.id === 'odds:stake-new').t > 2);
});

test('wallet merge: entries by id, newest settings and figures', () => {
  const a = mergeWallet(emptyWallet(10), { entries: [{ id: 'a', t: 2, app: 'odds', amount: 5 }], settings: { k: { value: 1, t: 1 } }, snap: { odds: { open: 10, t: 1 } } });
  const b = mergeWallet(a, { entries: [{ id: 'a', t: 2, app: 'odds', amount: 7 }, { id: 'b', t: 1, app: 'odds', amount: 3 }], settings: { k: { value: 2, t: 3 } }, snap: { odds: { open: 4, t: 0 } } });
  assert.deepEqual(b.entries.map(e => e.id), ['b', 'a']);
  assert.equal(b.settings.k.value, 2);
  assert.equal(b.snap.odds.open, 10);
  assert.equal(poolBalance(b), 8);
});

test('one device at a time: another claiming makes the first read-only', async () => {
  const t = setup();
  const acct = await newPass(t);
  const other = await t.call('POST', '', { op: 'login', passcode: acct.passcode, app: 'odds' });
  assert.equal(other.data.active, true);
  const read = await t.call('GET', t.qt(acct.token));
  assert.equal(read.data.active, false);
  assert.ok(read.data.live.t);
  assert.equal(read.data.token, undefined);
  const write = await t.call('POST', '?app=odds', { op: 'write', qt: acct.token, payload: 'gz1:x' });
  assert.equal(write.status, 409);
  assert.equal(write.data.error.code, 'SESSION_MOVED');
  // A peek (no claim) stays read-only; a claim takes it back, and says so.
  assert.equal((await t.call('POST', '', { op: 'refresh', refresh: acct.refresh, app: 'odds' })).data.active, false);
  const back = await t.call('POST', '', { op: 'refresh', refresh: acct.refresh, app: 'slip', claim: true });
  assert.equal(back.data.active, true);
  assert.equal(back.data.took, true);
  assert.ok(back.data.refresh, 'the refresh token is renewed');
  assert.equal((await t.call('POST', '?app=slip', { op: 'write', qt: back.data.token, payload: 'gz1:y' })).status, 200);
  const again = await t.call('POST', '', { op: 'refresh', refresh: back.data.refresh, app: 'odds', claim: true });
  assert.equal(again.data.took, undefined, 'still its own: nothing taken');
});

test('login with the pass; an unknown pass is refused; a bad one is not even looked up', async () => {
  const t = setup();
  const acct = await newPass(t);
  const login = await t.call('POST', '', { op: 'login', passcode: acct.passcode.toLowerCase().replace(/^(.{5})/, '$1-'), app: 'slip' });
  assert.equal(login.status, 200);
  assert.ok(login.data.refresh);
  assert.equal(login.data.passcode, undefined, 'the pass is never sent back');
  assert.equal((await t.call('POST', '', { op: 'login', passcode: 'ABCDEFGHJK', app: 'odds' })).data.error.code, 'PASSCODE_NOT_FOUND');
  assert.equal((await t.call('POST', '', { op: 'login', passcode: 'short', app: 'odds' })).data.error.code, 'INVALID_PASSCODE');
});

test('sign out everywhere: every earlier token stops working', async () => {
  const t = setup();
  const acct = await newPass(t);
  const out = await t.call('POST', '', { op: 'signout-all', qt: acct.token });
  assert.equal(out.status, 200);
  assert.ok(out.data.refresh, 'this device stays signed in');
  assert.equal((await t.call('GET', t.qt(out.data.token))).status, 200);
  assert.equal((await t.call('GET', t.qt(acct.token))).data.error.code, 'SIGNED_OUT');
  assert.equal((await t.call('POST', '', { op: 'refresh', refresh: acct.refresh, app: 'odds', claim: true })).data.error.code, 'SIGNED_OUT');
  assert.equal((await t.call('POST', '', { op: 'login', passcode: acct.passcode, app: 'odds' })).status, 200);
});

test('payday: NT$10,000 on the 1st of each Taiwan month after the month the pass was made, back pay included', () => {
  const pays = (w, now) => paydayEntries(w, now).filter(e => e.kind === 'pay').map(e => e.id);
  // Made on 10/21: its own month is the opening money's.
  const made = Date.UTC(2026, 9, 21, 3);
  assert.deepEqual(pays({ created: made, entries: [] }, made), []);
  assert.deepEqual(pays({ created: made, entries: [] }, Date.UTC(2026, 10, 3, 3)), ['pass:pay:2026-11']);
  assert.equal(paydayEntries({ created: made, entries: [] }, Date.UTC(2026, 10, 3, 3)).find(e => e.kind === 'pay').amount, 10_000);
  // Back pay: every month nobody opened the app, paid the next time (no
  // reward for coming back, no loss for staying away).
  assert.deepEqual(pays({ created: made, entries: [] }, Date.UTC(2027, 0, 10, 3)), ['pass:pay:2026-11', 'pass:pay:2026-12', 'pass:pay:2027-01']);
  // 10/31 23:30 Taipei is still October; 11/1 00:00 is payday.
  assert.deepEqual(pays({ created: made, entries: [] }, Date.UTC(2026, 9, 31, 15, 30)), []);
  assert.deepEqual(pays({ created: made, entries: [] }, Date.UTC(2026, 9, 31, 16, 0)), ['pass:pay:2026-11']);
  // Paid once: an id the wallet has isn't due again; the start is due once.
  const paid = { created: made, entries: [{ id: 'pass:start' }, { id: 'pass:pay:2026-11' }] };
  assert.deepEqual(paydayEntries(paid, Date.UTC(2026, 10, 3, 3)), []);
  assert.equal(monthId(Date.UTC(2026, 9, 31, 16, 0)), '2026-11');
  assert.equal(monthStart(Date.UTC(2026, 9, 31, 17, 0)), Date.UTC(2026, 9, 31, 16, 0));
  // December rolls into January.
  assert.equal(nextMonth(Date.UTC(2026, 11, 15)), Date.UTC(2026, 11, 31, 16, 0));
});

test('broke is broke until the 1st: a balance at zero brings no money in the month', () => {
  const made = Date.UTC(2026, 9, 21, 3);
  const w = { created: made, entries: [{ id: 'pass:start', amount: PAY.start }, { id: 'odds:stake-1', amount: -PAY.start }] };
  assert.deepEqual(paydayEntries(w, Date.UTC(2026, 9, 31, 15, 59)), []);
});

test('the pay comes with the next read, sign-in or save of the month, once', async () => {
  const t = setup({ start: Date.UTC(2026, 9, 21, 3) });
  const acct = await newPass(t);
  t.advance(14 * 86_400_000);
  const read = await t.call('GET', t.qt((await t.call('POST', '', { op: 'refresh', refresh: acct.refresh, app: 'odds', claim: true })).data.token));
  assert.equal(read.data.pool, PAY.start + PAY.month);
  const again = await t.call('GET', t.qt(read.data.token));
  assert.equal(again.data.pool, PAY.start + PAY.month);
});

test('rotate: a new pass for the same account, the old one dead, every other device out', async () => {
  const t = setup();
  const acct = await newPass(t);
  await t.call('PATCH', `${t.qt(acct.token)}&app=odds`, { payload: 'gz1:mine' });
  const other = await t.call('POST', '', { op: 'login', passcode: acct.passcode, app: 'odds' });
  const back = await t.call('POST', '', { op: 'refresh', refresh: acct.refresh, app: 'odds', claim: true });
  const r = await t.call('POST', '', { op: 'rotate', qt: back.data.token });
  assert.equal(r.status, 200);
  assert.notEqual(r.data.passcode, acct.passcode);
  assert.equal(r.data.payload, 'gz1:mine');
  assert.equal(r.data.pool, acct.pool);
  assert.equal(claimsOf(r.data.refresh).d, claimsOf(acct.refresh).d, 'the same account');
  assert.equal((await t.call('POST', '', { op: 'login', passcode: acct.passcode, app: 'odds' })).status, 404);
  assert.equal((await t.call('POST', '', { op: 'login', passcode: r.data.passcode, app: 'odds' })).status, 200);
  assert.equal((await t.call('POST', '', { op: 'refresh', refresh: other.data.refresh, app: 'odds', claim: true })).status, 401);
  assert.equal([...t.store.keys()].filter(k => k.startsWith(`${PASS_COLLECTION}/`)).length, 1, 'one pass left');
});

test('rotate twice at once: one new pass, never two', async () => {
  const t = setup();
  const acct = await newPass(t);
  const get = t.deps.fsGet;
  t.deps.fsGet = async (...args) => {
    const doc = await get(...args);
    await new Promise(r => setTimeout(r, 2));
    return doc;
  };
  const [r1, r2] = await Promise.all([t.call('POST', '', { op: 'rotate', qt: acct.token }), t.call('POST', '', { op: 'rotate', qt: acct.token })]);
  assert.deepEqual([r1.status, r2.status].sort(), [200, 401]);
  assert.equal([...t.store.keys()].filter(k => k.startsWith(`${PASS_COLLECTION}/`)).length, 1);
});

test("a phone clock set ahead never blocks a later save: a setting's time is the Worker's at the latest", async () => {
  const t = setup();
  const a = await newPass(t);
  const year = 365 * 86_400_000;
  const ahead = await t.call('PATCH', `${t.qt(a.token)}&app=odds`, { wallet: { settings: { theme: { value: 'dark', t: t.deps.now() + year } } } });
  assert.equal(ahead.status, 200);
  assert.ok(ahead.data.wallet.settings.theme.t < t.deps.now() + year / 2, 'stamped no later than now');
  t.advance(60_000);
  const later = await t.call('PATCH', `${t.qt(ahead.data.token)}&app=odds`, { wallet: { settings: { theme: { value: 'light', t: t.deps.now() } } } });
  assert.equal(later.data.wallet.settings.theme.value, 'light');
});

test('deleting the account removes everything, its pass too; deleting an app removes only its data', async () => {
  const t = setup();
  const acct = await newPass(t);
  await t.call('PATCH', `${t.qt(acct.token)}&app=odds`, { payload: 'gz1:x' });
  await t.call('PATCH', `${t.qt(acct.token)}&app=slip`, { payload: 'gz1:y' });
  assert.equal((await t.call('DELETE', `${t.qt(acct.token)}&app=slip`)).status, 200);
  assert.equal((await t.call('GET', `${t.qt(acct.token)}&app=odds`)).data.payload, 'gz1:x');
  assert.equal((await t.call('DELETE', t.qt(acct.token))).status, 200);
  assert.deepEqual([...t.store.keys()], []);
});

test("a save of the app's data alone doesn't rewrite the wallet", async () => {
  const t = setup();
  const a = await newPass(t);
  let walletWrites = 0;
  const fsWrite = t.deps.fsWrite;
  t.deps.fsWrite = (env, collection, ...rest) => (collection === WALLET_COLLECTION && walletWrites++, fsWrite(env, collection, ...rest));
  for (let i = 1; i < 5; i++) assert.equal((await t.call('POST', '?app=odds', { op: 'write', qt: a.token, payload: `v:${i}` })).status, 200);
  assert.equal(walletWrites, 0, 'data alone: no wallet write');
  await t.call('POST', '?app=odds', { op: 'write', qt: a.token, payload: 'v:5', wallet: { settings: { x: { value: 1, t: 1 } } } });
  assert.equal(walletWrites, 1);
});

test('a read that says which wallet (w) and data (since) it holds gets neither back while they are the same', async () => {
  const t = setup();
  const a = await newPass(t);
  const saved = await t.call('POST', '?app=odds', { op: 'write', qt: a.token, payload: 'v:1' });
  const held = saved.data.updateTime;
  const first = await t.call('GET', `${t.qt(saved.data.token)}&app=odds`);
  const same = await t.call('GET', `${t.qt(first.data.token)}&app=odds&since=${encodeURIComponent(held)}&w=${encodeURIComponent(first.data.walletTime)}`);
  assert.equal(same.data.unchanged, true);
  assert.equal(same.data.payload, undefined);
  assert.equal(same.data.same, true);
  assert.equal(same.data.wallet, undefined);
  assert.ok(Number.isFinite(same.data.pool));
  await t.call('POST', '?app=odds', { op: 'write', qt: same.data.token, payload: 'v:2', wallet: { settings: { x: { value: 1, t: 1 } } } });
  const changed = await t.call('GET', `${t.qt(same.data.token)}&app=odds&since=${encodeURIComponent(held)}&w=${encodeURIComponent(first.data.walletTime)}`);
  assert.equal(changed.data.payload, 'v:2');
  assert.ok(changed.data.wallet && !changed.data.same);
  // The wake: one request, the claim with the data and the wallet as held.
  const wake = await t.call('POST', '', { op: 'refresh', refresh: a.refresh, app: 'odds', claim: true, data: true, since: changed.data.updateTime, w: changed.data.walletTime });
  assert.equal(wake.data.unchanged, true);
  assert.equal(wake.data.same, true);
  assert.ok(wake.data.token && wake.data.refresh);
});

test("a big wallet's old entries fold into monthly sums: the same balance, the Worker's own kept, no paid slip payable again", async () => {
  const now = Date.parse('2027-12-01T00:00:00Z');
  const DAY = 86_400_000;
  const entries = [{ id: 'pass:start', t: now - 900 * DAY, app: 'pass', kind: 'start', amount: 200_000 }];
  for (let i = 0; i < 3000; i++) {
    const t = now - (900 - (i % 880)) * DAY;
    entries.push({ id: `odds:stake-s${i}`, t, app: 'odds', kind: 'stake', amount: -100 });
    if (i % 2) entries.push({ id: `odds:payout-s${i}`, t: t + DAY, app: 'odds', kind: 'payout', amount: 190 });
  }
  const w = { ...emptyWallet(now - 900 * DAY), entries };
  const folded = foldWallet(w, now);
  assert.ok(folded.entries.length < w.entries.length / 2);
  assert.equal(poolBalance(folded), poolBalance(w));
  assert.ok(folded.entries.some(e => e.id === 'pass:start'));
  const have = new Set(folded.entries.map(e => e.id));
  for (let i = 1; i < 3000; i += 2) assert.ok(!(have.has(`odds:stake-s${i}`) && !have.has(`odds:payout-s${i}`)), `slip s${i}`);
  assert.deepEqual(foldWallet(folded, now), folded);
  const big = { ...w, entries: [...w.entries, ...Array.from({ length: 3000 }, (_, i) => ({ id: `odds:stake-x${i}`, t: now - 500 * DAY, app: 'odds', kind: 'stake', amount: -1 }))] };
  assert.ok(JSON.stringify(big).length > FOLD_AT);
  let doc = { exists: true, payload: JSON.stringify(big), updateTime: 'v1' };
  const deps = { now: () => now, fsGet: async () => doc, fsWrite: async (env, c, id, text) => ((doc = { exists: true, payload: text, updateTime: 'v2' }), { updateTime: 'v2' }) };
  const r = await updateWallet({}, deps, 'acct', x => ({ ...x, entries: [...x.entries, { id: 'odds:stake-new', t: now, app: 'odds', kind: 'stake', amount: -10 }] }));
  assert.ok(doc.payload.length < FOLD_AT);
  assert.equal(poolBalance(r.wallet), Math.round((poolBalance(big) - 10) * 100) / 100);
});

test('a session run out still reads public data for READ_GRACE_MS, never past it', async () => {
  const secret = 'grace-test-secret';
  const now = Date.now();
  const ranOut = await signToken(secret, { k: 'ses', d: 'x', e: now - 3_600_000 });
  assert.equal(await readToken(secret, ranOut, 'ses', now), null);
  assert.ok(await readToken(secret, ranOut, 'ses', now - READ_GRACE_MS));
  const long = await signToken(secret, { k: 'ses', d: 'x', e: now - READ_GRACE_MS - 60_000 });
  assert.equal(await readToken(secret, long, 'ses', now - READ_GRACE_MS), null);
});

test('the token secret needs nobody: made once and kept in D1, the same for every isolate; TOKEN_SECRET wins when set', async () => {
  const db = fakeD1();
  const one = await tokenSecret({ STORE: db });
  assert.ok(one.length >= 40);
  // Another isolate (another binding object, the same database): the same secret.
  const other = { prepare: sql => db.prepare(sql) };
  assert.equal(await tokenSecret({ STORE: other }), one);
  assert.equal(await tokenSecret({ STORE: db, TOKEN_SECRET: 'set' }), 'set');
  assert.equal(await tokenSecret({}), '');
});
