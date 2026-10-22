// ---- deps.js ----
// The Worker's own plumbing, handed to the routes and the clock's jobs
// (pass.js, settle.js, lotto.js, kambi.js, board.js take it as `deps`, so
// each stays testable without Cloudflare): the store's calls, codes, the
// time, and the reads a slip's check and a run make.

import { json, errorJson, upstreamFailed, readJsonBody, INVALID_BODY, sha256Hex } from './http.js';
import { docStore, countDay } from './doc-store.js';
import { handleSports } from './sports.js';
import { handleData } from './data.js';
import { ASIA_HOST, asiaBaseballResponse } from './asia-baseball.js';
import { F1_LIVE_HOST, f1LiveResponse } from './f1-live.js';
import { fetchKambiLive } from './kambi.js';

// The address this Worker's own routes are called at in place (never fetched).
export const INTERNAL = 'https://longshot.internal';

const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
// A random code (passes, account ids, session ids): never 0, 1, O or I.
// (Codes are random, never chosen by a person, so a plain SHA-256 of a pass
// is enough: a leak of the database never hands over a working pass.)
export function generateCode(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
}

// The store (doc-store.js): D1.
export const DOCS = docStore();
export const BASE_DEPS = {
  json,
  errorJson,
  upstreamFailed,
  readJsonBody,
  INVALID_BODY,
  fsGet: DOCS.get,
  fsWrite: DOCS.write,
  fsDelete: DOCS.delete,
  fsList: DOCS.list,
  countDay,
  sha256Hex,
  generateCode,
  now: () => Date.now()
};

// /kambi and its run (kambi.js): the same plumbing, and Kambi's live data.
export const KAMBI_DEPS = { ...BASE_DEPS, fetchLive: fetchKambiLive };

// Settling (settle.js): the sources read directly (the Asian leagues' months
// and F1's archive in this Worker, as the sports proxy serves them).
export async function readSource(url) {
  try {
    const u = new URL(url);
    const res = u.hostname === ASIA_HOST ? await asiaBaseballResponse(u) : u.hostname === F1_LIVE_HOST ? (u.pathname === '/session.json' ? await f1LiveResponse(u) : null) : await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    return res?.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// (The sports proxy is this Worker's own route: called in place, its cache
// writes kept within this call.)
const inPlace = { waitUntil: p => p?.catch?.(() => {}), passThroughOnException() {} };
// The proxy's answer for one URL, read in place as this Worker (`ip`
// 'worker': no pass needed, sports.js checkSession).
async function viaProxy(env, url, trim = '', within) {
  const ask = `${INTERNAL}/sports-proxy?url=${encodeURIComponent(url)}${trim ? `&trim=${encodeURIComponent(trim)}` : ''}${within != null ? `&within=${within}` : ''}`;
  return handleSports(new Request(ask), env, inPlace, {}, 'worker');
}

// A placed slip's prices are read as Play reads them: through the sports
// proxy (its cache and trims), the packs from R2 (/data/).
// (`within`: every read on a copy at most that many seconds old; a live bet's second look.)
export const priceReads = (env, within) => ({
  read: async (url, trim = '') => {
    const res = await viaProxy(env, url, trim, within);
    if (!res.ok) throw new Error(`proxy ${res.status}`);
    return res.json();
  },
  // A pack, read in place (data.js: R2). None built yet answers 404: the
  // kit reads its source instead (play-sources packJson's fallback).
  pack: async path => {
    const res = await handleData(new Request(`${INTERNAL}/data/${path}`), env, inPlace, {}, 'worker', `/data/${path}`);
    if (!res.ok) throw new Error(`pack ${res.status}`);
    return res.json();
  }
});

// The board's reads through the data proxy's route (its trims, its cache):
// the JSON, or null.
export const builderProxy = env => async (url, trim = '') => {
  const res = await viaProxy(env, url, trim);
  return res.ok ? res.json() : null;
};

// Settling's plumbing (settle.js, lotto.js). (OpenF1, a race's flags,
// through the proxy's route: its cache answers when OpenF1 turns the shared
// address away.)
export const playDeps = env => ({
  ...BASE_DEPS,
  read: url => (url.startsWith('https://api.openf1.org/') ? priceReads(env).read(url).catch(() => null) : readSource(url)),
  prices: priceReads(env),
  livePrices: priceReads(env, 2)
});
