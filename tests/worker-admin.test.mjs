// /admin (worker/admin.js) on a real D1 shape (node:sqlite): the owner made
// once, the panel's sign-in, passes handed out, the guards.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAdmin, guardsOf, forgetGuards } from '../worker/admin.js';
import { handlePassRequest } from '../worker/pass.js';
import { handleSlipScan } from '../worker/slip.js';
import { BASE_DEPS } from '../worker/deps.js';
import { fakeD1 } from './fixtures/worker/fake-d1.mjs';

let ips = 0;
function setup() {
  forgetGuards();
  const env = { STORE: fakeD1(), TOKEN_SECRET: 'test-secret' };
  const ip = `10.1.0.${++ips}`;
  const post = async (path, body, handler) => {
    const res = await handler(new Request(`https://w${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env, {}, ip, BASE_DEPS);
    return { status: res.status, data: await res.json() };
  };
  return { env, admin: body => post('/admin', body, handleAdmin), pass: body => post('/pass', body, handlePassRequest) };
}

test('the owner is made once: the first claim answers a pass and a token, every later one is refused', async () => {
  const t = setup();
  assert.equal((await t.admin({ action: 'state' })).data.owner, false);
  const first = await t.admin({ action: 'claim' });
  assert.equal(first.status, 200);
  assert.match(first.data.passcode, /^[2-9A-HJ-NP-Z]{10}$/);
  assert.ok(first.data.token);
  assert.equal((await t.admin({ action: 'state' })).data.owner, true);
  assert.equal((await t.admin({ action: 'claim' })).data.error.code, 'CLAIMED');
  // The owner's pass signs in on a phone too, with the opening money.
  const phone = await t.pass({ op: 'login', passcode: first.data.passcode, app: 'slip' });
  assert.equal(phone.data.pool, 30_000);
});

test("the panel signs in with the owner's pass only, and its token opens the tools", async () => {
  const t = setup();
  const { passcode } = (await t.admin({ action: 'claim' })).data;
  const { passes } = (await t.admin({ action: 'issue', at: (await t.admin({ action: 'login', passcode })).data.token, count: 1 })).data;
  // Someone else's pass: not the owner.
  assert.equal((await t.admin({ action: 'login', passcode: passes[0].passcode })).data.error.code, 'NOT_OWNER');
  assert.equal((await t.admin({ action: 'overview', at: 'nope' })).data.error.code, 'NOT_OWNER');
  const at = (await t.admin({ action: 'login', passcode })).data.token;
  assert.equal((await t.admin({ action: 'overview', at })).status, 200);
  assert.equal((await t.admin({ action: 'whatever', at })).data.error.code, 'UNKNOWN_ACTION');
});

test('passes handed out: each signs in once given, shows as unused until then, and can be signed out, renewed or removed', async () => {
  const t = setup();
  const { token: at } = (await t.admin({ action: 'claim' })).data;
  const issued = await t.admin({ action: 'issue', at, count: 3 });
  assert.equal(issued.data.passes.length, 3);
  const [a, b] = issued.data.passes;
  let list = (await t.admin({ action: 'accounts', at })).data.accounts;
  assert.equal(list.length, 4);
  assert.equal(list.filter(x => x.unused).length, 4, 'the owner too, until its first sign-in');
  const phone = await t.pass({ op: 'login', passcode: a.passcode, app: 'odds' });
  assert.equal(phone.status, 200);
  list = (await t.admin({ action: 'accounts', at })).data.accounts;
  assert.equal(list.find(x => x.ref === a.ref).unused, false);
  // Signed out everywhere: the phone's refresh stops working.
  assert.equal((await t.admin({ action: 'signout', at, ref: a.ref })).status, 200);
  assert.equal((await t.pass({ op: 'refresh', refresh: phone.data.refresh, app: 'odds' })).data.error.code, 'SIGNED_OUT');
  // A new pass: the old one stops, the new one works.
  const renewed = await t.admin({ action: 'repass', at, ref: a.ref });
  assert.equal((await t.pass({ op: 'login', passcode: a.passcode, app: 'odds' })).data.error.code, 'PASSCODE_NOT_FOUND');
  assert.equal((await t.pass({ op: 'login', passcode: renewed.data.passcode, app: 'odds' })).status, 200);
  // Removed: its pass is gone with it. The owner's own account can't be.
  assert.equal((await t.admin({ action: 'delete', at, ref: b.ref })).status, 200);
  assert.equal((await t.pass({ op: 'login', passcode: b.passcode, app: 'odds' })).data.error.code, 'PASSCODE_NOT_FOUND');
  const owner = (await t.admin({ action: 'accounts', at })).data.accounts.find(x => x.owner);
  assert.equal((await t.admin({ action: 'delete', at, ref: owner.ref })).data.error.code, 'OWNER');
  assert.equal((await t.admin({ action: 'issue', at, count: 99 })).data.passes.length, 20);
});

test('the guards: set from the panel, read by the routes; scans off answers PAUSED and never asks Gemini', async () => {
  const t = setup();
  const { token: at } = (await t.admin({ action: 'claim' })).data;
  assert.deepEqual((await t.admin({ action: 'guards', at })).data.guards, { scans: true, scanCap: 400, play: true });
  const set = await t.admin({ action: 'guards', at, guards: { scans: false, scanCap: 99999, play: false, junk: 1 } });
  assert.deepEqual(set.data.guards, { scans: false, scanCap: 5000, play: false });
  const guards = await guardsOf(t.env, BASE_DEPS);
  assert.equal(guards.scans, false);
  let asked = 0;
  const res = await handleSlipScan(new Request('https://w/slip-scan', { method: 'POST', headers: { Origin: 'https://jaypengx.github.io' }, body: JSON.stringify({ image: { mime_type: 'image/jpeg', data: 'AAAA' } }) }), { ...t.env, GEMINI_API_KEY: 'k' }, {}, '10.2.0.1', async () => (asked++, new Response('{}')), guards);
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error.code, 'PAUSED');
  assert.equal(asked, 0);
});
