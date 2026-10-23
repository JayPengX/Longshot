// Names in Chinese the way 台灣運彩's tickets print them: clubs Taiwan has
// no name for in the kit's list, and F1 drivers by surname. Known drivers
// from the kit; the rest Google's reading (the kit's translate, through the
// proxy, kept a month), asked once and kept on this phone. Until a name
// comes back it shows as it was.

import { F1_NAMES_ZH } from '../../kit/logos.mjs';

const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ł/g, 'l').replace(/\s+/g, ' ').trim();
export const hasZh = s => /[㐀-鿿]/.test(String(s || ''));
// What Google is asked: a driver's surname with Mr. so it reads as a name,
// not a word; a club's whole name.
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

const surnameOf = name => name.trim().split(/\s+/).at(-1);
// An F1 driver as Taiwan's broadcasts say them (羅素), by surname.
export function driverZh(name) {
  const words = String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/\s+/).filter(w => !/^(jr|sr)\.?$/i.test(w));
  const sur = words.at(-1) || '';
  const hit = Object.entries(F1_NAMES_ZH || {}).find(([k]) => k.toLowerCase() === sur.toLowerCase());
  return hit ? hit[1] : (kept[`p:${fold(sur)}`] ?? null);
}

// A club's name in Chinese, or null while it isn't known.
export function nameZh(en) {
  if (!en || hasZh(en)) return en || null;
  return kept[`t:${fold(en)}`] ?? null;
}

// Reading the names this phone hasn't yet: a few to a question to Google
// (its answer split back, each checked), one by one when it won't split.
let ask = null;
export const useTranslator = fn => (ask = fn);
const clean = s =>
  String(s || '')
    .replace(/^(先生|女士|小姐|夫人|太太)/, '')
    .replace(/(先生|女士|小姐|夫人|太太)$/, '')
    .trim();
// Drivers all in Chinese; clubs may keep a short mark (FC) the way the
// press prints them.
const usable = (s, kind) => hasZh(s) && !(kind === 'p' ? /[A-Za-z]/ : /[A-Za-z]{4,}/).test(s);
// A driver as Google gives them: the surname (after its last ·).
const pick = (s, kind) => (kind === 'p' ? clean(s).split(/[·・‧]/).at(-1).trim() : clean(s));
async function readOne(q, kind) {
  const got = pick(await ask(`${kind === 'p' ? 'Mr. ' : ''}${q}`, 'zh-TW', 'en').catch(() => ''), kind);
  return usable(got, kind) ? got : null;
}
async function readChunk(chunk) {
  const out = new Map();
  const kind = chunk[0].kind;
  const hon = kind === 'p' ? 'Mr. ' : '';
  const got = String((await ask(chunk.map(x => `${hon}${x.q}`).join('; '), 'zh-TW', 'en').catch(() => '')) || '')
    .split(/[;；]/)
    .map(s => pick(s, kind))
    .filter(Boolean);
  if (got.length === chunk.length && got.every(x => usable(x, kind))) chunk.forEach((x, j) => out.set(x.key, got[j]));
  else await Promise.all(chunk.map(async x => out.set(x.key, await readOne(x.q, kind))));
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
// Make sure these games' names are read: their clubs and a race's drivers.
// Resolves once they are (or `wait` ms on, the rest coming in behind: the
// page told through onNames).
export function warm(games, { wait = 2500 } = {}) {
  if (!ask) return Promise.resolve();
  const want = new Map();
  const add = (name, kind) => {
    if (!name || hasZh(name)) return;
    const key = `${kind}:${fold(name)}`;
    if (key in kept || want.has(key)) return;
    want.set(key, { key, q: name, kind });
  };
  for (const g of games || []) {
    for (const s of g?.home && g?.away ? [g.home, g.away] : []) if (!hasZh(s.zh)) add(s.en, 't');
    // A race's field: the drivers Taiwan has no name for yet.
    for (const d of g?.field || []) if (!driverZh(d.name)) add(surnameOf(d.name), 'p');
  }
  if (!want.size) return Promise.resolve();
  const items = [...want.values()].sort((a, b) => a.kind.localeCompare(b.kind));
  // Same kind together, so one question asks alike names.
  const groups = [];
  for (const x of items) {
    const last = groups.at(-1);
    if (last && last[0].kind === x.kind) last.push(x);
    else groups.push([x]);
  }
  // Four questions at a time; the page told as each comes back.
  const chunks = groups.flatMap(grp => Array.from({ length: Math.ceil(grp.length / 6) }, (_, i) => grp.slice(i * 6, i * 6 + 6)));
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
