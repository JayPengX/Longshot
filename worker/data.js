// ---- data.js: /data/…, what the Worker builds, served from R2 ----
// Play's home board (board.js, every ten minutes) is kept in R2 (bucket
// longshot-data, binding DATA) and served here at /data/<path>.
//
//   GET  /data/<path>        a file: the edge cache first (one R2 read serves
//                            everyone in a colo for a minute or more), then R2
//
// Reads are public (a phone reads the board before it's signed in), counted
// per address in memory. The data proxy's kept copies (sports.js, `kept/`)
// are in the same bucket and never served here.

import { json } from './http.js';
import { sessionLimited } from './token.js';
import { BOARD_PATH } from '#kit/play-boardfile.mjs';

const TYPES = { json: 'application/json', gz: 'application/gzip', txt: 'text/plain; charset=utf-8' };
const typeOf = path => TYPES[/\.([a-z]+)$/.exec(path)?.[1]] || 'application/octet-stream';
// How long a phone and the edge keep a file: Play's board (built every ten
// minutes, its odds the freshest thing here) a minute, then served stale
// while the next is read; anything else ten.
const maxAge = path => (path === BOARD_PATH ? 60 : 600);
export const cacheControl = path => `public, max-age=${maxAge(path)}${path === BOARD_PATH ? ', stale-while-revalidate=300' : ''}`;
export const READS_PER_MIN = 900;
// The edge cache's own address for a file (never fetched: only a key).
const CACHE_HOST = 'https://longshot-data.internal/';

// A file's path as kept: no empty, '.' or '..' parts, no leading slash.
export const validPath = p => typeof p === 'string' && p.length > 0 && p.length <= 900 && !p.startsWith('/') && !p.split('/').some(s => s === '' || s === '.' || s === '..');
export function cleanPath(raw) {
  try {
    const p = decodeURIComponent(raw);
    return validPath(p) ? p : null;
  } catch {
    return null;
  }
}

async function readFile(env, ctx, path) {
  const key = new Request(`${CACHE_HOST}${path}`);
  const cache = globalThis.caches?.default || null;
  const hit = cache && (await cache.match(key));
  // (A file not built yet is noted at the edge for 2 minutes: an app asks
  // again every 15 s, each an R2 read for nothing.)
  if (hit) return hit.headers.get('X-Data-Missing') ? new Response('', { status: 404 }) : hit;
  const obj = env.DATA ? await env.DATA.get(path) : null;
  if (!obj) {
    if (cache) ctx.waitUntil(cache.put(key, new Response('', { headers: { 'X-Data-Missing': '1', 'Cache-Control': 'public, max-age=120' } })));
    return new Response('', { status: 404 });
  }
  const res = new Response(obj.body, { headers: { 'Content-Type': typeOf(path), ETag: obj.httpEtag, 'Cache-Control': cacheControl(path) } });
  if (cache) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

export async function handleData(request, env, ctx, headers, ip, path) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: { message: 'GET only' } }, 405, headers);
  if (ip !== 'worker' && sessionLimited(`data:${ip}`, READS_PER_MIN)) return json({ error: { message: 'Too many requests' } }, 429, headers);
  const file = cleanPath(path.slice('/data/'.length));
  if (!file || file.startsWith('kept/')) return json({ error: { message: 'Not found' } }, 404, headers);
  const res = await readFile(env, ctx, file);
  const out = new Response(request.method === 'HEAD' ? null : res.body, res);
  for (const [k, v] of Object.entries(headers)) out.headers.set(k, v);
  const tag = res.headers.get('ETag');
  if (tag && request.headers.get('If-None-Match') === tag) return new Response(null, { status: 304, headers: out.headers });
  return out;
}
