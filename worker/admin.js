// ---- admin.js ----
// /admin: the owner's panel (public/admin/). Passes are handed out here,
// accounts looked after, and the guards set.
//
// The owner is one Longshot account, named in config/admin. The first
// `claim` (when there's no owner yet) makes that account and its pass and
// answers the pass, once; after that nobody can claim. The panel signs in
// with the owner's pass (`login`) and gets an admin token (12 hours) of its
// own: the phone's session isn't touched, so the panel never takes the
// account off the owner's phone.
//
//   POST /admin { action: 'state' }                        { owner: bool }
//   POST /admin { action: 'claim' }                        { passcode, token }
//   POST /admin { action: 'login', passcode }              { token }
//   POST /admin { action, at: token, ... }                 the owner's tools:
//     overview                  accounts, who's active, the money, today's use
//     accounts                  every account, newest first
//     issue { count }           new passes (1 to 20), answered once
//     signout { ref }           every device of an account signed out
//     repass { ref }            a new pass for an account (the old one stops)
//     delete { ref }            an account gone (never the owner's)
//     guards { guards? }        the guards, set when given
//
// The guards (config/admin's `guards`), read by the routes they guard:
//   scans     ticket photos read by Gemini (/slip-scan); scanCap a Taiwan day
//   play      Play's bets and the lottery (/play): off pauses new ones
// Settling and the board never stop.

import { storeReady, twDay } from './doc-store.js';
import { tokenSecret, signToken, readToken, sessionLimited } from './token.js';
import { WALLET_COLLECTION, PASS_COLLECTION, PASSCODE_PATTERN, cleanCode, parseWallet, poolBalance, gen, openAccount, updateWallet, deleteAccount, newPasscode } from './pass.js';

export const CONFIG_COLLECTION = 'config';
export const ADMIN_ID = 'admin';
const ADMIN_MS = 12 * 3_600_000;
const DAY = 86_400_000;
export const GUARD_DEFAULTS = { scans: true, scanCap: 400, play: true };
const MAX_ISSUE = 20;

// config/admin: { owner, claimed, guards }.
async function readConfig(env, deps) {
  const doc = await deps.fsGet(env, CONFIG_COLLECTION, ADMIN_ID);
  try {
    return { ...(doc.exists ? JSON.parse(doc.payload) : {}), updateTime: doc.updateTime, exists: doc.exists };
  } catch {
    return { exists: doc.exists, updateTime: doc.updateTime };
  }
}

// The guards as the routes read them, kept a minute an isolate (a change
// from the panel is in force within a minute everywhere, at once here).
let cached = null;
export async function guardsOf(env, deps, now = Date.now()) {
  if (cached && cached.store === env.STORE && now - cached.at < 60_000) return cached.guards;
  let guards = { ...GUARD_DEFAULTS };
  try {
    guards = cleanGuards((await readConfig(env, deps)).guards);
  } catch {}
  cached = { store: env.STORE, at: now, guards };
  return guards;
}
export const forgetGuards = () => (cached = null);
function cleanGuards(g = {}) {
  const cap = Math.floor(Number(g?.scanCap));
  return {
    scans: typeof g?.scans === 'boolean' ? g.scans : GUARD_DEFAULTS.scans,
    scanCap: Number.isFinite(cap) ? Math.max(0, Math.min(5000, cap)) : GUARD_DEFAULTS.scanCap,
    play: typeof g?.play === 'boolean' ? g.play : GUARD_DEFAULTS.play
  };
}

const lastUsed = w => Math.max(w?.live?.t || 0, ...(w?.entries || []).map(e => (e.app === 'pass' ? 0 : e.t || 0)));
const started = w => Boolean(w?.entries?.some(e => e.id === 'pass:start'));
const refOf = id => id.slice(0, 6);

async function accounts(env, deps) {
  const rows = await deps.fsList(env, WALLET_COLLECTION, 500);
  return rows.map(r => ({ id: r.id, w: parseWallet(r.payload) })).filter(x => x.w);
}
// The one account a short reference names (never ambiguous), or null.
async function accountByRef(env, deps, ref) {
  if (typeof ref !== 'string' || ref.length < 4) return null;
  const hits = (await accounts(env, deps)).filter(x => x.id.startsWith(ref));
  return hits.length === 1 ? hits[0] : null;
}
const row = (x, owner, now) => ({
  ref: refOf(x.id),
  owner: x.id === owner,
  unused: !started(x.w),
  created: x.w.created || 0,
  last: lastUsed(x.w) || 0,
  balance: Math.round(poolBalance(x.w)),
  devicesOut: gen(x.w),
  live: Boolean(x.w.live?.t && now - x.w.live.t < 60 * DAY)
});

const TOOLS = {
  async overview({ env, deps, owner }) {
    const now = deps.now();
    const list = await accounts(env, deps);
    const used = list.filter(x => started(x.w));
    const active = ms => used.filter(x => now - lastUsed(x.w) < ms).length;
    const balances = used.map(x => poolBalance(x.w));
    const days = Array.from({ length: 14 }, (_, i) => twDay(now - (13 - i) * DAY));
    const byDay = f => days.map(d => used.filter(x => f(x.w) && twDay(f(x.w)) === d).length);
    const today = twDay(now);
    const count = async key => {
      try {
        const r = await env.STORE?.prepare?.('SELECT n FROM days WHERE key = ?1').bind(key).first();
        return Number(r?.n) || 0;
      } catch {
        return 0;
      }
    };
    return {
      at: now,
      accounts: used.length,
      waiting: list.length - used.length,
      active: { day: active(DAY), week: active(7 * DAY), month: active(30 * DAY) },
      money: { total: Math.round(balances.reduce((a, b) => a + b, 0)), top: Math.round(Math.max(0, ...balances)), under: balances.filter(b => b < 1_000).length },
      days,
      starts: byDay(w => w.created),
      lastSeen: byDay(lastUsed),
      today: { scans: await count(`scan:${today}`) },
      guards: await guardsOf(env, deps, now),
      richest: [...used].sort((a, b) => poolBalance(b.w) - poolBalance(a.w)).slice(0, 5).map(x => row(x, owner, now))
    };
  },
  async accounts({ env, deps, owner }) {
    const now = deps.now();
    const list = (await accounts(env, deps)).map(x => row(x, owner, now));
    return { accounts: list.sort((a, b) => b.created - a.created) };
  },
  async issue({ env, deps, body }) {
    const n = Math.max(1, Math.min(MAX_ISSUE, Math.floor(Number(body.count) || 1)));
    const passes = [];
    for (let i = 0; i < n; i++) {
      const { docId, passcode } = await openAccount(env, deps);
      passes.push({ ref: refOf(docId), passcode });
    }
    return { passes };
  },
  async signout({ env, deps, body }) {
    const x = await accountByRef(env, deps, body.ref);
    if (!x) return { error: 'NOT_FOUND', status: 404 };
    await updateWallet(env, deps, x.id, w => ({ ...w, sec: { ...(w.sec || {}), gen: gen(w) + 1 }, live: null }));
    return { ok: true };
  },
  async repass({ env, deps, body }) {
    const x = await accountByRef(env, deps, body.ref);
    if (!x) return { error: 'NOT_FOUND', status: 404 };
    const { passcode, hash } = await newPasscode(env, deps, x.id);
    const old = x.w.sec?.pass;
    await updateWallet(env, deps, x.id, w => ({ ...w, sec: { ...(w.sec || {}), pass: hash, gen: gen(w) + 1 }, live: null }));
    if (old && old !== hash) await deps.fsDelete(env, PASS_COLLECTION, old);
    return { passcode };
  },
  async delete({ env, deps, body, owner }) {
    const x = await accountByRef(env, deps, body.ref);
    if (!x) return { error: 'NOT_FOUND', status: 404 };
    if (x.id === owner) return { error: 'OWNER', status: 400 };
    await deleteAccount(env, deps, x.id);
    return { ok: true };
  },
  async guards({ env, deps, body }) {
    if (body.guards && typeof body.guards === 'object') {
      for (let i = 0; i < 4; i++) {
        const cfg = await readConfig(env, deps);
        const { updateTime, exists, ...keep } = cfg;
        const next = { ...keep, guards: cleanGuards({ ...cleanGuards(cfg.guards), ...body.guards }) };
        try {
          await deps.fsWrite(env, CONFIG_COLLECTION, ADMIN_ID, JSON.stringify(next), exists ? { updateTime } : { exists: false });
          break;
        } catch (e) {
          if (!e.precondition) throw e;
        }
      }
      forgetGuards();
    }
    return { guards: await guardsOf(env, deps, deps.now()) };
  }
};

export async function handleAdmin(request, env, headers, ip, deps) {
  const { json, errorJson } = deps;
  if (request.method !== 'POST') return errorJson('METHOD_NOT_ALLOWED', 405, headers, request);
  if (!storeReady(env)) return errorJson('MISSING_STORE', 500, headers, request);
  if (sessionLimited(`admin:${ip}`, 60, 60_000, deps.now())) return errorJson('RATE_LIMITED', 429, headers, request);
  const body = await deps.readJsonBody(request);
  if (body === deps.INVALID_BODY || !body || typeof body !== 'object') return errorJson('INVALID_JSON', 400, headers, request);
  const secret = await tokenSecret(env);
  const cfg = await readConfig(env, deps);
  const now = deps.now();
  const adminToken = (d, g) => signToken(secret, { k: 'adm', d, g, e: now + ADMIN_MS });

  if (body.action === 'state') return json({ owner: Boolean(cfg.owner) }, 200, headers);

  // The first owner: made once, when there's none. Written with "only if
  // nobody did first": two claims at once make one owner.
  if (body.action === 'claim') {
    if (cfg.owner) return errorJson('CLAIMED', 403, headers, request);
    const { docId, passcode } = await openAccount(env, deps);
    const { updateTime, exists, ...keep } = cfg;
    try {
      await deps.fsWrite(env, CONFIG_COLLECTION, ADMIN_ID, JSON.stringify({ ...keep, owner: docId, claimed: now }), exists ? { updateTime } : { exists: false });
    } catch (e) {
      await deleteAccount(env, deps, docId);
      if (e.precondition) return errorJson('CLAIMED', 403, headers, request);
      throw e;
    }
    return json({ passcode, token: await adminToken(docId, 0) }, 200, headers);
  }

  if (body.action === 'login') {
    if (sessionLimited(`admin-login:${ip}`, 10, 3_600_000, now)) return errorJson('RATE_LIMITED', 429, headers, request);
    const code = cleanCode(body.passcode);
    if (!cfg.owner || !PASSCODE_PATTERN.test(code)) return errorJson('NOT_OWNER', 403, headers, request);
    const pass = await deps.fsGet(env, PASS_COLLECTION, await deps.sha256Hex(code));
    let account = null;
    try {
      account = pass.exists ? JSON.parse(pass.payload).account : null;
    } catch {}
    if (account !== cfg.owner) return errorJson('NOT_OWNER', 403, headers, request);
    const w = await deps.fsGet(env, WALLET_COLLECTION, account);
    return json({ token: await adminToken(account, gen(w.exists ? parseWallet(w.payload) : null)) }, 200, headers);
  }

  // Everything else: the owner's admin token, at the owner's current
  // generation (signing the owner out everywhere signs the panel out too).
  const c = await readToken(secret, body.at, 'adm', now);
  if (!c || c.d !== cfg.owner) return errorJson('NOT_OWNER', 403, headers, request);
  const ow = await deps.fsGet(env, WALLET_COLLECTION, c.d);
  if (gen(ow.exists ? parseWallet(ow.payload) : null) !== c.g) return errorJson('NOT_OWNER', 403, headers, request);
  const tool = Object.hasOwn(TOOLS, body.action) ? TOOLS[body.action] : null;
  if (!tool) return errorJson('UNKNOWN_ACTION', 400, headers, request);
  const out = await tool({ env, deps, body, owner: cfg.owner });
  return out.error ? errorJson(out.error, out.status || 400, headers, request) : json(out, 200, headers);
}
