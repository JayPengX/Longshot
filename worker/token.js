// ---- token.js ----
// Signed Longshot Pass tokens: pass.js signs them, every other route checks
// them (sports.js, settle.js's /play, kambi.js, slip.js).
//
// A token is `<body>.<sig>`: body is base64url JSON, sig its HMAC-SHA256
// under the token secret. Nothing in a token is secret (it names the
// account's id, never the pass); it only proves /pass issued it.
//
//   { k: kind, d: account id, s: session id, g: the account's token
//     generation, e: expiry (ms) }
//
// kinds:
//   ses  a session: reads and writes /pass (the account's Play data, `odds`,
//        and its tickets, `slip`, with the same one), /play, /kambi,
//        /slip-scan, and reads through /sports-proxy. Short (SESSION_MS);
//        /pass hands a fresh one back while the session is the account's
//        live one, so a device the person has moved away from runs out
//        within minutes.
//   ref  a device's refresh token: trades for a new session (60 days).
//
// The secret: env.TOKEN_SECRET when it's set; otherwise one made at random
// the first time it's needed and kept in the store (D1), so nobody has to
// set one up.

export const SESSION_MS = 20 * 60_000;
// A session run out is still good this long for reading public data through
// /sports-proxy (scores, prices, odds: nothing of the account's): an app
// opened again after a while reads with the token it kept, not after a
// sign-in round trip first. Writes and /pass never.
export const READ_GRACE_MS = 6 * 3_600_000;
export const REFRESH_MS = 60 * 86_400_000;

const enc = new TextEncoder();
const keys = new Map();

export function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(text) {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4));
  return Uint8Array.from(s, c => c.charCodeAt(0));
}

// ---- The secret -------------------------------------------------------------------
//
// Kept as the document config/token-secret ({ secret }), written once with
// an "only if it isn't there" precondition: two isolates making one at the
// same moment both end up with whichever was written first. Read once an
// isolate per store.
export const SECRET_COLLECTION = 'config';
export const SECRET_ID = 'token-secret';
const SCHEMA = 'CREATE TABLE IF NOT EXISTS docs (coll TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, updated TEXT NOT NULL, PRIMARY KEY (coll, id))';
const secrets = new WeakMap();
export async function tokenSecret(env) {
  if (env.TOKEN_SECRET) return env.TOKEN_SECRET;
  const db = env.STORE;
  if (!db) return '';
  if (!secrets.has(db)) secrets.set(db, storedSecret(db).catch(error => (secrets.delete(db), Promise.reject(error))));
  return secrets.get(db);
}
async function storedSecret(db) {
  await db.prepare(SCHEMA).run();
  const read = async () => {
    const row = await db.prepare('SELECT payload FROM docs WHERE coll = ? AND id = ?').bind(SECRET_COLLECTION, SECRET_ID).first();
    try {
      return row ? JSON.parse(row.payload).secret || '' : '';
    } catch {
      return '';
    }
  };
  const had = await read();
  if (had) return had;
  const made = b64url(crypto.getRandomValues(new Uint8Array(32)));
  await db
    .prepare('INSERT OR IGNORE INTO docs (coll, id, payload, updated) VALUES (?, ?, ?, ?)')
    .bind(SECRET_COLLECTION, SECRET_ID, JSON.stringify({ secret: made }), new Date().toISOString())
    .run();
  // (Another isolate's, if it got there first.)
  const kept = await read();
  if (!kept) throw new Error('no token secret');
  return kept;
}

async function hmacKey(secret) {
  if (!keys.has(secret)) keys.set(secret, crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']));
  return keys.get(secret);
}

export async function signToken(secret, claims) {
  const body = b64url(enc.encode(JSON.stringify(claims)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

// The claims of a valid, unexpired token of `kind`, else null.
export async function readToken(secret, token, kind, now = Date.now()) {
  if (!secret || typeof token !== 'string' || token.length > 1024) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  try {
    if (!(await crypto.subtle.verify('HMAC', await hmacKey(secret), unb64url(sig), enc.encode(body)))) return null;
    const claims = JSON.parse(new TextDecoder().decode(unb64url(body)));
    if (!claims || claims.k !== kind || !(claims.e > now)) return null;
    return claims;
  } catch {
    return null;
  }
}

// ---- A limiter in memory -----------------------------------------------------------
//
// Requests carrying a valid token are counted per session in the isolate's
// memory only: the token already proves a real pass is behind them. (Also
// used per address for the calls without one: a sign-up, a sign-in.)
const counts = new Map();
export function sessionLimited(sid, limit, windowMs = 60_000, now = Date.now()) {
  const bucket = Math.floor(now / windowMs);
  const c = counts.get(sid);
  if (!c || c.bucket !== bucket) {
    if (counts.size > 5000) counts.clear();
    counts.set(sid, { bucket, n: 1 });
    return false;
  }
  c.n++;
  return c.n > limit;
}

// ---- Sealed: a short-lived note only this Worker can read -----------------------
//
// A passkey's challenge (passkey.js) goes out sealed (AES-GCM under a key
// from the same secret) and comes back with the passkey's answer: nothing is
// stored until a passkey is made or used.
async function sealKey(secret) {
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(`longshot-seal:${secret}`));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function seal(secret, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await sealKey(secret), enc.encode(JSON.stringify(data))));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return b64url(out);
}

export async function unseal(secret, text) {
  if (!secret || typeof text !== 'string' || text.length > 512) return null;
  try {
    const bytes = unb64url(text);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, await sealKey(secret), bytes.slice(12));
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    return null;
  }
}
