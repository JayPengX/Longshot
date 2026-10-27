// Small pure helpers for the 彩券 tab's wording, kept apart from the DOM code so
// tests can reach them: 期別, the sales cutoff, 獎別, the prize table's rules,
// and what the slip may offer (倍數, 多期, 包牌), on the kit's own exports
// (play-lottery.mjs: closesAt, tierName, limits, drawTerm…).
import { GAMES } from './lib/lottery.mjs';
import * as kit from './lib/lottery.mjs';

// 「第 115000083 期」 / "Draw 115000083"; '' while a draw has no term.
export function termLabel(term, lang = 'zh') {
  const s = String(term ?? '').trim();
  if (!s || s === 'undefined' || s === 'null' || s === '0' || s === 'NaN') return '';
  return lang === 'en' ? `Draw ${s}` : `第 ${s} 期`;
}

// A draw's term wherever the app kept it (the draw, the result drawn: the
// kit's `period` or `term`), else ''.
export const termOf = (...sources) => {
  for (const s of sources) {
    const v = s?.period ?? s?.term;
    if (v != null && termLabel(v)) return v;
  }
  return '';
};

// The 期別 of a draw not out yet: the kit's drawTerm (BINGO exact, an evening
// game counted on from its latest draw), else ''.
export function nextTerm(gameId, draw, latest) {
  try {
    return kit.drawTerm(gameId, draw, latest) || '';
  } catch {
    return '';
  }
}

// When sales close for a draw (ms): the kit's closesAt (20:00 for the 20:30
// games; 賓果 a minute before each draw).
export const cutoffAt = (gameId, at) => kit.closesAt(gameId, { at });

// 獎別 of a stored tier ('jackpot', 'first'…) for a game, else ''.
export function tierName(gameId, key, lang = 'zh') {
  return kit.tierName(gameId, key, lang) ?? '';
}

// What a prize-table row asks for, in words.
export function tierRule(x, lang = 'zh') {
  const en = lang === 'en';
  if (x.m) {
    const [a, b] = x.m;
    return en ? `${a}${b ? ' + zone 2' : ''}` : `第1區 ${a} 個${b ? '＋第2區' : ''}`;
  }
  if (x.sp) return en ? `${x.hits} + special number` : `對中 ${x.hits} 個號碼＋特別號`;
  return en ? `${x.hits} numbers` : `對中 ${x.hits} 個號碼`;
}
// 3星彩 and 4星彩 pay by how many of the last digits match.
export const digitRule = (x, lang = 'zh') => (lang === 'en' ? `last ${x.hits} digits` : `後 ${x.hits} 碼相同`);

// ---- What the slip may offer ------------------------------------------------------
//
// 倍數 as each game's 投注方式 has it (台灣彩券): none on 威力彩, 大樂透 and
// 今彩539, up to 10 on 樂合彩, 50 on 3星彩, 4星彩 and BINGO.
export const gameLimits = gameId => kit.limits(gameId);
// The proxy sells at most 50 selections a sale and 120 tickets with 多期
// counted (Orbit-Core lotto.js MAX_TICKETS, MAX_SOLD).
export const MAX_LINES = 50;
export const MAX_SOLD = 120;
// The most draws `lines` selections can be bought for in one sale.
export const periodsFor = (gameId, lines = 1) => Math.max(1, Math.min(gameLimits(gameId).periods, Math.floor(MAX_SOLD / Math.max(1, lines))));

// 包牌 (系統組合): the most numbers a zone (or a 樂合彩 pick) takes.
export const zoneMax = z => z.upTo;
export const comboMax = g => g.combo.upTo;
// A 包牌: more numbers than one bet takes in some zone.
export const isSystem = (gameId, sel) => Boolean(GAMES[gameId]?.zones && sel?.zones?.some((z, i) => z.length > GAMES[gameId].zones[i].n));

// ---- Results ---------------------------------------------------------------------

// A ticket whose draw is out but whose prize isn't announced yet (a pool or
// capped tier it won: the kit's ticketPrize `pending`).
export function pendingPrize(ticket, draw) {
  if (!draw) return false;
  try {
    return Boolean(kit.ticketPrize(ticket, draw)?.pending);
  } catch {
    return false;
  }
}

// A 包牌's winning bets by tier, as the results print them:
// 「參獎 ×2 · 普獎 ×5」 ('' for one winning bet or none).
export function winsText(gameId, wins, lang = 'zh') {
  if (!Array.isArray(wins) || wins.reduce((s, w) => s + (w.n || 0), 0) < 2) return '';
  return wins.map(w => `${tierName(gameId, w.tier, lang) || w.tier} ×${w.n}`).join(' · ');
}

// The jackpot Taiwan Lottery advertises for the next draw (the kit's
// upcoming(): 「頭獎上看 3.2 億」, 保證 when it's the NT$2億 / NT$1億 floor), else
// the latest draw's pool: { label, amount } or null.
export function jackpotOf(next, latest, lang = 'zh') {
  const jp = next?.jackpot;
  if (jp?.amount > 0) {
    const sure = /保證/.test(jp.desc || '');
    const short = lang === 'en' ? (sure ? 'min.' : 'est.') : sure ? '保證' : '上看';
    return { label: lang === 'en' ? (sure ? 'Jackpot guaranteed' : 'Jackpot est.') : `頭獎${short}`, short, amount: jp.amount };
  }
  return latest?.jackpot > 0 ? { label: lang === 'en' ? 'Jackpot' : '頭獎累積', short: '', amount: latest.jackpot } : null;
}

// Tickets of one 多期 purchase together: [{ first, all }] in the order given,
// a ticket with no series alone.
export function bySeries(tickets) {
  const out = [];
  const at = new Map();
  for (const x of tickets) {
    const key = x.series?.id;
    if (!key) {
      out.push({ first: x, all: [x] });
      continue;
    }
    if (!at.has(key)) {
      at.set(key, out.length);
      out.push({ first: x, all: [] });
    }
    const g = out[at.get(key)];
    g.all.push(x);
    if ((x.draw?.at ?? 0) < (g.first.draw?.at ?? 0)) g.first = x;
  }
  return out;
}
