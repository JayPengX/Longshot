// What every route answers with (worker.js routes; pass.js, settle.js,
// sports.js, … handle): who may call it, the CORS headers, a JSON answer,
// the errors in both languages, and a request's body read safely.

// The app's page: GitHub Pages, and its own host on Jay's domain
// (longshot.jaypengx.com, a site Worker reading Pages through).
export const ALLOWED_ORIGINS = ['https://jaypengx.github.io', 'https://longshot.jaypengx.com'];
// A page served from this computer (the preview tool; over --h2 an https
// one, as Pages serves a phone): the dev doors let it in (sports.js, worker.js).
export const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/;

export function isAllowedOrigin(origin) {
  return ALLOWED_ORIGINS.includes(origin) || LOCAL_ORIGIN.test(origin || '');
}

// X-Worker-Colo carries the IATA code of the Cloudflare colo the request came
// in through (request.cf.colo), on every answer. Headers the app reads must
// be listed in Expose-Headers: the data proxy's cache (X-Sports-Proxy-*).
export function corsHeaders(origin, colo) {
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Expose-Headers': 'X-Worker-Colo, X-Sports-Proxy-Cache, X-Sports-Proxy-Cache-Tier, X-Sports-Proxy-Age, X-Sports-Proxy-Final, Server-Timing',
    // Browsers keep a preflight this long (Chrome caps it at 2 hours): the
    // app's JSON writes don't each cost a second Worker request.
    'Access-Control-Max-Age': '86400',
    'X-Worker-Colo': colo || 'unknown',
    Vary: 'Origin'
  };
}

export function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' }
  });
}

// ---- Errors in both languages ----------------------------------------------
//
// Every error carries a stable, never-translated `code` (for the app to show
// its own words) and a `message` in the request's language: English when
// Accept-Language puts English first, else Traditional Chinese.
const ERRORS = {
  RATE_LIMITED: ['Too many requests. Please try again later.', '請求過於頻繁，請稍後再試。'],
  DAILY_QUOTA_EXCEEDED: ["Today's quota has been used up. Please try again tomorrow.", '今日額度已用盡，請明天再試。'],
  INVALID_JSON: ['Invalid JSON body', '無效的 JSON 請求內容。'],
  METHOD_NOT_ALLOWED: ['GET, POST, PATCH or DELETE only', '僅支援 GET、POST、PATCH 或 DELETE 方法。'],
  MISSING_STORE: 'The worker has no store (D1) bound.|Worker 尚未綁定資料庫（D1）。'.split('|'),
  INVALID_PASSCODE: ['Invalid pass', '無效的通行碼。'],
  MISSING_PAYLOAD: ['Missing or invalid payload', '缺少或無效的內容資料。'],
  PASSCODE_NOT_FOUND: ['No Longshot Pass has this code.', '找不到這組通行碼。'],
  CREATE_CLOSED: ['No more new accounts today. Try again tomorrow.', '今天開新帳號的名額滿了，明天再試。'],
  UNKNOWN_APP: ['Unknown app', '未知的應用程式'],
  UNKNOWN_OP: ['Unknown operation', '未知的操作'],
  TOKEN_INVALID: ['Your sign-in has expired. Signing in again…', '登入已過期，正在重新登入…'],
  SIGNED_OUT: ['This device was signed out. Sign in with your Longshot Pass.', '這台裝置已登出，請用 Longshot Pass 登入。'],
  SESSION_MOVED: ['Longshot is open on another device.', 'Longshot 正在另一台裝置使用中。'],
  PASS_REQUIRED: ['Sign in with your Longshot Pass.', '請用 Longshot Pass 登入。'],
  NOT_FOUND: ['Not found', '找不到此路徑。'],
  WORKER_FAILED: ['Something went wrong. Please try again.', '發生錯誤，請再試一次。']
};

function pickLocale(request) {
  const header = (request?.headers?.get?.('Accept-Language') || '').trim();
  return /^en\b/i.test(header) || /,\s*en\b/i.test(header) ? 0 : 1;
}

// `{ error: { code, message } }`, the message in the request's language.
export function errorJson(code, status, headers, request) {
  const message = ERRORS[code]?.[pickLocale(request)] ?? code;
  return json({ error: { code, message } }, status, headers);
}

// The one error whose message is the upstream's own (a store or a source down).
export function upstreamFailed(error, headers) {
  return json({ error: { code: 'UPSTREAM_FAILED', message: error.message || 'Upstream request failed' } }, 502, headers);
}

// A text's SHA-256 as hex.
export async function sha256Hex(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, '0')).join('');
}

// A request's body as text, or null past `max` bytes: read as it comes and
// stopped there (a client may send Cloudflare's 100 MB, more than an
// isolate's 128 MB holds, and a crash takes every request in it along).
export async function bodyText(request, max) {
  if (Number(request.headers.get('Content-Length')) > max) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) {
      reader.cancel().catch(() => {});
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(n);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return new TextDecoder().decode(out);
}

// A body parses to any JSON value, `null` included, so a failed parse needs
// a sentinel of its own: `(await readJsonBody(request)) === INVALID_BODY`
// means the caller should answer INVALID_JSON. So does one past `max` bytes:
// a save is at most a couple of MB.
export const INVALID_BODY = Symbol('invalid body');
export async function readJsonBody(request, max = 4_000_000) {
  try {
    const text = await bodyText(request, max);
    return text == null ? INVALID_BODY : JSON.parse(text);
  } catch {
    return INVALID_BODY;
  }
}
