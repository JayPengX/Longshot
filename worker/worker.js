// ---- worker.js ----
// Longshot's Worker (longshot.pengzjay.workers.dev): every route, by path.
//
//   /pass           the Longshot Pass: sign-in, the wallet and the app's
//                   data (pass.js)
//   /admin          the owner's panel: passes handed out, the guards (admin.js);
//                   opened in a browser, it goes on to the panel's page
//   /play           Play's slips placed and settled, the lottery (settle.js,
//                   price.js, lotto.js)
//   /kambi          Kambi matches watched for settling (kambi.js)
//   /slip-scan      a 台灣運彩 ticket's photo read by Gemini (slip.js)
//   /sports-proxy   the data proxy (sports.js)
//   /data/<path>    what the Worker builds, from R2 (data.js)
//
// The minute's jobs (settling, the lottery, Kambi, the board) run on the
// clock (clock.js): a Durable Object's alarm, woken by any request and by
// the crons.

import { corsHeaders, errorJson, LOCAL_ORIGIN } from './http.js';
import { readToken, tokenSecret, sessionLimited } from './token.js';
import { handlePassRequest } from './pass.js';
import { handleAdmin, guardsOf } from './admin.js';
import { handlePlay } from './settle.js';
import { handleKambiRequest } from './kambi.js';
import { handleSlipScan } from './slip.js';
import { handleSports } from './sports.js';
import { handleData } from './data.js';
import { BASE_DEPS, KAMBI_DEPS, playDeps } from './deps.js';
import { wake, tick } from './clock.js';

export { Clock } from './clock.js';

const ADMIN_PAGE = 'https://longshot.jaypengx.com/admin/';

// The session a request carries (`qt=`), or null.
async function sessionOf(request, env) {
  const qt = new URL(request.url).searchParams.get('qt');
  return qt ? readToken(await tokenSecret(env), qt, 'ses') : null;
}

// Gemini (`generateContent`) with the schema as the answer's shape, called
// from here: the Worker runs in Taiwan (wrangler.toml's [placement]), never
// Hong Kong, which Gemini refuses. Gemini's answer as is.
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models/';
export function geminiVia(env, headers, fetchFn = fetch) {
  return async (model, parts, schema) => {
    const res = await fetchFn(`${GEMINI}${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { response_mime_type: 'application/json', response_schema: schema, temperature: 0, maxOutputTokens: 24576, thinkingConfig: { thinkingLevel: 'low' } }
      })
    });
    return new Response(res.body, { status: res.status, headers: { ...headers, 'Content-Type': 'application/json' } });
  };
}

// Every route, by path (fetch below answers anything that throws).
async function route(request, env, ctx, headers, origin) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const path = new URL(request.url).pathname.replace(/\/+$/, '');

  if (path === '/pass') return handlePassRequest(request, env, headers, ip, BASE_DEPS);
  // (Typed into Safari, the Worker's address answered a line of JSON: a black page.)
  if (path === '/admin' && request.method === 'GET') return Response.redirect(ADMIN_PAGE, 302);
  if (path === '/admin') return handleAdmin(request, env, headers, ip, BASE_DEPS);
  // The data proxy (sports.js): its own session gate and limits.
  if (path === '/sports-proxy') return handleSports(request, env, ctx, headers, ip);
  if (path.startsWith('/data/')) return handleData(request, env, ctx, headers, ip, path);
  if (path === '/slip-scan') return handleSlipScan(request, env, headers, ip, geminiVia(env, headers), await guardsOf(env, BASE_DEPS));
  if (path === '/kambi') {
    // A session only, counted per session in memory.
    const session = await sessionOf(request, env);
    if (!session) return errorJson('TOKEN_INVALID', 401, headers, request);
    if (sessionLimited(`k:${session.s}`, 60)) return errorJson('RATE_LIMITED', 429, headers, request);
    return handleKambiRequest(request, env, headers, KAMBI_DEPS);
  }
  if (path === '/play') {
    const session = await sessionOf(request, env);
    if (session && sessionLimited(`pl:${session.s}`, 30)) return errorJson('RATE_LIMITED', 429, headers, request);
    // The dev door: a localhost page may have a slip's prices checked (nothing placed), 10 a minute an address.
    const dev = !session && LOCAL_ORIGIN.test(origin);
    if (dev && sessionLimited(`pl:dev:${ip}`, 10)) return errorJson('RATE_LIMITED', 429, headers, request);
    return handlePlay(request, env, headers, session, { ...playDeps(env), dev, guards: await guardsOf(env, BASE_DEPS) });
  }
  return errorJson('NOT_FOUND', 404, headers, request);
}

// How long the Worker took to answer (Server-Timing: w;dur=ms), readable by
// the app (http.js exposes it): a slow answer says whether the time went
// here (an upstream such as ESPN) or on the way to the phone.
function timed(res, t0) {
  if (!res || res.status === 101 || res.webSocket) return res;
  try {
    res.headers.set('Server-Timing', `w;dur=${Date.now() - t0}`);
    return res;
  } catch {
    const copy = new Response(res.body, res);
    copy.headers.set('Server-Timing', `w;dur=${Date.now() - t0}`);
    return copy;
  }
}

export default {
  // A route that throws is still answered with the CORS headers (an app sees
  // a failure it can try again, not a blocked request), and logged.
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin, request.cf?.colo);
    wake(env, ctx);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const t0 = Date.now();
    try {
      return timed(await route(request, env, ctx, headers, origin), t0);
    } catch (error) {
      console.log('route failed', new URL(request.url).pathname, String(error?.message || error).slice(0, 200));
      return errorJson('WORKER_FAILED', 500, headers, request);
    }
  },

  // The crons (wrangler.toml [triggers], the even and the odd minutes): the
  // clock's backup. Its minute is run once, by whichever comes first.
  async scheduled(event, env, ctx) {
    tick(env, ctx, event.scheduledTime || Date.now());
  }
};
