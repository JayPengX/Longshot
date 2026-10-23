// Clubs in Chinese the way 台灣運彩's tickets print them, where the kit's
// list has no name for them: Google's reading (the kit's translate, through
// the proxy, kept a month), asked once and kept on this phone. Until a name
// comes back it shows as it was. (People keep their own names: drivers are
// never put into Chinese.)

const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ł/g, 'l').replace(/\s+/g, ' ').trim();
export const hasZh = s => /[㐀-鿿]/.test(String(s || ''));
// What Google is asked: a club's whole name.
const KEY = 'slip.zh.v2';
let kept = {};
try {
  kept = JSON.parse(globalThis.localStorage?.getItem(KEY) || '{}') || {};
} catch {}
const save = () => {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(kept));
  } catch {}
};

// A club's name in Chinese, or null while it isn't known.
export function nameZh(en) {
  if (!en || hasZh(en)) return en || null;
  return kept[`t:${fold(en)}`] ?? null;
}

// Reading the names this phone hasn't yet: a few to a question to Google
// (its answer split back, each checked), one by one when it won't split.
let ask = null;
export const useTranslator = fn => (ask = fn);
// A club may keep a short mark (FC) the way the press prints it.
const usable = s => hasZh(s) && !/[A-Za-z]{4,}/.test(s);
async function readOne(q) {
  const got = String((await ask(q, 'zh-TW', 'en').catch(() => '')) || '').trim();
  return usable(got) ? got : null;
}
async function readChunk(chunk) {
  const out = new Map();
  const got = String((await ask(chunk.map(x => x.q).join('; '), 'zh-TW', 'en').catch(() => '')) || '')
    .split(/[;；]/)
    .map(s => s.trim())
    .filter(Boolean);
  if (got.length === chunk.length && got.every(usable)) chunk.forEach((x, j) => out.set(x.key, got[j]));
  else await Promise.all(chunk.map(async x => out.set(x.key, await readOne(x.q))));
  return out;
}

let busy = Promise.resolve();
const listeners = new Set();
export const onNames = fn => listeners.add(fn);
// The names kept and the page told, a beat after the last to come in.
let telling = 0;
const tell = () => {
  clearTimeout(telling);
  telling = setTimeout(() => {
    save();
    for (const fn of listeners) fn();
  }, 300);
};
// Make sure these games' names are read: their clubs (a championship's contenders too).
// Resolves once they are (or `wait` ms on, the rest coming in behind: the
// page told through onNames).
export function warm(games, { wait = 2500 } = {}) {
  if (!ask) return Promise.resolve();
  const want = new Map();
  const add = name => {
    if (!name || hasZh(name)) return;
    const key = `t:${fold(name)}`;
    if (key in kept || want.has(key)) return;
    want.set(key, { key, q: name });
  };
  for (const g of games || []) {
    for (const s of g?.home && g?.away ? [g.home, g.away] : []) if (!hasZh(s.zh)) add(s.en);
    // A championship's clubs (a race's field is drivers: their own names).
    for (const t of g?.field || []) if ('zh' in t && !hasZh(t.zh)) add(t.name);
  }
  if (!want.size) return Promise.resolve();
  const items = [...want.values()];
  // Four questions at a time; the page told as each comes back.
  const chunks = Array.from({ length: Math.ceil(items.length / 6) }, (_, i) => items.slice(i * 6, i * 6 + 6));
  const job = (busy = busy.then(async () => {
    const todo = chunks.map(c => c.filter(x => !(x.key in kept))).filter(c => c.length);
    const lane = async () => {
      for (let c; (c = todo.shift()); ) {
        let any = false;
        for (const [k, v] of await readChunk(c)) if (v) (kept[k] = v), (any = true);
        if (any) tell();
      }
    };
    await Promise.all([lane(), lane(), lane(), lane()]);
  }));
  return Promise.race([job, new Promise(r => setTimeout(r, wait))]);
}
