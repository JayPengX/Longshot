// ---- pass.js ----
// /pass: the Longshot Pass, the one account behind Longshot. Play money only.
//
// Passes are handed out by the owner (the admin page, admin.js): there's
// no sign-up. The pass is a 10-character code, stored only as its SHA-256 (a document
// in `passes` naming the account), and typed only to sign in. Signing in
// gives the device a refresh token and a short session token; everything
// else is done with the session. Devices never keep the pass itself. Behind
// it, under the account's id (16 random characters, never shown):
//
//   - the wallet (collection `wallets`): the NT$ balance, as JSON this
//     Worker merges itself (mergeWallet):
//       entries   money in or out, each with a fixed id, so the same entry
//                 sent twice counts once
//       snap      the app's latest figures, newest wins (Play's money in
//                 open bets)
//       settings  newest wins per key
//       live      which session (device) is the live one
//       sec       the token generation (bumped to sign every device out) and
//                 the pass's hash
//   - the app's data, one document for each of APPS: `odds` (Play's
//     account) and `slip` (the 台灣運彩 tickets followed). One session works
//     for both.
//
// With a session token (`qt`):
//   GET    /pass?qt=T[&app=A][&w=W][&since=U]   the wallet, A's data;
//            `active` says whether this session is the account's live one,
//            and while it is a fresh `token` comes back. The wallet the
//            device holds (`w`, its walletTime) isn't sent again (`same`);
//            nor is A's data when it's still the one of `since` (its
//            updateTime): { unchanged: true, updateTime } in place of `payload`
//   PATCH  /pass?qt=T[&app=A]  { payload?, wallet?, w? }   only while live
//          (also POST /pass?app=A { op: 'write', qt, payload?, wallet?, w? }:
//          a POST of plain text is one request, a PATCH two)
//   DELETE /pass?qt=T[&app=A]   the account (or A's data)
//   POST   /pass { op: 'login', passcode, app }        sign in on this device
//   POST   /pass { op: 'refresh', refresh, app, claim?, data?, w?, since? }
//   POST   /pass { op: 'signout-all', qt }             every other device out
//   POST   /pass { op: 'rotate', qt }                  a new pass, same account

import { storeReady } from './doc-store.js';
import { tokenSecret, signToken, readToken, sessionLimited, SESSION_MS, REFRESH_MS } from './token.js';

export const PASSCODE_LENGTH = 10;
export const PASSCODE_PATTERN = /^[2-9A-HJ-NP-Z]{10}$/;
export const WALLET_COLLECTION = 'wallets';
export const PASS_COLLECTION = 'passes';
const ACCOUNT_ID = /^[2-9A-HJ-NP-Z]{16}$/;

// Each app's data collection.
//   odds  Play: the account's bets, settings and history
//   slip  the 台灣運彩 tickets followed (read from a photo, /slip-scan)
export const APPS = {
  odds: { collection: 'play', maxPayload: 1_000_000 },
  slip: { collection: 'slips', maxPayload: 300_000 }
};
// Who can write entries: Play (what it spends), and this Worker itself
// ('pass': the opening money and the weekly pay). An app can't write 'pass'
// entries.
const ENTRY_APPS = new Set(['odds']);

// (D1 holds a row of up to 2 MB.)
export const WALLET_MAX_LENGTH = 1_800_000;
// A wallet past this has its old entries folded into monthly sums (foldWallet).
export const FOLD_AT = 600_000;
const MAX_ENTRIES_PER_WRITE = 1000;
const MAX_AMOUNT = 1_000_000_000;

// Sign-ins per address, LOGIN_PER_HOUR. Calls with a session are counted
// per session in memory (TOKEN_LIMIT a minute).
export const LIMITS = { loginPerHour: 30 };
export const TOKEN_LIMIT = 90;

export function emptyWallet(now = Date.now()) {
  return { v: 1, created: now, entries: [], snap: {}, settings: {} };
}

// ---- The money: an opening and a weekly pay -----------------------------------------
//
// A new pass opens with NT$200,000 (`pass:start`), and the Worker pays
// NT$10,000 each Taiwan week (from Monday 00:00, `pass:pay:<Monday>`): on
// the first sign-in, refresh or save that week; a week nobody opened the app
// is paid the next time (back pay). The week the pass was made pays nothing
// more: its opening is that week's money.
export const PAY = { start: 200_000, week: 10_000 };
const TPE = 8 * 3_600_000;
export const WEEK = 7 * 86_400_000;
// Monday 00:00 (Taiwan) of the week of `t`.
export function weekStart(t) {
  const d = new Date(t + TPE);
  const day = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day) - TPE;
}
// That Monday as YYYY-MM-DD (Taiwan).
export const mondayId = t => new Date(weekStart(t) + TPE).toISOString().slice(0, 10);

// The pay entries due now that the wallet doesn't have yet.
export function paydayEntries(wallet, now) {
  const have = new Set((wallet.entries || []).map(e => e.id));
  const out = [];
  if (!have.has('pass:start')) out.push({ id: 'pass:start', t: now, app: 'pass', kind: 'start', amount: PAY.start });
  const created = Number.isFinite(wallet.created) ? Math.min(wallet.created, now) : now;
  for (let w = weekStart(created) + WEEK, n = 0; w <= now && n < 520; w += WEEK, n++) {
    const id = `pass:pay:${mondayId(w)}`;
    if (!have.has(id)) out.push({ id, t: now, app: 'pass', kind: 'pay', amount: PAY.week });
  }
  return out;
}

const isObj = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : undefined);
const finite = v => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
export const cleanCode = v =>
  String(v || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, '');

// One entry as stored: anything malformed is dropped, not stored.
export function cleanEntry(e, { allowPass = false } = {}) {
  if (!isObj(e)) return null;
  const id = str(e.id, 96);
  const t = finite(e.t);
  const amount = finite(e.amount);
  const app = str(e.app, 12);
  if (!id || t == null || amount == null || Math.abs(amount) > MAX_AMOUNT) return null;
  if (!(ENTRY_APPS.has(app) || (allowPass && app === 'pass'))) return null;
  // The Worker's own ids (the opening, the pay) are its alone.
  if (!allowPass && id.startsWith('pass:')) return null;
  const out = { id, t: Math.round(t), app, kind: str(e.kind, 24) || 'other', amount: Math.round(amount * 100) / 100 };
  const note = str(e.note, 80);
  if (note) out.note = note;
  return out;
}

// A newest-wins map (snap, settings): every value an object with `t`.
function cleanStamped(map, maxKeys, maxValue) {
  const out = {};
  if (!isObj(map)) return out;
  for (const [k, v] of Object.entries(map).slice(0, maxKeys)) {
    if (k.length > 96 || !isObj(v) || finite(v.t) == null) continue;
    if (JSON.stringify(v).length > maxValue) continue;
    out[k] = v;
  }
  return out;
}

// No app adds money: this Worker does (the opening and the pay here,
// Play's payouts and prizes in settle.js and lotto.js). An app's entries are
// what it spends (0 or less).
export const appEntries = entries => entries.filter(e => e.amount <= 0);

// An app's new entries dated by this Worker (a phone's clock can't put an
// entry anywhere else); one already in the wallet keeps its own.
export const stamped = (entries, wallet, now) => {
  const have = new Set((wallet?.entries || []).map(e => e.id));
  return entries.map(e => (have.has(e.id) ? e : { ...e, t: now }));
};

// Settings and figures (newest wins) dated no later than this Worker's now:
// a phone clock set ahead stamped them in the future, and then every later
// change, from any device, lost to them (the server's time wins).
const clampTimes = (map, now) => {
  if (!isObj(map) || !Object.values(map).some(v => v?.t > now)) return map;
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v?.t > now ? { ...v, t: now } : v]));
};
export function atMostNow(w, now) {
  const [snap, settings] = [clampTimes(w?.snap, now), clampTimes(w?.settings, now)];
  return !w || (snap === w.snap && settings === w.settings) ? w : { ...w, snap, settings };
}

// What a client may send to change the wallet.
export function cleanPatch(patch) {
  if (!isObj(patch)) return { entries: [], snap: {}, settings: {} };
  return {
    entries: (Array.isArray(patch.entries) ? patch.entries.slice(0, MAX_ENTRIES_PER_WRITE) : []).map(e => cleanEntry(e)).filter(Boolean),
    snap: cleanStamped(patch.snap, 8, 4000),
    settings: cleanStamped(patch.settings, 32, 4000)
  };
}

const newest = (a = {}, b = {}) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) if (!out[k] || v.t >= out[k].t) out[k] = v;
  return out;
};

// Two wallets (or a wallet and a patch) as one: entries by id (the first
// copy kept, since an entry never changes), the rest newest-wins.
export function mergeWallet(a, b) {
  const base = a || emptyWallet();
  if (!b) return base;
  const entries = new Map(base.entries.map(e => [e.id, e]));
  for (const e of b.entries || []) if (!entries.has(e.id)) entries.set(e.id, e);
  const created = Math.min(base.created ?? Infinity, b.created ?? Infinity);
  return {
    v: 1,
    created: created === Infinity ? Date.now() : created,
    entries: [...entries.values()].sort((x, y) => x.t - y.t || (x.id < y.id ? -1 : 1)),
    snap: newest(base.snap, b.snap),
    settings: newest(base.settings, b.settings),
    // The Worker's own fields: a patch never carries them.
    ...(base.live ? { live: base.live } : {}),
    ...(base.sec ? { sec: base.sec } : {})
  };
}

// The balance right now: every entry.
export function poolBalance(wallet) {
  const sum = (wallet?.entries || []).reduce((s, e) => s + e.amount, 0);
  return Math.round(sum * 100) / 100;
}

export function parseWallet(text) {
  try {
    const w = JSON.parse(text);
    if (isObj(w) && w.v === 1 && Array.isArray(w.entries)) return { ...emptyWallet(w.created), ...w };
  } catch {}
  return null;
}

// What clients see of the wallet: not the Worker's own bookkeeping.
export function publicWallet(w) {
  if (!w) return w;
  const { sec, ...rest } = w;
  return rest;
}

const isActive = (wallet, claims) => Boolean(wallet?.live?.sid) && wallet.live.sid === claims.s;
export const gen = wallet => wallet?.sec?.gen || 0;
const liveOf = wallet => (wallet?.live ? { t: wallet.live.t } : null);

// ---- Handler ---------------------------------------------------------------
//
// deps: the Worker's own plumbing, passed in so this file stays testable:
// { json, errorJson, upstreamFailed, readJsonBody, INVALID_BODY,
//   fsGet(env, collection, id), fsWrite(env, collection, id, payload,
//   precondition), fsDelete(env, collection, id),
//   sha256Hex, generateCode(length), now() }.
//   fsWrite's precondition is { updateTime } or { exists: false }, and a
//   failed one throws an error with `precondition: true`.

const OPS = {
  login: passLogin,
  refresh: passRefresh,
  'signout-all': passSignOutAll,
  rotate: passRotate
};

export async function handlePassRequest(request, env, headers, ip, deps) {
  const { json, errorJson, upstreamFailed } = deps;
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(request.method)) return errorJson('METHOD_NOT_ALLOWED', 405, headers, request);
  if (!storeReady(env)) return errorJson('MISSING_STORE', 500, headers, request);

  const url = new URL(request.url);
  const app = url.searchParams.get('app') || '';
  if (app && !APPS[app]) return errorJson('UNKNOWN_APP', 400, headers, request);

  try {
    const secret = await tokenSecret(env);
    // A save also comes as a POST (`op: 'write'`, the session in the body).
    let method = request.method;
    let body = null;
    if (method === 'POST' || method === 'PATCH') {
      body = await deps.readJsonBody(request);
      if (body === deps.INVALID_BODY || !isObj(body)) return errorJson('INVALID_JSON', 400, headers, request);
    }
    if (method === 'POST') {
      if (body.op === 'write') method = 'PATCH';
      else {
        const run = Object.hasOwn(OPS, body.op) ? OPS[body.op] : null;
        if (!run) return errorJson('UNKNOWN_OP', 400, headers, request);
        return await run({ request, env, headers, ip, deps, body, app: app || str(body.app, 12) || 'odds', secret });
      }
    }

    // Everything else needs a session.
    const claims = await readToken(secret, (method !== request.method && str(body.qt, 4096)) || url.searchParams.get('qt'), 'ses', deps.now());
    if (!claims) return errorJson('TOKEN_INVALID', 401, headers, request);
    if (sessionLimited(`pass:${claims.s}`, TOKEN_LIMIT, 60_000, deps.now())) return errorJson('RATE_LIMITED', 429, headers, request);
    const docId = claims.d;

    if (method === 'GET') {
      const walletDoc = await deps.fsGet(env, WALLET_COLLECTION, docId);
      let wallet = walletDoc.exists ? parseWallet(walletDoc.payload) : null;
      if (!wallet || claims.g !== gen(wallet)) return errorJson('SIGNED_OUT', 401, headers, request);
      let walletTime = walletDoc.updateTime;
      const out = { exists: true, active: isActive(wallet, claims), live: liveOf(wallet) };
      if (out.active) {
        if (paydayEntries(wallet, deps.now()).length) {
          const paid = await updateWallet(env, deps, docId, w => mergeWallet(w, { entries: paydayEntries(w, deps.now()) }));
          if (paid) ({ wallet, updateTime: walletTime } = paid);
        }
        out.token = await sessionToken(secret, claims, deps.now());
      }
      Object.assign(out, { wallet: publicWallet(wallet), walletTime, pool: poolBalance(wallet), updateTime: '', payload: '' });
      sameWallet(out, url.searchParams.get('w'));
      if (app) Object.assign(out, await appData(env, deps, app, docId, url.searchParams.get('since')));
      return json(out, 200, headers);
    }

    if (method === 'PATCH') {
      const hasPayload = body.payload !== undefined;
      if (hasPayload && !(app && typeof body.payload === 'string' && body.payload && body.payload.length <= APPS[app].maxPayload)) {
        return errorJson('MISSING_PAYLOAD', 400, headers, request);
      }
      const now = deps.now();
      let refused = null;
      const result = await updateWallet(
        env,
        deps,
        docId,
        w => {
          refused = null;
          if (claims.g !== gen(w)) return (refused = 'SIGNED_OUT'), w;
          // Only the live device writes: one the person has moved away from
          // must not overwrite what the live one did since.
          if (!isActive(w, claims)) return (refused = 'SESSION_MOVED'), w;
          const patch = atMostNow(cleanPatch(body.wallet), now);
          w = atMostNow(w, now);
          // A save of the app's data alone (nothing for the wallet, no pay
          // due): the wallet isn't rewritten.
          if (!patch.entries.length && !Object.keys(patch.snap).length && !Object.keys(patch.settings).length && !paydayEntries(w, now).length) return w;
          const merged = mergeWallet(w, { ...patch, entries: stamped(appEntries(patch.entries), w, now) });
          return mergeWallet(merged, { entries: paydayEntries(merged, now) });
        },
        { skipIf: () => refused }
      );
      if (!result) return errorJson('SIGNED_OUT', 401, headers, request);
      if (refused) return json({ error: { code: refused, message: refused }, live: liveOf(result.wallet) }, refused === 'SIGNED_OUT' ? 401 : 409, headers);
      const out = { wallet: publicWallet(result.wallet), walletTime: result.updateTime, pool: poolBalance(result.wallet), token: await sessionToken(secret, claims, now) };
      // (A save that left the wallet as the device holds it: not sent back.)
      if (body.w && body.w === result.updateTime) {
        delete out.wallet;
        out.same = true;
      }
      if (hasPayload) out.updateTime = (await deps.fsWrite(env, APPS[app].collection, docId, body.payload)).updateTime;
      return json(out, 200, headers);
    }

    // DELETE
    const w = await deps.fsGet(env, WALLET_COLLECTION, docId);
    const wallet = w.exists ? parseWallet(w.payload) : null;
    if (!wallet || claims.g !== gen(wallet)) return errorJson('SIGNED_OUT', 401, headers, request);
    if (app) {
      await deps.fsDelete(env, APPS[app].collection, docId);
      return json({ deleted: true }, 200, headers);
    }
    await deleteAccount(env, deps, docId);
    return json({ deleted: true }, 200, headers);
  } catch (error) {
    return upstreamFailed(error, headers);
  }
}

const sessionToken = (secret, c, now) => signToken(secret, { k: 'ses', d: c.d, s: c.s, g: c.g, e: now + SESSION_MS });
const refreshToken = (secret, c, now) => signToken(secret, { k: 'ref', d: c.d, s: c.s, g: c.g, e: now + REFRESH_MS });

// ---- Sessions -------------------------------------------------------------------

// A new device session on account `docId`, made the live one: the reply
// every way of signing in shares (a refresh token for the device, a session,
// the wallet and the app's data).
async function signIn(ctx, docId, { passcode = null } = {}) {
  const { env, headers, deps, secret, app } = ctx;
  if (!APPS[app]) return deps.errorJson('UNKNOWN_APP', 400, headers, ctx.request);
  const now = deps.now();
  const sid = deps.generateCode(12);
  // (A handed-out pass's account starts at its first sign-in: no pay for the weeks it waited.)
  const fresh = w => (w.entries.some(e => e.id === 'pass:start') ? w : { ...w, created: now });
  const result = await updateWallet(env, deps, docId, w => ({ ...mergeWallet(fresh(w), { entries: paydayEntries(fresh(w), now) }), live: { sid, t: now } }));
  if (!result) return null;
  const c = { d: docId, s: sid, g: gen(result.wallet) };
  const out = await sessionReply(env, deps, secret, result, c, now, { app });
  out.refresh = await refreshToken(secret, c, now);
  if (passcode) out.passcode = passcode;
  return deps.json(out, 200, headers);
}

// App `app`'s data for the account: { payload, updateTime } ('' for none),
// or { unchanged: true, updateTime } when it's still the one the device
// holds (`since`, the updateTime it came with).
async function appData(env, deps, app, docId, since = '') {
  const doc = await deps.fsGet(env, APPS[app].collection, docId);
  if (!doc.exists) return { payload: '', updateTime: '' };
  if (since && since === doc.updateTime) return { unchanged: true, payload: undefined, updateTime: doc.updateTime };
  return { payload: doc.payload, updateTime: doc.updateTime };
}

// The wallet the device already holds (`w`, its walletTime): not sent again.
function sameWallet(out, w) {
  if (!w || !out.walletTime || w !== out.walletTime) return out;
  delete out.wallet;
  out.same = true;
  return out;
}

async function sessionReply(env, deps, secret, result, c, now, { app, since = '' } = {}) {
  const out = {
    token: await sessionToken(secret, c, now),
    active: true,
    wallet: publicWallet(result.wallet),
    walletTime: result.updateTime,
    pool: poolBalance(result.wallet),
    payload: '',
    updateTime: ''
  };
  if (app) Object.assign(out, await appData(env, deps, app, c.d, since));
  return out;
}

// A new account and its pass, for the owner to hand out (admin.js): its
// opening money comes with its first sign-in.
export async function openAccount(env, deps) {
  const now = deps.now();
  const docId = await newAccountId(env, deps);
  const { passcode, hash } = await newPasscode(env, deps, docId);
  await updateWallet(env, deps, docId, w => ({ ...w, created: now, sec: { gen: 0, pass: hash } }), { create: true });
  return { docId, passcode };
}

// The account a pass opens, or null.
async function accountOfPass(env, deps, hash) {
  const doc = await deps.fsGet(env, PASS_COLLECTION, hash);
  try {
    const id = doc.exists ? JSON.parse(doc.payload).account : null;
    return typeof id === 'string' && ACCOUNT_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

// Sign in with the pass.
async function passLogin(ctx) {
  const { env, deps, headers, request, body, ip } = ctx;
  if (sessionLimited(`login:${ip}`, LIMITS.loginPerHour, 3_600_000, deps.now())) return deps.errorJson('RATE_LIMITED', 429, headers, request);
  const passcode = cleanCode(body.passcode);
  if (!PASSCODE_PATTERN.test(passcode)) return deps.errorJson('INVALID_PASSCODE', 400, headers, request);
  const docId = await accountOfPass(env, deps, await deps.sha256Hex(passcode));
  const res = docId && (await signIn(ctx, docId));
  return res || deps.errorJson('PASSCODE_NOT_FOUND', 404, headers, request);
}

// A device's refresh token for a session. With `claim` this device becomes
// the live one; without, a session comes back only if it already is (else
// { active: false, live }). The refresh token is renewed each time.
async function passRefresh(ctx) {
  const { env, headers, deps, body, secret, app, request } = ctx;
  const { json, errorJson } = deps;
  const now = deps.now();
  const c = await readToken(secret, body.refresh, 'ref', now);
  if (!c) return errorJson('TOKEN_INVALID', 401, headers, request);
  if (!APPS[app]) return errorJson('UNKNOWN_APP', 400, headers, request);
  if (sessionLimited(`r:${c.s}`, 30, 60_000, now)) return errorJson('RATE_LIMITED', 429, headers, request);
  const doc = await deps.fsGet(env, WALLET_COLLECTION, c.d);
  const wallet = doc.exists ? parseWallet(doc.payload) : null;
  if (!wallet || gen(wallet) !== c.g) return errorJson('SIGNED_OUT', 401, headers, request);
  const claims = { d: c.d, s: c.s, g: c.g };
  const live = isActive(wallet, claims);
  const w = str(body.w, 100);
  if (!live && !body.claim) return json(sameWallet({ active: false, live: liveOf(wallet), wallet: publicWallet(wallet), walletTime: doc.updateTime, pool: poolBalance(wallet) }, w), 200, headers);
  let result = { wallet, updateTime: doc.updateTime };
  if (!live || paydayEntries(wallet, now).length) {
    result = await updateWallet(env, deps, c.d, x => ({ ...mergeWallet(x, { entries: paydayEntries(x, now) }), live: { sid: c.s, t: now } }));
    if (!result) return errorJson('SIGNED_OUT', 401, headers, request);
  }
  const out = sameWallet(await sessionReply(env, deps, secret, result, claims, now, { app: body.data ? app : '', since: str(body.since, 100) }), w);
  out.refresh = await refreshToken(secret, claims, now);
  // Taken back from another device that was live meanwhile: this device's
  // copy may be behind (the app is told, 'active').
  if (!live && wallet.live) out.took = true;
  return json(out, 200, headers);
}

// A session whose account still stands at the same generation.
async function liveSession(ctx) {
  const c = await readToken(ctx.secret, ctx.body.qt, 'ses', ctx.deps.now());
  if (!c) return null;
  const doc = await ctx.deps.fsGet(ctx.env, WALLET_COLLECTION, c.d);
  const wallet = doc.exists ? parseWallet(doc.payload) : null;
  return wallet && gen(wallet) === c.g ? c : null;
}

// Every other device signed out: every token issued so far stops working,
// and this device comes back signed in afresh.
async function passSignOutAll(ctx) {
  const { env, headers, deps, request } = ctx;
  const c = await liveSession(ctx);
  if (!c) return deps.errorJson('TOKEN_INVALID', 401, headers, request);
  if (sessionLimited(`so:${c.s}`, 5, 60_000, deps.now())) return deps.errorJson('RATE_LIMITED', 429, headers, request);
  await updateWallet(env, deps, c.d, w => (gen(w) !== c.g ? w : { ...w, sec: { ...(w.sec || {}), gen: gen(w) + 1 }, live: null }));
  const res = await signIn(ctx, c.d);
  return res || deps.errorJson('SIGNED_OUT', 401, headers, request);
}

// A new pass for the same account (the old one leaked, say): the old one
// stops working, every other device is signed out, and this one comes back
// signed in with the new pass. Nothing is copied: the pass only names the
// account.
async function passRotate(ctx) {
  const { env, headers, deps, request } = ctx;
  const c = await liveSession(ctx);
  if (!c) return deps.errorJson('TOKEN_INVALID', 401, headers, request);
  if (sessionLimited(`rot:${c.s}`, 5, 60_000, deps.now())) return deps.errorJson('RATE_LIMITED', 429, headers, request);
  // Taken first (every device out): two rotates at once make one new pass.
  const wallet = await claimAccount(env, deps, c.d, c.g);
  if (!wallet) return deps.errorJson('SIGNED_OUT', 401, headers, request);
  const { passcode, hash } = await newPasscode(env, deps, c.d);
  const old = wallet.sec?.pass;
  await updateWallet(env, deps, c.d, w => ({ ...w, sec: { ...(w.sec || {}), pass: hash } }));
  if (old && old !== hash) await deps.fsDelete(env, PASS_COLLECTION, old);
  return signIn(ctx, c.d, { passcode });
}

// ---- Storage ------------------------------------------------------------------------

// An account taken by this request alone, for a rotate: its generation moved
// on (every token of it stops) over the version read. The wallet as taken,
// or null when another request took it first.
async function claimAccount(env, deps, docId, g) {
  let took = false;
  const result = await updateWallet(env, deps, docId, w => {
    took = gen(w) === g;
    return took ? { ...w, sec: { ...(w.sec || {}), gen: g + 1 }, live: null } : w;
  });
  return took && result ? result.wallet : null;
}

// Read, change and write the wallet, again if another write got in between
// (the store's updateTime precondition). null if there's no such account.
export async function updateWallet(env, deps, docId, change, { create = false, skipIf = () => false } = {}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const doc = await deps.fsGet(env, WALLET_COLLECTION, docId);
    const current = doc.exists ? parseWallet(doc.payload) : null;
    if (!current && !create) return null;
    let next = change(current || emptyWallet(deps.now()));
    // Nothing to write (refused, or no change).
    if (current && (skipIf() || next === current)) return { wallet: current, updateTime: doc.updateTime };
    let text = JSON.stringify(next);
    // Grown big (every bet and prize is an entry): its old ones folded, so
    // it never reaches the limit and stops saving.
    if (text.length > FOLD_AT) {
      next = foldWallet(next, deps.now());
      text = JSON.stringify(next);
    }
    if (text.length > WALLET_MAX_LENGTH) throw new Error('wallet too big');
    try {
      const written = await deps.fsWrite(env, WALLET_COLLECTION, docId, text, doc.exists ? { updateTime: doc.updateTime } : { exists: false });
      return { wallet: next, updateTime: written.updateTime };
    } catch (error) {
      if (!error.precondition) throw error;
    }
  }
  throw new Error('wallet busy, try again');
}

// Old entries as one a month for each app and kind (`fold:<app>:<kind>:<YYYY-MM>`,
// its amount their sum, `n` how many): the balance and every app's and kind's
// sums stay the same. Never folded: the Worker's own (pass:*, ids the pay
// looks up), and Play's until they're over 400 days old (a slip is paid only
// while its stake is in the wallet, and never twice while its payout is: a
// season's futures are settled within the year); anything else after 180 days.
const FOLD_PLAY_MS = 400 * 86_400_000;
const FOLD_MS = 180 * 86_400_000;
export function foldWallet(w, now) {
  const kept = [];
  const folds = new Map();
  for (const e of w.entries || []) {
    const id = String(e?.id || '');
    const age = now - (Number(e?.t) || now);
    const foldable = e?.app && e.app !== 'pass' && Number.isFinite(e.amount) && age > (e.app === 'odds' ? FOLD_PLAY_MS : FOLD_MS);
    if (!foldable && !id.startsWith('fold:')) {
      kept.push(e);
      continue;
    }
    const month = id.startsWith('fold:') ? id.split(':')[3] : new Date(Number(e.t) + TPE).toISOString().slice(0, 7);
    const key = id.startsWith('fold:') ? id : `fold:${e.app}:${e.kind || ''}:${month}`;
    const f = folds.get(key) || { id: key, t: 0, app: e.app, kind: e.kind || '', amount: 0, n: 0 };
    f.amount = Math.round((f.amount + e.amount) * 100) / 100;
    f.n += id.startsWith('fold:') ? Number(e.n) || 0 : 1;
    f.t = Math.max(f.t, Number(e.t) || 0);
    folds.set(key, f);
  }
  return { ...w, entries: [...folds.values(), ...kept].sort((a, b) => (a.t || 0) - (b.t || 0)) };
}

// The account gone: its pass, the app's data and the wallet.
export async function deleteAccount(env, deps, docId) {
  const doc = await deps.fsGet(env, WALLET_COLLECTION, docId);
  const wallet = doc.exists ? parseWallet(doc.payload) : null;
  if (wallet?.sec?.pass) await deps.fsDelete(env, PASS_COLLECTION, wallet.sec.pass);
  for (const { collection } of Object.values(APPS)) await deps.fsDelete(env, collection, docId);
  await deps.fsDelete(env, WALLET_COLLECTION, docId);
}

async function newAccountId(env, deps) {
  for (let i = 0; i < 4; i++) {
    const id = deps.generateCode(16);
    if (!(await deps.fsGet(env, WALLET_COLLECTION, id)).exists) return id;
  }
  throw new Error('could not make an account');
}

// A fresh pass for account `docId`, its document written only if no pass
// has that hash already (astronomically unlikely, 32^10, but checked).
export async function newPasscode(env, deps, docId) {
  for (let i = 0; i < 4; i++) {
    const passcode = deps.generateCode(PASSCODE_LENGTH);
    const hash = await deps.sha256Hex(passcode);
    try {
      await deps.fsWrite(env, PASS_COLLECTION, hash, JSON.stringify({ account: docId }), { exists: false });
      return { passcode, hash };
    } catch (error) {
      if (!error.precondition) throw error;
    }
  }
  throw new Error('could not mint a passcode');
}
