// The page's words for games, picks and tickets, in the reader's language
// (lang.mjs W: Chinese first). Times are Taiwan's. No DOM, so it's tested.
import { W, en } from './lang.mjs';
import { LEAGUES, twDay, isSetSport } from './feed.mjs';
import { KINDS, KINDS_EN, modeName } from './slip.mjs';
import { specOf } from './ticket.mjs';
import { isF1, isChamp, F1_KINDS, F1_KINDS_EN, gpName, sessionName, surname } from './f1.mjs';
import { extraKindName } from './board.mjs';
import { money } from '../../kit/core.mjs';
import { nameZh, hasZh, playersOf, driverZh } from './zh.mjs';

export { money };
export const pct = (p, d = 0) => `${(p * 100).toFixed(d)}%`;
export const odds2 = n => (Number.isFinite(n) ? n.toFixed(2) : '—');
// NT$ with its sign: +NT$1,200, −NT$300, NT$0.
export const signedMoney = n => money(n, { sign: true });
export const signed = x => (x > 0 ? `+${x}` : `${x}`);

// Names in the reader's language.
// Chinese as 運彩 prints it (zh.mjs): a name Taiwan has none for yet in
// its reading, English only until that comes.
const zhOf = (t, kind) => (hasZh(t.zh) ? t.zh : nameZh(t.en, kind) ?? t.zh);
export const nm = (t, g = null) => (en ? t.en || t.zh : zhOf(t, g && playersOf(g) ? 'p' : 'team'));
export const lg = league => (en ? LEAGUES[league]?.en : LEAGUES[league]?.zh) || '';
export const kindName = k => (en ? KINDS_EN[k] ?? F1_KINDS_EN[k] : KINDS[k] ?? F1_KINDS[k]) ?? extraKindName(k) ?? '';
// An F1 race in words: 美國站 正賽 / United States GP Race.
export const raceText = g => `${gpName(g, en)} ${sessionName(g, en)}`;
// What a pick is on: the two sides of a game, or the race.
export const matchText = g => (isF1(g) ? raceText(g) : `${nm(g.away, g)} @ ${nm(g.home, g)}`);
export const sideName = (g, side) => {
  const t = g[side];
  if (en) return t.abbr || t.en || t.short;
  // (A club Kambi names, until read: its whole name, never a word of it.)
  return hasZh(t.short) ? t.short : (nameZh(t.en, playersOf(g) ? 'p' : 'team') ?? (isSetSport(g.league) && !playersOf(g) ? t.en : t.short));
};
// A driver: their surname, Chinese as Taiwan says it (羅素) in Chinese.
export const driverName = name => (en ? surname(name) : driverZh(name) ?? surname(name));

// A time in Taiwan: { day: 今天 / 明天 / 昨天 / 10/21（三）, time: 19:05 }.
const TW = 8 * 3_600_000;
const WEEK = '日一二三四五六';
const WEEK_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function when(start, now = Date.now()) {
  const t = Date.parse(start);
  const d = new Date(t + TW);
  const time = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  const diff = Math.round((Date.parse(twDay(t)) - Date.parse(twDay(now))) / 86_400_000);
  const day = diff === 0 ? W('今天', 'Today') : diff === 1 ? W('明天', 'Tomorrow') : diff === -1 ? W('昨天', 'Yesterday') : en ? `${WEEK_EN[d.getUTCDay()]} ${d.getUTCMonth() + 1}/${d.getUTCDate()}` : `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${WEEK[d.getUTCDay()]}）`;
  return { day, time };
}
// A day as Taiwan writes it short: 10/21.
export const dayText = iso => {
  const [, m, d] = twDay(Date.parse(iso)).split('-');
  return `${Number(m)}/${Number(d)}`;
};

// Where a game is, in words: { text, live, ht } (ht: the game's key while
// it's at half-time, an ESPN game's, for the break's countdown).
export function statusOf(g, now = Date.now()) {
  if (isF1(g) && g.state === 'in') return { text: g.lap?.of ? W(`第 ${g.lap.now}/${g.lap.of} 圈`, `Lap ${g.lap.now}/${g.lap.of}`) : W('進行中', 'Live'), live: true };
  // The championship: how many of its races are run.
  if (isChamp(g) && g.state === 'pre' && g.progress?.now) return { text: W(`已賽 ${g.progress.now}/${g.progress.of} 站`, `${g.progress.now} of ${g.progress.of} races run`), live: false };
  if (isF1(g) && g.state === 'void') return { text: W('取消', 'Called off'), live: false };
  if (g.off) return { text: g.off === 'suspended' ? W('暫停', 'Suspended') : W('延賽', 'Postponed'), live: false };
  if (g.state === 'void') return { text: W('延賽或取消', 'Called off'), live: false };
  if (g.state === 'post') return { text: /OT|SO/.test(g.detail || '') ? W('完賽（延長）', 'Final (OT)') : W('完賽', 'Final'), live: false };
  if (g.state === 'pre') {
    const w = when(g.start, now);
    return { text: `${w.day} ${w.time}`, live: false };
  }
  // A set sport: the set it's in (tennis' 盤, the others' 局).
  if (isSetSport(g.league)) return { text: g.period ? (LEAGUES[g.league].sport === 'tennis' ? W(`第${g.period}盤`, `Set ${g.period}`) : W(`第${g.period}局`, `Game ${g.period}`)) : W('進行中', 'Live'), live: true };
  const d = g.detail || '';
  const spec = specOf(g.league);
  if (/^(HT\b|Halftime)/i.test(d)) return { text: W('中場休息', 'Halftime'), live: true, ht: LEAGUES[g.league]?.data === 'espn' ? g.id : null };
  let text = W('進行中', 'Live');
  const inning = /^(Top|Bot|Bottom|Mid|Middle|End)\w*\s+(\d+)/i.exec(d);
  if (inning) {
    const half = /^top/i.test(inning[1]) ? ['上', 'Top'] : /^bot/i.test(inning[1]) ? ['下', 'Bot'] : /^mid/i.test(inning[1]) ? ['中', 'Mid'] : ['結束', 'End'];
    text = W(`${inning[2]}局${half[0]}`, `${half[1]} ${inning[2]}`);
  } else if (spec.minutes) text = g.clock || W('進行中', 'Live');
  else if (spec.clock && g.period) {
    const ot = g.period > spec.clock.periods;
    const end = /^End/i.test(d);
    text = `${ot ? W('延長賽', 'OT') : W(`第${g.period}節`, `Q${g.period}`)}${end ? W('結束', ' end') : g.clock && g.clock !== '0:00' && g.clock !== '0.0' ? ` ${g.clock}` : ''}`;
  }
  return { text, live: true };
}

// A pick in words: 道奇 勝, 湖人 -4.5, 大 8.5, 單.
export function pickText(leg) {
  const g = leg.game;
  switch (leg.kind) {
    case 'f1':
      return isChamp(g) ? W(`${driverName(leg.driver)} 年度冠軍`, `${surname(leg.driver)} champion`) : W(`${driverName(leg.driver)} 奪冠`, `${surname(leg.driver)} to win`);
    case 'ml':
      return leg.side === 'draw' ? W('和局', 'Draw') : W(`${sideName(g, leg.side)} 勝`, `${sideName(g, leg.side)} win`);
    case 'spread':
      // 讓分和 (soccer's three-way 讓分): the home side's line with it.
      if (leg.side === 'draw') return W(`讓分和 (${sideName(g, 'home')} ${signed(leg.line)})`, `Handicap draw (${sideName(g, 'home')} ${signed(leg.line)})`);
      return `${sideName(g, leg.side)} ${signed(leg.line)}`;
    case 'total':
      return `${leg.side === 'over' ? W('大', 'Over') : W('小', 'Under')} ${leg.line}`;
    case 'oddeven':
      return leg.side === 'odd' ? W('單', 'Odd') : W('雙', 'Even');
    default:
      return extraText(leg);
  }
}

// One of the lottery's other bets (board.mjs) in words, as Play names them:
// 道奇 大 4.5, 道奇 −1.5, 主勝或和局, 主/客, 2:1, 3-4, 第 3 局.
const RESULT = { home: ['主', 'H'], draw: ['和', 'D'], away: ['客', 'A'] };
const OU = { over: ['大', 'Over'], under: ['小', 'Under'] };
const range = (lo, hi) => (hi == null ? `${lo}+` : lo === hi ? `${lo}` : `${lo}-${hi}`);
export function extraText(leg) {
  const g = leg.game;
  const ou = side => (OU[side] ? W(OU[side][0], OU[side][1]) : '');
  const result = side => (side === 'draw' ? W('和局', 'Draw') : W(`${sideName(g, side)} 勝`, `${sideName(g, side)} win`));
  const inning = leg.period != null && (leg.kind === 'inningml' || leg.kind === 'inningtotal') ? W(`第${leg.period}局 `, `Inning ${leg.period} `) : '';
  switch (leg.kind) {
    case 'teamtotal':
    case 'teamhits':
      return `${sideName(g, leg.team)} ${ou(leg.side)} ${leg.line}`;
    case 'hits':
      return W(`安打 ${ou(leg.side)} ${leg.line}`, `Hits ${ou(leg.side)} ${leg.line}`);
    case 'qtotal':
      return `${W(`第${leg.period ?? 1}節 `, `P${leg.period ?? 1} `)}${ou(leg.side)} ${leg.line}`;
    case 'qrunline':
      return `${W(`第${leg.period ?? 1}節 `, `P${leg.period ?? 1} `)}${sideName(g, leg.side)} ${signed(leg.line)}`;
    case 'topperiod':
      return leg.side === 'tie' ? W('平手', 'Tie') : W(`第${leg.side}節`, `Period ${leg.side}`);
    case 'raceto':
      return leg.side === 'none' ? W('無', 'Neither') : W(`${sideName(g, leg.side)} 先得${leg.line}分`, `${sideName(g, leg.side)} first to ${leg.line}`);
    case 'firstgoal':
    case 'lastgoal':
      return leg.side === 'none' ? W('無進球', 'No goal') : sideName(g, leg.side);
    case 'higherhalf':
      return leg.side === 'tie' ? W('一樣多', 'Tie') : leg.side === 'first' ? W('上半場', 'First half') : W('下半場', 'Second half');
    case 'teamgoals':
      return W(`${sideName(g, leg.team)} ${range(leg.lo, leg.hi)} 球`, `${sideName(g, leg.team)} ${range(leg.lo, leg.hi)} goals`);
    case 'mltotal':
    case 'mlbtts': {
      const [res, other] = String(leg.side).split('|');
      const second = leg.kind === 'mltotal' ? `${ou(other)} ${leg.line}` : W(other === 'yes' ? '都進球' : '非都進球', other === 'yes' ? 'both score' : 'not both');
      return `${result(res)}/${second}`;
    }
    case 'hdc':
      return W('半場 ', 'Half ') + String(leg.side)
        .split('|')
        .map(x => (x === 'draw' ? W('和局', 'Draw') : W(`${sideName(g, x)}勝`, `${sideName(g, x)}`)))
        .join(W('或', ' or '));
    case 'hscore':
      return leg.score === 'other' ? W('半場 其他比分', 'Half: any other') : W(`半場 ${String(leg.score).replace('-', ':')}`, `Half ${String(leg.score).replace('-', ':')}`);
    case 'htotal':
    case 'f5total':
    case 'corners':
    case 'tdtotal':
    case 'inningtotal':
    case 'gametotal':
      return `${inning}${ou(leg.side)} ${leg.line}`;
    case 'hrunline':
    case 'f5runline':
    case 'sethcap':
    case 'gamehcap':
      return `${sideName(g, leg.side)} ${signed(leg.line)}`;
    case 'half':
    case 'f5':
    case 'q1':
    case 'regulation':
    case 'inningml':
    case 'set1':
      return `${inning}${result(leg.side)}`;
    case 'btts':
    case 'firstinning':
      return leg.side === 'yes' ? W('是', 'Yes') : W('否', 'No');
    case 'nextrun':
      return leg.side === 'none' ? W('無', 'None') : sideName(g, leg.side);
    case 'dc':
      return String(leg.side)
        .split('|')
        .map(x => (x === 'draw' ? W('和局', 'Draw') : W(`${sideName(g, x)}勝`, `${sideName(g, x)}`)))
        .join(W('或', ' or '));
    case 'htft':
      return `${W(RESULT[leg.ht]?.[0], RESULT[leg.ht]?.[1])}/${W(RESULT[leg.ft]?.[0], RESULT[leg.ft]?.[1])}`;
    case 'score':
    case 'setscore':
      return leg.score === 'other' ? W('其他比分', 'Any other') : String(leg.score).replace('-', ':');
    case 'margin':
      return leg.side === 'draw' ? W('和局', 'Draw') : `${sideName(g, leg.team)} ${range(leg.lo, leg.hi)}`;
    case 'goalbands':
    case 'goalcount':
      return W(`${range(leg.lo, leg.hi)} 球`, `${range(leg.lo, leg.hi)} goals`);
    case 'inning':
      return leg.inning < 9 ? W(`第 ${leg.inning + 1} 局`, `Inning ${leg.inning + 1}`) : W('一樣多', 'Tie for most');
    default:
      return '';
  }
}

// A ticket as words, for 分享 (Messages, LINE…): its kind and cost, each
// pick and how it stands (✓ ✕ ↺ decided, ● on, · to come) with its score,
// what it pays. `v`: its slipView.
export function shareText(slip, v) {
  const mark = x => (x.result === 'won' ? '✓' : x.result === 'lost' ? '✕' : x.result === 'void' ? '↺' : x.live ? '●' : '·');
  const lines = slip.legs.map((l, i) => {
    const g = l.game;
    const score = g.score && g.state !== 'pre' ? ` ${g.score.away}–${g.score.home}` : '';
    return `${mark(v.legs[i])} ${pickText(l)} @${odds2(l.odds)}${l.est ? W(' 估', ' est.') : ''}（${matchText(g)}${score}）`;
  });
  const head = `${modeName(slip.mode, slip.legs, slip.sizes, en)} · ${money(v.pre.cost)}`;
  const tail = v.done ? (v.status === 'refund' ? W(`退款 ${money(v.paid.net)}`, `Refunded: ${money(v.paid.net)}`) : v.paid.gross > 0 ? W(`中獎，實拿 ${money(v.paid.net)}`, `Won: ${money(v.paid.net)} after tax`) : W('未中獎', 'Lost')) : W(`全中可得 ${money(v.pre.best.net)} · 現在價值 ${money(v.now.net)}`, `Pays ${money(v.pre.best.net)} if all win · worth ${money(v.now.net)} now`);
  return `${W('我的運彩注單', 'My ticket')}：${head}\n${lines.join('\n')}\n${tail}\n— Orbit Slips`;
}

// How a live pick stands on the score, in a line under its scoreboard:
// 讓分後領先 2.5, 已 149 分 · 還差 72, 落後 1 局. With `p` (how far a total
// has come, 0–1) for its bar, and `tone` ahead / behind. Null when there's
// nothing to tell (not started, over, or a bet the score doesn't show).
const UNIT = { soccer: ['球', 'goals'], hockey: ['球', 'goals'], tennis: ['盤', 'sets'], volleyball: ['局', 'sets'], badminton: ['局', 'games'], tabletennis: ['局', 'games'] };
const fmtN = n => String(Math.round(Math.abs(n) * 10) / 10);
export function standOf(leg) {
  const g = leg.game;
  if (isF1(g) || g.state !== 'in' || !g.score) return null;
  const { home, away } = g.score;
  const [uz, ue] = UNIT[LEAGUES[g.league]?.sport] ?? ['分', 'pts'];
  const unit = n => W(`${fmtN(n)} ${uz}`, `${fmtN(n)} ${ue}`);
  const mine = side => (side === 'home' ? home - away : away - home);
  switch (leg.kind) {
    case 'ml': {
      if (leg.side === 'draw') return home === away ? { text: W('目前平手', 'Level now'), tone: 'ahead' } : { text: W(`相差 ${unit(home - away)}`, `${unit(home - away)} apart`), tone: 'behind' };
      const d = mine(leg.side);
      return d === 0 ? { text: W('目前平手', 'Level now'), tone: '' } : d > 0 ? { text: W(`領先 ${unit(d)}`, `Up ${unit(d)}`), tone: 'ahead' } : { text: W(`落後 ${unit(d)}`, `Down ${unit(d)}`), tone: 'behind' };
    }
    case 'spread': {
      if (leg.side === 'draw' || !Number.isFinite(leg.line)) return null;
      const d = mine(leg.side) + leg.line;
      return d === 0 ? { text: W('讓分後平手', 'Level with the line'), tone: '' } : d > 0 ? { text: W(`讓分後領先 ${unit(d)}`, `Covering by ${unit(d)}`), tone: 'ahead' } : { text: W(`讓分後落後 ${unit(d)}`, `Short by ${unit(d)}`), tone: 'behind' };
    }
    case 'total':
    case 'teamtotal': {
      if (!Number.isFinite(leg.line) || leg.line <= 0) return null;
      const cur = leg.kind === 'total' ? home + away : leg.team === 'away' ? away : home;
      const left = leg.line - cur;
      const p = Math.min(1, cur / leg.line);
      if (leg.side === 'over') return left > 0 ? { text: W(`已 ${unit(cur)} · 還差 ${unit(Math.ceil(left))}`, `${unit(cur)} so far · ${unit(Math.ceil(left))} to go`), p, tone: '' } : { text: W(`已 ${unit(cur)} · 過關`, `${unit(cur)} · landed`), p: 1, tone: 'ahead' };
      return left > 0 ? { text: W(`已 ${unit(cur)} · 尚餘 ${unit(left)}`, `${unit(cur)} so far · ${unit(left)} spare`), p, tone: '' } : { text: W(`已 ${unit(cur)} · 超過了`, `${unit(cur)} · gone over`), p: 1, tone: 'behind' };
    }
    default:
      return null;
  }
}
