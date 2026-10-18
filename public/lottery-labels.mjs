// Small pure helpers for the 彩券 tab's wording, kept apart from the DOM code so
// tests can reach them: 期別, the sales cutoff, 獎別 and the prize table's rules.
import { GAMES } from './lib/lottery.mjs';
import * as kit from './lib/lottery.mjs';

// 「第 115000083 期」 / "Draw 115000083"; '' while a draw has no term.
export function termLabel(term, lang = 'zh') {
  const s = String(term ?? '').trim();
  if (!s || s === 'undefined' || s === 'null' || s === '0' || s === 'NaN') return '';
  return lang === 'en' ? `Draw ${s}` : `第 ${s} 期`;
}

// A draw's term wherever the app kept it (the draw, the result drawn), else ''.
export const termOf = (...sources) => {
  for (const s of sources) if (s?.term != null && termLabel(s.term)) return s.term;
  return '';
};

// When sales close for a draw (ms): the kit's CLOSE_MS before the 20:30 games;
// 賓果 sells until a minute before each draw (the kit's nextDraw).
export function cutoffAt(gameId, at) {
  if (gameId === 'bingo') return at - 60_000;
  const close = Number.isFinite(kit.CLOSE_MS) ? kit.CLOSE_MS : 30 * 60_000;
  return at - close;
}

// 獎別 of a stored tier ('jackpot', 'first'…) for a game, else ''.
export function tierName(gameId, key, lang = 'zh') {
  const tier = GAMES[gameId]?.tiers?.find(x => x.key === key);
  return tier ? tier[lang === 'en' ? 'en' : 'zh'] : '';
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
