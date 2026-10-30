// ---- passkey.js ----
// Passkeys for the Longshot Pass: a key made in the phone's (or computer's)
// secure chip, unlocked with Face ID, Touch ID, Windows Hello or a PIN,
// that signs in without typing the pass. On top of the pass, never instead
// of it: both sign in.
//
// The RP ID is Longshot's own address (longshot.jaypengx.com), so a passkey
// made here serves Longshot alone (the Orbit apps have their own Pass and
// their own passkeys); this Worker takes them only from the pages in rpOf.
//
// Kept in the wallet (`passkeys`: { user, keys: [{ id, alg, jwk, n, be, bs,
// via, on, t, used }] }); `passkeys` (the collection) finds the account from a
// key's id (doc id: the id's SHA-256, payload { d, id }).
//
//   POST /pass { op: 'passkey-begin' }                               a sign-in challenge (5 min)
//   POST /pass { op: 'passkey-login', challenge, credential, app }   signed in
//   POST /pass { op: 'passkey-add-begin', qt }                       a challenge to make one
//   POST /pass { op: 'passkey-add', qt, challenge, credential, device }
//   POST /pass { op: 'passkey-remove', qt, id }
//
// Challenges are sealed (token.js seal): nothing is stored until a passkey
// is made or used.

import { verifyRegistration, verifyAssertion, b64url, PROVIDERS } from './webauthn.js';
import { seal, unseal, readToken, sessionLimited } from './token.js';

export const PASSKEY_COLLECTION = 'passkeys';
export const PASSKEY_MAX = 10;
export const PASSKEY_MS = 5 * 60_000;
export const RP_ID = 'longshot.jaypengx.com';
export const PASSKEY_PAGES = [`https://${RP_ID}`];
const LOCAL = /^http:\/\/localhost(:\d{1,5})?$/;

// The page a passkey may be made or used on, and its RP ID. (A local page
// only where PASSKEY_DEV is on: the tests and a local preview.)
export const rpOf = env => origin => (PASSKEY_PAGES.includes(origin) ? RP_ID : env.PASSKEY_DEV === 'on' && LOCAL.test(origin) ? 'localhost' : null);

const str = (v, max) => (typeof v === 'string' && v.length <= max ? v : '');
const keysOf = wallet => (Array.isArray(wallet?.passkeys?.keys) ? wallet.passkeys.keys : []);
const indexId = (deps, id) => deps.sha256Hex(`pk:${id}`);
const bad = (ctx, code, status = 400) => ctx.deps.errorJson(code, status, ctx.headers, ctx.request);
// The device it was made on, as the page names it ('iPhone', 'Windows'…).
const DEVICES = new Set(['iPhone', 'iPad', 'Mac', 'Windows', 'Android', 'ChromeOS', 'Linux']);

// Apple's passkeys carry no AAGUID (all zeros): a synced one made on an
// Apple device is in iCloud Keychain.
const appleKeychain = (made, device) => (made.be && /^[0-]*$/.test(made.aaguid || '') && ['iPhone', 'iPad', 'Mac'].includes(device) ? 'icloud' : '');

// What the page sees of a passkey: never its key.
export const passkeySummary = wallet => keysOf(wallet).map(k => ({ id: k.id, via: k.via || '', on: k.on || '', sync: Boolean(k.be), t: k.t, used: k.used || 0 }));
export const passkeyIds = wallet => keysOf(wallet).map(k => k.id);

// What pass.js lends: its wallet, its sign-in and its session check
// (passed in, so the two files don't import each other).
let PASS = null;
export const usePass = pass => (PASS = pass);

async function session(ctx) {
  const c = await readToken(ctx.secret, ctx.body.qt, 'ses', ctx.deps.now());
  if (!c) return null;
  const doc = await ctx.deps.fsGet(ctx.env, PASS.WALLET_COLLECTION, c.d);
  const wallet = doc.exists ? PASS.parseWallet(doc.payload) : null;
  return wallet && PASS.gen(wallet) === c.g ? { c, wallet } : null;
}

const walletReply = (ctx, result) => ctx.deps.json({ wallet: PASS.publicWallet(result.wallet), walletTime: result.updateTime, pool: PASS.poolBalance(result.wallet) }, 200, ctx.headers);

// A challenge to sign in with any passkey of ours (the browser lists them).
export async function passkeyBegin(ctx) {
  if (sessionLimited(`pk:${ctx.ip}`, 120, 3_600_000, ctx.deps.now())) return bad(ctx, 'RATE_LIMITED', 429);
  const exp = ctx.deps.now() + PASSKEY_MS;
  return ctx.deps.json({ challenge: await seal(ctx.secret, { k: 'pki', e: exp, n: ctx.deps.generateCode(8) }), exp }, 200, ctx.headers);
}

export async function passkeyLogin(ctx) {
  const { env, deps, body, secret } = ctx;
  if (sessionLimited(`login:${ctx.ip}`, PASS.LIMITS.loginPerHour, 3_600_000, deps.now())) return bad(ctx, 'RATE_LIMITED', 429);
  const now = deps.now();
  const challenge = str(body.challenge, 512);
  const sealed = await unseal(secret, challenge);
  if (sealed?.k !== 'pki' || !(sealed.e > now)) return bad(ctx, 'PASSKEY_EXPIRED', 410);
  const cred = body.credential || {};
  const id = str(cred.id, 1400);
  if (!id) return bad(ctx, 'PASSKEY_INVALID');
  const found = await deps.fsGet(env, PASSKEY_COLLECTION, await indexId(deps, id));
  let docId = '';
  try {
    docId = found.exists ? JSON.parse(found.payload).d : '';
  } catch {}
  const doc = docId ? await deps.fsGet(env, PASS.WALLET_COLLECTION, docId) : { exists: false };
  const wallet = doc.exists ? PASS.parseWallet(doc.payload) : null;
  const key = keysOf(wallet).find(k => k.id === id);
  // (Removed here, or its account gone: the page tells the browser to forget it.)
  if (!key) return bad(ctx, 'PASSKEY_UNKNOWN', 404);
  let used;
  try {
    used = await verifyAssertion({ clientDataJSON: str(cred.clientDataJSON, 6000), authenticatorData: str(cred.authenticatorData, 6000), signature: str(cred.signature, 1200) }, { challenge, origins: rpOf(env), key });
  } catch {
    return bad(ctx, 'PASSKEY_INVALID', 401);
  }
  // A counter that went back: a copy of a key that should have none (a
  // synced passkey counts nothing, 0 every time).
  if ((key.n || used.signCount) && used.signCount <= (key.n || 0)) return bad(ctx, 'PASSKEY_INVALID', 401);
  await PASS.updateWallet(env, deps, docId, w => ({ ...w, passkeys: { ...w.passkeys, keys: keysOf(w).map(k => (k.id === id ? { ...k, n: used.signCount, used: now, bs: used.bs } : k)) } }));
  const res = await PASS.signIn(ctx, docId);
  return res || bad(ctx, 'PASSKEY_UNKNOWN', 404);
}

// A challenge to make a passkey for the signed-in account, with what the
// browser shows (the account's number) and the keys it already has.
export async function passkeyAddBegin(ctx) {
  const { deps, secret } = ctx;
  const s = await session(ctx);
  if (!s) return bad(ctx, 'TOKEN_INVALID', 401);
  if (sessionLimited(`pk:${s.c.s}`, 20, 60_000, deps.now())) return bad(ctx, 'RATE_LIMITED', 429);
  const keys = keysOf(s.wallet);
  if (keys.length >= PASSKEY_MAX) return bad(ctx, 'PASSKEY_FULL', 409);
  const user = s.wallet.passkeys?.user || b64url(crypto.getRandomValues(new Uint8Array(16)));
  const exp = deps.now() + PASSKEY_MS;
  const challenge = await seal(secret, { k: 'pka', d: s.c.d, g: s.c.g, u: user, e: exp });
  // (The account number as the Pass card shows it.)
  const name = `Longshot Pass ${s.c.d.slice(0, 6)}`;
  return deps.json({ challenge, exp, user: { id: user, name, displayName: name }, exclude: keys.map(k => k.id) }, 200, ctx.headers);
}

export async function passkeyAdd(ctx) {
  const { env, deps, body, secret } = ctx;
  const s = await session(ctx);
  if (!s) return bad(ctx, 'TOKEN_INVALID', 401);
  if (sessionLimited(`pk:${s.c.s}`, 20, 60_000, deps.now())) return bad(ctx, 'RATE_LIMITED', 429);
  const now = deps.now();
  const challenge = str(body.challenge, 512);
  const sealed = await unseal(secret, challenge);
  if (sealed?.k !== 'pka' || sealed.d !== s.c.d || sealed.g !== s.c.g || !(sealed.e > now)) return bad(ctx, 'PASSKEY_EXPIRED', 410);
  const cred = body.credential || {};
  let made;
  try {
    made = await verifyRegistration({ id: str(cred.id, 1400) || undefined, clientDataJSON: str(cred.clientDataJSON, 6000), attestationObject: str(cred.attestationObject, 22_000) }, { challenge, origins: rpOf(env) });
  } catch {
    return bad(ctx, 'PASSKEY_INVALID');
  }
  const at = await indexId(deps, made.id);
  try {
    await deps.fsWrite(env, PASSKEY_COLLECTION, at, JSON.stringify({ d: s.c.d, id: made.id }), { exists: false });
  } catch (error) {
    if (!error.precondition) throw error;
    return bad(ctx, 'PASSKEY_TAKEN', 409);
  }
  const key = { id: made.id, alg: made.alg, jwk: made.jwk, n: made.signCount, be: made.be, bs: made.bs, via: PROVIDERS[made.aaguid] || appleKeychain(made, body.device), on: DEVICES.has(body.device) ? body.device : '', t: now, used: 0 };
  let refused = null;
  const result = await PASS.updateWallet(
    env,
    deps,
    s.c.d,
    w => {
      refused = null;
      if (PASS.gen(w) !== s.c.g) return (refused = 'SIGNED_OUT'), w;
      if (keysOf(w).length >= PASSKEY_MAX) return (refused = 'PASSKEY_FULL'), w;
      return { ...w, passkeys: { user: w.passkeys?.user || sealed.u, keys: [...keysOf(w), key] } };
    },
    { skipIf: () => refused }
  );
  if (!result || refused) {
    await deps.fsDelete(env, PASSKEY_COLLECTION, at);
    return bad(ctx, refused || 'SIGNED_OUT', refused === 'PASSKEY_FULL' ? 409 : 401);
  }
  return walletReply(ctx, result);
}

export async function passkeyRemove(ctx) {
  const { env, deps, body } = ctx;
  const s = await session(ctx);
  if (!s) return bad(ctx, 'TOKEN_INVALID', 401);
  const id = str(body.id, 1400);
  if (!id) return bad(ctx, 'PASSKEY_UNKNOWN', 404);
  const result = await PASS.updateWallet(env, deps, s.c.d, w => (keysOf(w).some(k => k.id === id) ? { ...w, passkeys: { ...w.passkeys, keys: keysOf(w).filter(k => k.id !== id) } } : w));
  await dropIndex(env, deps, s.c.d, [id]);
  return result ? walletReply(ctx, result) : bad(ctx, 'SIGNED_OUT', 401);
}

// Index entries of these keys that still lead to `docId`, deleted.
export async function dropIndex(env, deps, docId, ids) {
  for (const id of ids) {
    const at = await indexId(deps, id);
    const doc = await deps.fsGet(env, PASSKEY_COLLECTION, at);
    let d = '';
    try {
      d = doc.exists ? JSON.parse(doc.payload).d : '';
    } catch {}
    if (doc.exists && (!d || d === docId)) await deps.fsDelete(env, PASSKEY_COLLECTION, at);
  }
}
