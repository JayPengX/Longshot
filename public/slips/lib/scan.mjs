// A ticket read from its photo: the picture shrunk on the phone, read by
// Gemini through the proxy's /slip-scan door (a fixed prompt, a few a day an
// address: Shared-Proxy/slip.js), then each pick matched to a real game
// here. Nothing is saved until the person checks the ticket and saves it.
import { LEAGUES, PROXY, gamesOn, twDay, shiftDay } from './feed.mjs';
import { normalizeTeamName } from '../../kit/logos.mjs';
import { choose, newId } from './slip.mjs';
import { isF1, isF1Pick, f1Fit } from './f1.mjs';
import { EXTRA_KINDS } from './board.mjs';

// Orbit Class's import shrinks to 1280 px; a slip's small print wants a little more.
const MAX_SIDE = 1600;
const QUALITY = 0.8;

// The photo as a JPEG's base64, turned upright, at most MAX_SIDE a side.
export async function shrink(file) {
  let img;
  try {
    img = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('image'));
      el.src = URL.createObjectURL(file);
    });
  }
  const w = img.width || img.naturalWidth;
  const h = img.height || img.naturalHeight;
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
  if (!blob) throw new Error('image');
  const url = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
  return url.replace(/^data:[^,]*,/, '');
}

// What Gemini read, or { error: 'busy' | 'limit' | 'offline' | 'failed' | 'signin' }.
// (`qt`: the Longshot Pass's session, counted per account: 30 a day.)
export async function readSlip(base64, qt = '') {
  let res;
  try {
    res = await fetch(`${PROXY}/slip-scan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: { mime_type: 'image/jpeg', data: base64 }, ...(qt ? { qt } : {}) }) });
  } catch {
    // (No connection only when the phone says so: a slow or failed answer from the server isn't the person's internet.)
    return { error: globalThis.navigator?.onLine === false ? 'offline' : 'failed' };
  }
  if (res.status === 401) return { error: 'signin' };
  if (res.status === 429) return { error: 'limit' };
  if (res.status === 503) return { error: 'busy' };
  if (!res.ok) return { error: 'failed' };
  try {
    return readOf(await res.json());
  } catch {
    return { error: 'failed' };
  }
}

// Gemini's reply ({ candidates: [{ content: { parts: [{ text }] } }] }) as
// the ticket it read: { isSlip, picks: [{ sport, league, teams, teamsEn,
// date, kind, pick, line, odds }], combos: ['4串1'…], stakePer, total }, its
// lists always lists; anything else is a failed read.
const strings = x => (Array.isArray(x) ? x.map(v => (v == null ? '' : String(v))) : []);
export function readOf(reply) {
  let read;
  try {
    const text = (reply?.candidates?.[0]?.content?.parts || []).map(p => p?.text || '').join('');
    read = JSON.parse(text.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ''));
  } catch {
    return { error: 'failed' };
  }
  if (!read || typeof read !== 'object' || Array.isArray(read)) return { error: 'failed' };
  const picks = Array.isArray(read.picks) ? read.picks.filter(p => p && typeof p === 'object' && !Array.isArray(p)).map(p => ({ ...p, teams: strings(p.teams), teamsEn: strings(p.teamsEn) })) : [];
  const combos = Array.isArray(read.combos) ? read.combos.map(String) : read.combos ? [String(read.combos)] : [];
  return { ...read, picks, combos };
}

// ---- The ticket's combinations -------------------------------------------------------

// "單場", "4串1", "3串4" or ["2串1", "3串1"] for n picks: { mode, sizes } (sizes
// the parlay sizes bought, for 組合), or null when it can't be told.
export function combosOf(combos, n) {
  const list = [].concat(combos ?? []).map(s => String(s).replace(/\s/g, ''));
  if (!list.length) return null;
  const parsed = list.map(s => /(\d+)串(\d+)/.exec(s)).filter(Boolean).map(m => [Number(m[1]), Number(m[2])]);
  // 單場, or only 1串1: every game on its own. 1串1 beside other sizes is 過1關 in a 組合.
  if (list.some(s => /單場|單關/.test(s)) || (parsed.length && parsed.every(([k, m]) => k === 1 && m === 1))) return { mode: 'single', sizes: [1] };
  if (list.some(s => /全部過關/.test(s)) && !parsed.length) return n >= 2 ? { mode: 'parlay', sizes: [n] } : { mode: 'single', sizes: [1] };
  if (!parsed.length) return null;
  // Several "k串1": those sizes.
  if (parsed.every(([, m]) => m === 1)) {
    const sizes = [...new Set(parsed.map(([k]) => k))].sort((a, b) => a - b);
    if (sizes.length === 1 && sizes[0] === n) return { mode: 'parlay', sizes: [n] };
    return sizes.every(k => k >= 1 && k <= n) ? { mode: 'system', sizes } : null;
  }
  // One "N串M": the sizes whose combinations add up to M, the largest ones first (3串4 is 2串1 ×3 and 3串1).
  const [N, M] = parsed[0];
  if (N !== n) return null;
  for (let lo = N; lo >= 1; lo--) {
    const sizes = Array.from({ length: N - lo + 1 }, (_, i) => lo + i);
    if (sizes.reduce((s, k) => s + choose(N, k), 0) === M) return { mode: 'system', sizes };
  }
  for (let k = 2; k <= N; k++) if (choose(N, k) === M) return { mode: 'system', sizes: [k] };
  // Any other mix of sizes (3串6 is 過1關 ×3 and 2串1 ×3), the larger sizes first when more than one adds up.
  let best = null;
  for (let bits = 1; bits < 1 << N; bits++) {
    const sizes = Array.from({ length: N }, (_, i) => i + 1).filter(k => bits & (1 << (k - 1)));
    if (sizes.reduce((s, k) => s + choose(N, k), 0) !== M) continue;
    const key = [...sizes].reverse().join(',');
    if (!best || key.localeCompare(best.key, undefined, { numeric: true }) > 0) best = { key, sizes };
  }
  return best ? { mode: 'system', sizes: best.sizes } : null;
}

// ---- Matching picks to games -----------------------------------------------------------

const zh = s => String(s || '').replaceAll('臺', '台').replace(/[\s·．.()（）]/g, '').replace(/(足球俱樂部|俱樂部|隊)$/, '');
// How well a printed team fits a game's team: 3 sure, 2 likely, 0 not.
function teamFit(printed, printedEn, t) {
  const p = zh(printed);
  const names = [zh(t.zh), zh(t.short)].filter(Boolean);
  if (p && names.includes(p)) return 3;
  const en = normalizeTeamName(printedEn);
  const ten = normalizeTeamName(t.en);
  if (en && ten && en === ten) return 3;
  if (p.length >= 2 && names.some(n => n.length >= 2 && (n.includes(p) || p.includes(n)))) return 2;
  if (en.length >= 5 && ten.length >= 5 && (en.includes(ten) || ten.includes(en))) return 2;
  return 0;
}
// The picked text is this printed team.
function sameTeam(p, printed, printedEn) {
  const a = zh(p);
  const b = zh(printed);
  if (a && a === b) return true;
  const en = normalizeTeamName(p);
  if (en && en === normalizeTeamName(printedEn)) return true;
  return a.length >= 2 && b.length >= 2 && (a.includes(b) || b.includes(a));
}
// How a game fits a pick: { score, flipped } (flipped: the printed first team is the home team).
export function gameFit(pick, g) {
  // An F1 pick on an F1 race only (f1.mjs).
  if (isF1(g) || isF1Pick(pick)) return isF1(g) && isF1Pick(pick) ? { ...f1Fit(pick, g), flipped: false } : { score: 0, flipped: false };
  const [a, b] = pick.teams || [];
  const [ae, be] = pick.teamsEn || [];
  const straight = [teamFit(a, ae, g.away), teamFit(b, be, g.home)];
  const flipped = [teamFit(a, ae, g.home), teamFit(b, be, g.away)];
  const s1 = straight[0] && straight[1] ? straight[0] + straight[1] : 0;
  const s2 = flipped[0] && flipped[1] ? flipped[0] + flipped[1] : 0;
  return s1 >= s2 ? { score: s1, flipped: false } : { score: s2, flipped: true };
}

// A pick as a leg on `game`, or null when what's picked can't be told.
export function legOf(pick, game, flipped) {
  const odds = Math.round(Number(pick.odds) * 100) / 100;
  if (!(odds > 1)) return null;
  if (isF1(game)) {
    const fit = f1Fit(pick, game);
    return fit.score ? { id: newId('l'), kind: 'f1', driver: fit.driver, game, odds } : null;
  }
  const leg = { id: newId('l'), kind: pick.kind, game, odds };
  const p = String(pick.pick || '').trim();
  // Which printed team a name is (0 the first), then which side of the game that is.
  const sideOf = name => {
    const [a, b] = pick.teams || [];
    const [ae, be] = pick.teamsEn || [];
    const fa = sameTeam(name, a, ae);
    const fb = sameTeam(name, b, be);
    let idx = fa && !fb ? 0 : fb && !fa ? 1 : -1;
    if (idx < 0) {
      const ta = teamFit(name, name, game[flipped ? 'home' : 'away']);
      const tb = teamFit(name, name, game[flipped ? 'away' : 'home']);
      idx = ta > tb ? 0 : tb > ta ? 1 : -1;
    }
    return idx < 0 ? null : (idx === 0) !== flipped ? 'away' : 'home';
  };
  if (EXTRA_KINDS.includes(pick.kind)) return extraLeg(pick, leg, p, sideOf);
  if (pick.kind === 'ml' || pick.kind === 'spread') {
    if (/^(draw|和|平|讓分和)/i.test(p)) {
      // 和局, and soccer's three-way 讓分 讓分和 (its line the home side's).
      if (!(pick.kind === 'ml' ? ['soccer', 'hockey'] : ['soccer']).includes(LEAGUES[game.league]?.sport)) return null;
      leg.side = 'draw';
    } else {
      leg.side = sideOf(p);
      if (!leg.side) return null;
    }
    if (pick.kind === 'spread') {
      // (A line Gemini couldn't read is null: never taken as 0.)
      const line = pick.line == null || pick.line === '' ? NaN : Number(pick.line);
      if (!Number.isFinite(line)) return null;
      leg.line = line;
    }
    return leg;
  }
  if (pick.kind === 'total') {
    const line = Math.abs(Number(pick.line));
    if (!Number.isFinite(line) || !line) return null;
    leg.side = /^(over|大)/i.test(p) ? 'over' : /^(under|小)/i.test(p) ? 'under' : null;
    leg.line = line;
    return leg.side ? leg : null;
  }
  if (pick.kind === 'oddeven') {
    leg.side = /^(odd|單)/i.test(p) ? 'odd' : /^(even|雙)/i.test(p) ? 'even' : null;
    return leg.side ? leg : null;
  }
  return null;
}

// One of the lottery's other bets read (board.mjs: 半場, [1-5局], 雙勝,
// 正確比數…) as a leg, as the kit settles it; null when it can't be told.
const OU = p => (/^(over|大)/i.test(p) ? 'over' : /^(under|小)/i.test(p) ? 'under' : null);
const YN = p => (/^(yes|是)/i.test(p) ? 'yes' : /^(no|否)/i.test(p) ? 'no' : null);
const RESULT = p => (/^(home|主)/i.test(p) ? 'home' : /^(away|客)/i.test(p) ? 'away' : /^(draw|和|平)/i.test(p) ? 'draw' : null);
const DRAWN = /^(draw|和|平)/i;
// 上半場正確比數's (the kit's play-markets HALF_SCORES).
const HALF_SCORES = ['1-0', '0-0', '0-1', '2-0', '1-1', '0-2', '2-1', '2-2', '1-2', '3-0', '0-3'];
const SCORES = ['1-0', '2-0', '2-1', '3-0', '3-1', '3-2', '0-0', '1-1', '2-2', '3-3', '0-1', '0-2', '1-2', '0-3', '1-3', '2-3'];
// A band as printed ("1-2", "3+", "2"): { lo, hi } (hi null: and up).
function bandOf(text) {
  const m = /^\s*(\d+)\s*(?:([-~–])\s*(\d+)|(\+))?\s*$/.exec(String(text ?? ''));
  if (!m) return null;
  const lo = Number(m[1]);
  return { lo, hi: m[4] ? null : m[3] != null ? Number(m[3]) : lo };
}
function extraLeg(pick, leg, p, sideOf) {
  const line = pick.line == null || pick.line === '' ? NaN : Number(pick.line);
  const k = pick.kind;
  const side = name => (DRAWN.test(name) ? 'draw' : sideOf(name));
  if (['htotal', 'f5total', 'corners', 'tdtotal', 'inningtotal', 'gametotal', 'qtotal', 'hits'].includes(k)) {
    leg.side = OU(p);
    leg.line = Math.abs(line);
    if (!leg.side || !leg.line) return null;
  } else if (k === 'teamtotal' || k === 'teamhits') {
    leg.side = OU(p);
    leg.team = sideOf(pick.team || '');
    leg.line = Math.abs(line);
    if (!leg.side || !leg.team || !leg.line) return null;
  } else if (['hrunline', 'f5runline', 'sethcap', 'gamehcap', 'qrunline'].includes(k)) {
    leg.side = sideOf(p);
    leg.line = line;
    if (!leg.side || !Number.isFinite(line)) return null;
  } else if (['half', 'f5', 'q1', 'regulation', 'inningml', 'set1'].includes(k)) {
    leg.side = side(p);
    if (!leg.side) return null;
  } else if (k === 'btts' || k === 'firstinning') {
    leg.side = YN(p);
    if (!leg.side) return null;
  } else if (k === 'nextrun') {
    leg.side = /^(none|無)/i.test(p) ? 'none' : sideOf(p);
    leg.line = 1;
    if (!leg.side) return null;
  } else if (k === 'firstgoal' || k === 'lastgoal') {
    leg.side = /^(none|無)/i.test(p) ? 'none' : sideOf(p);
    if (!leg.side) return null;
  } else if (k === 'raceto') {
    // 先得X分: X the line; 無 neither.
    leg.side = /^(none|無)/i.test(p) ? 'none' : sideOf(p);
    leg.line = Math.abs(line);
    if (!leg.side || !leg.line) return null;
  } else if (k === 'topperiod') {
    leg.side = /^(tie|平手|一樣多)/i.test(p) ? 'tie' : /\d/.exec(p)?.[0];
    if (!leg.side) return null;
  } else if (k === 'higherhalf') {
    leg.side = /^(first|上)/i.test(p) ? 'first' : /^(second|下)/i.test(p) ? 'second' : /^(tie|一樣多|平手)/i.test(p) ? 'tie' : null;
    if (!leg.side) return null;
  } else if (k === 'teamgoals') {
    const band = bandOf(pick.band ?? p);
    leg.team = sideOf(pick.team || '');
    if (!band || !leg.team) return null;
    Object.assign(leg, { side: `${leg.team}|${band.lo}`, lo: band.lo, hi: band.hi });
  } else if (k === 'mltotal' || k === 'mlbtts') {
    // The result and the other, both: "home|over", "draw|yes".
    const [r, x] = p.split(/[|/／]/).map(t => t.trim());
    const res = RESULT(r ?? '') ?? side(r ?? '');
    const other = k === 'mltotal' ? OU(x ?? '') : YN(x ?? '');
    if (!res || !other) return null;
    leg.side = `${res}|${other}`;
    if (k === 'mltotal') {
      leg.line = Math.abs(line);
      if (!leg.line) return null;
    }
  } else if (k === 'dc' || k === 'hdc') {
    const two = p.split(/[|/／、或]/).map(x => RESULT(x.trim()) ?? side(x.trim()));
    if (two.length !== 2 || two.some(x => !x) || two[0] === two[1]) return null;
    const order = ['home', 'draw', 'away'];
    leg.side = two.sort((a, b) => order.indexOf(a) - order.indexOf(b)).join('|');
  } else if (k === 'htft') {
    const [ht, ft] = p.split(/[/／]/).map(x => RESULT(x.trim()));
    if (!ht || !ft) return null;
    Object.assign(leg, { ht, ft });
  } else if (k === 'score' || k === 'hscore') {
    // 其他比分: any score not on the board (its list, the kit's play-markets').
    if (/^(other|其他)/i.test(p)) Object.assign(leg, { score: 'other', listed: k === 'hscore' ? HALF_SCORES : SCORES });
    else {
      const m = /^(\d+)\s*[-:：]\s*(\d+)$/.exec(p);
      if (!m) return null;
      leg.score = `${Number(m[1])}-${Number(m[2])}`;
    }
  } else if (k === 'margin') {
    if (DRAWN.test(p)) leg.side = 'draw';
    else {
      const band = bandOf(pick.band);
      leg.team = sideOf(p);
      if (!leg.team || !band) return null;
      Object.assign(leg, { side: `${leg.team}|${band.lo}`, ...band });
    }
  } else if (k === 'goalbands' || k === 'goalcount') {
    const band = bandOf(pick.band ?? p);
    if (!band) return null;
    Object.assign(leg, band);
  } else if (k === 'inning') {
    const n = /^(tie|一樣多|平手)/i.test(p) ? 10 : Number(/\d+/.exec(p)?.[0]);
    if (!(n >= 1 && n <= 10)) return null;
    leg.inning = n - 1;
  } else return null;
  if (k === 'qrunline' || k === 'qtotal') leg.period = pick.period >= 1 ? Number(pick.period) : 1;
  if (k === 'inningml' || k === 'inningtotal') {
    if (!(pick.period >= 1)) return null;
    leg.period = Number(pick.period);
  }
  return leg;
}

// The days a pick's game can be on: its printed date (and the day either
// side), else the day the ticket was bought (`bought`, an old ticket's) or
// today, from the day before to three days on (a ticket is bought before its games).
const isDay = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
function daysFor(pick, now, bought) {
  if (isDay(pick.date)) return [pick.date, shiftDay(pick.date, -1), shiftDay(pick.date, 1)];
  const from = isDay(bought) && bought <= twDay(now) ? bought : twDay(now);
  // (An F1 ticket is often bought days before its race: the week on.)
  return [from, ...(isF1Pick(pick) ? [1, -1, 2, 3, 4, 5, 6, 7] : [1, -1, 2, 3]).map(d => shiftDay(from, d))];
}
// The leagues to look in: the one read first, then every league of its sport.
function leaguesFor(pick) {
  if (isF1Pick(pick)) return ['f1'];
  const out = [];
  if (LEAGUES[pick.league]) out.push(pick.league);
  for (const [k, l] of Object.entries(LEAGUES)) if (!out.includes(k) && (!pick.sport || pick.sport === 'other' || l.sport === pick.sport)) out.push(k);
  return out;
}

// Every pick matched: { legs, missed: [pick…] }. `games(league, day)` lists a
// day's games (feed.mjs's gamesOn); `bought` the day the ticket was bought;
// `progress(done, all)` as it goes.
export async function matchPicks(picks, { now = Date.now(), bought = null, games = (l, d) => gamesOn(l, d, { fresh: 60_000 }), progress = () => {} } = {}) {
  const cache = new Map();
  const list = (league, day) => {
    const k = `${league}|${day}`;
    if (!cache.has(k)) cache.set(k, games(league, day).catch(() => []));
    return cache.get(k);
  };
  const legs = [];
  const missed = [];
  let done = 0;
  for (const pick of picks) {
    let best = null;
    const days = daysFor(pick, now, bought);
    const leagues = leaguesFor(pick);
    // The league read first, then the rest a few at a time (all straight from ESPN but Asia's).
    for (let i = 0; i < leagues.length && !(best?.fit.score >= 6); i += i === 0 ? 1 : 6) {
      const batch = i === 0 ? [leagues[0]] : leagues.slice(i, i + 6);
      const found = await Promise.all(batch.flatMap(l => days.map(d => list(l, d))));
      for (const g of found.flat()) {
        // (A race can carry more than one pick: its winner and a head-to-head.)
        if (g.state === 'void' || (!isF1(g) && legs.some(l => l.game.id === g.id))) continue;
        const fit = gameFit(pick, g);
        if (fit.score >= 4 && (!best || fit.score > best.fit.score)) best = { g, fit };
      }
    }
    const leg = best && legOf(pick, best.g, best.fit.flipped);
    if (leg) legs.push(leg);
    else missed.push(pick);
    progress(++done, picks.length);
  }
  return { legs, missed };
}

// The amount a combination: as printed, else the whole ticket over its combinations.
export function stakeOf(read, combos) {
  const per = Number(read.stakePer);
  if (per > 0) return Math.round(per / 10) * 10;
  const total = Number(read.total);
  if (total > 0 && combos > 0) return Math.round(total / combos / 10) * 10;
  return null;
}

// When a ticket was bought and settled, for one saved after its games: an old
// ticket keeps its own days (its month's spend, its place in 戰績), not today.
// Bought: the printed day (noon in Taiwan) when that's before its first game,
// else just before that game; now while a game is still to start. Settled:
// the last game's start, once every game is over or off.
export function timesOf(legs, bought, now = Date.now()) {
  const starts = legs.map(l => Date.parse(l.game.start)).filter(Number.isFinite);
  const first = Math.min(...starts);
  if (!starts.length || first > now) return { created: new Date(now).toISOString() };
  const noon = isDay(bought) ? Date.parse(`${bought}T04:00:00Z`) : NaN;
  const created = new Date(noon < first ? noon : first - 60_000).toISOString();
  const over = legs.every(l => l.game.state === 'post' || l.game.state === 'void');
  return over ? { created, settledAt: new Date(Math.max(...starts)).toISOString() } : { created };
}
