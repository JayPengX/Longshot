// Passkeys and device codes for the Longshot Pass: real keys made here
// (P-256, Ed25519, RSA) signing the way an authenticator does, against /pass
// on an in-memory store.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { handlePassRequest, openAccount, mergeWallet, WALLET_COLLECTION } from '../worker/pass.js';
import { PASSKEY_COLLECTION, RP_ID } from '../worker/passkey.js';
import { b64url, unb64url } from '../worker/webauthn.js';

const ORIGIN = 'https://longshot.jaypengx.com';

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

const post = (t, body) => t.call('POST', '', body);

// ---- A software authenticator ----------------------------------------------------

function cbor(v) {
  const head = (major, len) => {
    if (len < 24) return [(major << 5) | len];
    if (len < 256) return [(major << 5) | 24, len];
    if (len < 65536) return [(major << 5) | 25, len >> 8, len & 255];
    return [(major << 5) | 26, (len >>> 24) & 255, (len >> 16) & 255, (len >> 8) & 255, len & 255];
  };
  if (typeof v === 'number') return Uint8Array.from(v >= 0 ? head(0, v) : head(1, -1 - v));
  if (typeof v === 'string') {
    const b = new TextEncoder().encode(v);
    return Uint8Array.from([...head(3, b.length), ...b]);
  }
  if (v instanceof Uint8Array) return Uint8Array.from([...head(2, v.length), ...v]);
  if (v instanceof Map) {
    const parts = [Uint8Array.from(head(5, v.size))];
    for (const [k, x] of v) parts.push(cbor(k), cbor(x));
    return concat(...parts);
  }
  throw new Error('cbor: ' + typeof v);
}
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let at = 0;
  for (const p of parts) out.set(p, (at += p.length) - p.length);
  return out;
};
const sha = bytes => new Uint8Array(createHash('sha256').update(bytes).digest());
// DER from raw r||s (what a real authenticator sends for ES256).
function rawToDer(raw) {
  const int = b => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    b = b.slice(i);
    if (b[0] & 0x80) b = concat(Uint8Array.of(0), b);
    return concat(Uint8Array.of(2, b.length), b);
  };
  const body = concat(int(raw.slice(0, 32)), int(raw.slice(32)));
  return concat(Uint8Array.of(0x30, body.length), body);
}

async function authenticator({ alg = -7, rpId = RP_ID, flags = 0x05 | 0x08 | 0x10, aaguid = 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd', counter = 0 } = {}) {
  const spec = { [-7]: { name: 'ECDSA', namedCurve: 'P-256' }, [-8]: { name: 'Ed25519' }, [-257]: { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: Uint8Array.of(1, 0, 1), hash: 'SHA-256' } }[alg];
  const pair = await webcrypto.subtle.generateKey(spec, true, ['sign', 'verify']);
  const jwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
  const cose =
    alg === -7
      ? new Map([[1, 2], [3, -7], [-1, 1], [-2, unb64url(jwk.x)], [-3, unb64url(jwk.y)]])
      : alg === -8
        ? new Map([[1, 1], [3, -8], [-1, 6], [-2, unb64url(jwk.x)]])
        : new Map([[1, 3], [3, -257], [-1, unb64url(jwk.n)], [-2, unb64url(jwk.e)]]);
  const credId = webcrypto.getRandomValues(new Uint8Array(20));
  const id = b64url(credId);
  let count = counter;
  const guid = Uint8Array.from(aaguid.replace(/-/g, '').match(/../g).map(h => parseInt(h, 16)));
  const data = (type, challenge, origin) => new TextEncoder().encode(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
  return {
    id,
    create(challenge, { origin = ORIGIN, rp = rpId, f = flags | 0x40 } = {}) {
      const authData = concat(sha(new TextEncoder().encode(rp)), Uint8Array.of(f), Uint8Array.of(0, 0, 0, count), guid, Uint8Array.of(0, credId.length), credId, cbor(cose));
      return { id, clientDataJSON: b64url(data('webauthn.create', challenge, origin)), attestationObject: b64url(cbor(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]))) };
    },
    async get(challenge, { origin = ORIGIN, rp = rpId, f = flags, step = counter ? 1 : 0 } = {}) {
      count += step;
      const authData = concat(sha(new TextEncoder().encode(rp)), Uint8Array.of(f), Uint8Array.of((count >>> 24) & 255, (count >> 16) & 255, (count >> 8) & 255, count & 255));
      const client = data('webauthn.get', challenge, origin);
      const signed = concat(authData, sha(client));
      const algo = alg === -7 ? { name: 'ECDSA', hash: 'SHA-256' } : alg === -8 ? { name: 'Ed25519' } : { name: 'RSASSA-PKCS1-v1_5' };
      let sig = new Uint8Array(await webcrypto.subtle.sign(algo, pair.privateKey, signed));
      if (alg === -7) sig = rawToDer(sig);
      return { id, clientDataJSON: b64url(client), authenticatorData: b64url(authData), signature: b64url(sig), userHandle: '' };
    }
  };
}

async function signedIn(t) {
  const { passcode } = await openAccount(t.env, t.deps);
  const made = await post(t, { op: 'login', passcode, app: 'odds' });
  assert.equal(made.status, 200);
  return { ...made.data, passcode };
}
async function addKey(t, acct, a, extra = {}) {
  const begin = await post(t, { op: 'passkey-add-begin', qt: acct.token });
  assert.equal(begin.status, 200, JSON.stringify(begin.data));
  return post(t, { op: 'passkey-add', qt: acct.token, challenge: begin.data.challenge, credential: a.create(begin.data.challenge, extra), device: 'iPhone' });
}
async function login(t, a, extra = {}) {
  const begin = await post(t, { op: 'passkey-begin' });
  return post(t, { op: 'passkey-login', app: 'odds', challenge: begin.data.challenge, credential: await a.get(begin.data.challenge, extra) });
}

for (const alg of [-7, -8, -257])
  test(`a passkey (${alg}) made on a signed-in Pass signs in on a new device`, async () => {
    const t = setup();
    const acct = await signedIn(t);
    const a = await authenticator({ alg });
    const added = await addKey(t, acct, a);
    assert.equal(added.status, 200, JSON.stringify(added.data));
    const [k] = added.data.wallet.passkeys;
    assert.deepEqual({ via: k.via, on: k.on, sync: k.sync }, { via: 'icloud', on: 'iPhone', sync: true });
    // The page never sees a key.
    assert.equal(JSON.stringify(added.data.wallet).includes('jwk'), false);
    const res = await login(t, a);
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.ok(res.data.token && res.data.refresh);
    assert.equal(res.data.passcode, undefined);
    assert.ok(res.data.wallet.passkeys[0].used > 0);
    // The pass still signs in too.
    assert.equal((await post(t, { op: 'login', passcode: acct.passcode, app: 'odds' })).status, 200);
  });

test('several passkeys per Pass, each removed on its own; a key survives the wallet being written', async () => {
  const t = setup();
  const acct = await signedIn(t);
  const phone = await authenticator();
  const pc = await authenticator({ aaguid: '08987058-cadc-4b81-b6e1-30de50dcbe96', flags: 0x05 });
  await addKey(t, acct, phone);
  const two = await addKey(t, acct, pc);
  assert.deepEqual(two.data.wallet.passkeys.map(k => k.via), ['icloud', 'windows']);
  assert.equal((await addKey(t, acct, pc)).data.error.code, 'PASSKEY_TAKEN');
  // A save and a payday merge keep them.
  const signed = (await login(t, phone)).data;
  await t.call('PATCH', `?qt=${encodeURIComponent(signed.token)}&app=odds`, { wallet: { entries: [{ id: 'bet:1', t: t.deps.now(), app: 'odds', kind: 'bet', amount: -100 }] } });
  assert.equal(mergeWallet({ v: 1, entries: [], passkeys: { keys: [1] } }, { entries: [] }).passkeys.keys.length, 1);
  const gone = await post(t, { op: 'passkey-remove', qt: signed.token, id: phone.id });
  assert.deepEqual(gone.data.wallet.passkeys.map(k => k.id), [pc.id]);
  assert.equal((await login(t, phone)).data.error.code, 'PASSKEY_UNKNOWN');
  assert.equal((await login(t, pc)).status, 200);
});

test('a forged or misplaced passkey never signs in', async () => {
  const t = setup();
  const acct = await signedIn(t);
  const a = await authenticator();
  await addKey(t, acct, a);
  // Orbit's page, another site, another RP, no Face ID, no touch.
  for (const extra of [{ origin: 'https://orbit.jaypengx.com' }, { origin: 'https://evil.example' }, { rp: 'jaypengx.com' }, { f: 0x01 }, { f: 0x04 }]) assert.equal((await login(t, a, extra)).data.error.code, 'PASSKEY_INVALID', JSON.stringify(extra));
  const other = await authenticator();
  const begin = await post(t, { op: 'passkey-begin' });
  const forged = { ...(await other.get(begin.data.challenge)), id: a.id };
  assert.equal((await post(t, { op: 'passkey-login', app: 'odds', challenge: begin.data.challenge, credential: forged })).data.error.code, 'PASSKEY_INVALID');
  const late = await post(t, { op: 'passkey-begin' });
  t.advance(6 * 60_000);
  assert.equal((await post(t, { op: 'passkey-login', app: 'odds', challenge: late.data.challenge, credential: await a.get(late.data.challenge) })).data.error.code, 'PASSKEY_EXPIRED');
});

test('a counting key that counts back is refused (a cloned key)', async () => {
  const t = setup();
  const acct = await signedIn(t);
  const a = await authenticator({ counter: 5, flags: 0x05 });
  await addKey(t, acct, a);
  assert.equal((await login(t, a)).status, 200);
  assert.equal((await login(t, a, { step: 0 })).data.error.code, 'PASSKEY_INVALID');
});

test('adding needs a live session of that account; a deleted account takes its keys', async () => {
  const t = setup();
  const one = await signedIn(t);
  const two = await signedIn(t);
  const a = await authenticator();
  const begin = await post(t, { op: 'passkey-add-begin', qt: one.token });
  assert.equal((await post(t, { op: 'passkey-add', qt: two.token, challenge: begin.data.challenge, credential: a.create(begin.data.challenge) })).data.error.code, 'PASSKEY_EXPIRED');
  assert.equal((await post(t, { op: 'passkey-add-begin', qt: 'nope' })).status, 401);
  const added = await addKey(t, two, a);
  assert.equal(added.status, 200);
  assert.ok([...t.store.keys()].some(k => k.startsWith(`${PASSKEY_COLLECTION}/`)));
  await t.call('DELETE', `?qt=${encodeURIComponent(two.token)}`);
  assert.equal([...t.store.keys()].some(k => k.startsWith(`${PASSKEY_COLLECTION}/`)), false);
  assert.equal((await login(t, a)).data.error.code, 'PASSKEY_UNKNOWN');
});

test('a device code signs in once, within 10 minutes, and not after every device is signed out', async () => {
  const t = setup();
  const acct = await signedIn(t);
  const made = await post(t, { op: 'pair-create', qt: acct.token });
  assert.match(made.data.code, /^[2-9A-HJ-NP-Z]{8}$/);
  const used = await post(t, { op: 'pair-redeem', code: made.data.code.toLowerCase(), app: 'odds' });
  assert.equal(used.status, 200);
  assert.ok(used.data.refresh);
  assert.equal((await post(t, { op: 'pair-redeem', code: made.data.code, app: 'odds' })).data.error.code, 'PAIR_NOT_FOUND');
  const late = await post(t, { op: 'pair-create', qt: used.data.token });
  t.advance(11 * 60_000);
  assert.equal((await post(t, { op: 'pair-redeem', code: late.data.code, app: 'odds' })).data.error.code, 'PAIR_NOT_FOUND');
  const fresh = (await post(t, { op: 'login', passcode: acct.passcode, app: 'odds' })).data;
  const third = await post(t, { op: 'pair-create', qt: fresh.token });
  await post(t, { op: 'signout-all', qt: fresh.token });
  assert.equal((await post(t, { op: 'pair-redeem', code: third.data.code, app: 'odds' })).data.error.code, 'PAIR_NOT_FOUND');
  assert.equal((await post(t, { op: 'pair-create', qt: 'nope' })).status, 401);
});
