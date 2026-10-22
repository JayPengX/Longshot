// ---- gemini.js ----
// The Gemini relay (Worker longshot-gemini, wrangler.gemini.toml): the
// ticket photo read (/slip-scan, slip.js) calls Google's Gemini from here, a
// Worker pinned to Taiwan ([placement] gcp:asia-east1), through the main
// Worker's service binding GEMINI. The main Worker runs near each caller, and
// Gemini refuses some of the places a caller's colo can be (Hong Kong). No
// address of its own: only the main Worker reaches it. It alone holds the
// key (the secret GEMINI_API_KEY); without it, every ask is a clear 503.
//
//   POST https://longshot-gemini/?model=<one of SCAN_MODELS>
//        body: Gemini's generateContent request, as is
//   → Gemini's answer, as is (or 503 { error: { code: 'MISSING_API_KEY' } }).
import { SCAN_MODELS } from './slip.js';

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models/';
const MAX_BODY = 3_000_000;

const answer = (status, code, message) => new Response(JSON.stringify({ error: { code, message } }), { status, headers: { 'Content-Type': 'application/json' } });

export async function relay(request, env, fetchFn = fetch) {
  if (request.method !== 'POST') return answer(405, 'METHOD_NOT_ALLOWED', 'POST only');
  const model = new URL(request.url).searchParams.get('model') || '';
  if (!SCAN_MODELS.includes(model)) return answer(400, 'UNKNOWN_MODEL', 'Unknown model');
  if (!env.GEMINI_API_KEY) return answer(503, 'MISSING_API_KEY', 'Not set up');
  if (Number(request.headers.get('Content-Length')) > MAX_BODY) return answer(413, 'TOO_LARGE', 'Too large');
  return fetchFn(`${GEMINI}${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: request.body
  });
}

export default {
  fetch: (request, env) => relay(request, env)
};
