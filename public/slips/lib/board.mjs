// Every other bet 台灣運彩 sells on a game (半場, [1-5局], 雙勝, 正確比數,
// 勝分差…): the kit's board (play-board.mjs gameOptions, Quadra Play's one
// pricing path) for a Slips game, grouped as the lottery's sections, each
// option as a pick; graded by the kit's legResult (settle.mjs), as Play
// settles them. The four 不讓分, 讓分, 大小 and 單雙 stay slip.mjs's. No DOM,
// so it's tested.
import { legResult, decidedSoFar } from '../../kit/settle.mjs';
import { LEAGUES, isSetSport, SUMMARY_KINDS } from './feed.mjs';
import { W } from './lang.mjs';

// Slips' own kinds (slip.mjs grade, f1.mjs); every other kind is the kit's.
export const BASE_KINDS = new Set(['ml', 'spread', 'total', 'oddeven', 'f1']);
// (A set sport's every pick, its winner too: settled on its sets.)
export const isExtra = leg => !BASE_KINDS.has(leg.kind) || isSetSport(leg.game?.league);

// The kit's league for a Slips game: its own where Play sells it, else one
// of its kind (a cup's soccer as the Premier League's).
const STAND_IN = { soccer: 'epl', hockey: 'nhl', baseball: 'mlb', basketball: 'nba', football: 'nfl' };
export const kitSport = (league, kitLeagues = {}) => (kitLeagues[league] ? league : STAND_IN[LEAGUES[league]?.sport] ?? league);

// No market for the game: an even guess (the home side a little ahead,
// soccer's draw a quarter), so its bets are listed, their odds typed.
const HOUSE = { soccer: { home: 0.44, draw: 0.27, away: 0.29 }, other: { home: 0.54, away: 0.46 } };

// A Slips game in Play's shape (gameOptions'): the market's chances, its
// total and spread (the away side's line). An Asian league's game has only
// its final score to settle on (no innings read): its parts aren't listed.
export function kitGame(g, kitLeagues) {
  const sport = LEAGUES[g.league]?.sport;
  const soccer = sport === 'soccer';
  const m = g.market;
  const game = { id: g.id, sport: kitSport(g.league, kitLeagues), startUtc: g.start };
  const win = m?.win && Number.isFinite(m.win.home) && Number.isFinite(m.win.away) && (!soccer || Number.isFinite(m.win.draw)) ? m.win : null;
  if (win) game.draftKings = soccer ? { home: win.home, draw: win.draw, away: win.away } : { home: win.home, away: win.away };
  else game.house = soccer ? HOUSE.soccer : HOUSE.other;
  if (m?.total) game.total = { line: m.total.line, overFair: m.total.over };
  if (m?.spread) game.spread = { awayLine: -m.spread.line, awayFair: 1 - m.spread.home };
  if (LEAGUES[g.league]?.data !== 'espn') game.scoreOnly = true;
  return game;
}

// The lottery's sections, in its order (Play's names).
const SECTIONS = [
  ['teamtotal', '主隊/客隊大小', 'Team totals'],
  ['dc', '雙勝', 'Double chance'],
  ['btts', '兩隊是否都進球', 'Both teams score'],
  ['half', '半場不讓分', 'First half'],
  ['hrunline', '半場讓分', 'First-half spread'],
  ['htotal', '半場大小', 'First-half total'],
  ['q1', '第一節不讓分', 'First quarter'],
  ['tdtotal', '達陣數大小', 'Total touchdowns'],
  ['corners', '角球數大小', 'Corners'],
  ['f5', '[1-5局]不讓分', 'First 5 innings'],
  ['f5runline', '[1-5局]讓分', 'First 5 innings run line'],
  ['f5total', '[1-5局]大小', 'First 5 innings total'],
  ['firstinning', '首局得分', 'Run in the 1st'],
  ['inningml', '單局不讓分', 'Inning winner'],
  ['inningtotal', '單局大小', 'Inning total'],
  ['nextrun', '第一分', 'First to score'],
  ['regulation', '不讓分（60 分鐘）', '60-minute result'],
  ['score', '正確比數', 'Correct score'],
  ['htft', '半/全場', 'Half-time / full-time'],
  ['margin', '勝分差', 'Winning margin'],
  ['goalbands', '總進球數', 'Total goals'],
  ['goalcount', '正確進球數', 'Exact total goals'],
  ['inning', '得分最高單局', 'Highest-scoring inning'],
  // 運彩's others (the kit's f70c9c5): the combos, a half's, a period's, the goals' order, hits.
  ['mltotal', '不讓分/大小', 'Result and total'],
  ['mlbtts', '不讓分/兩隊是否都進球', 'Result and both score'],
  ['hdc', '半場雙勝', 'First-half double chance'],
  ['hscore', '上半場正確比數', 'First-half correct score'],
  ['teamgoals', '主(客)隊正確進球數', 'Team goals'],
  ['firstgoal', '第一球', 'First goal'],
  ['lastgoal', '最後進球球隊', 'Last goal'],
  ['higherhalf', '得分較高半場', 'Higher-scoring half'],
  ['qrunline', '第一節讓分', 'First-period spread'],
  ['qtotal', '第一節大小', 'First-period total'],
  ['topperiod', '得分最高單節', 'Highest-scoring period'],
  ['raceto', '先得分', 'Race to'],
  ['hits', '安打數大小', 'Total hits'],
  ['teamhits', '主(客)隊安打數大小', 'Team hits'],
  // The set sports' (tennis, volleyball, badminton, table tennis).
  ['sethcap', '讓盤', 'Set handicap'],
  ['gamehcap', '讓局', 'Game handicap'],
  ['gametotal', '大小', 'Total games'],
  ['set1', '第一盤不讓分', 'First set'],
  ['setscore', '正確比數', 'Correct score (sets)']
];
const SECTION = Object.fromEntries(SECTIONS.map(([k, zh, en]) => [k, { zh, en }]));
// A kind's name (the ticket's, the stats'), or undefined for one not here.
export const extraKindName = k => (SECTION[k] ? W(SECTION[k].zh, SECTION[k].en) : undefined);
export const EXTRA_KINDS = Object.keys(SECTION);

// One option of the kit's board as a pick (its kind, side and what settles
// it), with its fair chance (`fair`, for its chance before the game) and
// the lottery's price for it (`est`).
export function legOfOption(o) {
  const leg = { kind: o.kind, side: o.side };
  const s = o.settle || {};
  for (const k of ['lo', 'hi', 'score', 'listed', 'team', 'ht', 'ft', 'period', 'line']) if (s[k] != null) leg[k] = s[k];
  if (o.kind === 'teamtotal' || o.kind === 'teamhits') Object.assign(leg, { team: o.team, line: o.teamLine });
  if (o.kind === 'inning') leg.inning = o.inning;
  if (leg.line == null && o.line != null) leg.line = o.line;
  if (leg.period == null && o.period != null) leg.period = o.period;
  if (Number.isFinite(o.fairChance)) leg.fair = Math.round(o.fairChance * 10_000) / 10_000;
  return { leg, est: Math.round(o.estOdds * 100) / 100 };
}

// A game's other bets, by section: [{ kind, title, options: [{ leg, est }] }]
// (one section an inning for 單局). `board`: the kit's play-board.mjs,
// `kitLeagues` its play-teams.mjs LEAGUES.
export function sectionsFor(g, board, kitLeagues) {
  let options = [];
  try {
    options = board.gameOptions(kitGame(g, kitLeagues));
  } catch {
    return [];
  }
  const groups = new Map();
  for (const o of options) {
    if (!SECTION[o.kind]) continue;
    const { leg, est } = legOfOption(o);
    const byInning = (o.kind === 'inningml' || o.kind === 'inningtotal') && leg.period != null;
    const key = byInning ? `${o.kind}|${leg.period}` : o.kind;
    if (!groups.has(key)) {
      const title = byInning ? W(`[第${leg.period}局]${o.kind === 'inningml' ? '不讓分' : '大小'}`, `Inning ${leg.period} ${o.kind === 'inningml' ? 'winner' : 'total'}`) : extraKindName(o.kind);
      groups.set(key, { kind: o.kind, title, options: [] });
    }
    groups.get(key).options.push({ leg, est });
  }
  const order = k => EXTRA_KINDS.indexOf(k);
  return [...groups.values()].sort((a, b) => order(a.kind) - order(b.kind));
}

// ---- Grading -----------------------------------------------------------------

// What a game's own score says, as the kit's legResult reads an outcome:
// the score, each side's periods (innings, halves, quarters) and what its
// summary added (corners, touchdowns, who scored each run: `extras`).
const outcomeOf = (g, status = 'final', periods = g.periods) => ({
  status,
  awayScore: g.score?.away,
  homeScore: g.score?.home,
  awayInnings: periods?.away || [],
  homeInnings: periods?.home || [],
  // Soccer's goals in order (第一球, 最後進球球隊), baseball's hits (安打數大小).
  ...(g.goalOrder ? { goalOrder: g.goalOrder } : {}),
  ...(g.hits ? { awayHits: g.hits.away, homeHits: g.hits.home } : {}),
  ...(g.extras || {})
});
// A pick waiting on its game's summary (feed.mjs SUMMARY_KINDS).
export const needsSummary = leg => leg.kind in SUMMARY_KINDS && leg.game?.extras?.[SUMMARY_KINDS[leg.kind]] == null;

// How many periods a part of the game takes (its half, its first five
// innings, one inning), so it's decided once they're played.
const halfOf = league => (LEAGUES[league]?.sport === 'soccer' ? 1 : 2);
function periodsFor(leg) {
  const k = leg.kind;
  if (k === 'half' || k === 'hrunline' || k === 'htotal' || k === 'hdc' || k === 'hscore') return halfOf(leg.game.league);
  if (k === 'qrunline' || k === 'qtotal') return leg.period ?? 1;
  if (k === 'q1' || k === 'firstinning' || k === 'set1') return 1;
  if (k === 'f5' || k === 'f5total' || k === 'f5runline') return 5;
  if (k === 'inningml' || k === 'inningtotal') return leg.period ?? 1;
  return null;
}
// The periods played to the end while the game is on (the one under way
// not yet): ESPN's line scores, "End 5th" or half-time counting it.
export function periodsDone(g) {
  const n = Math.min(g.periods?.away?.length ?? 0, g.periods?.home?.length ?? 0);
  // Baseball by its inning: "Bot 6th" has five done, "End 6th" six.
  const inning = /^(Top|Bot|Bottom|Mid|Middle|End)\w*\s+(\d+)/i.exec(g.detail || '');
  if (inning) return Math.min(n, Number(inning[2]) - (/^end/i.test(inning[1]) ? 0 : 1));
  return /^(End|HT\b|Half)/i.test(g.detail || '') ? n : Math.max(0, n - 1);
}

// 'won', 'lost' or 'void' for one of these picks, or null while it isn't
// decided: called off, the kit's (its score so far decides what it already
// has); over, on its final; on, a part of it played (a half, five innings).
export function gradeExtra(leg) {
  const g = leg.game;
  const kitLeg = { ...leg, sport: kitSport(g.league) };
  if (g.state === 'void') return (g.score && decidedSoFar(kitLeg, { awayScore: g.score.away, homeScore: g.score.home })) || 'void';
  if (g.state === 'post' && g.score) return legResult(kitLeg, outcomeOf(g));
  if (g.state === 'in' && g.score && !g.off) {
    const n = periodsFor(leg);
    if (n && periodsDone(g) >= n) {
      const cut = { away: g.periods.away.slice(0, n), home: g.periods.home.slice(0, n) };
      return legResult(kitLeg, outcomeOf(g, 'final', cut));
    }
    return decidedSoFar(kitLeg, { awayScore: g.score.away, homeScore: g.score.home });
  }
  return null;
}
