import { slipPayoutTable, settleSlip, boostRate, PARLAY_BOOST, SLIP_RULES, combosBySize } from './lib/odds.mjs';
import { useSourcesSession, loadOdds, loadExtraLeagues, loadExtraFutures, taipeiDayKey, fetchOutcomes, loadLive, parseInning, loadFutureTeams, futureTeamLeagues, loadGameOffers, loadPlayers, loadLeagueTeams } from './lib/sources.mjs';
import { propName } from './lib/props.mjs';
import { hasPlayers } from './lib/players.mjs';
import * as kitPhotos from '#kit/photos.mjs';
import * as kit from '#kit/quadra.mjs';
import * as kitBoard from '#kit/play-board.mjs';
import * as kitUI from '#kit/ui.mjs';
import * as kitTeams from '#kit/play-teams.mjs';
const { personPhoto } = kitPhotos;
import { LIVE_MIN_LIQUIDITY, PERIODS } from './lib/live.mjs';
import { accountFor, LOCK_SINCE, balance, newSlipId, placeSlip, placeFreeSlip, FREE_MIN_ODDS, legResult, applyResults, mergeAccounts, recoverFromWallet, refundLost, mergeDistinct, poolEntries, resultByMarket, taxPaid, compactAccount, cashOut, isAccount } from './lib/account.mjs';
import { cashOutState, CASHOUT_MAX_OPEN } from './lib/cashout.mjs';
import { boardBets, futureBets, liveBets, legOf } from './lib/bets.mjs';
import { useSettleToken, readSettled, ackSettled, takeForCashOut, placeSlips, revealPending } from './lib/settled.mjs';
import { renderHome, tasteKey } from './home.js';
import { mountLottery } from './lottery-ui.js';
import { mountStats } from './stats-ui.js';
import { icon, kitGlyph } from './icons.js';

import { othersBalance, installGate, watchUpdates, quadraSession, tabBar, topActions, recordAffinity, affinityPatch, notify, schedulePush, storedAccount, ask, tell, money as kitMoney, freeBets, dev, everyDev, keepOffline, onlineOnly } from '#kit/quadra.mjs';
import { pack, unpack } from './lib/codec.mjs';
import { accountRecord } from './lib/history.mjs';
import { detectLocale, makeT, STRINGS } from './lib/i18n.mjs';
import { f1Driver, f1Constructor, F1_NAMES_ZH, F1_PAGE, findTeamLogo, countryFlag, countryCode, leagueLogo, teamLogo, teamZh, teamNameZh, LEAGUES, familyOf, isSoccer, normalizeTeamName } from './lib/teams.mjs';
import { flagUrl } from '#kit/logos.mjs';
import { logoPicture, raceName } from '#kit/logos.mjs';
import { minLegsProblem, leagueTier } from './lib/rules.mjs';
import { gameOptions } from './lib/board.mjs';
import { recommend } from './lib/recommend.mjs';
import { readBoard, boardLottery } from './lib/boardstart.mjs';
import { minLegsWhy, slipQuote, quoteAllPays, slipRange, slipsMost, legState, slipGroupKey, dropPicks, payoutTotals, parlayOdds, allVoid } from './lib/slip.mjs';


// A kit empty state whose icon is a kit glyph name, as a small tile of Play's own (the grey one).
const emptyK = o => {
  const n = kitUI.empty({ ...o, icon: o.icon ? '•' : '' });
  const slot = n.querySelector('.q-empty-icon');
  if (slot) { slot.innerHTML = kitUI.icons[o.icon] || ''; slot.classList.add('kit'); }
  return n;
};

const ACCOUNT_KEY = 'oddsStudy.account';
// Saved slips shown before the rest fold away.
const SAVED_SHOWN = 10;

const state = {
  locale: detectLocale(),
  t: null,
  data: null,
  bets: [],
  futures: [],
  // Recommended picks (recommend.mjs): bet id -> { tag, back, beats }.
  recs: new Map(),
  // Games in progress and their live bets.
  liveGames: [],
  liveBets: [],
  liveRecs: new Map(),
  liveAt: null,
  parlay: [],
  pickedOdds: {},
  slipMode: 'single',
  // Chosen 過關組合 sizes; 'all' stands for 全過, whatever the leg count.
  slipSizes: new Set([2, 'all']),
  // The stake per combination: the last one used on this device.
  slipStake: (() => {
    try {
      const v = Number(localStorage.getItem('play.stake'));
      return v >= 10 && v % 10 === 0 ? v : 500;
    } catch {
      return 500;
    }
  })(),
  day: null,
  dayPicked: false,
  // True until the first simulation is ready: the loading screen covers the page.
  booting: true,
  sport: 'all',
  tab: 'home',
  // The game whose sheet is open (every market), by id.
  sheetGame: null,
  // Each open game's market tab (大小, 讓分, 主隊/客隊大小, 得分最高單局).
  marketTab: new Map(),
  propTab: new Map(),
  // The simulated account (play money) and its sync.
  account: null,
  accountReady: false,
  // Resolves once the account is read and merged with the pass (boot).
  accountIn: null,
  sync: { busy: false, error: '', at: null },
  // The Quadra Pass's wallet (the shared money pool), when the code is a pass.
  wallet: null,
  // Slips saved or settled since the page opened, highlighted.
  freshSlips: new Set(),
  checking: false,
  checkedAt: 0,
  // Games in progress on open slips: leg id -> its outcome so far.
  legLive: new Map(),
  // Open picks' games past their start but not on: called off (status 'void') or not begun ('pre').
  legOutcome: new Map(),
  showAllSaved: false,
  // 大手筆 (bets grow with the balance) or 真實 (survey-based stakes) in the simulator.
  // The leaderboard shown.
  leaderKey: 'best',
  historyFilter: 'all',
  // 紀錄 shows the slips or the stats.
  historyView: 'slips'
};
state.t = makeT(state.locale);

const $ = id => document.getElementById(id);

// A sideways tab row (.market-tabs) fades on the side that has more tabs
// off screen, so a cut-off last tab reads as "more this way".
// The capsule around a tab row: its track and inset (the row inside only scrolls, and fades).
const tabStrip = row => (row ? el('div', { class: 'tab-strip' }, [row]) : null);
function markScroll(row) {
  const more = row.scrollWidth - row.clientWidth > 2;
  row.classList.toggle('more-left', more && row.scrollLeft > 2);
  row.classList.toggle('more-right', more && row.scrollLeft < row.scrollWidth - row.clientWidth - 2);
}
if (typeof document !== 'undefined') {
  document.addEventListener('scroll', e => e.target?.classList?.contains('market-tabs') && markScroll(e.target), true);
  const marked = () => document.querySelectorAll('.market-tabs').forEach(markScroll);
  let queued = false;
  new MutationObserver(() => queued || ((queued = true), requestAnimationFrame(() => ((queued = false), marked())))).observe(document.documentElement, { childList: true, subtree: true });
  addEventListener('resize', marked);
}
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) if (child != null) node.append(child);
  return node;
}

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

// ---- Formatting -------------------------------------------------------------

function numberLocale() {
  return state.locale === 'zh' ? 'zh-TW' : 'en-US';
}

// Formatters are made once per language and kept: making one is slow
// (Safari especially), and hundreds of bets are formatted on every tap.
const formatters = new Map();
function formatter(kind, make) {
  const key = `${kind}|${numberLocale()}`;
  if (!formatters.has(key)) formatters.set(key, make(numberLocale()));
  return formatters.get(key);
}
const fmtInt = n => formatter('int', locale => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })).format(n);

// The kit's NT$ money (a sign on a gain or loss that shows a figure; `sign: false` leaves it off).
const fmtMoney = (value, { sign = true } = {}) => kitMoney(value, { sign });

function fmtOdds(o) {
  return o.toFixed(2);
}

// A day and time in one short run ("10/10 21:00", Taiwan time): where a
// line has no room for the weekday.
function fmtShort(iso) {
  return formatter('short', locale => new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Taipei' }))
    .format(new Date(iso))
    .replace(/[,，]\s*/, ' ');
}
// A pick's start as short as it reads: today's its hour ("22:00"), the
// next day's 明天 ("明天 00:30"), later ones their date ("10/14 21:00").
function legWhen(iso) {
  if (!iso) return '';
  const day = ms => taipeiDayKey(new Date(ms));
  const at = Date.parse(iso);
  const hm = new Date(at + 8 * 3_600_000).toISOString().slice(11, 16);
  if (day(at) === day(Date.now())) return hm;
  if (day(at) === day(Date.now() + 86_400_000)) return `${state.locale === 'zh' ? '明天' : 'Tomorrow'} ${hm}`;
  return fmtShort(iso);
}
// A saved pick's name as shown now: a driver as the apps name them today,
// in English (a ticket from before keeps "G.羅素" or "羅素": George Russell).
// A driver's surname as the grid writes it ("Carlos Sainz Jr." is Sainz, not "Jr.").
function shortDriver(name) {
  const words = String(name || '').split(' ').filter(w => !/^(jr|sr|ii|iii|iv)\.?$/i.test(w));
  const known = f1Driver(name).surname;
  return (known && words.find(w => w.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === known.toLowerCase())) || words.slice(-1)[0] || '';
}
const F1_EN = Object.fromEntries(Object.entries(F1_NAMES_ZH).map(([surname, zh]) => [zh, F1_PAGE[surname] ? F1_PAGE[surname].split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ') : surname]));
const shownLabel = leg => {
  const label = String(leg.shortLabel || leg.label || '').replace(/^[A-Z]{1,3}\.(?=[\u4e00-\u9fff])/, '');
  return F1_EN[label] || label;
};
// A game's time: its day and 待定 while its hour isn't set (a play-off's
// next game: sold until the earliest it can start, the time it carries).
const TBD = { zh: '時間待定', en: 'Time TBD' };
function fmtDay(iso) {
  return formatter('day', locale => new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'Asia/Taipei' })).format(new Date(iso));
}
const gameTime = g => (g?.timeTbd ? `${fmtDay(g.startUtc)} ${TBD[state.locale === 'zh' ? 'zh' : 'en']}` : fmtTime(g.startUtc));
// Taiwan time, like the lottery, wherever the page is opened.
function fmtTime(iso) {
  return formatter('time', locale =>
    new Intl.DateTimeFormat(locale, {
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: 'Asia/Taipei'
    })
  ).format(new Date(iso));
}

function teamName(team) {
  return state.locale === 'zh' ? team.zh : team.en;
}

// ---- Bets -------------------------------------------------------------------

// The kit's order of a game's two sides (soccer home first, the rest away first).
const sidesOf = game => kitTeams.sidesInOrder(game);
function matchupText(game) {
  const [a, b] = sidesOf(game);
  return `${teamName(a)}${isSoccer(game.sport) ? ' vs ' : ' @ '}${teamName(b)}`;
}

// The same by the teams' short names ("火箭 @ 獨行俠"), for a line under a
// pick that has a league in front of it too (the full names were cut).
// A team's short name, for a row with no room for the city: Chinese's
// nickname (道奇), and in English the same teams' (Dodgers; the American
// leagues' city + nickname, as the kit's names have them). Else `fallback`.
const EN_TWO_WORD = /\b(Red Sox|White Sox|Blue Jays|Trail Blazers|Golden Knights|Maple Leafs|Blue Jackets|Red Wings|Red Bulls)$/;
function shortTeamName(sport, en, fallback) {
  const zh = en ? teamNameZh(sport, en, familyOf(sport)) : null;
  if (state.locale === 'zh') return zh?.short || fallback;
  return zh?.short && zh.short !== zh.full ? EN_TWO_WORD.exec(en)?.[1] || en.split(' ').pop() : fallback;
}

// Which competition a game is in: its league, and for tours and cups the
// event (Kambi's group: "Chengdu", "Italy Serie A" …).
function gameSeries(game) {
  const league = state.t(`sport_${game.sport}`);
  // Leagues whose Kambi group is only the league again ("Chinese Professional Baseball").
  const plain = ['baseball', 'basketball'].includes(familyOf(game.sport));
  // (Against its English name too: Kambi's "K-League 1" is the league, not a stage, in Chinese as well.)
  const same = name => [league, STRINGS.en?.[`sport_${game.sport}`]].some(x => x && normalizeTeamName(x).replace(/[\s-]/g, '') === normalizeTeamName(name).replace(/[\s-]/g, ''));
  const event = game.group && !plain && !same(game.group) ? game.group : null;
  return event ? `${league} · ${event}` : league;
}

// ---- Names for the board's options (board.mjs prices them) --------------------

function fmtLine(line) {
  return `${line > 0 ? '+' : line < 0 ? '−' : ''}${Math.abs(line)}`;
}

// A priced option with what the page calls it: `chip` (on its button),
// `label` (in full), `shortLabel` (on the slip) and `marketLabel` (its
// market's heading).
function named(game, o, matchup) {
  const t = state.t;
  const team = side => teamName(game[side]);
  switch (o.kind) {
    case 'ml': {
      const name = o.side === 'draw' ? t('draw') : team(o.side);
      return { ...o, matchup, chip: name, label: o.side === 'draw' ? `${matchup} ${name}` : `${name} ${t('win')}`, shortLabel: name };
    }
    case 'total':
      return { ...o, matchup, marketLabel: String(o.totalLine), chip: t(o.side), label: `${matchup} ${t(o.side)} ${o.totalLine}`, shortLabel: `${t(o.side)} ${o.totalLine}` };
    case 'runline': {
      const text = `${team(o.side)} ${fmtLine(o.runLine)}`;
      return { ...o, matchup, marketLabel: `${team(o.giver)} ${fmtLine(-Math.abs(o.awayLine))}`, chip: text, label: text, shortLabel: `${t('runLine')} ${text}` };
    }
    case 'teamtotal': {
      const text = `${team(o.team)} ${t(o.side)} ${o.teamLine}`;
      return { ...o, matchup, marketLabel: `${team(o.team)} ${o.teamLine}`, chip: t(o.side), label: text, shortLabel: text };
    }
    case 'prop': {
      const what = propText(o.stat, o.propLine, o.side);
      return { ...o, matchup, chip: o.side === 'yes' ? o.player : t(o.side), label: `${matchup} ${o.player} ${what}`, shortLabel: `${o.player} ${what}` };
    }
    case 'inning': {
      const name = o.inning < 9 ? t('inningN', { n: o.inning + 1 }) : t('inningTie');
      return { ...o, matchup, chip: name, label: `${matchup} ${t('topInning')} ${name}`, shortLabel: name };
    }
    default: {
      const name = pickName(game, o.m, o.pick);
      // Double chance's buttons in the sheet's words (主勝或和): two teams' names on one wrapped it.
      const chip = o.m.kind === 'dc' && /^(home|draw|away)\|(home|draw|away)$/.test(o.pick.side) ? t(`dc_${o.pick.side.replace('|', '_')}`) : name;
      return { ...o, matchup, marketLabel: marketLabelOf(game, o.m), chip, label: `${matchup} ${name}`, shortLabel: name };
    }
  }
}

// What a player pick is: "進球", "進球 2+", "射正 大 1.5".
function propText(stat, line, side) {
  const name = propName(stat, state.locale);
  if (stat === 'first') return name;
  if (side === 'yes') return line > 1 ? `${name} ${line}+` : name;
  return `${name} ${state.t(side)} ${line}`;
}

// A market's heading inside its section, when it needs one.
function marketLabelOf(game, m) {
  const t = state.t;
  if (m.kind === 'runline' || m.kind === 'total') return null;
  if (m.kind === 'nextrun') return t('firstScore');
  if (m.kind === 'hcap3') return `${teamName(game[m.giver])} ${fmtLine(-Math.abs(m.awayLine))}`;
  if (m.kind === 'ml' && familyOf(game.sport) === 'hockey') return t(HOCKEY_ML);
  // One inning's market (單局不讓分 / 單局大小) by its inning: [第1局]不讓分.
  if (m.period != null && (m.kind === 'inningml' || m.kind === 'inningtotal')) return t(m.kind === 'inningml' ? 'inningMlN' : 'inningTotalN', { n: m.period });
  if (m.market === 'margin6') return t('secMargin6');
  return t(secName(SECTIONS.find(sec => sec.kind === m.kind) ?? { kind: m.kind, title: m.kind }, game.sport, true));
}

const RESULT_SHORT = { home: 'homeShort', draw: 'drawShort', away: 'awayShort' };

// What a pick is called: a team, a line, a band, a score …
function pickName(game, market, pick) {
  const t = state.t;
  // A handicap (讓分, 半場讓分, [1-5局]讓分, 讓盤, 讓局): the team with its own line.
  if ((market.kind === 'runline' || HCAP_KINDS.has(market.kind)) && (pick.side === 'away' || pick.side === 'home') && pick.line != null) return `${teamName(game[pick.side])} ${fmtLine(pick.line)}`;
  // Soccer's three-way 讓分: each team with its own whole-goal line, then 和.
  if (market.kind === 'hcap3') return pick.side === 'draw' ? t('draw') : `${teamName(game[pick.side])} ${fmtLine(pick.side === 'away' ? market.awayLine : -market.awayLine)}`;
  if (market.kind === 'dc') return pick.side.split('|').map(x => (x === 'draw' ? t('draw') : teamName(game[x]))).join(' / ');
  if (market.kind === 'htft') return `${t(RESULT_SHORT[pick.ht])}/${t(RESULT_SHORT[pick.ft])}`;
  // 總進球數 bands; 正確進球數 one total each (9+ the last).
  if (market.kind === 'goalbands' || market.kind === 'goalcount') return pick.hi == null ? `${pick.lo}+` : pick.lo === pick.hi ? String(pick.lo) : `${pick.lo}-${pick.hi}`;
  // Hockey's 勝分差 on 60 minutes has a 和局 pick (台灣運彩's), no team.
  if (market.kind === 'margin' && pick.side === 'draw') return state.t('draw');
  if (market.kind === 'margin') return `${teamName(game[pick.team])} ${pick.hi == null ? `${pick.lo}+` : pick.lo === pick.hi ? pick.lo : `${pick.lo}-${pick.hi}`}`;
  if (market.kind === 'score' || market.kind === 'setscore') return pick.score === 'other' ? t('scoreOther') : pick.score.replace('-', ':');
  if (pick.side === 'away' || pick.side === 'home') return teamName(game[pick.side]);
  // Over or under with its line (半場大小 大 4.5, 單局大小 小 0.5): a market of several lines read the same without it.
  if ((pick.side === 'over' || pick.side === 'under') && market.line != null) return `${t(pick.side)} ${market.line}`;
  return t({ draw: 'draw', odd: 'odd', even: 'even', yes: 'yes', no: 'no', over: 'over', under: 'under' }[pick.side] ?? pick.side);
}

// A game's options (board.mjs gameOptions: every market, ~60 a game) are
// worked out once for what the game says, not on every redraw: hundreds of
// games made each redraw take half a second on a phone (a tap waited for
// it). Kept by the game's id and its contents (a fresh read with the same
// prices, the saved board's game today, reuses them); its Kambi markets or
// players arriving work them out again.
const optionsMemo = new Map();
const gameKey = game => JSON.stringify(game, (k, v) => (k === 'offers' || k === 'players' ? undefined : v));
function optionsOf(game) {
  const hit = optionsMemo.get(game.id);
  if (hit && hit.offers === game.offers && hit.players === game.players && (hit.game === game || hit.key === gameKey(game))) {
    if (hit.game !== game) Object.assign(hit, { game, options: hit.options.map(o => ({ ...o, game })) });
    return hit.options;
  }
  const options = gameOptions(game);
  optionsMemo.set(game.id, { game, key: gameKey(game), offers: game.offers, players: game.players, options });
  return options;
}

const f1MarketsMemo = {};
// Names a pick of a game (its label, chip, shortLabel), the game's matchup text worked out once.
function namer() {
  const matchups = new Map();
  return (game, o) => {
    if (!matchups.has(game.id)) matchups.set(game.id, matchupText(game));
    return named(game, o, matchups.get(game.id));
  };
}
// The board's bets, priced by the kit (play-bets.mjs, the Worker checks a
// placed bet's price with the same code), each named here.
function buildBets(data) {
  for (const game of data.games) {
    // Kambi's own markets of the game once read (loadOffers), whatever read of the board this is.
    if (gameOffers.has(game.id)) game.offers = gameOffers.get(game.id).offers;
    // And its players with their season numbers (players.mjs), once read.
    if (gamePlayers.get(game.id)?.players) game.players = gamePlayers.get(game.id).players;
  }
  return boardBets(data, { optionsOf, name: namer(), memo: f1MarketsMemo }).map(b => (b.sport === 'f1' && !b.label ? nameF1(b, data.f1) : b));
}

// An F1 pick's names: drivers in Chinese here, the race's name as its matchup.
const F1_SHORT = { f1podium: 'f1PodiumShort', f1top6: 'f1Top6Short', f1top10: 'f1Top10Short', f1pole: 'f1PoleShort' };
const F1_FLAG_NAME = { sc: 'f1Sc', vsc: 'f1Vsc', red: 'f1Red' };
function nameF1(b, f1) {
  const t = state.t;
  const matchup = raceName(f1.title, state.locale);
  const nameOf = driver => (state.locale === 'zh' ? driver.zh : null);
  const name = b.driver ? nameOf(b.driver) ?? b.driverEn : '';
  if (b.kind === 'f1') return { ...b, matchup, label: `F1 ${name}`, shortLabel: name };
  if (F1_SHORT[b.kind]) return { ...b, matchup, label: `F1 ${t(F1_SHORT[b.kind])} ${name}`, shortLabel: name };
  if (b.kind === 'f1h2h') {
    const rival = nameOf(b.rivalDriver) ?? b.rival;
    return { ...b, matchup, rivalLabel: rival, label: `F1 ${name} ${t('f1H2HBeats')} ${rival}`, shortLabel: `${shortDriver(b.driverEn)} ${t('f1H2HBeats')} ${shortDriver(b.rival)}` };
  }
  if (b.kind === 'f1team') return { ...b, matchup, label: `F1 ${t('f1TeamShort')} ${b.team}`, shortLabel: b.team };
  const flag = F1_FLAG_NAME[b.kind?.slice(2)];
  if (flag) {
    const short = `${t(flag)} ${t(b.pick === 'yes' ? 'f1FlagYes' : 'f1FlagNo')}`;
    return { ...b, matchup, label: `F1 ${short}`, shortLabel: short };
  }
  return { ...b, matchup };
}

// A championship pick's name: drivers as the lottery writes them.
function futureName(market, team) {
  if (market.key === 'f1drivers' && state.locale === 'zh') return f1Driver(team.name.en).zh;
  return teamName(team.name);
}

// One bet per team of every championship market (play-bets.mjs), named here.
function buildFutures(data) {
  const t = state.t;
  return futureBets(data.futures).map(b => {
    const title = t(`future_${b.futureMarket.key}`, { season: b.futureMarket.season });
    const cardTitle = t(`future_${b.futureMarket.key}`, { season: '' }).trim();
    const name = futureName(b.futureMarket, b.futureTeam);
    return { ...b, matchup: cardTitle, label: `${title} ${name}`, shortLabel: name };
  });
}

function effectiveOdds(bet) {
  return bet.estOdds;
}

// Days follow Taiwan time, like the lottery.
function dayKey(iso) {
  return taipeiDayKey(iso);
}

// Where a league sits on screen: the catalogue's headline leagues (CPBL
// among them) with the majors, whatever the house's risk tier says about its cut.
const shownTier = sport => (LEAGUES[sport]?.top ? 'major' : leagueTier(sport));

// The sport filter: everything, a kind of sport (g:<group>), or one league.
const SPORT_GROUPS_ALL = {
  baseball: { icon: 'ball', leagues: ['mlb', 'npb', 'kbo', 'cpbl'] },
  basketball: { icon: 'ball', leagues: Object.keys(LEAGUES).filter(key => LEAGUES[key].family === 'basketball' && !LEAGUES[key].off) },
  soccer: { icon: 'ball', leagues: Object.keys(LEAGUES).filter(key => LEAGUES[key].family === 'soccer' && !LEAGUES[key].off) },
  football: { icon: 'flag', leagues: ['nfl', 'ncaaf'] },
  hockey: { icon: 'target', leagues: ['nhl'] },
  f1: { icon: 'flag', leagues: ['f1'] }
};
// Only leagues on sale (Taiwan can watch them); a kind with none left goes.
const SPORT_GROUPS = Object.fromEntries(
  Object.entries(SPORT_GROUPS_ALL)
    .map(([g, x]) => [g, { ...x, leagues: x.leagues.filter(k => k === 'f1' || LEAGUES[k]) }])
    .filter(([, x]) => x.leagues.length)
);
const groupOfSport = sport => Object.keys(SPORT_GROUPS).find(g => SPORT_GROUPS[g].leagues.includes(sport));

function inSport(sport) {
  if (state.sport === 'all' || state.sport === sport) return true;
  return state.sport.startsWith('g:') && SPORT_GROUPS[state.sport.slice(2)]?.leagues.includes(sport);
}

function rerenderFiltered() {
  renderSportFilter();
  renderTabs();
  renderDayFilter();
  renderGames();
  renderLive();
  renderFutures();
}

function chip({ pressed, icon, text, count, onclick }) {
  return el('button', { class: 'q-chip', type: 'button', 'aria-pressed': String(pressed), onclick }, [icon ?? null, el('span', { text }), count ? el('span', { class: 'chip-count', text: count }) : null]);
}

// The kinds of sport as one row of chips (a logo or the sport's glyph, the
// name, today's games); a kind with several leagues, once picked, its
// leagues in a second row.
function renderSportFilter() {
  const t = state.t;
  const present = new Set([...state.bets, ...state.futures].map(b => b.sport));
  const groups = Object.keys(SPORT_GROUPS).filter(g => SPORT_GROUPS[g].leagues.some(l => present.has(l)));
  const valid = state.sport === 'all' || (state.sport.startsWith('g:') && groups.includes(state.sport.slice(2))) || present.has(state.sport);
  if (!valid) state.sport = 'all';
  const current = state.sport === 'all' ? null : state.sport.startsWith('g:') ? state.sport.slice(2) : groupOfSport(state.sport);
  const pick = value => () => {
    state.sport = value;
    rerenderFiltered();
  };
  $('sport-filter').replaceChildren(
    chip({ pressed: state.sport === 'all', text: t('sport_all'), onclick: pick('all') }),
    ...groups.map(g => {
      const leagues = SPORT_GROUPS[g].leagues.filter(l => present.has(l));
      return chip({ pressed: current === g, icon: groupIcon(g), text: t(`group_${g}`), onclick: pick(leagues.length === 1 ? leagues[0] : `g:${g}`) });
    })
  );
  keepInView($('sport-filter'));
  const leagues = current ? SPORT_GROUPS[current].leagues.filter(l => present.has(l)) : [];
  $('league-filter').hidden = leagues.length < 2;
  $('league-filter').replaceChildren(
    ...(leagues.length < 2 ? [] : [chip({ pressed: state.sport === `g:${current}`, text: t('leagueAll'), onclick: pick(`g:${current}`) }), ...leagues.map(l => chip({ pressed: state.sport === l, icon: leagueImg(l, 'logo-xs'), text: t(`sport_${l}`), onclick: pick(l) }))])
  );
  keepInView($('league-filter'));
}
// A kind of sport's picture: its one league's logo, else its glyph.
// A kind of sport shows its own art: the kit's sport glyph when it has one, else its
// lead league's logo (MLB for 棒球, NBA for 籃球), never one ball for every sport.
const groupIcon = g => {
  if (kitUI.icons[`sport_${g}`]) return kitGlyph(kitUI, `sport_${g}`, 'chip-glyph');
  const lead = SPORT_GROUPS[g].leagues.find(l => leagueLogo(l));
  return lead ? leagueImg(lead, 'logo-xs') : kitGlyph(kitUI, SPORT_GROUPS[g].icon, 'chip-glyph');
};
// A sideways row keeps its chosen chip in view.
function keepInView(row) {
  const on = row?.querySelector('[aria-pressed="true"]');
  if (on && (on.offsetLeft < row.scrollLeft || on.offsetLeft + on.offsetWidth > row.scrollLeft + row.clientWidth)) row.scrollLeft = on.offsetLeft - 16;
}

// 今天 / 明天 / the weekday, in Taiwan time.
function dayLabel(day) {
  const today = dayKey(new Date().toISOString());
  const tomorrow = dayKey(new Date(Date.now() + 86_400_000).toISOString());
  if (day === today) return state.t('today');
  if (day === tomorrow) return state.t('tomorrow');
  const [y, m, d] = day.split('-').map(Number);
  return formatter('weekday', locale => new Intl.DateTimeFormat(locale, { weekday: 'short' })).format(new Date(y, m - 1, d));
}

// The days with games, worked out again only when what they come from changes.
let dayMemo = { key: [], days: [] };
const sameKeys = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
// The day a bet is shown on: its own, but an F1 weekend's all on race day
// (its pole closes at qualifying, the day before in Taipei).
const betDay = b => dayKey(b.sport === 'f1' && state.data.f1?.startUtc ? state.data.f1.startUtc : b.start);
const f1Day = () => (state.data?.f1?.startUtc ? dayKey(state.data.f1.startUtc) : null);
// The day the board shows, in the head's button (今天 10/19 ▾): a tap lists
// every day with its games. One day only: the day, no menu.
function renderDayFilter() {
  const t = state.t;
  const today = dayKey(new Date().toISOString());
  const liveNow = state.liveGames.filter(g => inSport(g.sport)).length;
  // Today stays while games are on (場中 lives there).
  const dayKeys = [state.bets, state.sport, liveNow > 0, today];
  if (!sameKeys(dayKeys, dayMemo.key)) dayMemo = { key: dayKeys, days: [...new Set([...state.bets.filter(b => inSport(b.sport)).map(betDay), ...(liveNow ? [today] : [])])].sort() };
  const days = dayMemo.days;
  // The earliest day with games until one is picked.
  if (!state.dayPicked || !days.includes(state.day)) {
    state.day = days[0] ?? null;
    state.dayPicked = false;
  }
  const button = $('day-pick');
  button.hidden = !state.day;
  if (state.day) {
    const [, m, d] = state.day.split('-').map(Number);
    button.replaceChildren(el('span', { text: `${dayLabel(state.day)} ${m}/${d}` }), days.length > 1 ? el('i', { class: 'pl-day-chev', 'aria-hidden': 'true' }) : null);
    button.disabled = days.length <= 1;
    button.onclick = () =>
      kitUI.menu(
        button,
        days.map(day => {
          const [, dm, dd] = day.split('-').map(Number);
          const games = state.data.games.filter(g => inSport(g.sport) && dayKey(g.startUtc) === day).length;
          const extra = [day === today && liveNow ? `${t('liveTitle')} ${liveNow}` : null, games ? t('gamesN', { n: games }) : null, inSport('f1') && f1Day() === day ? 'F1' : null].filter(Boolean).join(' · ');
          return {
            label: `${dayLabel(day)} ${dm}/${dd}${extra ? `  ·  ${extra}` : ''}`,
            icon: day === state.day ? '✓' : '',
            onClick: () => {
              state.day = day;
              state.dayPicked = true;
              rerenderFiltered();
              scrollTo({ top: 0 });
            }
          };
        })
      );
  }
  // 場中 shows on today only.
  renderLive();
}

// Two initials of a name ("Sarah De Nutte" → SD; a Chinese name's first character).
const initialsOf = name => {
  const n = String(name || '?').trim();
  if (/[\u3400-\u9fff]/.test(n)) return n.slice(0, 1);
  return n.split(/\s+/).filter(w => w && !/^(jr|sr)\.?$/i.test(w)).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
};
// ---- Pictures kept across redraws ----------------------------------------------------
//
// The boards and a game's sheet are drawn anew whenever anything changes (a
// pick, the markets arriving, the live prices every 15 seconds). A new <img>
// for every logo each time made the phone load and paint every picture again:
// they blinked, and now and then one stayed blank. Now a redraw takes the
// pictures already on screen in that place and moves them into the new
// layout (`recycled`), so a logo is loaded once and stays put.
let recycled = null;
function redraw(root, draw) {
  if (!root) return draw();
  const outer = recycled;
  recycled = new Map();
  for (const node of root.querySelectorAll('[data-pic]')) {
    const list = recycled.get(node.dataset.pic) ?? [];
    list.push(node);
    recycled.set(node.dataset.pic, list);
  }
  // Every other picture already painted (the kit's logo tiles: home's cards,
  // the live strip) moves into the new layout too, by its address.
  const painted = new Map();
  const was = new Set(root.querySelectorAll('img'));
  for (const img of was) {
    if (!img.complete || !img.naturalWidth) continue;
    const list = painted.get(img.src) ?? [];
    list.push(img);
    painted.set(img.src, list);
  }
  try {
    return draw();
  } finally {
    recycled = outer;
    if (painted.size)
      for (const img of root.querySelectorAll('img')) {
        if (was.has(img)) continue;
        const list = painted.get(img.src);
        let old = list?.shift();
        while (old && old.isConnected) old = list.shift();
        if (!old) continue;
        old.className = img.className;
        old.alt = img.alt;
        old.style.cssText = img.style.cssText;
        old.style.opacity = '';
        img.replaceWith(old);
      }
  }
}
// The picture `key` from the redraw's old screen, else a new one (`make`).
// A stand-in (an initial: the logo wasn't known yet when it was first drawn,
// e.g. the home page from the saved live copy before the leagues' logos
// arrived) is never kept once the real picture can be drawn.
const isStandIn = node => node.matches('.logo-fallback, .league-missing, .league-icon') || Boolean(node.querySelector?.('.logo-fallback, .league-missing, .league-icon'));
function keptPic(key, make) {
  const old = recycled?.get(key)?.shift();
  if (old && !isStandIn(old)) return old;
  const node = make();
  if (old && isStandIn(node)) return old;
  node.dataset.pic = key;
  return node;
}

// A team logo, or its initials in a circle when there's no logo (or it fails).
function logoImg(sport, enName, label, size = '') {
  return keptPic(`team|${sport}|${enName}|${label}|${size}`, () => drawLogo(sport, enName, label, size));
}
function drawLogo(sport, enName, label, size) {
  // A national team's flag; else one character: a Chinese name's first
  // character, or an English initial.
  const flag = countryFlag(enName);
  const fallback = () =>
    flag ? el('span', { class: `logo logo-flag ${size}`, 'aria-hidden': 'true', text: flag }) : el('span', { class: `logo logo-fallback ${size}`, 'aria-hidden': 'true', text: (label || '?').trim().slice(0, 1) });
  // A side not decided yet ("Yankees/Red Sox"): no one team's logo.
  if (/\//.test(enName || '')) return fallback();
  // No club logo for a national side: its round flag.
  const code = countryCode(enName);
  const url = teamLogo(sport, enName) ?? findTeamLogo(futureTeamLeagues(sport), enName) ?? (code ? flagUrl(code) : null);
  return logoPicture(url, url === teamLogo(sport, enName) ? teamLogo(sport, enName, true) : null, `logo ${code && url === flagUrl(code) ? 'player-flag ' : ''}${size}`, fallback);
}

// The league's own logo on a small white disc, the same for every league in
// light and dark mode, so no logo ever vanishes
// into a dark background and none stands out.
function leagueImg(sport, size = '') {
  return keptPic(`league|${sport}|${size}`, () => drawLeague(sport, size));
}
function drawLeague(sport, size) {
  const icon = LEAGUES[sport]?.icon;
  const fallback = () => (icon ? el('span', { class: 'league-img league-icon', 'aria-hidden': 'true' }, [kitGlyph(kitUI, 'ball')]) : el('span', { class: 'league-img league-missing', 'aria-hidden': 'true' }));
  return el('span', { class: `league-badge ${size}` }, logoPicture(leagueLogo(sport), null, 'league-img', fallback));
}

// ---- Rendering: static text ------------------------------------------------

function renderStatic() {
  const t = state.t;
  document.documentElement.lang = state.locale === 'zh' ? 'zh-Hant' : 'en';
  // The app's name in the page's language only: 四方運彩 or Quadra Sportsbook.
  document.title = t('title');
  const bootTitle = document.querySelector('#loading .q-boot-title');
  if (bootTitle) bootTitle.textContent = t('title');
  $('title').textContent = t('title');
  $('game-search').placeholder = t('searchPlaceholder');
  $('game-search').setAttribute('aria-label', t('searchPlaceholder'));
  if ($('parlay-title')) $('parlay-title').textContent = t('parlayTitle');
  for (const node of document.querySelectorAll('[data-t]')) node.textContent = t(node.dataset.t);
  for (const tab of TABS) tabNav.label(tab, t(`tab_${tab}`));
  // Every tab but the first opens on the kit's large title (Home has none).
  for (const tab of TABS.slice(1)) {
    const panel = $(`panel-${tab}`);
    const own = panel?.querySelector(':scope > .q-nav-title');
    if (own) own.setTitle?.(t(`tab_${tab}`));
    else {
      panel?.prepend(kitUI.navTitle(t(`tab_${tab}`)));
    }
  }
}

// A board that couldn't be read says so once, in a toast (the page keeps what it has).
function renderStatus(kind) {
  if (kind === 'error') kitUI.toast(state.t('loadFailed'));
}

// ---- Ranking ------------------------------------------------------------------

function betIcon(bet) {
  if (bet.kind === 'f1team') return constructorBadge(bet.team, 'logo-sm');
  if (bet.kind?.startsWith('f1') && bet.driver) return driverBadge(bet, 'logo-sm');
  if (bet.kind === 'future') return logoImg(bet.sport, bet.teamEn, bet.shortLabel, 'logo-sm');
  // Totals' side is over/under: they show the league, team totals the team.
  const side = bet.kind === 'teamtotal' ? bet.team : ['away', 'home'].includes(bet.side) ? bet.side : null;
  if (bet.game && side) return logoImg(bet.sport, bet.game[side].en, teamName(bet.game[side]), 'logo-sm');
  return leagueImg(bet.sport, 'logo-sm');
}

// ---- Games --------------------------------------------------------------------

// The search bar: teams (Chinese or English) and leagues, every day and
// sport at once; the filters step aside while it's in use.
state.query = '';
const searchKey = text => normalizeTeamName(String(text || '')).replace(/\s+/g, '') || String(text || '').toLowerCase().replace(/\s+/g, '');
function gameMatches(game, query) {
  const t = state.t;
  const hay = [game.away.en, game.away.zh, game.home.en, game.home.zh, t(`sport_${game.sport}`), gameSeries(game)].filter(Boolean);
  const want = searchKey(query);
  return hay.some(text => searchKey(text).includes(want) || String(text).includes(query));
}
function searchGames() {
  const q = state.query;
  document.body.classList.toggle('searching', Boolean(q));
  return state.data.games.filter(g => gameMatches(g, q)).sort((a, b) => a.startUtc.localeCompare(b.startUtc));
}

function renderGames() {
  redraw($('games-list'), drawGames);
}
// The day's games, one section per league (its logo and name, its count),
// the big leagues first; with every sport shown the thinly traded ones fold
// behind one row. A search lists every match found, any day, in one section.
function drawGames() {
  const t = state.t;
  const container = $('games-list');
  const searching = Boolean(state.query);
  document.body.classList.toggle('searching', searching);
  if (!searching) renderDayFilter();
  const byGame = groupBy(state.bets, b => b.gameId);
  const games = (searching ? searchGames() : state.data.games.filter(g => inSport(g.sport) && dayKey(g.startUtc) === state.day)).filter(g => byGame.get(g.id));
  if (searching) {
    container.replaceChildren(
      games.length
        ? gameSection(el('span', { text: t('searchResults', { q: state.query, n: games.length }) }), null, games.map(g => gameRow(g, byGame.get(g.id), { league: true, day: true })))
        : kitUI.empty({ title: t('searchNone') })
    );
    return;
  }
  const TIER = { major: 0, minor: 1, thin: 2 };
  const leagues = [...groupBy(games, g => g.sport).entries()].sort(([a, x], [b, y]) => TIER[shownTier(a)] - TIER[shownTier(b)] || x[0].startUtc.localeCompare(y[0].startUtc));
  const fold = state.sport === 'all' && !state.showThin && leagues.some(([s]) => shownTier(s) !== 'thin');
  const shown = fold ? leagues.filter(([s]) => shownTier(s) !== 'thin') : leagues;
  const folded = leagues.slice(shown.length);
  const rest = folded.reduce((n, [, list]) => n + list.length, 0);
  const sections = shown.map(([sport, list]) => gameSection([leagueImg(sport, 'logo-xs'), el('span', { text: t(`sport_${sport}`) })], list.length, list.map(g => gameRow(g, byGame.get(g.id)))));
  const f1 = f1Section();
  if (f1) sections.splice(sections.length && shownTier(shown[0][0]) === 'major' ? 1 : 0, 0, f1);
  container.replaceChildren(
    ...sections,
    ...[rest
      ? el('button', { class: 'pl-fold q-press', type: 'button', onclick: () => ((state.showThin = true), renderGames()) }, [
          el('span', { class: 'pl-fold-logos', 'aria-hidden': 'true' }, folded.slice(0, 3).map(([s]) => leagueImg(s, 'logo-xs'))),
          el('span', { class: 'pl-fold-text', text: t('moreLeagues', { n: rest }) }),
          el('i', { class: 'pl-chev', 'aria-hidden': 'true' })
        ])
      : null,
    !sections.length ? kitUI.empty({ title: t('noBets') }) : null].filter(Boolean)
  );
}
function gameSection(title, count, rows) {
  return el('section', { class: 'q-section' }, [
    el('div', { class: 'q-section-head' }, [el('h2', { class: 'pl-league-h' }, title), count ? el('span', { class: 'pl-count', text: String(count) }) : null]),
    el('div', { class: 'q-rowcard pl-games' }, rows)
  ]);
}

function hhmm(iso) {
  return formatter('hhmm', locale => new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Taipei' })).format(new Date(iso));
}

// A game's winner columns: soccer's 主勝/和/客勝; a three-way winner elsewhere
// (hockey's 60 minutes with 台灣運彩's settle rules in the kit) keeps the
// card's away-at-home order with 和 between; else the two teams.
function winnerSides(game, ml) {
  if (isSoccer(game.sport)) return ['home', 'draw', 'away'];
  // (Basketball and baseball are 不讓分 two-way: never a 和 button, whatever a feed sends.)
  return ml.some(b => b.side === 'draw') && !['baseball', 'basketball'].includes(familyOf(game.sport)) ? ['away', 'draw', 'home'] : ['away', 'home'];
}
// A row's team name: Chinese's full name, English's short one (the city cut).
const rowTeam = (game, side) => (state.locale === 'zh' ? teamName(game[side]) : shortTeamName(game.sport, game[side].en, teamName(game[side])));
// The event a game is in beyond its league (a tour's stop, a cup's round).
const eventOf = game => gameSeries(game).split(' · ').slice(1).join(' · ');
// How many markets a game has beyond the winner.
const marketCount = bets => new Set(bets.filter(b => b.kind !== 'ml').map(b => b.market ?? b.kind)).size;

// A game as a row: the time (or its live state) and its markets' count on
// top, then each side with its logo, its score and its win price. A tap
// anywhere but a price opens its sheet with every market.
function gameRow(game, bets, { league = false, day = false } = {}) {
  const t = state.t;
  const ml = bets.filter(b => b.kind === 'ml');
  const rows = winnerSides(game, ml).map(side => {
    const bet = ml.find(b => b.side === side);
    if (side === 'draw') return bet ? el('div', { class: 'pl-team draw' }, [el('span', { class: 'pl-draw-mark', 'aria-hidden': 'true', text: '=' }), el('span', { class: 'pl-team-name', text: t('draw') }), pickButton(bet, '')]) : null;
    const score = game.live ? el('span', { class: `pl-score${scoreMoved(`${game.id}|${side}`, game.live[`${side}Score`]) ? ' moved' : ''}`, text: String(game.live[`${side}Score`]) }) : null;
    return el('div', { class: 'pl-team' }, [logoImg(game.sport, game[side].en, teamName(game[side]), 'logo-sm'), el('span', { class: 'pl-team-name', text: rowTeam(game, side) }), score, bet ? pickButton(bet, '') : el('span', { class: 'pick-none' })]);
  });
  const n = marketCount(bets);
  const event = league ? gameSeries(game) : eventOf(game);
  const when = game.timeTbd ? TBD[state.locale === 'zh' ? 'zh' : 'en'] : day ? `${dayKey(game.startUtc).slice(5).replace('-', '/')} ${hhmm(game.startUtc)}` : hhmm(game.startUtc);
  return el('article', { class: `pl-game${game.live ? ' live' : ''}`, 'data-game': game.id, onclick: e => !e.target.closest('button') && openGameSheet(game.id) }, [
    el('div', { class: 'pl-game-top' }, [
      league ? leagueImg(game.sport, 'logo-xs') : null,
      game.live
        ? el('span', { class: 'pl-when live' }, [el('i', { class: 'pl-dot', 'aria-hidden': 'true' }), el('span', { text: liveStateText(game.live), ...halftimeTick(game.live, game.live.sport) })])
        : el('span', { class: 'pl-when', text: when }),
      event ? el('span', { class: 'pl-event', text: event }) : null,
      el('span', { class: 'pl-more', text: n ? t('marketsN', { n }) : '' }, [el('i', { class: 'pl-chev', 'aria-hidden': 'true' })])
    ]),
    ...rows
  ]);
}

// A game in its sheet: the scoreboard (both sides' logos and names, the
// time or the live score between), the win prices in one row, then every
// other market under its tabs.
// A team's logo address (a club's, else a national side's flag), for the kit's logo tiles.
const teamUrl = (sport, en) => (/\//.test(en || '') ? null : teamLogo(sport, en) ?? findTeamLogo(futureTeamLeagues(sport), en) ?? (countryCode(en) ? flagUrl(countryCode(en)) : null));
function gameDetail(game, bets) {
  const t = state.t;
  const ml = bets.filter(b => b.kind === 'ml');
  const sides = winnerSides(game, ml);
  const [left, right] = sides.filter(s => s !== 'draw');
  const day = dayKey(game.startUtc);
  const [, m, d] = day.split('-').map(Number);
  const others = bets.filter(b => b.kind !== 'ml');
  // A game Kambi lists, or with players' markets, has more on the way while its lists are read.
  const more = others.length > 0 || Boolean(game.live && game.kambiId) || (!moreShown.has(game.id) && (Boolean(game.kambiId) || (Boolean(game.espnTeams) && hasPlayers(game.sport))));
  const win = sides.map(s => ml.find(b => b.side === s)).filter(Boolean);
  return el('div', { class: 'gs' }, [
    // sheetHero: the two logos, the time (or score) big, the matchup under it.
    kitUI.sheetHero({
      logos: [left, right].map(s => teamUrl(game.sport, game[s].en)),
      eyebrow: game.live ? liveStateText(game.live) : `${dayLabel(day)} ${m}/${d}`,
      big: game.live ? `${game.live[`${left}Score`]} : ${game.live[`${right}Score`]}` : game.timeTbd ? TBD[state.locale === 'zh' ? 'zh' : 'en'] : hhmm(game.startUtc),
      sub: [left, right].map(s => shortTeamName(game.sport, game[s].en, teamName(game[s]))).join(' vs '),
      tint: 'var(--q-blue)'
    }),
    win.length ? el('div', { class: 'gs-win', style: `--n:${win.length}` }, win.map(b => pickButton(b, b.side === 'draw' ? t('draw') : shortTeamName(game.sport, game[b.side].en, teamName(game[b.side]))))) : null,
    more ? gameMore(game, others) : kitUI.empty({ title: t('offersNone') })
  ]);
}

// Every other market of a game, one tab each: the main ones first, the
// players' (球員) next, the long-shot ones (bands, exact scores) together
// under 更多.
// A game's markets drawn once their lists are in (Kambi's markets, the
// players'), or after 4 s with what there is: the 球員 tab and the rest
// jumped in seconds after the sheet opened. Meanwhile, the tabs' and rows' shape.
const moreShown = new Set();
const moreSince = new Map();
function gameMore(game, bets) {
  const t = state.t;
  wantOffers(game);
  const pending = (game.kambiId && !gameOffers.has(game.id) && offersLoading.has(game.id)) || gamePlayers.get(game.id)?.loading;
  if (!moreShown.has(game.id)) {
    if (!moreSince.has(game.id)) moreSince.set(game.id, Date.now());
    const left = moreSince.get(game.id) + 4000 - Date.now();
    if (pending && left > 0) {
      setTimeout(() => state.sheetGame === game.id && !moreShown.has(game.id) && renderGameSheet(), left + 20);
      return el('div', { class: 'game-more more-shape', 'aria-hidden': 'true' }, [
        el('div', { class: 'shape-tabs' }, [0, 1, 2, 3].map(() => el('i', { class: 'shape-pill' }))),
        el('div', { class: 'shape-rows' }, [0, 1, 2, 3].map(() => el('div', { class: 'shape-row' }, [el('i', { class: 'shape-line' }), el('i', { class: 'shape-odds' }), el('i', { class: 'shape-odds' })])))
      ]);
    }
    moreShown.add(game.id);
  }
  const all = SECTIONS.filter(sec => sec.kind !== 'ml' && bets.some(b => b.kind === sec.kind));
  const extra = all.filter(sec => sec.extra);
  const kinds = [...all.filter(sec => !sec.extra), ...(extra.length ? [MORE_SECTION] : [])];
  const current = kinds.find(sec => sec.kind === state.marketTab.get(game.id)) ?? kinds[0];
  const tabs =
    kinds.length > 1
      ? el('div', { class: 'q-chips market-tabs', role: 'tablist', 'aria-label': t('moreMarkets') },
          kinds.map(sec =>
            el('button', {
              type: 'button',
              role: 'tab',
              class: `q-chip${sec.kind === 'prop' ? ' tab-props' : ''}`,
              'aria-selected': String(sec === current),
              'aria-pressed': String(sec === current),
              text: t(secName(sec, game.sport)),
              onclick: () => {
                state.marketTab.set(game.id, sec.kind);
                renderGameSheet();
              }
            })
          )
        )
      : null;
  // The row scrolls sideways: the chosen tab kept in view after a redraw.
  if (tabs)
    requestAnimationFrame(() => {
      const on = tabs.querySelector('[aria-selected="true"]');
      if (on && tabs.scrollWidth > tabs.clientWidth) tabs.scrollLeft = Math.max(0, on.offsetLeft - (tabs.clientWidth - on.offsetWidth) / 2);
    });
  let panel = null;
  if (current === MORE_SECTION)
    panel = el('div', { class: 'market-more' }, extra.map(sec => el('section', { class: 'more-block' }, [el('h4', { class: 'more-title', text: t(secName(sec, game.sport, true)) }), marketPanel(game, sec, bets.filter(b => b.kind === sec.kind), { titled: true })])));
  else if (current?.kind === 'prop') panel = propsPanel(game, bets.filter(b => b.kind === 'prop'));
  else if (current) panel = marketPanel(game, current, bets.filter(b => b.kind === current.kind));
  // Kambi's full list on its way: say so under the model's markets.
  const waiting = (game.kambiId && !gameOffers.has(game.id) && offersLoading.has(game.id)) || gamePlayers.get(game.id)?.loading;
  // The markets keep the tallest height they've had while this game is open:
  // a shorter tab no longer pulls the page (and the tabs under the finger) up.
  if (marketTall.game !== game.id) Object.assign(marketTall, { game: game.id, h: 0 });
  const body = el('div', { class: 'market-body', style: marketTall.h ? `min-height:${marketTall.h}px` : null }, [panel]);
  requestAnimationFrame(() => {
    if (marketTall.game === game.id && body.isConnected) marketTall.h = Math.max(marketTall.h, body.offsetHeight);
  });
  return el('div', { class: 'game-more' }, [tabStrip(tabs), body, waiting ? el('p', { class: 'muted offers-wait', text: t('offersLoading') }) : !panel ? el('p', { class: 'muted offers-wait', text: t('offersNone') }) : null]);
}

const marketTall = { game: null, h: 0 };

// Players' markets: one chip per market (進球, 射正 1.5 …), then each
// player with their price, the likeliest first.
function propsPanel(game, bets) {
  const t = state.t;
  const groups = [...groupBy(bets, b => b.group).entries()];
  const ORDER = ['first', 'goals', 'ga', 'assists', 'sot', 'points', 'shots', 'hr', 'hits', 'rbi', 'runs', 'hrr', 'td', 'passYds', 'rushYds', 'recYds', 'rec', 'rushRecYds', 'passRushYds', 'passTD', 'passComp', 'passAtt', 'rushAtt', 'ints', 'pts', 'reb', 'ast', 'threes'];
  const rank = ([key]) => {
    const [stat, line] = key.split('|');
    return (ORDER.indexOf(stat) + 1 || 99) * 1000 + Number(line || 0);
  };
  groups.sort((a, b) => rank(a) - rank(b));
  const chosen = groups.find(([key]) => key === state.propTab.get(game.id)) ?? groups[0];
  if (!chosen) return null;
  const chipFor = ([key, list]) => {
    const [stat, line] = key.split('|');
    const side = list.some(b => b.side === 'yes') ? 'yes' : 'over';
    const text = side === 'yes' ? propText(stat, Number(line) || 1, 'yes') : `${propName(stat, state.locale)} ${line}`;
    return el('button', {
      type: 'button',
      class: 'q-chip prop-chip',
      'aria-pressed': String(key === chosen[0]),
      text,
      onclick: () => {
        state.propTab.set(game.id, key);
        renderGameSheet();
      }
    });
  };
  const chips = el('div', { class: 'chip-row prop-chips' }, groups.map(chipFor));
  requestAnimationFrame(() => {
    const on = chips.querySelector('[aria-pressed="true"]');
    if (on && chips.scrollWidth > chips.clientWidth) chips.scrollLeft = Math.max(0, on.offsetLeft - (chips.clientWidth - on.offsetWidth) / 2);
  });
  const [, list] = chosen;
  const players = [...groupBy(list, b => b.player).values()].sort((a, b) => Math.min(...a.map(x => x.estOdds)) - Math.min(...b.map(x => x.estOdds)));
  const ou = list.some(b => b.side === 'over');
  const rows = players.map(picks => {
    const name = picks[0].player;
    const cells = ou ? ['over', 'under'].map(side => picks.find(b => b.side === side)) : [picks[0]];
    return el('div', { class: `prop-row ${ou ? 'two' : ''}` }, [
      el('span', { class: 'prop-player' }, [playerPhoto(picks[0].photo, name, game.sport, picks[0].photoGuessed), el('span', { class: 'prop-name', text: name })]),
      ...cells.map(b => (b ? pickButton(b, ou ? t(b.side) : '') : el('span')))
    ]);
  });
  return el('div', { class: 'market-panel props' }, [
    chips,
    ou ? el('div', { class: 'prop-head' }, [el('span', { text: t('colPlayer') }), el('span', { text: t('over') }), el('span', { text: t('under') })]) : null,
    el('div', { class: 'prop-list' }, rows),
    el('p', { class: 'muted prop-note', text: t('propsNote', { capped: fmtMoney(SLIP_RULES.capped, { sign: false }) }) })
  ]);
}

// Whether a live score just changed: the score each place last showed, and
// for a few seconds after it changes the place says so (a brief highlight).
const shownScores = new Map();
const SCORE_FLASH_MS = 6_000;
function scoreMoved(key, value) {
  const was = shownScores.get(key);
  const now = Date.now();
  if (!was) {
    shownScores.set(key, { value, at: 0 });
    return false;
  }
  if (was.value !== value) shownScores.set(key, { value, at: now });
  return now - shownScores.get(key).at < SCORE_FLASH_MS;
}

// A player's picture, found the way every Quadra app finds one (the kit's
// personPhoto): the roster's (ESPN's by id is only a guess), one found
// before on this device, then a search by name; the initials meanwhile.
function playerPhoto(url, name, league, guessed = false) {
  return keptPic(`player|${league}|${name}`, () => drawPlayer(url, name, league, guessed));
}
function drawPlayer(url, name, league, guessed) {
  const initials = () => el('span', { class: 'prop-avatar', 'aria-hidden': 'true', text: initialsOf(name) });
  return personPhoto(name, league, { urls: guessed ? [] : [url], guess: guessed ? url : null, cls: 'prop-avatar prop-photo', fallback: initials });
}

// ---- A game's own markets from Kambi (offers.mjs) ------------------------------------
//
// Read when a game is opened (and for the games of picks on the slip): its
// every real line, half, corner and player market. Kept while fresh; a game
// opened again later reads them anew.
const gameOffers = new Map();
const offersLoading = new Set();
const OFFERS_FRESH_MS = 2 * 60_000;
const LIVE_OFFERS_FRESH_MS = 12_000;
// A game's players (ESPN's rosters and seasons): read once a game is opened,
// for the model's players' markets and everyone's picture.
const gamePlayers = new Map();
// A read that failed is tried again the next time the game is wanted, 20 s on.
const PLAYERS_RETRY_MS = 20_000;
function wantPlayers(game) {
  if (game?.live || !game?.espnTeams || !hasPlayers(game.sport)) return;
  const had = gamePlayers.get(game.id);
  if (had && !(had.failed && Date.now() - had.failed > PLAYERS_RETRY_MS)) return;
  gamePlayers.set(game.id, { loading: true });
  loadPlayers(game)
    .then(players => gamePlayers.set(game.id, { players: players ?? [] }))
    .catch(() => {
      gamePlayers.set(game.id, { failed: Date.now() });
      setTimeout(() => state.sheetGame === game.id && wantPlayers(game), PLAYERS_RETRY_MS + 100);
    })
    .finally(rebuildBoard);
}
function wantOffers(game) {
  wantPlayers(game);
  if (!game?.kambiId || offersLoading.has(game.id)) return;
  const had = gameOffers.get(game.id);
  if (had && Date.now() - had.at < (game.live ? LIVE_OFFERS_FRESH_MS : OFFERS_FRESH_MS)) return;
  offersLoading.add(game.id);
  loadGameOffers(game, { live: Boolean(game.live) })
    .then(offers => {
      if (offers) gameOffers.set(game.id, { at: Date.now(), offers });
    })
    .finally(() => {
      offersLoading.delete(game.id);
      rebuildBoard();
    });
}
// Every board redrawn once, after the markets that came in this frame.
let rebuildQueued = false;
function rebuildBoard() {
  if (rebuildQueued || !state.data || state.fromBoard) return;
  rebuildQueued = true;
  requestAnimationFrame(() => {
    rebuildQueued = false;
    state.bets = buildBets(state.data);
    if (state.liveData) {
      const live = buildLiveBets(state.liveData);
      state.liveGames = live.games;
      state.liveBets = live.bets;
      renderLive();
    }
    renderGames();
    renderGameSheet();
    renderParlay();
    renderSlipBar();
    syncPicks();
  });
}
// The game a pick on the slip is on (its id starts with the game's).
const gameOfPick = id => state.data?.games.find(g => id.startsWith(`${g.id}|`)) ?? null;
// The slip's picks whose game's own markets aren't read yet: read them.
function offersForSlip() {
  for (const id of state.parlay) {
    const game = gameOfPick(id);
    if (game) wantOffers(game);
  }
}
// A game whose markets or players are still on their way (a pick on it stays on the slip).
const gameWaiting = game => Boolean(game && ((game.kambiId && !gameOffers.has(game.id)) || (game.espnTeams && hasPlayers(game.sport) && !gamePlayers.get(game.id)?.players && !gamePlayers.get(game.id)?.failed)));

// One line of a two-way market: the line (tagged when the lottery posts it)
// and its two picks.
function lineRow(label, pair, { posted = false, main = false } = {}) {
  // Outside MLB the tagged line is DraftKings' main line, not a checked lottery line.
  if (posted && pair[0]?.sport !== 'mlb') main = true;
  return el('div', { class: `line-row ${posted ? 'posted' : ''} ${main ? 'main' : ''}` }, [
    el('span', { class: 'line-label' }, [
      el('strong', { text: label }),
    ]),
    ...pair.map(b => (b ? pickButton(b, '') : el('span')))
  ]);
}

// A block of lines under its own heading: [first column, pick A, pick B].
function lineTable(heads, rows, title = null) {
  return el('div', { class: 'line-table' }, [
    title ? el('p', { class: 'line-title', text: title }) : null,
    el('div', { class: 'line-head' }, heads.map(text => el('span', { text }))),
    ...rows
  ]);
}

// Each kind of market laid out as a table of its lines.
function marketPanel(game, section, bets, { titled = false } = {}) {
  const t = state.t;
  const by = (list, side) => list.find(b => b.side === side);
  let body;
  if (TOTAL_KINDS.has(section.kind)) {
    // (A total's line is the option's; a Kambi game total's, its market's.)
    const lineOf = b => b.totalLine ?? b.line ?? b.m?.line;
    // One table per period ([第1局]大小); a whole-game total has none.
    body = [...groupBy(bets, b => b.period ?? b.m?.period ?? '').entries()].map(([period, list]) => {
      const rows = [...groupBy(list, lineOf).values()]
        .sort((a, b) => lineOf(a[0]) - lineOf(b[0]))
        .map(pair => lineRow(String(lineOf(pair[0])), [by(pair, 'over'), by(pair, 'under')], { posted: pair[0].posted, main: pair[0].mainLine }));
      return lineTable([t('colLine'), t('over'), t('under')], rows, period !== '' && section.kind === 'inningtotal' ? t('inningTotalN', { n: period }) : null);
    });
  } else if (HCAP_KINDS.has(section.kind)) {
    // One block per team giving the runs: "遊騎兵 讓分" -1.5, -2.5, …
    const giverOf = b => b.giver ?? b.m?.giver;
    const awayLineOf = b => b.awayLine ?? b.m?.awayLine;
    body = ['away', 'home']
      .map(giver => {
        const taker = giver === 'away' ? 'home' : 'away';
        const markets = [...groupBy(bets.filter(b => giverOf(b) === giver), b => b.market).values()].sort((a, b) => Math.abs(awayLineOf(a[0])) - Math.abs(awayLineOf(b[0])));
        if (!markets.length) return null;
        const rows = markets.map(pair => lineRow(fmtLine(-Math.abs(awayLineOf(pair[0]))), [by(pair, giver), by(pair, taker)], { posted: pair[0].posted }));
        const team = teamName(game[giver]);
        const heading = section.kind === 'runline' ? t(isSoccer(game.sport) || familyOf(game.sport) === 'hockey' ? 'giveGoals' : familyOf(game.sport) === 'baseball' ? 'giveRuns' : 'givePoints', { team }) : section.kind === 'gamehcap' ? t(POINT_SETS.has(familyOf(game.sport) ?? game.sport) ? 'givePoints' : 'giveGames', { team }) : section.kind === 'sethcap' ? t('giveSets', { team }) : `${team} · ${t(secName(section, game.sport, true))}`;
        return lineTable([t('colLine'), teamName(game[giver]), teamName(game[taker])], rows, heading);
      })
      .filter(Boolean);
  } else if (section.kind === 'teamtotal') {
    body = ['away', 'home']
      .map(team => {
        const lines = [...groupBy(bets.filter(b => b.team === team), b => b.teamLine).values()].sort((a, b) => a[0].teamLine - b[0].teamLine);
        if (!lines.length) return null;
        const rows = lines.map(pair => lineRow(String(pair[0].teamLine), [by(pair, 'over'), by(pair, 'under')], { posted: pair[0].posted, main: pair[0].posted }));
        return lineTable([t('colLine'), t('over'), t('under')], rows, teamName(game[team]));
      })
      .filter(Boolean);
  } else if (section.kind === 'margin' && bets.length && bets.every(b => b.pick?.team || b.pick?.side === 'draw')) {
    // One row of bands per team under its name ("1-5", "21+"): the team's
    // name on every button wrapped it onto two rows.
    const band = p => (p.hi == null ? `${p.lo}+` : p.lo === p.hi ? String(p.lo) : `${p.lo}-${p.hi}`);
    // Basketball's two 勝分差 (12 picks, then the 6-pick one: margin6, under its own name).
    const markets = [...groupBy(bets, b => b.market).entries()].sort(([a], [b]) => (a === 'margin6') - (b === 'margin6'));
    body = markets.flatMap(([market, of]) => [
      market === 'margin6' ? el('p', { class: 'line-title', text: t('secMargin6') }) : null,
      ...['away', 'home'].flatMap(team => {
        const list = of.filter(b => b.pick.team === team).sort((a, b) => a.pick.lo - b.pick.lo);
        if (!list.length) return [];
        return [el('div', { class: 'market-head' }, [el('span', { class: 'market-title', text: teamName(game[team]) })]), el('div', { class: 'market-picks bands', style: `--n:${list.length <= 5 ? list.length : list.length === 6 ? 3 : 4}` }, list.map(b => pickButton(b, band(b.pick))))];
      })
    ]);
    // Hockey's 和局 (a 60-minute tie), on its own row after the teams'.
    const draw = bets.find(b => b.pick?.side === 'draw');
    if (draw) body.push(el('div', { class: 'market-picks bands', style: '--n:1' }, [pickButton(draw, t('draw'))]));
  } else {
    // One block per market (最高單局 has one; 第N分 one per run).
    const markets = [...groupBy(bets, b => b.market).values()];
    body = markets.flatMap(list => [
      // Under 更多 the section's own title already names a lone market.
      titled && markets.length === 1 ? null : el('div', { class: 'market-head' }, [el('span', { class: 'market-title', text: list[0].marketLabel ?? t(section.title) })]),
      el('div', { class: 'market-picks' }, list.map(b => pickButton(b, b.chip ?? b.shortLabel)))
    ]);
  }
  return el('div', { class: `market-panel ${section.kind}` }, body);
}

// Kinds laid out as tables of lines: over/under, and one team giving a line.
const TOTAL_KINDS = new Set(['total', 'htotal', 'f5total', 'corners', 'tdtotal', 'inningtotal', 'gametotal']);
// Set sports scored in points, not games (volleyball, badminton, table tennis): 讓分 and 大小 on points.
const POINT_SETS = new Set(['volleyball', 'badminton', 'tabletennis']);
// A market's name by its sport: a handicap is baseball's run line, hockey's
// puck line, soccer's 讓分 too, a spread elsewhere; a total is runs, goals or
// points (an NHL game's tabs said "Total runs" and "Run line").
function secName(sec, sport, full = false) {
  const family = familyOf(sport);
  if (sec.kind === 'runline') return isSoccer(sport) ? 'secHandicap' : family === 'hockey' ? 'secPuckLine60' : family === 'baseball' ? 'secRunLine' : 'secSpread';
  if (sec.kind === 'total') return family === 'baseball' ? 'secTotal' : family === 'hockey' ? 'secTotalGoals60' : isSoccer(sport) ? 'secTotalGoals' : 'secTotalPoints';
  // Hockey's 不讓分 at 台灣運彩 is the 60 minutes, a tie void (HOCKEY_ML).
  if (sec.kind === 'ml' && family === 'hockey') return HOCKEY_ML;
  // A set sport's 讓局 and 大小: on points in volleyball, badminton and table tennis.
  if (sec.kind === 'gamehcap' && POINT_SETS.has(family ?? sport)) return 'secPointHcap';
  if (sec.kind === 'gametotal' && POINT_SETS.has(family ?? sport)) return 'secTotalPoints';
  return full ? sec.title : sec.short ?? sec.title;
}
// Handicaps laid out by the team giving the line: the game's own, and the
// kit's others (半場讓分, [1-5局]讓分, 讓盤, 讓局: play-board.mjs HCAP_KINDS).
const HCAP_KINDS = new Set(['runline', 'hrunline', 'f5runline', 'sethcap', 'gamehcap', ...kitBoard.HCAP_KINDS]);
// 台灣運彩's settle rules: 過關組合 from 2 games with 過1關, a postponed game
// void after 48 hours, and hockey's 不讓分, 讓分 and 大小 on 60 minutes.
const SYSTEM_MIN = 2;
// Hockey's winner: on 60 minutes, a tie then void.
const HOCKEY_ML = 'secMoneyline60';

// One section per kind of bet, each market of it with its own take. The
// inning market's ten results take a whole row.
const SECTIONS = [
  { kind: 'ml', title: 'secMoneyline' },
  { kind: 'total', title: 'secTotal' },
  { kind: 'runline', title: 'secRunLine' },
  // Soccer's 讓分: three ways on whole goals (主-1 / 讓分和 / 客+1).
  { kind: 'hcap3', title: 'secHandicap' },
  { kind: 'prop', title: 'secProps' },
  { kind: 'teamtotal', title: 'secTeamTotal' },
  { kind: 'dnb', title: 'secDnb' },
  { kind: 'dc', title: 'secDoubleChance' },
  { kind: 'btts', title: 'secBtts' },
  { kind: 'half', title: 'secHalf' },
  { kind: 'hrunline', title: 'secHalfSpread' },
  { kind: 'htotal', title: 'secHalfTotal' },
  { kind: 'tdtotal', title: 'secTdTotal' },
  { kind: 'corners', title: 'secCorners' },
  { kind: 'f5', title: 'secF5' },
  { kind: 'f5runline', title: 'secF5RunLine' },
  { kind: 'f5total', title: 'secF5Total' },
  { kind: 'regulation', title: 'secRegulation' },
  { kind: 'firstinning', title: 'secFirstInning' },
  { kind: 'inningml', title: 'secInningMl' },
  { kind: 'inningtotal', title: 'secInningTotal' },
  { kind: 'q1', title: 'secQ1' },
  { kind: 'nextrun', title: 'secNextRun' },
  // Set sports (tennis, volleyball, badminton, table tennis, esports).
  { kind: 'set1', title: 'secSet1' },
  { kind: 'sethcap', title: 'secSetHcap' },
  { kind: 'gamehcap', title: 'secGameHcap' },
  { kind: 'gametotal', title: 'secGameTotal' },
  // Long shots, together under 更多.
  { kind: 'score', title: 'secScore', extra: true },
  { kind: 'setscore', title: 'secSetScore', extra: true },
  { kind: 'htft', title: 'secHtft', extra: true },
  { kind: 'margin', title: 'secMargin', extra: true },
  { kind: 'goalbands', title: 'secGoalBands', extra: true },
  { kind: 'goalcount', title: 'secGoalCount', extra: true },
  { kind: 'inning', title: 'secTopInning', short: 'topInningShort', extra: true }
];
const MORE_SECTION = { kind: 'more', title: 'secMore' };

function fmtPctShort(p) {
  return p >= 0.1 ? `${Math.round(p * 100)}%` : `${(p * 100).toFixed(1)}%`;
}

// A pick's tooltip: what it is, its odds, and whether the house limits it.
function pickTitle(bet) {
  const t = state.t;
  return [
    bet.label,
    `${t('legendOdds')} ${fmtOdds(effectiveOdds(bet))}`,
    bet.lock ? t(`lock_${bet.lock}`) : minLegsText(bet)
  ]
    .filter(Boolean)
    .join('\n');
}

// Why a pick is sold only in a parlay: its game's own 限關, or its short odds (with them).
function minLegsText(bet) {
  const why = minLegsWhy(bet, effectiveOdds(bet));
  if (!why) return null;
  if (why.from === 'est') return state.t('minLegsNoteEst', { n: why.n });
  return why.from === 'event' ? state.t('minLegsNoteEvent', { n: why.n }) : state.t('minLegsNote', { n: why.n, odds: fmtOdds(why.odds) });
}

// A pick: tap to put it on the bet slip (or take it off). The big number is
// the odds, like any sportsbook's board. A locked
// pick (the house doesn't sell it) shows a lock; one sold only in parlays
// shows its minimum (2關, 3關).
function pickButton(bet, name) {
  const t = state.t;
  const inSlip = state.parlay.includes(bet.id);
  // (A live price from the last read, before today's: shown, not taken.)
  const stale = Boolean(bet.live && state.liveStale);
  const locked = Boolean(bet.lock) || stale;
  const body = [
    name ? el('span', { class: 'pick-name', text: name }) : null,
    el('span', { class: 'pick-odds' }, [
      bet.lock ? icon('lock', 'lock') : document.createTextNode(fmtOdds(effectiveOdds(bet))),
      !locked && bet.minLegs > 1 ? el('small', { class: 'min-legs', text: t('minLegsTag', { n: bet.minLegs }) }) : null
    ])
  ];
  return el('button', {
    class: `pick ${bet.lock ? 'locked' : ''} ${stale ? 'stale' : ''} ${inSlip ? 'in-slip' : ''}`,
    type: 'button',
    'data-bet': bet.id,
    title: pickTitle(bet),
    disabled: locked ? true : null,
    'aria-pressed': String(inSlip),
    // (A stale live price, not locked by the house: 更新賠率中, never "lock_undefined".)
    'aria-label': `${bet.label} ${fmtOdds(effectiveOdds(bet))} · ${locked ? t(bet.lock ? `lock_${bet.lock}` : 'placeUpdating') : inSlip ? t('removeLeg') : t('addLeg')}`,
    onclick: locked ? null : () => toggleLeg(bet)
  }, body);
}

function groupBy(items, key) {
  const map = new Map();
  for (const item of items) {
    const k = key(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
}

// ---- Live (場中) --------------------------------------------------------------------

// A game at half-time (ESPN's "HT" for soccer, "Halftime" for the rest).
const atHalftime = live => !live.delayed && /^(HT\b|Half)/i.test(live.detail || '');
// 中場休息's countdown (the kit's): a game at half-time's key, its break's
// end found once from ESPN's summary of it, read fresh; null otherwise.
function halftimeKey(live, sport) {
  const path = LEAGUES[sport]?.path;
  if (!live?.espnId || !path || live.book === 'kambi' || !atHalftime(live)) return null;
  const key = `play:${sport}:${live.espnId}`;
  kit.watchHalftime(key, { sport: familyOf(sport), league: sport, read: () => kit.proxyJson(`https://site.api.espn.com/apis/site/v2/sports/${path}/summary?event=${live.espnId}`, { ttl: 2_000, persist: false }) });
  return key;
}
// 中場休息 and its countdown ("中場休息 12:34"), ticking where it's shown.
function halftimeText(live, sport) {
  const key = halftimeKey(live, sport);
  return [state.t('liveHalfTime'), key ? kit.halftimeClock(kit.halftimeEnd(key)) : ''].filter(Boolean).join(' ');
}
const halftimeTick = (live, sport) => {
  const key = halftimeKey(live, sport);
  return key ? kit.halftimeAttrs(key, state.t('liveHalfTime')) : {};
};

// "4局下 1出局", "中場休息 12:34", "67'", "第3節 5:32", "延長".
function liveStateText(live) {
  const t = state.t;
  if (live.delayed) return `${live.detail} · ${t('livePaused')}`;
  if (live.book === 'kambi') {
    if (live.inningNo) return t('liveInningN', { n: live.inningNo });
    if (live.quarter) return t('livePeriodN', { n: live.quarter, clock: '' }).trim();
    return t('liveInPlay');
  }
  if (atHalftime(live)) return halftimeText(live, live.sport);
  if (isSoccer(live.sport)) return `${live.minute}'`;
  if (live.period != null) {
    const regulation = PERIODS[live.sport]?.[0] ?? 4;
    if (live.period > regulation) return t('liveOT', { clock: live.clock }).trim();
    return t('livePeriodN', { n: live.period, clock: live.clock }).trim();
  }
  const text = t(`liveHalf_${live.half}`, { n: live.inning });
  return live.half === 'top' || live.half === 'bottom' ? `${text} ${t('liveOuts', { n: live.outs })}` : text;
}

// Every live game as a game card's data, and its bets at live odds
// (play-bets.mjs liveBets), named here.
function buildLiveBets(data) {
  const t = state.t;
  const { games, bets } = liveBets(data, { offersOf: game => gameOffers.get(game.id)?.offers ?? null });
  const matchups = new Map(games.map(g => [g.id, matchupText(g)]));
  return {
    games,
    bets: bets.map(b => {
      const matchup = matchups.get(b.gameId);
      if (b.kind === 'nextrun') {
        const name = b.side === 'none' ? t('nextRunNone') : teamName(b.game[b.side]);
        const label = `${t('nextRunN', { n: b.runN })} ${name}`;
        return { ...b, matchup, marketLabel: t('nextRunN', { n: b.runN }), chip: name, label: `${matchup} ${label}`, shortLabel: label };
      }
      const out = named(b.game, b, matchup);
      // The model's and Kambi's live lines go under their market's own heading.
      if (!b.fromOffers) delete out.marketLabel;
      return out;
    })
  };
}

function renderLive() {
  redraw($('live'), drawLive);
}
// 場中: every game on now, the big leagues first, each row with its league's logo.
function drawLive() {
  const TIER = { major: 0, minor: 1, thin: 2 };
  const games = state.liveGames.filter(g => inSport(g.sport)).sort((a, b) => TIER[shownTier(a.sport)] - TIER[shownTier(b.sport)] || a.startUtc.localeCompare(b.startUtc));
  // Only on today's board (another day's games haven't started), and not while searching.
  const onToday = state.day === dayKey(new Date().toISOString());
  $('live').hidden = !games.length || !onToday || Boolean(state.query);
  if ($('live').hidden) return;
  const byGame = groupBy(state.liveBets, b => b.gameId);
  $('live-count').textContent = String(games.length);
  $('live-list').replaceChildren(...games.map(g => gameRow(g, byGame.get(g.id) ?? [], { league: true })));
}

// Live games refresh every 30 seconds while the games tab is on screen.
// Live games and open bets on games under way refresh every 15 seconds while
// on screen (the proxy keeps live answers 10 seconds), at once on coming back
// to the app or to a tab that shows them.
// The live beat: the admin panel's 開發 (kit dev 'playLive'), 5 seconds by default.
const liveMs = () => dev('playLive') * 1000;
let liveBusy = null;
let liveAgain = false;
let liveAsked = 0;
let liveDrawn = 0;
// Resolves once the games in play are drawn. Asked again while reading:
// once more after (its promise: that next read's, which the one under way
// starts as it ends). `now`: a read of its own at once (the other leagues
// just came in, which the one under way didn't know of: queued behind it,
// the first screen waited two whole reads, 7.7 s with Europe's evening on).
function refreshLive({ now = false } = {}) {
  if (liveBusy && !now) return ((liveAgain = true), liveBusy.then(() => liveBusy));
  const read = readLive(++liveAsked).finally(() => {
    if (liveBusy !== read) return;
    liveBusy = null;
    if (liveAgain) {
      liveAgain = false;
      refreshLive();
    }
  });
  return (liveBusy = read);
}
async function readLive(asked) {
  try {
    const data = await loadLive(new Date(), LIVE_MIN_LIQUIDITY, { also: liveHint });
    // (A read asked before one already drawn: older, not drawn over it.)
    if (asked < liveDrawn) return;
    liveDrawn = asked;
    state.liveData = data;
    state.liveStale = false;
    saveLiveCopy(data);
    const { games, bets } = buildLiveBets(data);
    state.liveRecs = recommend(bets);
    state.liveGames = games;
    state.liveBets = bets;
    state.liveAt = data.loadedAt;
    // A live pick whose line is gone (the game moved on, or ended) leaves the slip.
    const ids = new Set(bets.map(b => b.id));
    const had = state.parlay.length;
    state.parlay = state.parlay.filter(id => !id.startsWith('live|') || ids.has(id));
    // The day strip (today stays on it while games are on, drawn again only
    // when that changes), and 場中 with it.
    if (state.data && !state.query) renderDayFilter();
    else renderLive();
    renderGameSheet();
    // The slip: with a live pick on it (its price now), or one just gone.
    if (state.parlay.length !== had) slipChanged();
    else if (state.parlay.some(id => id.startsWith('live|'))) renderParlay();
    if (state.tab === 'home') drawHome();
  } catch (error) {
    console.error(error);
  }
}

// One beat for everything live: the board's games in play (games and home,
// the slip with a live pick on it) and the open bets' scores and cash-out
// values (紀錄, home's 你的投注, the slip).
function livePulse({ force = false } = {}) {
  if (document.visibilityState !== 'visible') return;
  if (state.tab === 'games' || state.tab === 'home' || (slipOpen() && state.parlay.some(id => id.startsWith('live|')))) refreshLive();
  if (state.data && (state.tab === 'history' || state.tab === 'home' || slipOpen())) checkResults(force);
}
everyDev('playLive', () => livePulse());

// ---- Championships and F1: one board each -------------------------------------

// An F1 team: its logo on its colour; a driver: their face (the team's colour
// and initials until it comes). The kit's, as Orbit Sports shows them.
const constructorBadge = (name, size = '') => kitPhotos.teamPic(name, { cls: size });
const driverBadge = (name, size = '') => kitPhotos.driverPic(name, { cls: size });

// One row per team or driver: its rank, picture, name (a line under it),
// and its price, the same button as every pick on the board.
function entryRow(bet, i, picture, sub, name = bet.shortLabel) {
  const inSlip = state.parlay.includes(bet.id);
  return el('div', { class: `pl-entry${inSlip ? ' in-slip' : ''}${bet.lock ? ' locked' : ''}`, 'data-bet': bet.id, title: pickTitle(bet) }, [
    el('span', { class: 'pl-entry-rank', text: String(i + 1) }),
    picture,
    el('span', { class: 'pl-entry-name' }, [el('span', { text: name }), sub ? el('small', { text: sub }) : null]),
    pickButton(bet, '')
  ]);
}

// A board of prices (F1, a championship) in the game sheet: its emblem, name
// and when it settles, its market tabs, then every entry.
function boardBody({ emblem, title, sub, tabs = null, lead = null, entries }) {
  return el('div', { class: 'gs' }, [
    el('div', { class: 'gs-boardhead' }, [leagueImg(emblem, 'logo-lg'), el('div', {}, [el('p', { class: 'gs-btitle', text: title }), el('p', { class: 'gs-bsub', text: sub })])]),
    tabs,
    lead ? el('p', { class: 'gs-lead', text: lead }) : null,
    el('div', { class: 'q-rowcard pl-entries' }, entries)
  ]);
}

// 冠軍: one row per market (its league, its name, the favourite's price),
// each opening its board.
function renderFutures() {
  const markets = groupBy(state.futures.filter(b => inSport(b.sport)), b => b.market);
  $('futures').hidden = markets.size === 0 || Boolean(state.query);
  $('futures-list').replaceChildren(
    ...[...markets.entries()].map(([market, bets]) => {
      const top = [...bets].filter(b => !b.lock).sort((a, b) => effectiveOdds(a) - effectiveOdds(b)).slice(0, 1);
      return el('button', { class: 'q-ritem chevron pl-fut', type: 'button', onclick: () => openBoard(`fut|${market}`) }, [
        el('span', { class: 'pl-fut-logo' }, leagueImg(bets[0].sport, 'logo-sm')),
        el('span', { class: 'q-ritem-text' }, [el('span', { class: 'q-ritem-title', text: bets[0].matchup }), el('small', { text: top.map(b => `${b.shortLabel} ${fmtOdds(effectiveOdds(b))}`).join(' · ') })]),
        el('span', { class: 'q-ritem-value', text: String(bets.length) })
      ]);
    })
  );
}
function futuresBoard(market) {
  const t = state.t;
  const bets = state.futures.filter(b => b.market === market);
  if (!bets.length) return null;
  const { matchup, sport } = bets[0];
  const picture = b => (market === 'f1drivers' ? driverBadge(b.teamEn) : market === 'f1constructors' ? constructorBadge(b.teamEn) : logoImg(b.sport, b.teamEn, b.shortLabel));
  return {
    title: [leagueImg(sport, 'logo-xs'), el('span', { text: t(`sport_${sport}`) })],
    body: boardBody({ emblem: sport, title: matchup, sub: `${t('futureSettles')} ${t(`futureSettle_${market}`)}`, entries: bets.map((b, i) => entryRow(b, i, picture(b))) })
  };
}

// ---- Bet slip -----------------------------------------------------------------

// A pick's odds on the slip: as now, and the way they moved since it was
// picked (the old figure beside them).
function legOdds(b) {
  const now = effectiveOdds(b);
  const was = state.pickedOdds[b.id];
  const moved = was && Math.abs(now - was) >= 0.005 ? (now > was ? 'up' : 'down') : '';
  return el('span', { class: `leg-odds${moved ? ` moved ${moved}` : ''}` }, [
    moved ? el('small', { class: 'leg-was', text: `${moved === 'up' ? '▲' : '▼'} ${fmtOdds(was)}` }) : null,
    document.createTextNode(fmtOdds(now))
  ]);
}
function toggleLeg(bet) {
  if (bet.lock && !state.parlay.includes(bet.id)) return;
  // A pick is for buying: the prices it is bought at are the full read's (bets wait for it).
  wantFull();
  // Felt, as iOS's own controls are (the kit's haptic).
  kit.haptic();
  if (state.parlay.includes(bet.id)) {
    state.parlay = state.parlay.filter(id => id !== bet.id);
  } else {
    // Picks of one game can all be chosen: singles buy each, a parlay or
    // system combination never holds two of the same game (odds.mjs).
    state.parlay.push(bet.id);
    // The odds when it was picked: the slip shows if they move after.
    state.pickedOdds[bet.id] = effectiveOdds(bet);
    if (state.parlay.length > SLIP_RULES.maxLegs) state.parlay.shift();
    // Two picks or more make a parlay unless another way was chosen.
    if (!state.modeChosen && state.parlay.length >= 2) state.slipMode = 'parlay';
  }
  slipChanged();
}
// The slip changed (a pick added or taken off, the slip cleared or placed):
// every pick button anywhere on the page (an open game's sheet too) shows it
// at once, in place (a tap redrew every board: 118–244 ms), and so do the
// slip, its bar and F1's market tabs (a dot on a tab with a pick).
let slipShown = new Set();
function slipChanged() {
  saveSlip();
  const now = new Set(state.parlay);
  const moved = [...now, ...slipShown].filter(id => now.has(id) !== slipShown.has(id));
  slipShown = now;
  if (moved.some(id => id.startsWith('f1')) && state.sheetGame === 'board:f1') renderGameSheet();
  renderParlay();
  syncPicks();
  renderSlipBar();
}
function syncPicks() {
  const on = new Set(state.parlay);
  for (const node of document.querySelectorAll('[data-bet]')) {
    const inSlip = on.has(node.dataset.bet);
    if (node.classList.contains('in-slip') === inSlip) continue;
    node.classList.toggle('in-slip', inSlip);
    if (node.tagName !== 'BUTTON') continue;
    node.setAttribute('aria-pressed', String(inSlip));
    // Its spoken label ends with what a tap does (pickButton, entryRow).
    const label = node.getAttribute('aria-label') || '';
    const cut = label.lastIndexOf(' · ');
    if (!node.disabled && cut >= 0) node.setAttribute('aria-label', `${label.slice(0, cut)} · ${state.t(inSlip ? 'removeLeg' : 'addLeg')}`);
  }
}

// Everything that can go on the slip: games, F1 and championships.
function slipCandidates() {
  return [...state.bets, ...state.liveBets, ...state.futures];
}
// …by id (the first board's, as a search of them finds it), made again only
// when a board's bets do.
let betIndex = { of: [], map: new Map() };
function betById() {
  const of = [state.bets, state.liveBets, state.futures];
  if (of.some((x, i) => x !== betIndex.of[i])) {
    const map = new Map();
    for (const b of slipCandidates()) if (!map.has(b.id)) map.set(b.id, b);
    betIndex = { of, map };
  }
  return betIndex.map;
}

// Championships have no start time: they stay open until the lottery closes them.
function started(bet) {
  if (bet.waitsUntil > Date.now()) return false;
  return !bet.live && bet.start != null && Date.parse(bet.start) <= Date.now();
}

// Picks on the slip. Games already under way are dropped: the page doesn't
// cover live (in-play) betting.
function slipLegs() {
  const byId = betById();
  const legs = state.parlay.map(id => byId.get(id)).filter(Boolean);
  const live = legs.filter(started);
  if (live.length) Object.assign(state, dropPicks(state, live.map(b => b.id)));
  return { legs: legs.filter(b => !started(b)), dropped: live.length };
}

function sizeName(k, n) {
  return k === n ? state.t('slipAll') : state.t('slipSize', { k });
}

// The slip being made, by the ticket rules (lib/slip.mjs): its picks at the
// board's odds now, the mode, sizes and stake chosen, the free bet chosen.
const currentQuote = (legs, free) => slipQuote({ bets: legs.map(b => ({ ...b, estOdds: effectiveOdds(b) })), mode: state.slipMode, chosen: state.slipSizes, stake: state.slipStake, free });

// The slip's 限關 problem, saying why: the pick's short odds ("賠率 1.06 偏低：
// 只能串 3 關以上") or its game's own minimum ("這場比賽限串 3 關以上"); named
// when the slip has more than one pick. In 單場 each pick is its own ticket.
function minLegsError(legs, slip, sizes) {
  const t = state.t;
  const need = minLegsProblem(slip, sizes) || Math.max(1, ...slip.map(l => l.minLegs ?? 1));
  const bet = legs.find(b => (b.minLegs ?? 1) >= need) ?? legs.find(b => b.minLegs > 1);
  const why = bet && minLegsWhy(bet, effectiveOdds(bet));
  if (!why) return t('slipError_minLegs', { need });
  const pick = legs.length > 1 ? `${shortPick(bet)}${state.locale === 'zh' ? '：' : ': '}` : '';
  if (why.from === 'est') return t('slipError_minLegsEst', { need: why.n, pick });
  return why.from === 'event' ? t('slipError_minLegsEvent', { need: why.n, pick }) : t('slipError_minLegsOdds', { need: why.n, odds: fmtOdds(why.odds), pick });
}

// The slip sheet: the way it's bought (單場, 過關, 過關組合), its picks, the
// stake in NT$, then what it pays all correct, big, and the one button.
function renderParlay() {
  renderSlipBar();
  const t = state.t;
  const body = $('parlay-body');
  if (!body) return;
  const { legs, dropped } = slipLegs();
  const n = legs.length;
  renderTabs();
  const mode = state.slipMode;
  // A free bet (the welcome offer, or a weekly one issued earlier): a cut off the stake
  // (lib/slip.mjs slipQuote, the same numbers as the slip bar's).
  const tokens = freeBetList();
  const free = tokens.find(x => x.id === state.useFree) || null;
  const quote = currentQuote(legs, free);
  const { sizes, stake, freeShape, freeOn, errors, cost, legs: slip } = quote;
  const rerender = () => renderParlay();
  const droppedTag = dropped ? el('p', { class: 'sl-note' }, [el('span', { class: 'q-tag orange', text: t('slipDroppedLive', { n: dropped }) })]) : null;

  if (n === 0) {
    const go = el('button', { class: 'q-btn primary', type: 'button', text: t('goPick'), onclick: () => showTab('games') });
    body.replaceChildren(
      el('div', { class: 'sl' }, [
        emptyK({ icon: 'ticket', title: t('parlayEmpty'), action: go }),
        droppedTag
      ])
    );
    return;
  }

  const modes = el('div', { class: 'q-seg sl-modes', role: 'group', 'aria-label': t('slipMode'), style: `--q-seg-n:3;--q-seg-i:${['single', 'parlay', 'system'].indexOf(mode)}` },
    ['single', 'parlay', 'system'].map(m =>
      el('button', {
        type: 'button',
        'aria-pressed': String(m === mode),
        text: t(`slipMode_${m}`),
        onclick: () => {
          state.slipMode = m;
          state.modeChosen = true;
          saveSlip();
          rerender();
        }
      })
    )
  );
  const parts = [
    modes,
    droppedTag,
    el('div', { class: 'sl-legs-head' }, [
      el('span', { text: t('slipLegs', { n }) }),
      el('button', { class: 'sl-link', type: 'button', text: t('clearParlay'), onclick: () => ((state.parlay = []), slipChanged()) })
    ]),
    el('div', { class: 'q-rowcard sl-legs' },
      legs.map(b =>
        el('div', { class: 'sl-leg' }, [
          betIcon(b),
          legMain(b),
          legOdds(b),
          el('button', { class: 'sl-remove', type: 'button', 'aria-label': t('removeLeg'), onclick: () => toggleLeg(b) })
        ])
      )
    )
  ];
  if (mode === 'system' && n >= SYSTEM_MIN) {
    const bySize = combosBySize(slip);
    const options = [...Array.from({ length: n - 1 }, (_, i) => i + 1), 'all'].filter(k => bySize[k === 'all' ? n : k] > 0 || state.slipSizes.has(k));
    parts.push(
      el('p', { class: 'sl-label', text: t('slipSizes') }),
      el('div', { class: 'q-chips sl-chips', role: 'group', 'aria-label': t('slipSizes') },
        options.map(k => {
          const size = k === 'all' ? n : k;
          const on = state.slipSizes.has(k);
          return chip({
            pressed: on,
            text: sizeName(size, n),
            count: `×${fmtCount(bySize[size] ?? 0)}`,
            onclick: () => {
              if (on) state.slipSizes.delete(k);
              else state.slipSizes.add(k);
              saveSlip();
              rerender();
            }
          });
        })
      )
    );
  }
  if (tokens.length) parts.push(freeBetRow(tokens, free, freeOn, rerender, freeShape));
  // The stake in NT$, kept to the lottery's NT$10 unit (each combination's).
  const stakeInput = el('input', {
    type: 'text',
    value: String(stake),
    'aria-label': t('slipStake'),
    // Each digit typed is the stake at once (the payout and the button follow
    // a moment later), so a chip tapped before never wins over it.
    oninput: event => {
      setStake(Number(event.target.value.replace(/\D/g, '')) || 0);
      clearTimeout(stakeTimer);
      stakeTimer = setTimeout(rerender, 250);
    },
    onchange: event => {
      clearTimeout(stakeTimer);
      const value = Math.max(0, Math.round((Number(event.target.value) || 0) / SLIP_RULES.unit)) * SLIP_RULES.unit;
      if (value === state.slipStake) return void (event.target.value = String(value));
      setStake(value);
      // Redraw after the event: redrawing removes this input, and removing a
      // focused input fires another change while the first is still running.
      setTimeout(rerender);
    }
  });
  numberField(stakeInput, { digits: 6 });
  parts.push(
    el('div', { class: 'sl-stake' }, [
      el('label', { class: 'sl-stake-field' }, [el('span', { class: 'sl-label', text: mode === 'single' && n > 1 ? t('slipStakeEach') : mode === 'system' ? t('slipStakeCombo') : t('slipStake') }), el('span', { class: 'sl-stake-box' }, [el('b', { text: 'NT$' }), stakeInput])]),
      el('div', { class: 'q-chips sl-quick', role: 'group', 'aria-label': t('slipStake') }, QUICK_STAKES.map(v => el('button', { class: 'q-chip', type: 'button', 'aria-pressed': String(stake === v), text: fmtInt(v), onclick: () => (setStake(v), rerender()) })))
    ])
  );
  if (errors.length) {
    parts.push(el('ul', { class: 'sl-errors' }, errors.map(e => el('li', { text: e === 'minLegs' ? minLegsError(legs, slip, sizes) : t(`slipError_${e}`, { max: SLIP_RULES.maxLegs, min: fmtMoney(SLIP_RULES.minTicket, { sign: false }), maxTicket: fmtMoney(SLIP_RULES.maxTicket, { sign: false }), capped: fmtMoney(SLIP_RULES.capped, { sign: false }), unit: SLIP_RULES.unit, need: minLegsProblem(slip, sizes) }) }))));
  }
  // What comes off the balance: a free bet's top-up only.
  if (sizes.length && !errors.includes('stakeUnit') && (cost > 0 || freeOn)) parts.push(payoutBox(slip, sizes, stake, mode, freeOn ? free.value : 0));
  if (mode !== 'single' && n >= 2 && !errors.includes('stakeUnit')) parts.push(boostLadder(mode === 'parlay' ? n : Math.max(...sizes, 0)));
  // A free bet chosen that this slip can't take: said plainly (what to change).
  if (free && !freeOn) parts.push(el('p', { class: 'sl-note', role: 'status' }, [el('span', { class: 'q-tag orange', text: t('freeOff') }), el('span', { text: freeShape ? t('freeBetMinOdds', { v: FREE_MIN_ODDS.toFixed(2) }) : n > 1 && mode === 'single' ? t('freeBetSingles') : t('freeBetOneSlip') })]));
  // The place button in a sticky foot with the balance on its left.
  parts.push(el('div', { class: 'q-sheet-foot q-sf' }, [placeButton(legs, sizes, cost, errors, freeOn ? free : null)]));
  parts.push(el('button', { class: 'sl-link sl-rules', type: 'button', text: t('slipRulesTitle'), onclick: () => tell({ lang: state.locale, icon: 'book', title: t('slipRulesTitle'), body: t('slipRulesNote') }) }));
  const next = el('div', { class: 'sl' }, parts);
  // Typing a stake: its box stays as it is (a new field would drop the
  // keyboard and what's typed so far) and everything around it is redrawn,
  // whether the redraw is the typing's own or the board's.
  const old = body.firstElementChild;
  const typing = document.activeElement?.closest?.('.sl-stake-box') && old?.contains(document.activeElement) ? old.querySelector(':scope > .sl-stake') : null;
  const fresh = next.querySelector(':scope > .sl-stake');
  if (!typing || !fresh) return void body.replaceChildren(next);
  for (const child of [...old.children]) if (child !== typing) child.remove();
  const kids = [...next.children];
  const at = kids.indexOf(fresh);
  typing.before(...kids.slice(0, at));
  typing.after(...kids.slice(at + 1));
  typing.querySelector('.sl-label')?.replaceWith(fresh.querySelector('.sl-label'));
  typing.querySelector('.sl-quick')?.replaceWith(fresh.querySelector('.sl-quick'));
}
let stakeTimer = 0;

// The stake per combination, kept on the device for next time.
const QUICK_STAKES = [100, 500, 1000, 2000, 5000];
function setStake(v) {
  state.slipStake = v;
  try {
    localStorage.setItem('play.stake', String(v));
  } catch {}
}

// The slip, always at hand: a bar above the tab bar while it has picks
// (not on the slip itself): how many, what they pay together, and the way in.
function renderSlipBar() {
  let bar = $('slip-bar');
  if (!bar) {
    bar = el('button', { id: 'slip-bar', class: 'q-accessory slip-bar', type: 'button', hidden: '', onclick: () => openSlip() });
    document.body.append(bar);
  }
  // The same bar at the foot of a game's sheet (the page's is under it).
  const sheetBar = $('game-sheet-bar');
  const { legs } = slipLegs();
  const n = legs.length;
  if (sheetBar) sheetBar.hidden = true;
  if (!n || slipOpen() || !state.accountReady) return void (bar.hidden = true);
  const t = state.t;
  // The slip as it stands (its mode, sizes, free bet): what it costs from the
  // balance and pays all correct, the same numbers as the slip's own.
  const quote = currentQuote(legs, freeBetList().find(x => x.id === state.useFree) || null);
  const { mode } = quote;
  const all = quoteAllPays(quote);
  bar.hidden = false;
  bar.replaceChildren(
    el('span', { class: 'slip-bar-count num', text: String(n) }),
    el('span', { class: 'slip-bar-main' }, [
      el('strong', { text: mode === 'parlay' && n >= 2 ? t('barParlay', { n }) : mode === 'system' && n >= SYSTEM_MIN ? t('barSystem', { n }) : t('barSingles', { n }) }),
      el('small', { class: 'num', text: t('barPays', { stake: fmtMoney(quote.cost, { sign: false }), v: fmtMoney(all, { sign: false }) }) })
    ]),
    el('span', { class: 'slip-bar-go', text: `${t('barGo')} ›` })
  );
  // Its line shrinks to fit, never cut ("最高派彩 NT$7,1…" at 375 px: the bar
  // sits outside the parts fitNumbers watches).
  if (typeof ResizeObserver !== 'undefined') fitNumbers([...bar.querySelectorAll(SLIP_BAR_FIT)]);
  if (sheetBar && gameSheetOpen()) {
    sheetBar.replaceChildren(...[...bar.childNodes].map(node => node.cloneNode(true)));
    sheetBar.hidden = false;
    if (typeof ResizeObserver !== 'undefined') fitNumbers([...sheetBar.querySelectorAll(SLIP_BAR_FIT)]);
  }
}
const SLIP_BAR_FIT = '.slip-bar-main small';

// ---- Slip: what each pick is, what the ticket pays ------------------------------

// A kind of bet's name (its board section's).
function kindKey(kind) {
  const sec = SECTIONS.find(x => x.kind === kind);
  return { f1: 'f1Title', f1pole: 'f1PoleShort', f1podium: 'f1PodiumShort', f1top6: 'f1Top6Short', f1top10: 'f1Top10Short', f1h2h: 'f1H2HShort', f1team: 'f1TeamShort', f1sc: 'f1Sc', f1vsc: 'f1Vsc', f1red: 'f1Red', future: 'futuresTitle' }[kind] ?? sec?.short ?? sec?.title ?? null;
}

// The market a pick is from, as a small tag: 不讓分, 大小, 讓分 …
function marketTag(kind, sport, market = null) {
  // A total or a line named by its sport (goals, points, runs), as its section is (the short name: no '60 min').
  const key = market === 'margin6' ? 'secMargin6' : { inning: 'topInningShort', f1: 'f1WinnerTab' }[kind] ?? (kind === 'total' || kind === 'runline' || kind === 'gamehcap' || kind === 'gametotal' ? secName(SECTIONS.find(x => x.kind === kind) ?? { kind }, sport).replace(/60$/, '') : kindKey(kind));
  return key ? el('span', { class: `market-tag tag-${kind}`, text: state.t(key) }) : null;
}

// A pick on a slip: what it is (with its market), then its game and start
// time in full (the time tells doubleheader games apart).
// A pick in two short lines, each kept to one row: the market and the pick,
// then when and which game ("10/10 21:00 · 費城人 @ 勇士").
function legMain(leg) {
  return el('span', { class: 'leg-main' }, [
    el('span', { class: 'leg-pick' }, [leg.live ? el('span', { class: 'market-tag tag-live', text: state.t('tagLive') }) : null, marketTag(leg.kind, leg.sport, leg.market), el('strong', { text: shownLabel(leg) })]),
    el('small', { class: 'slip-leg-game', text: [legWhen(leg.start), shortMatchup(leg)].filter(Boolean).join(' · ') })
  ]);
}
// A pick with its team's short name where it names one ("布魯克林籃網 -3.5" → "籃網 -3.5").
function shortPick(leg) {
  const label = shownLabel(leg);
  for (const side of ['away', 'home']) {
    const en = leg[side] ?? leg.game?.[side]?.en;
    const full = en && (state.locale === 'zh' ? teamNameZh(leg.sport, en, familyOf(leg.sport))?.full : en);
    const short = full && shortTeamName(leg.sport, en, null);
    if (short && short !== full && label.includes(full)) return label.replace(full, short);
  }
  return label;
}
// A game by its teams' short names ("籃網 @ 黃蜂"; football: home first, "vs"),
// so the line fits; the game's own text when there are no two teams.
function shortMatchup(leg) {
  const [away, home] = [leg.away ?? leg.game?.away?.en, leg.home ?? leg.game?.home?.en];
  // A race's pick: the race alone (an older ticket's "新加坡站 排位賽第一" said the tag again and was cut).
  if (!away || !home) return leg.sport === 'f1' ? String(leg.matchup || '').replace(/\s+(排位賽|衝刺|正賽|Pole\b|Qualifying\b|Sprint\b).*$/i, '') : leg.matchup;
  // (A club with no short name of ours: its last word, "Breakers @ Kings", never cut.)
  const name = n => shortTeamName(leg.sport, n, '') || EN_TWO_WORD.exec(n)?.[1] || n.split(/\s+/).at(-1);
  return isSoccer(leg.sport) ? `${name(home)} vs ${name(away)}` : `${name(away)} @ ${name(home)}`;
}

// Payout at a glance: for a parlay the odds multiplied out, for singles each
// pick's return, for a system each size; then cost, what all correct pays
// (after tax) and the least a winning ticket pays.
// `free`: the free bet part of the stake (its stake isn't paid back).
// The sports tax withheld, as the kit has it (20% since 台灣運彩's members
// pay no stamp duty; 20.4% with it, as before).
const taxRateText = () => `${Math.round((SLIP_RULES.taxRate + (SLIP_RULES.stampRate || 0)) * 1000) / 10}%`;
function payoutBox(legs, sizes, stake, mode, free = 0) {
  const t = state.t;
  const { n, combos, bySize, cost, each, allGross, allTaxed, allNet, least, boostRate: boost, boostMore: more, taxed } =
    payoutTotals({ legs, sizes, stake, mode, free });
  const rows = [];
  if (mode === 'parlay') {
    const product = legs.reduce((p, l) => p * l.odds, 1);
    // The odds multiplied out on one line: up to three picks, past that "6 關賠率相乘".
    rows.push(payLine(n <= 3 ? `${legs.map(l => fmtOdds(l.odds)).join(' × ')}` : t('payOddsTimes', { n }), `×${fmtOdds(product)}`));
  } else if (mode === 'single') {
    if (legs.length > 1) legs.forEach((l, i) => rows.push(payLine(`${t('payEach', { i: i + 1 })} × ${fmtOdds(l.odds)}`, fmtMoney(each[i], { sign: false }))));
  } else {
    for (const k of sizes) rows.push(payLine(t('paySize', { size: sizeName(k, n), c: fmtInt(bySize[k] ?? 0) }), fmtMoney((bySize[k] ?? 0) * stake, { sign: false })));
  }
  if (boost > 0) rows.push(payLine(t('payBoost', { v: `+${Math.round(boost * 100)}%` }), more > 0 ? `+${fmtMoney(more, { sign: false })}` : `+${Math.round(boost * 100)}%`, 'pay-boost'));
  // With a free bet: what's paid from the balance (the free part isn't).
  rows.push(payLine(free ? t('payYouPay', { f: fmtMoney(free, { sign: false }) }) : t('payCost', { c: fmtInt(combos) }), fmtMoney(cost, { sign: false })));
  // Tax is the payout table's own (the free part taken off isn't tax).
  if (taxed) rows.push(payLine(t('payTax', { rate: taxRateText() }), `−${fmtMoney(allGross - allTaxed, { sign: false })}`));
  if (free) rows.push(payLine(t('payFreeBack'), `−${fmtMoney(free, { sign: false })}`));
  if (mode !== 'parlay' && least < allNet) rows.push(payLine(t('payLeastShort'), fmtMoney(least, { sign: false })));
  return el('div', { class: 'sl-pay' }, [
    // sheetHero in green: the payout big, the profit under it.
    kitUI.sheetHero({ eyebrow: free ? t('payAllFree') : t('payAll'), big: fmtMoney(allNet, { sign: false }), sub: t('payProfit', { v: fmtMoney(allNet - cost) }), tint: allNet > cost ? 'var(--q-green)' : 'var(--q-red)' }),
    el('div', { class: 'sl-pay-rows' }, rows)
  ]);
}
// The parlay boost as a ladder: 3 picks and up, the share the winnings grow
// by at each size, and where this slip stands.
function boostLadder(size) {
  const t = state.t;
  const steps = PARLAY_BOOST.map((r, k) => k).filter(k => k >= 3);
  const pct = r => `+${Math.round(r * 100)}%`;
  const now = boostRate(size);
  const next = steps.find(k => k > size);
  const line = now > 0 ? t('boostNow', { v: pct(now) }) : t('boostFrom', { n: 3 });
  const more = next ? t('boostNext', { n: next - size, v: pct(boostRate(next)) }) : t('boostTop');
  return el('div', { class: `boost${now > 0 ? ' on' : ''}` }, [
    el('div', { class: 'boost-head' }, [el('strong', { text: line }), el('small', { text: more })]),
    el('ol', { class: 'boost-steps' }, steps.map(k => el('li', { class: k <= size ? 'hit' : '' }, [el('span', { text: k === steps.at(-1) ? `${k}+` : String(k) }), el('b', { class: 'num', text: pct(boostRate(k)) })])))
  ]);
}

function payCell(label, value, cls = '', sub = '') {
  return el('div', { class: 'pay-cell' }, [el('small', { text: label }), el('strong', { class: cls, text: value }), sub ? el('small', { class: 'pay-sub', text: sub }) : null]);
}
// How a free bet's stake was paid, under its cost ("免費 NT$200 ＋ 自付 NT$800").
const freeLine = slip =>
  slip.cost > 0 ? state.t('placeFreePlus', { f: fmtMoney(slip.freeValue ?? slip.stake - slip.cost, { sign: false }), v: fmtMoney(slip.cost, { sign: false }) }) : state.t('placeFree', { v: fmtMoney(slip.freeValue ?? slip.stake, { sign: false }) });

function payLine(label, value, cls = '') {
  return el('div', { class: `pay-line ${cls}` }, [el('span', { text: label }), el('strong', { text: value })]);
}

// ---- The account: kept with the Quadra Pass ------------------------------------
//
// Signing in is required (quadra.mjs's sign-in screen). The account is this
// app's data on the pass (a copy on the device under the pass, so it opens
// at once); its ledger's entries go to the pass's wallet, the one Quadra
// money pool, and the rest of the pool (Securities' cash, Quadra's pay) is
// money to bet with here too.

const q = quadraSession('odds', { lang: state.locale });
let lotteryUi = null;
let statsUi = null;
useSourcesSession(q);
useSettleToken(() => q?.token || '');
const accountKey = () => `${ACCOUNT_KEY}:${q.pass}`;

// This pass's copy on the device.
async function loadAccount() {
  try {
    const stored = await unpack(localStorage.getItem(accountKey()));
    if (isAccount(stored)) return compactAccount(stored);
  } catch {}
  return null;
}
// A pass that got its opening money from Quadra itself opens an empty ledger
// (lib/account.mjs accountFor: a wallet not known yet is never taken for one without it).
const freshAccount = (wallet = state.wallet) => accountFor(wallet);

function poolExtra() {
  return othersBalance(state.wallet, 'odds');
}
function funds(account = state.account) {
  return balance(account) + poolExtra();
}

// Writes go one after another, so an older (slower to compress) save never
// lands after a newer one.
let saving = Promise.resolve();
function saveAccountLocal() {
  const account = state.account;
  const key = accountKey();
  saving = saving.then(async () => {
    try {
      localStorage.setItem(key, await pack(account));
    } catch {}
  });
  return saving;
}

// Every change goes to this device at once and to the pass shortly after.
function commitAccount(next) {
  if (next === state.account || !state.accountReady) return;
  noticeSettled(state.account, next);
  state.account = next;
  saveAccountLocal();
  renderAccount();
  renderSaved();
  pushSoon();
}

// A slip in a notice's line: its picks (three at most, then how many more), and its stake.
const slipLegsLine = slip => {
  const names = slip.legs.map(l => l.shortLabel || l.label);
  const more = names.length > 3 ? (state.locale === 'en' ? ` +${names.length - 3}` : ` 等 ${names.length} 場`) : '';
  return `${names.slice(0, 3).join('、')}${more} · ${fmtMoney(slip.stake, { sign: false })}`;
};
// While Play is closed the Worker tells how a slip went once it's settled
// (settle.js); the guessed "games are over" notices handed over before are
// cleared from its list.
const clearGuessedNotices = () => schedulePush(q, []);

// A slip or lottery ticket just settled: a notice (a banner on screen, a
// system notice when Play is in the background and they're allowed).
function noticeSettled(prev, next) {
  if (!prev) return;
  const was = new Map(prev.slips.map(x => [x.id, x.status]));
  for (const slip of next.slips) {
    if (slip.status !== 'settled' || was.get(slip.id) !== 'open' || slip.cashedOut) continue;
    const won = slip.payout > 0;
    notify(q, {
      title: won ? state.t('noticeSlipWon', { v: fmtMoney(slip.payout, { sign: false }) }) : state.t('noticeSlipLost'),
      body: slipLegsLine(slip),
      tag: `slip:${slip.id}`,
      hash: 'history',
      kind: 'slip'
    });
  }
  const had = new Map((prev.tickets || []).map(x => [x.id, x.status]));
  for (const ticket of next.tickets || []) {
    if (ticket.status !== 'settled' || had.get(ticket.id) !== 'open' || !(ticket.prize > 0) || ticket.card) continue;
    notify(q, { title: state.t('noticeTicketWon', { v: fmtMoney(ticket.prize, { sign: false }) }), body: '', tag: `ticket:${ticket.id}`, hash: 'tickets', kind: 'ticket' });
  }
}

let pushTimer = null;
addEventListener('pagehide', () => {
  if (!pushTimer) return;
  clearTimeout(pushTimer);
  pushTimer = null;
  syncNow();
});
function pushSoon() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    syncNow();
  }, 1200);
}

// Reads the pass's copy, merges it with this device's and writes back what's
// new: no device ever overwrites another's slips or grants. Syncs run one
// after another (a write already on its way must never land after a newer
// one and take a slip or ticket back out).
let syncChain = Promise.resolve();
let syncQueued = false;
function syncNow() {
  if (!state.accountReady || syncQueued) return syncChain;
  syncQueued = true;
  syncChain = syncChain.then(async () => {
    syncQueued = false;
    if (!q.active) return;
    state.sync = { ...state.sync, busy: true, error: '' };
    try {
      await mergeRemote(await q.read({ data: true, inbox: true }));
      state.sync = { ...state.sync, busy: false, at: new Date().toISOString() };
      // What the Worker settled applied; a scratched card's prize asked for
      // again if its reveal didn't get through.
      revealPending(state.account, state.wallet).catch(() => {});
      applySettled();
    } catch (error) {
      state.sync = { ...state.sync, busy: false, error: error.code === 'ECO_SESSION_MOVED' ? '' : state.t(error.code === 'TOO_BIG' ? 'syncTooBig' : 'syncFailed') };
    }
    renderAccount();
    renderParlay();
  });
  return syncChain;
}
// (Done once the Pass's copy is merged into the one here, not when the save
// that follows lands: on a weak connection that save took minutes.)
const mergeFirst = remote =>
  new Promise(merged => {
    syncChain = syncChain
      .then(() => mergeRemote(remote, merged))
      .catch(console.error)
      .finally(merged);
  });

async function mergeRemote(remote, applied = () => {}) {
  if (!remote) return;
  const theirs = remote.payload ? await unpack(remote.payload).catch(() => null) : null;
  // A copy there that can't be read is never saved over.
  if ((remote.payload && !theirs) || (theirs && !isAccount(theirs))) throw new Error('bad account');
  const wallet = remote.wallet || state.wallet;
  let merged = mergeAccounts(state.account || (theirs ? null : freshAccount(wallet)), theirs);
  if (!merged) merged = theirs || freshAccount(wallet);
  for (const item of remote.inbox || []) {
    const other = await unpack(item.payload).catch(() => null);
    if (isAccount(other)) merged = mergeDistinct(merged, compactAccount(other));
  }
  merged = refundLost(recoverFromWallet(merged, wallet));
  const have = new Set((wallet?.entries || []).map(e => e.id));
  const entries = poolEntries(merged).filter(e => !have.has(e.id));
  const open = merged.slips.filter(x => x.status === 'open').reduce((sum, x) => sum + x.cost, 0);
  // The money on open slips (counted in the account's worth) and how many.
  const n = merged.slips.filter(x => x.status === 'open').length;
  const had = wallet?.snap?.odds;
  const pl = resultByMarket(merged);
  const gov = taxPaid(merged);
  const same = had?.open === open && had?.n === n && !had?.slips && JSON.stringify(had?.pl || {}) === JSON.stringify(pl) && JSON.stringify(had?.gov || {}) === JSON.stringify(gov);
  const snap = same ? undefined : { odds: { open, n, pl, gov, t: Date.now() } };
  const changed = !theirs || JSON.stringify(merged) !== JSON.stringify(theirs);
  if (JSON.stringify(merged) !== JSON.stringify(state.account)) {
    state.account = merged;
    saveAccountLocal();
    renderSaved();
  }
  applied();
  if (changed || entries.length || snap) {
    const payload = changed ? await pack(merged) : undefined;
    if (payload && payload.length > 1_000_000) throw Object.assign(new Error('too big'), { code: 'TOO_BIG' });
    const res = await q.write({ payload, wallet: { entries, snap, settings: affinityPatch('odds').settings } });
    state.wallet = res.wallet || state.wallet;
  } else state.wallet = wallet;
  for (const item of remote.inbox || []) await q.dropInbox(item.id).catch(() => {});
}

// What the person bets on and opens, for recommendations here and in every
// Quadra app.
function track(keys = [], weight = 1) {
  if (keys.length) recordAffinity('odds', keys, weight);
}
// The keys a pick is about: its league, sport, teams (or driver) and market.
function betKeys(bet) {
  const game = state.data?.games.find(g => g.id === bet.gameId);
  const teams = game ? [game.away, game.home] : [bet.away, bet.home].filter(Boolean);
  return [
    bet.sport ? `league:${bet.sport}` : null,
    bet.sport ? `sport:${familyOf(bet.sport) || bet.sport}` : null,
    ...teams.map(team => `team:${bet.sport}:${normalizeTeamName(team?.en ?? team)}`),
    bet.driverEn ? `driver:${normalizeTeamName(bet.driverEn)}` : null,
    bet.kind ? `market:${bet.kind}` : null
  ].filter(Boolean);
}

// The logo of the team a pick is on (saved with the pick, so history shows
// it whatever the board holds later), or null for picks on no one team.
function legLogo(bet) {
  if (bet.kind === 'future') return teamLogo(bet.sport, bet.teamEn) ?? findTeamLogo(futureTeamLeagues(bet.sport), bet.teamEn);
  const side = bet.kind === 'teamtotal' ? bet.team : bet.settle?.team ?? (['away', 'home'].includes(bet.side) ? bet.side : null);
  return side && bet.game ? teamLogo(bet.sport, bet.game[side].en) : null;
}

// A saved pick's picture: its team's logo, the driver's badge, or the league's logo.
// (`size`: logo-sm in lists; a ticket's own picks logo-md, a driver's face as big as a team's logo.)
function legIcon(leg, size = 'logo-sm') {
  if (FLAG_KINDS.has(leg.kind)) return icon(leg.kind, `flag-badge ${size}`);
  if (leg.kind?.startsWith('f1') && leg.driver) {
    return driverBadge(leg.driver, size);
  }
  if (leg.logo) {
    const fallback = () => leagueImg(leg.sport, size);
    return logoPicture(leg.logo, leg.logo.includes('/500/') ? leg.logo.replace('/500/', '/500-dark/') : null, `logo ${size}`, fallback);
  }
  const side = leg.kind === 'teamtotal' ? leg.team : ['away', 'home'].includes(leg.side) ? leg.side : null;
  const url = side && leg[side] ? teamLogo(leg.sport, leg[side]) : null;
  if (url) return logoPicture(url, teamLogo(leg.sport, leg[side], true), `logo ${size}`, () => leagueImg(leg.sport, size));
  return leagueImg(leg.sport, size);
}

// What a pick on the slip needs to be settled later, whatever the board shows then.
function legRecord(bet) {
  return { ...legOf(bet), odds: effectiveOdds(bet), logo: legLogo(bet) };
}

// The free bets not yet spent (on this device either).
function freeBetList() {
  if (!state.accountReady) return [];
  return freeBets(state.wallet, Date.now(), state.account.ledger.filter(e => e.kind === 'freebet').map(e => e.id.slice(3)));
}
// Above the stake: the free bets to use, one chip each (its value, its days left).
function freeBetRow(tokens, free, freeOn, rerender, freeShape = true) {
  const t = state.t;
  const days = x => Math.max(1, Math.ceil((x.until - Date.now()) / 86_400_000));
  return el('div', { class: 'sl-free' }, [
    el('p', { class: 'sl-label', text: t('freeBetsTitle') }),
    el('div', { class: 'q-chips sl-chips', role: 'group' }, tokens.map(x =>
      el('button', { type: 'button', class: 'q-chip sl-free-chip', 'aria-pressed': String(free?.id === x.id), onclick: () => ((state.useFree = free?.id === x.id ? null : x.id), rerender()) }, [
        icon('gift', 'sl-gift'),
        el('span', { class: 'num', text: fmtMoney(x.value, { sign: false }) }),
        el('span', { class: 'chip-count', text: x.id === 'eco:fb:welcome' ? `${t('freeBetWelcome')} · ${t('freeBetDays', { n: days(x) })}` : x.id.startsWith('eco:fb:') ? `${t('freeBetTag')} · ${t('freeBetDays', { n: days(x) })}` : t('freeBetDays', { n: days(x) }) })
      ])
    ))
  ]);
}

// The 模擬下注 button: buys the slip on the simulated account.
function placeButton(legs, sizes, cost, errors, free = null) {
  const t = state.t;
  const money = funds();
  const short = cost > money;
  // Opened on the last board saved: bets wait for today's odds.
  const updating = Boolean(state.fromSnapshot);
  const drawnStake = state.slipStake;
  const blocked = errors.length > 0 || sizes.length === 0 || short || !state.accountReady || updating || state.placing;
  const paidBy = free && !short && !updating ? (cost > 0 ? t('placeFreePlus', { f: fmtMoney(free.value, { sign: false }), v: fmtMoney(cost, { sign: false }) }) : t('placeFree', { v: fmtMoney(free.value, { sign: false }) })) : '';
  const button = el('button', {
      class: `q-btn primary place-button${paidBy ? ' two-line' : ''}`,
      type: 'button',
      disabled: blocked ? '' : null,
      // One line: what's bought for how much; with a free bet, a smaller
      // second line says how it's paid (free + yours).
      text: state.placing ? t('placing') : updating ? t('placeUpdating') : free && !short ? t('placeSlip', { v: fmtMoney(free.value + cost, { sign: false }) }) : short ? t('placeShort', { v: fmtMoney(money, { sign: money < 0 }) }) : t('placeSlip', { v: fmtMoney(cost, { sign: false }) }),
      onclick: async () => {
        // A stake typed since this button was drawn (the tap that left the
        // field): drawn again with it, never bought at the old amount.
        if (state.slipStake !== drawnStake) return void (clearTimeout(stakeTimer), renderParlay());
        // Bought in one tap at the board's odds now: the slip redraws with
        // every refresh (moved odds marked there), so what it shows is what's
        // bought. Only a pick gone, locked or started stops it.
        const current = () => {
          const board = betById();
          const now = legs.map(b => board.get(b.id));
          return now.every(b => b && !b.lock && b.estOdds > 1 && !started(b)) ? now : null;
        };
        // 單場: each pick its own slip (its own bet, its own line in 紀錄),
        // the stake the same on each; the others, one slip.
        const build = picks => {
          const records = picks.map(legRecord);
          // The parlay boost as it stands now, kept with the slip.
          const boost = 1;
          const slips = free
            ? [{ id: newSlipId(), mode: state.slipMode, sizes, stake: free.value + cost, cost, legs: records, ...(state.slipMode !== 'single' ? { boost } : {}) }]
            : state.slipMode === 'single' && records.length > 1
              ? records.map(leg => ({ id: newSlipId(), mode: 'single', sizes: [1], stake: state.slipStake, cost: cost / records.length, legs: [leg] }))
              : [{ id: newSlipId(), mode: state.slipMode, sizes, stake: state.slipStake, cost, legs: records, ...(state.slipMode !== 'single' ? { boost } : {}) }];
          return { records, slips };
        };
        const stop = () => (renderParlay(), tell({ lang: state.locale, icon: 'clock', title: t('pickGone'), body: t('pickGoneBody') }));
        let picks = current();
        if (!picks) return stop();
        let { records, slips } = build(picks);
        if (cost > funds()) return;
        // Every purchase asks first: what it costs, and the most it can pay.
        const most = slips.reduce((sum, one) => sum + Math.max(0, slipRange(free ? { ...one, free: true, freeValue: free.value } : one).most), 0);
        const asked = await ask({
          lang: state.locale,
          icon: free ? 'spark' : 'ticket',
          title: free ? (cost > 0 ? t('placeAskFreePlus', { f: fmtMoney(free.value, { sign: false }), v: fmtMoney(cost, { sign: false }) }) : t('placeAskFree', { v: fmtMoney(free.value, { sign: false }) })) : t('placeAsk', { v: fmtMoney(cost, { sign: false }) }),
          body: t('placeAskBody', { n: records.length, most: fmtMoney(most, { sign: false }) }),
          ok: t('placeOk'),
          cancel: t('askCancel')
        });
        if (!asked || cost > funds()) return;
        picks = current();
        if (!picks) return stop();
        ({ records, slips } = build(picks));
        // Placed through the Worker (lib/settled.mjs): every pick's price
        // checked by the house, the stake taken from the pass, all or none.
        state.placing = true;
        renderParlay();
        const placed = await placeSlips(free ? slips.map(x => ({ ...x, free: free.id, freeValue: free.value })) : slips).catch(() => null);
        state.placing = false;
        renderParlay();
        if (!placed?.placed && !placed?.refused) return tell({ lang: state.locale, icon: 'clock', title: t('placeFailed'), body: t('placeFailedBody') });
        if (placed.refused) {
          const moved = placed.refused.moved?.[0];
          const pick = moved && records.find(r => r.id === moved.id);
          // A price that moved stops it and says so; the board is read again.
          if (moved) {
            load();
            return tell({ lang: state.locale, icon: 'clock', title: t('priceMoved'), body: moved.odds ? t('priceMovedBody', { pick: pick?.shortLabel || '', odds: fmtOdds(moved.odds) }) : t('pickGoneBody') });
          }
          return tell({ lang: state.locale, icon: 'clock', title: t('placeRefused'), body: t(placed.refused.problem === 'funds' ? 'placeRefusedFunds' : 'placeRefusedBody') });
        }
        if (placed.wallet) state.wallet = placed.wallet;
        let account = state.account;
        const now = new Date();
        if (free) {
          const placed = placeFreeSlip(account, slips[0], free, now, { extra: Infinity });
          if (placed.error) return;
          account = placed.account;
          state.useFree = null;
        } else for (const one of slips) {
          // The whole cost was checked above: each part goes through.
          const placed = placeSlip(account, one, now, { extra: Infinity });
          if (placed.error) return;
          account = placed.account;
        }
        const slip = { legs: records };
        state.parlay = [];
        state.modeChosen = false;
        saveSlip();
        state.justPlaced = { at: Date.now(), n: slips.length, cost, free: free ? free.value : 0 };
        for (const one of slips) state.freshSlips.add(one.id);
        commitAccount(account);
        // Synced at once, not in a moment: the balance in the other apps.
        clearTimeout(pushTimer);
        syncNow();
        track([...new Set(slip.legs.flatMap(leg => betKeys(leg)))], 3);
        slipChanged();
        showTab('history');
      }
    });
  if (paidBy) button.append(el('small', { text: paidBy }));
  return el('div', { class: 'place-row' }, [button, el('small', { class: 'muted', text: t('placeNote', { v: fmtMoney(money, { sign: money < 0 }) }) })]);
}


// Slips are settled by the Worker (lib/settled.mjs) when their games end,
// whether Play is open or not, and only by it (the proxy is the only one
// paying anything in): its results are applied here (the ledger's own ids:
// nothing paid twice). This device reads the open picks' games only for
// what's shown (live scores, cash out).
const RESULT_CHECK_MS = 90_000;
const SETTLED_EVERY_MS = 60_000;
let settledAt = 0;
async function applySettled(force = false) {
  if (!state.accountReady || !q.active || !state.account.slips.some(s => s.status === 'open')) return;
  if (!force && Date.now() - settledAt < SETTLED_EVERY_MS) return;
  settledAt = Date.now();
  const records = await readSettled().catch(() => null);
  if (!records) return;
  const now = new Date();
  let account = state.account;
  for (const [id, r] of Object.entries(records)) {
    if (!Array.isArray(r?.results)) continue;
    // Cashed out (on another device): as it was, at its value.
    const next = r.cashedOut ? cashOut(account, id, r.payout, now) : applyResults(account, id, r.results, now, r.finals || []);
    if (next !== account && next.slips.find(s => s.id === id)?.status === 'settled') state.freshSlips.add(id);
    account = next;
  }
  commitAccount(account);
  // Settled in this account now: the Worker forgets them.
  ackSettled(Object.keys(records).filter(id => records[id]?.settled && account.slips.find(s => s.id === id)?.status === 'settled')).catch(() => {});
}
// From the lock-down on (lib/account.mjs LOCK_SINCE) every slip is placed
// through the Worker, which watches its Kambi matches (Shared-Proxy settle.js watchSlips).
// A check runs unseen: only a tap on 查詢結果 shows it working (`shown`), and
// the screens are drawn again only when a score, a result or a pick's state changed.
async function checkResults(force = false, { shown = false } = {}) {
  if (!state.accountReady) return;
  await applySettled(force);
  let open = state.account.slips.filter(s => s.status === 'open');
  const now = new Date();
  // A slip with nothing left that can pay (a parlay's pick lost) settles now,
  // its other games not started yet.
  const settled = open.reduce((a, s) => applyResults(a, s.id, s.legs.map(() => null), now), state.account);
  if (settled !== state.account) {
    open.forEach(s => settled.slips.find(x => x.id === s.id)?.status === 'settled' && state.freshSlips.add(s.id));
    commitAccount(settled);
    open = settled.slips.filter(s => s.status === 'open');
    renderSaved();
  }
  const started = s => s.legs.filter(l => !l.result && (l.kind === 'future' || (l.start && Date.parse(l.start) <= now.getTime())));
  const pending = open.flatMap(started);
  // Kambi's matches for the Worker to keep: only an older slip's (one placed
  // since the lock-down is watched by the Worker as it's placed).
  const watch = open.filter(s => !(Date.parse(s.t) >= LOCK_SINCE)).flatMap(started);
  if (!pending.length || state.checking) return;
  // (A beat's own timer runs a little early or late: a second's slack.)
  if (!force && now.getTime() - state.checkedAt < (state.legLive.size ? liveMs() - 1000 : RESULT_CHECK_MS)) return;
  state.checking = true;
  state.checkingShown = shown;
  state.checkedAt = now.getTime();
  if (shown) renderSaved();
  const seen = () => JSON.stringify([[...state.legLive], [...state.legOutcome]]);
  const before = seen();
  try {
    const outcomes = await fetchOutcomes(pending, now, { watch });
    state.legLive = new Map([...outcomes].filter(([, o]) => o?.status === 'pending' && o.state === 'in'));
    state.legOutcome = new Map([...outcomes].filter(([, o]) => o?.status === 'void' || (o?.status === 'pending' && o.state === 'pre')));
  } catch (error) {
    console.error(error);
  } finally {
    state.checking = false;
    state.checkingShown = false;
    if (shown || seen() !== before) {
      renderSaved();
      // Home's 你的投注 shows the same scores and cash-out values.
      if (state.tab === 'home') drawHome();
    }
  }
}

function renderAccount() {
  if (!state.accountReady || !state.account) return;
  const t = state.t;
  const account = state.account;
  const r = accountRecord(account);
  // What's in play and the most it can pay, two big numbers; the record so
  // far as tags under them.
  const open = account.slips.filter(x => x.status === 'open');
  const most = slipsMost(open);
  const stat = (label, value, sub, cls = '') => el('div', { class: 'q-stat' }, [el('small', { text: label }), el('strong', { class: `stat-value ${cls}`.trim(), text: value }), sub ? el('span', { class: 'pl-stat-sub', text: sub }) : null]);
  const tags = r.decided
    ? [
        el('span', { class: 'q-tag', text: t('accountDecided', { n: r.decided }) }),
        el('span', { class: 'q-tag', text: `${t('accountWon')} ${fmtMoney(r.won, { sign: false })}` }),
        r.net != null ? el('span', { class: `q-tag ${r.net > 0 ? 'green' : r.net < 0 ? 'red' : ''}`, text: `${t('accountNet')} ${fmtMoney(r.net, { sign: true })}` }) : null,
        r.back != null ? el('span', { class: 'q-tag', text: `${t('accountBack')} ${r.back >= 1000 ? '999%+' : `${Math.round(r.back)}%`}` }) : null
      ]
    : [el('span', { class: 'q-tag', text: t('accountNoneYet') })];
  // No slips yet: no zero tiles, no stray pill (the empty state below says it).
  if (!account.slips.length) return void $('account-body').replaceChildren();
  $('account-body').replaceChildren(
    el('div', { class: 'q-stats pl-acct', style: '--q-stats-n:2' }, [stat(t('accountAtStake'), fmtMoney(r.open, { sign: false }), t('sumSlips', { n: r.openCount })), stat(t('sumMost'), fmtMoney(most, { sign: false }), '', most > 0 ? 'tint' : '')]),
    el('div', { class: 'q-tags pl-record' }, tags)
  );
}

// (Where a pick stands, legState, and what an open slip has locked in and can
// still pay, slipRange: lib/slip.mjs.)

// ---- Cash out ------------------------------------------------------------------------

// A pick's price right now: its own on the board before the game, the same
// market on the live board once it's under way (win, total, run line, team
// total), or null (no cash out on it now).
// The board's bet a pick is on now (before the start, or live).
function currentBet(leg, now = Date.now()) {
  if (leg.result) return null;
  if (!leg.start || Date.parse(leg.start) > now) return [...state.bets, ...state.futures].find(b => b.id === leg.id) ?? null;
  const game = state.liveGames.find(g => g.sport === leg.sport && g.away.en === leg.away && g.home.en === leg.home);
  if (!game) return null;
  const line = b => b.totalLine ?? b.runLine ?? b.teamLine ?? null;
  return state.liveBets.find(b => b.gameId === game.id && b.kind === leg.kind && b.side === leg.side && (leg.kind === 'ml' || line(b) === leg.line) && (leg.kind !== 'teamtotal' || b.team === leg.team)) ?? null;
}
function currentOdds(leg, now = Date.now()) {
  const b = currentBet(leg, now);
  return b && !b.lock && b.estOdds > 1 ? effectiveOdds(b) : null;
}
// A pick's fair chance now, for cash out: the board's own (its odds less the
// margin). Without one (an odd market), its odds' chance less a full margin.
function currentChance(leg, now = Date.now()) {
  const odds = currentOdds(leg, now);
  if (odds == null) return null;
  const bet = currentBet(leg, now);
  return bet?.fairChance > 0 && bet.fairChance < 1 ? bet.fairChance : (1 / odds) * (1 - FALLBACK_MARGIN);
}
const FALLBACK_MARGIN = 0.1;
// Where cash out stands: { value, reason, leg } (cashout.mjs), each undecided
// pick's chance with whether its game is in play (its margin's the live one).
function cashOutInfo(slip) {
  // A free bet's slip is never cashed out.
  if (slip.free) return { value: null, reason: 'free' };
  const now = Date.now();
  return cashOutState(
    slip,
    slip.legs.map(leg => {
      const p = currentChance(leg, now);
      return p == null ? null : { p, live: Boolean(leg.start && Date.parse(leg.start) <= now) };
    })
  );
}
const cashOutPrice = slip => cashOutInfo(slip).value;
// Why cash out is paused, in a few words ("國米 vs 帕爾瑪 場中暫停報價"), and the rules behind it.
function cashOutWhy(slip, info) {
  const t = state.t;
  const leg = info.leg != null ? slip.legs[info.leg] : null;
  const game = leg ? shortMatchup(leg) : '';
  if (info.reason === 'noPrice') return leg && leg.start && Date.parse(leg.start) <= Date.now() ? t('cashWhyLive', { game }) : t('cashWhyLocked', { game });
  if (info.reason === 'sameGame') return t('cashWhySameGame', { game });
  if (info.reason === 'tooMany') return t('cashWhyTooMany', { n: CASHOUT_MAX_OPEN });
  return '';
}
function cashOutRules() {
  const t = state.t;
  tell({ lang: state.locale, icon: 'coin', title: t('cashRulesTitle'), body: t('cashRulesBody'), points: [['◷', t('cashRulePrice'), t('cashRulePriceBody')], ['‖', t('cashRulePause'), t('cashRulePauseBody')]] });
}
async function doCashOut(slip, value) {
  const t = state.t;
  const fresh = cashOutPrice(slip);
  // The price moved since it was shown: ask again at the new one.
  if (fresh == null) return tell({ lang: state.locale, title: t('cashOutGone'), body: t('cashOutGoneBody') });
  if (!(await ask({ lang: state.locale, icon: 'coin', title: t('cashOutAsk', { v: fmtMoney(fresh, { sign: false }) }), body: t('cashOutAskBody', { most: fmtMoney(Math.max(0, slipRange(slip).most), { sign: false }) }), ok: t('cashOutOk'), cancel: t('cashOutKeep') }))) return;
  // Cashed out by the Worker: the value checked against the house's own,
  // paid by it (never with settling: a slip it settled meanwhile keeps its result).
  const asked = cashOutPrice(slip) ?? fresh;
  const taken = await takeForCashOut(slip.id, asked).catch(() => null);
  if (taken?.settled) {
    await applySettled(true);
    return tell({ lang: state.locale, title: t('cashOutSettled') });
  }
  if (!taken?.cashedOut) return tell({ lang: state.locale, title: t('cashOutGone'), body: taken?.refused?.value ? t('cashOutMovedBody', { v: fmtMoney(taken.refused.value, { sign: false }) }) : t('cashOutGoneBody') });
  if (taken.wallet) state.wallet = taken.wallet;
  const account = cashOut(state.account, slip.id, taken.cashedOut);
  if (account === state.account) return;
  state.freshSlips.add(slip.id);
  commitAccount(account);
  clearTimeout(pushTimer);
  syncNow();
  track([...new Set(slip.legs.flatMap(leg => betKeys(leg)))], 1);
  renderSaved();
  if (state.tab === 'home') drawHome();
}
function cashOutRow(slip) {
  const t = state.t;
  const info = cashOutInfo(slip);
  const value = info.value;
  const why = value == null ? cashOutWhy(slip, info) : '';
  return el('div', { class: `pl-cash${value == null ? ' off' : ''}` }, [
    el('button', { class: 'pl-cash-btn q-press', type: 'button', disabled: value == null ? '' : null, onclick: () => doCashOut(slip, value) }, [
      el('span', { text: t('cashOut') }),
      el('strong', { class: 'num', text: value == null ? t('cashOutPaused') : fmtMoney(value, { sign: false }) })
    ]),
    // Paused: why; the rules a tap away.
    el('div', { class: 'pl-cash-foot' }, [
      why ? el('span', { class: 'pl-cash-why', text: why }) : null,
      el('button', { class: 'sl-link', type: 'button', onclick: cashOutRules, text: t('cashRulesLink') })
    ])
  ]);
}

// Where a pick's game in play stands, if the game ended right now: the same
// settlement the slip will use ('won', 'lost', 'void' for a push), 'level'
// for a winner pick with the score level, or null when the score can't tell
// yet (the first run, a set not played).
function legStanding(leg) {
  const live = state.legLive.get(leg.id);
  if (!live) return null;
  // A level winner pick is neither winning nor losing yet where a game can't
  // end level (extra innings, overtime); in football a draw is an outcome of
  // its own, and a win pick on a draw is losing (it showed as level, uncoloured).
  if (leg.kind === 'ml' && leg.side !== 'draw' && live.homeScore === live.awayScore && !isSoccer(leg.sport) && !leg.settle?.threeWay) return 'level';
  return legResult(leg, { ...live, status: 'final' });
}

// ESPN's short detail in the page's language: baseball's half-innings and
// half-time translated, the rest ("Q3 5:21", "67'") as it is.
function liveDetail(live, sport) {
  const t = state.t;
  if (!live.detail) return t('liveInPlay');
  if (familyOf(sport) === 'baseball') {
    const inning = parseInning(live.detail, live.period);
    if (inning) return t(`liveHalf_${inning.half}`, { n: inning.inning });
  }
  if (atHalftime(live)) return halftimeText(live, sport);
  return live.detail;
}

// Where an open slip stands now, in one sentence and a colour. A parlay
// lives or dies on every pick: one losing and it loses ("1 場目前猜錯，這張
// 串關會輸"), all winning and it pays ("照目前比分全中，可拿 NT$3,090"); a
// level pick says so. Singles and systems: what it would pay if the games on
// now ended now. Null with nothing in play or decided.
function slipVerdict(slip, states) {
  const t = state.t;
  if (slip.status === 'settled' || slip.cashedOut) return null;
  // A called-off game's pick counts at odds 1 (void), as it will settle.
  const now = slip.legs.map((leg, k) => leg.result ?? (states[k] === 'off' ? 'void' : states[k] === 'live' ? legStanding(leg) : null));
  const count = x => now.filter(v => v === x).length;
  const waiting = states.filter(x => x === 'waiting').length;
  const live = states.filter(x => x === 'live').length;
  if (!live && !slip.legs.some(l => l.result)) return null;
  const pays = () => settleSlip({ legs: slip.legs.map((leg, k) => ({ gameId: leg.gameId, odds: leg.odds, result: now[k] === 'level' ? 'lost' : now[k] })), sizes: slip.sizes, stake: slip.stake, boost: slip.boost ?? 0 }).net;
  let tone = '';
  let text = '';
  if (slip.mode === 'parlay') {
    if (count('lost')) [tone, text] = ['losing', t('verdictParlayLost', { n: count('lost') })];
    else if (count('level')) [tone, text] = ['level', t('verdictLevel', { n: count('level') })];
    else if (!live) return null;
    else if (waiting) [tone, text] = ['winning', t('verdictOnTrack', { n: waiting })];
    else [tone, text] = ['winning', t('verdictAllWin', { v: fmtMoney(pays(), { sign: false }) })];
  } else {
    if (!live) return null;
    const v = now.every(x => x && x !== 'level') ? pays() : null;
    [tone, text] = v == null ? ['level', t('verdictWaiting', { n: count('won'), m: count('lost') })] : v > 0 ? ['winning', t('slipNowPays', { v: fmtMoney(v, { sign: false }) })] : ['losing', t('slipNowNothing')];
  }
  return el('p', { class: `slip-verdict ${tone}` }, [el('i', { class: 'verdict-dot', 'aria-hidden': 'true' }), el('span', { text })]);
}

// A pick's game in play in one line: the score (sets and each set's score
// for matches in sets), where the game is, and whether the pick is winning
// right now.
// A game's score in one line, the teams in the card's order: "太空人 4 : 6
// 運動家".
function scoreText(leg, score) {
  // Short names ("火箭 76 : 64 獨行俠"): the full ones were cut on a phone.
  const name = side => shortTeamName(leg.sport, leg[side], teamName({ en: leg[side], zh: teamZh(leg.sport, leg[side]) }));
  const first = isSoccer(leg.sport) ? ['home', 'away'] : ['away', 'home'];
  return `${name(first[0])} ${score[first[0]]} : ${score[first[1]]} ${name(first[1])}`;
}

// Where a pick in play stands now, as a class: 'winning', 'losing', or '' (level, or no score yet).
function liveTone(leg) {
  if (!state.legLive.has(leg.id)) return '';
  const standing = legStanding(leg);
  return standing === 'won' ? 'winning' : standing === 'lost' ? 'losing' : '';
}

// A pick's second line, by where it stands: to come, when and which game
// ("明天 00:30 · 曼聯 vs 熱刺"); on, the minute and the score in the
// game's order ("90' · 維拉 2 : 2 布倫特福德"; a race: the driver's place
// now and the lap); over, the final score. One row, never wrapped.
function legSubLine(leg, st) {
  const t = state.t;
  const live = st === 'live' ? state.legLive.get(leg.id) : null;
  if (live && leg.kind?.startsWith('f1')) {
    const at = name => (live.order || []).findIndex(x => sameName(x, name)) + 1;
    const me = at(leg.driver);
    const rival = leg.kind === 'f1h2h' ? leg.rival ?? String(leg.id || '').split('|')[2] : null;
    const where = live.lap?.now ? t('f1LapNow', { n: live.lap.now, of: live.lap.of }) : live.part ? `Q${live.part}` : t('liveInPlay');
    const places = [me ? `${shortDriver(leg.driver)} P${me}` : '', rival && at(rival) ? `${shortDriver(rival)} P${at(rival)}` : ''].filter(Boolean).join(' · ');
    return el('small', { class: 'leg-sub live' }, [el('span', { class: 'leg-min', text: where }), document.createTextNode(places ? ` · ${places}` : '')]);
  }
  if (live) {
    // The minute, then each side's name around the score: a long name gives way ("阿斯頓維… 2 : 2 布倫特…"), the score never.
    const order = isSoccer(leg.sport) ? ['home', 'away'] : ['away', 'home'];
    const name = side => shortTeamName(leg.sport, leg[side], teamName({ en: leg[side], zh: teamZh(leg.sport, leg[side]) }));
    const score = `${live[`${order[0]}Score`]} : ${live[`${order[1]}Score`]}`;
    const moved = scoreMoved(`leg|${leg.id}`, score);
    // Each side its small logo (its name where there's none): the names cut each other to 阿斯… 布倫….
    const side = k => {
      const url = teamLogo(leg.sport, leg[k]);
      return url ? logoPicture(url, teamLogo(leg.sport, leg[k], true), 'logo leg-team-logo', () => el('span', { class: 'leg-team', text: name(k) })) : el('span', { class: 'leg-team', text: name(k) });
    };
    return el('small', { class: 'leg-sub live leg-score-line' }, [
      el('span', { class: 'leg-min', text: liveDetail(live, leg.sport), ...halftimeTick(live, leg.sport) }),
      side(order[0]),
      el('span', { class: `leg-live-score num${moved ? ' moved' : ''}`, text: score }),
      side(order[1])
    ]);
  }
  if (leg.result && leg.final) {
    const f = leg.final;
    const text = f.winner ? `${t('finalWinner')} ${String(f.winner).replace(/^[A-Z]{1,3}\.(?=[\u4e00-\u9fff])/, '')}` : `${t('finalScore')} ${scoreText(leg, f)}`;
    return el('small', { class: 'leg-sub', text });
  }
  // (Not counted: the game alone, no time to wait for.)
  return el('small', { class: 'leg-sub', text: [st === 'moot' ? '' : st === 'off' ? t('legOffNote') : legWhen(leg.start), shortMatchup(leg)].filter(Boolean).join(' · ') });
}
const sameName = (a, b) => String(a || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === String(b || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// A pick's state as a small word at its side: 目前猜對 / 目前猜錯 / 平手 while on, 猜對了 / 猜錯了 once decided.
function legChip(leg, st) {
  const t = state.t;
  if (st === 'live') {
    const now = state.legLive.has(leg.id) ? legStanding(leg) : null;
    const [cls, key] = { won: ['winning', 'legNowWinning'], lost: ['losing', 'legNowLosing'], void: ['level', 'legNowLevel'], level: ['level', 'legNowLevel'] }[now] || ['live', 'legChipLive'];
    return el('span', { class: `leg-chip ${cls}`, text: t(key) });
  }
  if (['won', 'lost', 'void', 'cashed', 'moot', 'off', 'late'].includes(st)) return el('span', { class: `leg-chip ${st}`, text: t(`legChip_${st}`) });
  return null;
}
// A saved pick: its picture, the pick and its market on one row, the second
// line by where it stands, and its odds over its state at the side.
function savedLegRow(leg, st) {
  const tone = st === 'live' ? liveTone(leg) : '';
  return el('li', { class: `leg-row leg-${st}${tone ? ` ${tone}` : ''}` }, [
    legIcon(leg, 'logo-md'),
    el('span', { class: 'leg-body' }, [el('span', { class: 'leg-pick' }, [el('strong', { text: shortPick(leg) }), marketTag(leg.kind, leg.sport, leg.market)]), legSubLine(leg, st)]),
    el('span', { class: 'leg-side' }, [el('span', { class: 'leg-odds num' }, [document.createTextNode(fmtOdds(leg.odds))]), legChip(leg, st)])
  ]);
}

// A bet brought back from the pass's money records: its cost, time and
// payout are known, its picks aren't.
function recoveredSlipCard(slip) {
  const t = state.t;
  const profit = slip.payout - slip.cost;
  return el('article', { class: 'pl-slip recovered' }, [
    el('div', { class: 'pl-slip-head' }, [
      el('span', { class: 'pl-slip-title' }, [el('strong', { text: t('slipRecoveredTitle') }), el('small', { text: fmtTime(slip.t) })]),
      el('span', { class: `q-tag ${slip.refunded ? '' : profit > 0 ? 'green' : 'red'}`, text: slip.refunded ? t('slipRefunded') : slip.payout > 0 ? t('slipPaid', { v: fmtMoney(slip.payout, { sign: false }) }) : t('slipRecoveredNoPay') })
    ]),
    el('div', { class: 'pl-slip-money' }, [
      payCell(t('slipCost'), fmtMoney(slip.cost, { sign: false })),
      payCell(t('slipPaidLabel'), fmtMoney(slip.payout, { sign: false })),
      payCell(t('slipResult'), fmtMoney(profit), profit > 0 ? 'back-high' : profit < 0 ? 'back-low' : '')
    ])
  ]);
}
// A slip's picks' places, by start (a race weekend's later than its games when unknown).
const byStart = legs => legs.map((leg, k) => k).sort((a, b) => String(legs[a].start || '9').localeCompare(String(legs[b].start || '9')) || a - b);
function savedSlipCard(slip) {
  if (slip.recovered || !slip.legs.length) return recoveredSlipCard(slip);
  const t = state.t;
  const n = slip.legs.length;
  const now = Date.now();
  const settled = slip.status === 'settled';
  // A lost slip's games not played yet: 不計入 (the slip's over), as if they
  // weren't played (no live score).
  const states = slip.legs.map(leg => (slip.cashedOut && !leg.result ? 'cashed' : settled && !leg.result ? 'moot' : legState(leg, now, state.legOutcome.get(leg.id))));
  const decided = states.filter(st => ['won', 'lost', 'void'].includes(st)).length;
  const profit = settled ? slip.payout - slip.cost : null;
  const range = settled ? null : slipRange(slip);
  // Open, but nothing left can pay: a parlay with a lost pick.
  const dead = !settled && range.most <= 0;
  const mode = slip.mode === 'system' ? slip.sizes.map(k => sizeName(k, n)).join('、') : t(`slipMode_${slip.mode}`);
  const pill = settled
    ? el('span', { class: `q-tag ${slip.cashedOut ? 'blue' : profit > 0 ? 'green' : profit < 0 ? 'red' : ''}`, text: slip.cashedOut ? t(state.account.slips.some(x => x.editedFrom === slip.id) ? 'slipEdited' : 'slipCashed', { v: fmtMoney(slip.payout, { sign: false }) }) : allVoid(slip) ? t('slipVoided', { v: fmtMoney(slip.payout, { sign: false }) }) : slip.payout > 0 ? t('slipPaid', { v: fmtMoney(slip.payout, { sign: false }) }) : t('slipLost') })
    : dead
      ? el('span', { class: 'q-tag red', text: t('slipDead') })
      : el('span', { class: `q-tag ${states.includes('live') ? 'red solid' : 'tint'}`, text: states.includes('live') ? t('slipLiveNow') : t('slipOpen') });
  const nextStart = slip.legs.filter((leg, k) => states[k] === 'waiting' && leg.start).map(leg => leg.start).sort()[0];
  const boost = slip.boost && boostRate(Math.max(...slip.sizes), slip.boost) > 0 ? `+${Math.round(boostRate(Math.max(...slip.sizes), slip.boost) * 100)}%` : '';
  // Fresh: glows once as it's first shown, then plain (never on every redraw).
  const fresh = state.freshSlips.has(slip.id);
  if (fresh) setTimeout(() => state.freshSlips.delete(slip.id), 2600);
  return el('article', { class: `pl-slip${fresh ? ' fresh' : ''}${dead ? ' dead' : ''}` }, [
    el('div', { class: 'pl-slip-head' }, [
      el('span', { class: 'pl-slip-title' }, [
        el('strong', { text: `${mode} · ${t('slipLegs', { n })}` }),
        el('small', { text: [fmtTime(slip.t), slip.free ? t('freeBetTag') : '', boost ? t('slipBoosted', { v: boost }) : ''].filter(Boolean).join(' · ') })
      ]),
      pill
    ]),
    // One segment per pick, coloured by where it stands (a pick in play:
    // green while it would win, red while it would lose).
    el('div', { class: 'leg-bar', role: 'img', 'aria-label': t('slipProgress', { k: decided, n }) }, byStart(slip.legs).map(k => el('span', { class: `seg seg-${states[k]}${states[k] === 'live' ? ` ${liveTone(slip.legs[k])}` : ''}` }))),
    !settled && nextStart && !states.includes('live') ? el('p', { class: 'pl-slip-next', text: t('slipNextStart', { time: fmtShort(nextStart) }) }) : null,
    slipVerdict(slip, states),
    el('ul', { class: 'saved-legs' }, byStart(slip.legs).map(k => savedLegRow(slip.legs[k], states[k]))),
    el('div', { class: 'pl-slip-money' }, settled
      ? [
          payCell(t('slipCost'), fmtMoney(slip.free ? slip.stake : slip.cost, { sign: false }), '', slip.free ? freeLine(slip) : ''),
          payCell(t('slipPaidLabel'), fmtMoney(slip.payout, { sign: false })),
          profit > 0 ? payCell(t('slipResult'), fmtMoney(profit), 'back-high') : null
        ]
      : [
          payCell(t('slipCost'), fmtMoney(slip.free ? slip.stake : slip.cost, { sign: false }), '', slip.free ? freeLine(slip) : ''),
          slip.mode === 'parlay' ? payCell(t('payOdds'), `×${fmtOdds(parlayOdds(slip))}`) : null,
          decided && range.locked > 0 ? payCell(t('slipLocked'), fmtMoney(range.locked, { sign: false }), 'back-high') : null,
          payCell(decided ? t('slipMost') : slip.free ? t('payAllFree') : t('payAll'), fmtMoney(range.most, { sign: false }), dead ? 'back-low' : 'tint')
        ]),
    settled || dead || slip.free ? null : cashOutRow(slip)
  ]);
}
const HISTORY_FILTERS = {
  all: () => true,
  open: s => s.status === 'open',
  won: s => s.status === 'settled' && s.payout > 0
};

// Groups for the slip list (lib/slip.mjs slipGroupKey): games on now,
// waiting to start, already lost (a parlay with a lost pick, waiting for its
// other games), then settled slips by the Taiwan day their last game was played.

function groupTitle(key) {
  const t = state.t;
  if (key === 'live') return t('groupLive');
  if (key === 'waiting') return t('groupWaiting');
  if (key === 'dead') return t('groupDead');
  if (key === 'recovered') return t('groupRecovered');
  const day = key.slice(4);
  const today = taipeiDayKey(new Date());
  const yesterday = taipeiDayKey(new Date(Date.now() - 86_400_000));
  const [, m, d] = day.split('-').map(Number);
  const name = day === today ? t('today') : day === yesterday ? t('yesterday') : `${m}/${d}（${dayLabel(day)}）`;
  return t('groupSettled', { day: name });
}

function groupSummary(key, slips) {
  const t = state.t;
  const cost = slips.reduce((s, x) => s + x.cost, 0);
  // Settled days: what they paid, never a net.
  if (key.startsWith('day|') || key === 'recovered') {
    const paid = slips.reduce((s, x) => s + (x.payout || 0), 0);
    return el('span', { class: 'group-sum' }, [document.createTextNode(t('groupSlips', { n: slips.length })), paid > 0 ? el('strong', { class: 'back-high', text: t('groupPaid', { v: fmtMoney(paid, { sign: false }) }) }) : null]);
  }
  if (key === 'dead') return el('span', { class: 'group-sum' }, [document.createTextNode(t('groupSlips', { n: slips.length }))]);
  const most = slipsMost(slips);
  return el('span', { class: 'group-sum' }, [document.createTextNode(t('groupCountCost', { n: slips.length, cost: fmtMoney(cost, { sign: false }) })), el('strong', { text: t('groupMost', { v: fmtMoney(most, { sign: false }) }) })]);
}

// The 紀錄 tab shows the slips, the tickets or the stats, one at a time.
function applyHistoryView() {
  const t = state.t;
  if (!state.accountReady) return;
  const views = ['slips', 'tickets', 'stats'];
  const view = views.includes(state.historyView) ? state.historyView : 'slips';
  const seg = $('history-tabs');
  seg.hidden = false;
  seg.style.setProperty('--q-seg-n', '3');
  seg.style.setProperty('--q-seg-i', String(views.indexOf(view)));
  seg.replaceChildren(
    ...views.map(key =>
      el('button', {
        type: 'button',
        'aria-pressed': String(key === view),
        text: t(`historyView_${key}`),
        onclick: () => {
          state.historyView = key;
          applyHistoryView();
          renderStats();
        }
      })
    )
  );
  $('saved').hidden = view !== 'slips';
  $('stats').hidden = view !== 'stats';
  $('tickets').hidden = view !== 'tickets';
  if (view === 'tickets') lotteryUi?.renderTickets($('tickets-body'));
}

// 紀錄's lottery tickets (the 彩券 tab's “我的彩券” and notices lead here).
function showTickets() {
  state.historyView = 'tickets';
  showTab('history');
  applyHistoryView();
}

function renderSaved() {
  redraw($('saved-body'), drawSaved);
}
function drawSaved() {
  renderStats();
  if (!state.accountReady) return;
  const t = state.t;
  const slips = state.account.slips;
  const open = slips.filter(s => s.status === 'open');
  applyHistoryView();
  // No slips yet: the way to the games, not an empty page.
  if (!slips.length) {
    const go = el('button', { class: 'q-btn primary', type: 'button', text: t('goPick'), onclick: () => showTab('games') });
    // Under it, today's games (K3 wide cards later), so the tab is never blank.
    // (The games with an open 不讓分 found once: each game searching every bet was a second's freeze on a full board.)
    const open = new Set(state.bets.filter(b => b.kind === 'ml' && !b.lock).map(b => b.gameId));
    const soon = (state.data?.games || []).filter(g => open.has(g.id) && Date.parse(g.startUtc) > Date.now()).sort((x, y) => x.startUtc.localeCompare(y.startUtc)).slice(0, 4);
    const rows = soon.map(g => el('button', { class: 'q-ritem chevron', type: 'button', onclick: () => openGame(g.id) }, [
      logoImg(g.sport, g.home.en, teamName(g.home), 'logo-md'),
      el('span', { class: 'q-ritem-text' }, [el('span', { class: 'q-ritem-title', text: `${shortTeamName(g.sport, g.away.en, teamName(g.away))} vs ${shortTeamName(g.sport, g.home.en, teamName(g.home))}` }), el('small', { text: `${state.t(`sport_${g.sport}`)} · ${legWhen(g.startUtc)}` })])
    ]));
    return void $('saved-body').replaceChildren(emptyK({ icon: 'ticket', title: t('noSlipsYet'), action: go }), ...(rows.length ? [el('section', { class: 'q-section' }, [el('div', { class: 'q-section-head' }, [el('h2', { text: state.locale === 'en' ? 'Featured today' : '今日焦點' })]), el('div', { class: 'q-rowcard' }, rows)])] : []));
  }
  const now = Date.now();
  const filtered = slips.filter(HISTORY_FILTERS[state.historyFilter] ?? HISTORY_FILTERS.all);
  // Open slips all show; settled ones fold after SAVED_SHOWN.
  let settledShown = 0;
  const groups = new Map();
  for (const slip of filtered) {
    const key = slipGroupKey(slip, now, id => state.legOutcome.get(id));
    if ((key.startsWith('day|') || key === 'recovered') && !state.showAllSaved && settledShown++ >= SAVED_SHOWN) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(slip);
  }
  const rank = key => ({ live: 0, waiting: 1, dead: 2, recovered: 4 })[key] ?? 3;
  const order = [...groups.keys()].sort((a, b) => rank(a) - rank(b) || b.localeCompare(a));
  const hidden = filtered.filter(s => s.status === 'settled').length - Math.min(settledShown, SAVED_SHOWN);
  // Right after a bet: the way straight back to the board.
  const placed = state.justPlaced && Date.now() - state.justPlaced.at < 5 * 60_000 ? state.justPlaced : null;
  $('saved-body').replaceChildren(
    ...[placed
      ? el('button', { class: 'q-ritem chevron pl-placed', type: 'button', onclick: () => ((state.justPlaced = null), showTab('games')) }, [
          el('span', { class: 'q-tile', style: '--t:var(--q-green)', 'aria-hidden': 'true' }, [kitGlyph(kitUI, 'check')]),
          el('span', { class: 'q-ritem-text' }, [el('span', { class: 'q-ritem-title', text: t('placedTitle') }), el('small', { text: placed.free ? t('placedSubFree', { v: fmtMoney(placed.free, { sign: false }) }) : t('placedSub', { n: placed.n, v: fmtMoney(placed.cost, { sign: false }) }) })]),
          el('span', { class: 'q-ritem-value', text: t('placedMore') })
        ])
      : null,
    el('div', { class: 'pl-hist-bar' }, [
      el('div', { class: 'q-chips pl-chips', role: 'group', 'aria-label': t('savedTitle') },
        Object.keys(HISTORY_FILTERS).map(key =>
          chip({
            pressed: key === state.historyFilter,
            text: t(`filter_${key}`),
            count: String(slips.filter(HISTORY_FILTERS[key]).length),
            onclick: () => {
              state.historyFilter = key;
              state.showAllSaved = false;
              renderSaved();
            }
          })
        )
      ),
      open.length ? el('button', { class: 'pl-check q-press', type: 'button', disabled: state.checkingShown ? '' : null, 'aria-label': t('checkResults'), text: state.checkingShown ? t('checking') : t('checkResults'), onclick: () => checkResults(true, { shown: true }) }) : null
    ]),
    ...(order.length
      ? order.map(key =>
          el('section', { class: `q-section pl-group group-${key.split('|')[0]}` }, [
            el('div', { class: 'q-section-head' }, [el('h2', { text: groupTitle(key) }), groupSummary(key, groups.get(key))]),
            el('div', { class: 'pl-slips' }, groups.get(key).map(savedSlipCard))
          ])
        )
      : [kitUI.empty({ title: t('filterEmpty') })]),
    hidden > 0 && !state.showAllSaved ? el('button', { class: 'pl-fold q-press', type: 'button', onclick: () => ((state.showAllSaved = true), renderSaved()) }, [el('span', { class: 'pl-fold-text', text: t('savedMore', { n: hidden }) }), el('i', { class: 'pl-chev', 'aria-hidden': 'true' })]) : null].filter(Boolean)
  );
}

// ---- History: stats and analysis --------------------------------------------------

function renderStats() {
  // Drawn only when on screen: it can start the crowd simulation.
  if (!state.accountReady || state.tab !== 'history' || state.historyView !== 'stats') return;
  $('stats').hidden = false;
  statsUi.render($('stats-body'));
}

function fmtCount(n) {
  return fmtInt(Math.round(n));
}

// The loading screen: the Quadra one, the same in every app (icon, name,
// spinner, nothing more). Callers still pass what's loading and how far
// along; it isn't shown.
function showLoading() {
  $('loading').hidden = false;
}

function hideLoading() {
  $('loading').hidden = true;
}

// ---- Number fields ---------------------------------------------------------------------

// Numbers are typed on the phone's own number keyboard, as in Quadra
// Securities (inputmode numeric, no autocomplete), not a pad of the page's
// own: digits only, at most `digits` of them; Enter (the keyboard's Go/Done)
// runs `onEnter`, and leaving the field commits it (its change event).
function numberField(input, { digits = 7, onEnter = null } = {}) {
  input.setAttribute('inputmode', 'numeric');
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('enterkeyhint', onEnter ? 'go' : 'done');
  input.setAttribute('pattern', '[0-9]*');
  input.addEventListener('input', () => {
    const clean = input.value.replace(/\D/g, '').slice(0, digits);
    if (clean !== input.value) input.value = clean;
  });
  input.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    input.dispatchEvent(new Event('change', { bubbles: true }));
    onEnter ? onEnter(input.value) : input.blur();
  });
}

// F1: one card, a tab per market (the winner, places, head to heads, the
// winning team, and safety car, VSC and red flag each on their own).
// Each flag market's board, as the race shows it (icons.js).
const FLAG_KINDS = new Set(['f1sc', 'f1vsc', 'f1red']);
const F1_TABS = [
  { kind: 'f1', tab: 'f1WinnerTab', sub: null, notes: ['f1Intro', 'f1PhaseNote'] },
  { kind: 'f1pole', tab: 'f1PoleShort', sub: 'f1PoleSub', notes: ['f1PoleNote'], shown: 10 },
  { kind: 'f1podium', tab: 'f1PodiumShort', sub: 'f1PodiumSub', notes: ['f1PodiumNote'], shown: 10 },
  { kind: 'f1top6', tab: 'f1Top6Short', sub: 'f1Top6Sub', notes: ['f1PodiumNote'], shown: 10 },
  { kind: 'f1top10', tab: 'f1Top10Short', sub: 'f1Top10Sub', notes: ['f1PodiumNote'], shown: 12 },
  { kind: 'f1h2h', tab: 'f1H2HShort', sub: 'f1H2HSub', notes: ['f1PodiumNote'], shown: 10 },
  { kind: 'f1team', tab: 'f1TeamShort', sub: 'f1TeamSub', notes: ['f1PodiumNote'] },
  { kind: 'f1sc', tab: 'f1Sc', sub: 'f1ScSub', notes: ['f1FlagsNote'], flag: true },
  { kind: 'f1vsc', tab: 'f1Vsc', sub: 'f1VscSub', notes: ['f1FlagsNote'], flag: true },
  { kind: 'f1red', tab: 'f1Red', sub: 'f1RedSub', notes: ['f1FlagsNote'], flag: true }
];
// The race in the games list on its day: one section, one row opening its board.
function f1Section() {
  const t = state.t;
  const f1 = state.data?.f1;
  if (!f1 || !inSport('f1') || f1Day() !== state.day) return null;
  const tabs = F1_TABS.filter(x => state.bets.some(b => b.kind === x.kind));
  if (!tabs.length) return null;
  return gameSectionOf([leagueImg('f1', 'logo-xs'), el('span', { text: t('sport_f1') })], [
    el('button', { class: 'q-ritem chevron pl-fut', type: 'button', onclick: () => openBoard('f1') }, [
      el('span', { class: 'pl-fut-logo' }, leagueImg('f1', 'logo-sm')),
      el('span', { class: 'q-ritem-text' }, [el('span', { class: 'q-ritem-title', text: raceName(f1.title, state.locale) }), el('small', { text: `${hhmm(f1.startUtc)} · ${t(f1.phase === 'pre' ? 'f1PhasePre' : 'f1PhasePost')}` })]),
      el('span', { class: 'q-ritem-value', text: t('marketsN', { n: tabs.length }) })
    ])
  ]);
}
const gameSectionOf = (title, rows) => el('section', { class: 'q-section' }, [el('div', { class: 'q-section-head' }, [el('h2', { class: 'pl-league-h' }, title)]), el('div', { class: 'q-rowcard' }, rows)]);
// F1's board: a tab per market (the winner, places, head to heads, the
// winning team, and safety car, VSC and red flag each on their own).
function f1Board() {
  const t = state.t;
  const f1 = state.data?.f1;
  const tabs = F1_TABS.filter(x => state.bets.some(b => b.kind === x.kind));
  if (!f1 || !tabs.length) return null;
  const current = tabs.find(x => x.kind === state.f1Tab) ?? tabs[0];
  const list = state.bets.filter(b => b.kind === current.kind);
  // A market with a pick on the slip: a dot on its tab.
  const picked = kind => state.parlay.some(id => state.bets.find(b => b.id === id)?.kind === kind);
  const tabRow = el(
    'div',
    { class: 'q-chips market-tabs', role: 'tablist', 'aria-label': t('moreMarkets') },
    tabs.map(x =>
      el('button', {
        type: 'button',
        role: 'tab',
        class: picked(x.kind) ? 'q-chip has-pick' : 'q-chip',
        'aria-selected': String(x === current),
        'aria-pressed': String(x === current),
        text: t(x.tab),
        onclick: () => {
          state.f1Tab = x.kind;
          renderGameSheet();
        }
      })
    )
  );
  requestAnimationFrame(() => {
    const on = tabRow.querySelector('[aria-selected="true"]');
    if (on && tabRow.scrollWidth > tabRow.clientWidth) tabRow.scrollLeft = Math.max(0, on.offsetLeft - (tabRow.clientWidth - on.offsetWidth) / 2);
  });
  // A head to head: both drivers' faces (the pick in front) and their surnames ("Verstappen 勝 Hadjar").
  const picture = b =>
    current.flag
      ? icon(b.kind, 'flag-badge')
      : b.kind === 'f1team'
        ? constructorBadge(b.team)
        : b.kind === 'f1h2h'
          ? el('span', { class: 'h2h-faces' }, [driverBadge(b.driverEn), driverBadge(b.rival, 'h2h-rival')])
          : driverBadge(b.driverEn);
  const sub = b => (current.flag || b.kind === 'f1team' ? null : state.locale === 'zh' ? f1Constructor(b.driver.team).zh || b.driver.team : b.driver.team);
  const title = b => (b.kind === 'f1h2h' ? `${shortDriver(b.driverEn)} ${t('f1H2HBeats')} ${shortDriver(b.rival)}` : b.shortLabel);
  return {
    title: [leagueImg('f1', 'logo-xs'), el('span', { text: t('sport_f1') })],
    body: boardBody({
      emblem: 'f1',
      title: raceName(f1.title, state.locale),
      sub: `${fmtTime(f1.startUtc)} · ${t(f1.phase === 'pre' ? 'f1PhasePre' : 'f1PhasePost')}`,
      tabs: tabStrip(tabRow),
      lead: current.sub ? t(current.sub) : null,
      entries: list.map((b, i) => entryRow(b, i, picture(b), sub(b), title(b)))
    })
  };
}
// ============================================================================
// DO NOT REMOVE - iOS Safari "a tap needs two taps" fix.
// ============================================================================
// Empty, passive, page-wide touch/pointer listeners. They do nothing; their
// existence is the fix. iOS WebKit handles a tap differently depending on
// whether the spot touched has touch/pointer listeners; with listeners only
// on some elements a
// gesture there can leave its tap handling stuck, and the next tap
// elsewhere is used up clearing it. With listeners on the whole document
// every tap goes down the same path. Passive, so they never block
// scrolling. Chromium never reproduces this, so no test can catch it.
['touchstart', 'touchend', 'touchcancel', 'pointerdown', 'pointerup', 'pointercancel'].forEach(type => {
  document.addEventListener(type, () => {}, { capture: true, passive: true });
});

// ---- Boot ---------------------------------------------------------------------

function renderAll() {
  renderStatic();
  if (!state.data) return;
  if (state.fromBoard) {
    // The proxy's board: its picks are already priced and tagged (nothing to
    // price here, no futures); the full read replaces them whole.
    state.bets = state.boardBets;
    state.futures = [];
    state.recs = state.boardRecs;
  } else {
    state.bets = buildBets(state.data);
    state.futures = buildFutures(state.data);
    state.recs = recommend(state.bets);
  }
  offersForSlip();
  // (A pick not on the board stays in the slip: its league may still be on
  // its way. The slip shows only the picks it finds; saveSlip lets go of the
  // rest once everything has been read.)
  renderStatus('ok');
  renderTabs();
  renderSportFilter();
  renderDayFilter();
  renderGames();
  renderFutures();
  renderParlay();
  if (state.tab === 'home') drawHome();
  renderAccount();
  renderSaved();
  warmImages();
  loadGameTeams();
}

// The clubs' logos of the leagues read from Kambi (歐冠, 西甲, 巴甲…): ESPN's
// scoreboard, which carries them, isn't read for those, so ESPN's team list
// is, once per league with a side still drawn as a letter, then the board again.
const teamsAsked = new Set();
function loadGameTeams() {
  const games = [...(state.data?.games ?? []), ...(state.liveGames ?? [])];
  const missing = new Set();
  for (const g of games) {
    if (!g?.sport || teamsAsked.has(g.sport) || !LEAGUES[g.sport]?.path) continue;
    if (['home', 'away'].some(side => g[side]?.en && !/\//.test(g[side].en) && !teamUrl(g.sport, g[side].en))) missing.add(g.sport);
  }
  if (!missing.size) return;
  for (const sport of missing) teamsAsked.add(sport);
  Promise.all([...missing].map(sport => loadLeagueTeams(sport).catch(() => false))).then(got => got.some(Boolean) && renderAll());
}

// Start-up keeps the loading screen until the board is really there: the
// main odds, every other league (each drawn as it arrives) and the games in
// play, within BOOT_FULL_MS, then the logos in view.
// Everything a scroll or a tab away (championship boards, their club logos,
// the other tabs' pictures) loads in the background after the page opens.
// The page never opens empty: past BOOT_LIMIT_MS (a very slow connection)
// it opens with whatever has arrived.
const BOOT_LIMIT_MS = 45_000;
// The whole board (every league) before the loading screen goes, at most.
const BOOT_FULL_MS = 9_000;
// The first screen's logos (only those in view), at most.
const BOOT_IMAGES_MS = 2_500;
// A saved board: the loading screen stays until today's board has replaced
// it (so nothing reshuffles right after it lifts), this long at most; past
// it the saved board opens and today's swaps in when it's ready.
// (2 s, as Orbit Sports opens on what it had: at 6 s Play was the slowest
// app to open every time today's board took its time.)
const SNAPSHOT_WAIT_MS = 2_000;
// A saved board with games likely on (liveHint) and none of them read yet:
// the loading screen waits for them, this long at most.
const SNAPSHOT_LIVE_MS = 6_000;
const within = (promise, ms, fallback) => Promise.race([Promise.resolve(promise).catch(() => fallback), new Promise(resolve => setTimeout(() => resolve(fallback), ms))]);
// Every picture on screen in `root` loaded (or failed): no logo pops in as
// the page opens. Pictures further down wait for their turn (lazy), then
// warmImages fetches them in the background.
function imagesReady(root) {
  const bottom = window.innerHeight;
  const images = [...(root?.querySelectorAll('img') || [])].filter(img => {
    if (!img.getAttribute('src') || img.complete) return false;
    const box = img.getBoundingClientRect();
    return box.height > 0 && box.top < bottom && box.bottom > 0;
  });
  return Promise.all(
    images.map(img => {
      img.loading = 'eager';
      return new Promise(resolve => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      });
    })
  );
}

// Every logo on the page (other tabs, further down, dark-mode versions)
// fetched quietly a few at a time once the first screen is up, so a tab or
// a scroll finds them already loaded.
const warmed = new Set();
let warmTimer = null;
function warmImages() {
  if (state.booting) return;
  clearTimeout(warmTimer);
  warmTimer = setTimeout(() => {
    const urls = new Set();
    for (const img of document.querySelectorAll('main img[src]')) if (!img.complete) urls.add(img.src);
    for (const source of document.querySelectorAll('main picture source[srcset]')) if (matchMedia(source.media || 'all').matches) urls.add(source.srcset);
    const queue = [...urls].filter(u => !warmed.has(u));
    queue.forEach(u => warmed.add(u));
    const next = () => {
      const url = queue.shift();
      if (!url) return;
      const img = new Image();
      img.decoding = 'async';
      img.onload = img.onerror = next;
      img.src = url;
    };
    for (let i = 0; i < 6; i++) next();
  }, 300);
}

// The last board, kept on the device: the page opens on it at once and
// swaps in today's odds when they arrive (bets wait for those). Tied to
// its shape (SNAPSHOT_V: bump it when state.data's shape changes), not to the
// deploy: tying it to the deploy made every open after a new version a cold
// start of many seconds.
const SNAPSHOT_KEY = 'oddsStudy.board';
const SNAPSHOT_V = 2;
// Three days (a phone not opened yesterday still opens at once), the games
// that have started since left out: they'd only go when today's came in.
const SNAPSHOT_MAX_AGE_MS = 3 * 24 * 3_600_000;
let liveHint = [];
function readSnapshot() {
  try {
    const saved = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || 'null');
    if (!saved?.data?.games || saved.v !== SNAPSHOT_V || !(Date.now() - saved.at < SNAPSHOT_MAX_AGE_MS)) return null;
    const now = Date.now();
    // The leagues with a game begun in the last five hours (on now, likely):
    // the loading screen waits for their games in play, and the first live
    // read asks for them all at once (it knew only MLB's and the Premier
    // League's until the boards came in, a second read later: 場中焦點
    // popped in after the saved board opened).
    // Those on at the last open too (the saved board leaves out a game begun
    // before it was saved; the live copy names them, five hours at most).
    let copy = [];
    try {
      const kept = JSON.parse(localStorage.getItem(LIVE_COPY_KEY) || 'null');
      if (kept?.data?.games && now - kept.at < 5 * 3_600_000) copy = kept.data.games.map(g => g.sport);
    } catch {}
    liveHint = [...new Set([...copy, ...saved.data.games.filter(g => Date.parse(g.startUtc) <= now && Date.parse(g.startUtc) > now - 5 * 3_600_000).map(g => g.sport)])];
    saved.data.games = saved.data.games.filter(g => !(Date.parse(g.startUtc) <= now));
    return saved.data;
  } catch {
    return null;
  }
}
let snapshotTimer = null;
function saveSnapshot() {
  clearTimeout(snapshotTimer);
  snapshotTimer = setTimeout(() => {
    if (!state.data || state.fromSnapshot) return;
    try {
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ v: SNAPSHOT_V, at: Date.now(), data: state.data }));
    } catch {
      try {
        localStorage.removeItem(SNAPSHOT_KEY);
      } catch {}
    }
  }, 1000);
}

// ---- The proxy's board (/data/play/board.json) ------------------------------------
//
// Built on the proxy every ten minutes (the games of the next 72 hours with
// their winners, handicaps and best picks priced by the kit, and the lottery's
// jackpots): start-up reads that one file instead of every league's odds
// (about 138 reads), draws the home from it, and reads the full board only
// when a tab, a game or a pick needs it (wantFull). Missing, older than 30
// minutes, another shape version or the kit's file not loading:
// nothing changes, the saved board and the per-league reads run as before.
const BOARD_READ_MS = 4_000;
// How long start-up waits for the file before the saved board and the league reads go ahead without it.
const BOARD_WAIT_MS = 1_500;
const readPlayBoard = () => readBoard({ packJson: kit.packJson, timeout: BOARD_READ_MS });
// The board's games and picks as state.data and the picks Play names; the
// league tiles' counts (14 days) and the lottery's jackpots ride along.
function takeBoard({ file, mod }) {
  try {
    const { games, bets, recs } = mod.unpackBoard(file);
    const name = namer();
    state.boardBets = bets.map(b => name(b.game, b));
    state.boardRecs = recs;
    state.board = file;
    state.data = { games, futures: [], f1: null, loadedAt: file.built };
    state.fromBoard = state.fromSnapshot = true;
    // The leagues that may have a game on now: the first live read asks them all at once.
    if (Array.isArray(file.live)) liveHint = [...new Set([...liveHint, ...file.live])];
    return true;
  } catch (error) {
    console.error(error);
    Object.assign(state, { data: null, board: null, boardBets: null, boardRecs: null, fromBoard: false, fromSnapshot: false });
    return false;
  }
}
// The full read (load): every league, futures, the race. Once, when something
// needs more than the board holds; asked again only if it failed.
let fullRead = null;
function wantFull() {
  if (!state.fromBoard) return null;
  fullRead ??= load().finally(() => {
    fullRead = null;
  });
  return fullRead;
}
// Opened on the board: the loading screen goes once the balance and the games
// on now are in (as the full read waited for them), a moment at most.
async function openOnBoard() {
  const wait = liveHint.length && !state.liveData ? SNAPSHOT_LIVE_MS : SNAPSHOT_WAIT_MS;
  await within(Promise.all([state.accountIn, liveBusy || refreshLive()]), wait);
  if (state.tab === 'home') drawHome();
  if (state.booting) {
    await within(imagesReady($('panel-' + state.tab)), 800);
    state.booting = false;
    hideLoading();
    warmImages();
  }
  if (state.wantSlip) ((state.wantSlip = false), openSlip());
}
// Back after a while: the board again (one read), or the full read when it has aged out.
async function refreshBoard() {
  if (!state.fromBoard) return;
  const board = await readPlayBoard();
  if (!state.fromBoard) return;
  if (!board || !takeBoard(board)) return void wantFull();
  renderAll();
}

async function load() {
  const startedAt = Date.now();
  renderStatus('loading');
  const booting = state.booting;
  const onProgress = booting ? () => showLoading() : undefined;
  // A saved board is already up (boot): the loading screen isn't brought back over it.
  if (booting && !state.fromSnapshot) onProgress(0);
  const open = () => {
    if (!state.booting) return;
    state.booting = false;
    hideLoading();
    warmImages();
  };
  // Past the limit the page opens with whatever has arrived; the rest joins as it comes.
  const limit = booting
    ? setTimeout(() => {
        if (state.data) renderAll();
        open();
      }, BOOT_LIMIT_MS)
    : null;
  setBusy(true);
  // The last board saved opens the page at once (boot drew it while signing
  // in); today's replaces it below.
  // (Opened on the proxy's board, the full read starts later, when a tab, a game or a pick needs it, and swaps in the same way.)
  const saved = (booting || state.fromBoard) && state.fromSnapshot ? state.data : null;
  // The first screen is the balance and the games on now as well as the
  // board: the loading screen waits for the account (read and merged with
  // the pass) and the live games too.
  // (The games in play: the read on its way, or one now.)
  const firstScreen = () => Promise.all([state.accountIn, liveBusy || refreshLive()]);
  // Games likely on and none read (the saved copy is a quarter-hour old at most): the first screen waits longer for them.
  const liveWait = () => (liveHint.length && !state.liveData ? SNAPSHOT_LIVE_MS : SNAPSHOT_WAIT_MS);
  if (saved) {
    // Only if today's board is slow (SNAPSHOT_WAIT_MS): the saved one opens,
    // with the games on now (those it waits for a little longer).
    setTimeout(async () => {
      if (!state.booting) return;
      if (liveHint.length && !state.liveData) await within(liveBusy || refreshLive(), SNAPSHOT_LIVE_MS - SNAPSHOT_WAIT_MS);
      if (!state.booting) return;
      clearTimeout(limit);
      if (state.tab === 'home') drawHome();
      open();
    }, SNAPSHOT_WAIT_MS);
  }
  try {
    // The main board and every other league read at once (the request queue
    // serves the main board's first); the other leagues used to start only
    // once the main board was in, which held the loading screen a few
    // seconds longer than either needed.
    const now = new Date();
    const freshIn = loadOdds(now, saved ? undefined : onProgress);
    const addGames = games => {
      if (!games.length || !state.data) return;
      const ids = new Set(state.data.games.map(g => g.id));
      state.data.games = [...state.data.games, ...games.filter(g => !ids.has(g.id))].sort((a, b) => a.startUtc.localeCompare(b.startUtc));
    };
    // The other leagues join one by one as each is read (a slow one holds
    // back no other), drawn together a moment after the last to arrive.
    const pending = [];
    let joining = false;
    let drawTimer = 0;
    const join = () => {
      if (!joining || !pending.length) return;
      addGames(pending.splice(0));
      clearTimeout(drawTimer);
      drawTimer = setTimeout(() => {
        renderAll();
      }, 250);
    };
    const extraGames = loadExtraLeagues(now, games => (pending.push(...games), join())).catch(error => (console.error(error), []));
    const extraFutures = loadExtraFutures().catch(error => (console.error(error), []));
    // Their scoreboards tell which leagues have a game on: the live board
    // again, as soon as they're in (the main board's often later, and its
    // drawing a second more). The first screen waits for this one: every
    // league's games in play.
    const liveIn = extraGames.then(() => refreshLive({ now: true }));
    const fresh = await freshIn;
    if (saved) {
      // Swapped in whole (every league's games that came in time, the live
      // games too), so the list doesn't shrink to the main leagues and grow
      // back; a league later than that joins as it comes.
      // Already open on the saved board: today's waits until it's whole
      // (BOOT_FULL_MS at most) and swaps in once, not league by league.
      const elapsed = Date.now() - startedAt;
      await within(Promise.all([liveIn, firstScreen()]), state.booting ? Math.max(500, liveWait() - 300 - elapsed) : Math.max(1_000, BOOT_FULL_MS - elapsed));
      const ids = new Set(fresh.games.map(g => g.id));
      fresh.games = [...fresh.games, ...pending.splice(0).filter(g => !ids.has(g.id))].sort((a, b) => a.startUtc.localeCompare(b.startUtc));
      const futures = await within(extraFutures, 300, null);
      if (futures) {
        const keys = new Set(fresh.futures.map(f => f.key));
        fresh.futures = [...fresh.futures, ...futures.filter(f => !keys.has(f.key))];
      }
      state.data = fresh;
      state.fromSnapshot = false;
      state.fromBoard = false;
      joining = true;
      renderAll();
      // A game sheet opened on the board's game: its markets are read now.
      renderGameSheet();
      if (state.booting) {
        await within(imagesReady($('panel-' + state.tab)), 800);
        clearTimeout(limit);
        open();
      }
      warmImages();
      extraGames.then(() => (join(), saveSnapshot()));
      saveSnapshot();
      if (!futures)
        extraFutures.then(async more => {
          const keys = new Set(state.data.futures.map(f => f.key));
          state.data.futures = [...state.data.futures, ...more.filter(f => !keys.has(f.key))];
          renderAll();
          saveSnapshot();
          await loadFutureTeams(state.data.futures).catch(() => {});
          renderFutures();
          warmImages();
        });
      else loadFutureTeams(state.data.futures).then(() => (renderFutures(), warmImages())).catch(() => {});
      return;
    }
    state.data = fresh;
    joining = true;
    join();
    // A tab asked for in the address (#sim) that needed the odds opens now.
    if (state.wantedTab && state.tab !== state.wantedTab && tabAvailable(state.wantedTab)) state.tab = state.wantedTab;
    state.wantedTab = null;
    const addFutures = futures => {
      if (!futures.length || !state.data) return;
      const keys = new Set(state.data.futures.map(f => f.key));
      state.data.futures = [...state.data.futures, ...futures.filter(f => !keys.has(f.key))];
    };
    renderAll();
    if (state.wantSlip) ((state.wantSlip = false), openSlip());
    if (booting) {
      // The loading screen stays until the whole board is in: every league
      // and the games in play (each league drawn as it arrives, behind it),
      // then the logos of the first screen; past BOOT_FULL_MS it opens with
      // what has come and the rest keeps joining.
      await within(Promise.all([liveIn, firstScreen()]), Math.max(1_000, BOOT_FULL_MS - (Date.now() - startedAt)));
      clearTimeout(drawTimer);
      renderAll();
      await within(imagesReady($('panel-' + state.tab)), BOOT_IMAGES_MS);
      clearTimeout(limit);
      open();
    }
    // Once every league is in: kept for the next visit.
    extraGames.then(() => {
      warmImages();
      saveSnapshot();
    });
    extraFutures.then(async futures => {
      addFutures(futures);
      renderAll();
      saveSnapshot();
      // The clubs' logos: ESPN's team lists for the boards' leagues, then the boards again.
      await loadFutureTeams(state.data.futures).catch(() => {});
      renderFutures();
      warmImages();
    });
  } catch (error) {
    console.error(error);
    renderStatus('error');
  } finally {
    clearTimeout(limit);
    open();
    setBusy(false);
  }
}

// ---- Tabs ---------------------------------------------------------------------

// Four tabs like every Quadra app; the slip (投注單) is a sheet over any of
// them, opened from the bar above the tab bar (openSlip).
const TABS = ['home', 'games', 'lottery', 'history'];

function tabAvailable() {
  return true;
}

const TAB_ICONS = { home: 'home', games: 'calendar', lottery: 'balls', history: 'history' };

// A sheet of the kit's under the id the app addresses it by (#slip-sheet, #game-sheet): built on open, gone on close.
function kitSheet(id, { title, cls, body, onClose }) {
  const old = $(id);
  if (old?.open) return old;
  old?.remove();
  const sh = kitUI.sheet({ title, body, cls, detent: 'large', closeLabel: state.t('close'), onClose });
  sh.el.id = id;
  return sh.el;
}
// The refresh control (a button on a computer, a pull on a phone): held off while loading.
let actions = null;
const setBusy = on => {
  const r = actions?.refresh ?? $('refresh');
  if (r) r.disabled = on;
};
const slipOpen = () => Boolean($('slip-sheet')?.open);
function openSlip() {
  const dialog = kitSheet('slip-sheet', {
    title: state.t('parlayTitle'),
    cls: 'slip-sheet',
    body: [Object.assign(el('div'), { id: 'parlay-body' })],
    onClose: () => renderSlipBar()
  });
  dialog.querySelector('.q-sheet-head h2')?.setAttribute('id', 'parlay-title');
  wantFull();
  renderParlay();
  dialog.scrollTop = 0;
  renderSlipBar();
  if (state.parlay.some(id => id.startsWith('live|'))) refreshLive();
}
function closeSlip() {
  if ($('slip-sheet')?.open) kit.closeSheet($('slip-sheet'));
}

// ---- A game's sheet: every market of one game, over any tab ---------------------
//
// Opening a game used to unfold its card in the board, which pushed the page
// about (more so while its markets and pictures were still arriving). Now a
// game opens in a sheet like Orbit Sports' match sheet: the board under it
// never moves, and redraws (markets arriving, live prices) keep the sheet's place.
const gameSheetOpen = () => Boolean($('game-sheet')?.open);
// A game by id, live or not, with its picks (null: gone from the board).
function sheetGameOf(id) {
  const live = state.liveGames?.find(g => g.id === id);
  if (live) return { game: live, bets: (state.liveBets || []).filter(b => b.gameId === id) };
  const game = state.data?.games.find(g => g.id === id);
  return game ? { game, bets: (state.bets || []).filter(b => b.gameId === id) } : null;
}
function renderGameSheet() {
  if (!gameSheetOpen() || !state.sheetGame) return;
  const t = state.t;
  const keep = $('game-sheet').scrollTop;
  redraw($('game-sheet'), () => {
    // A board (F1, a championship) or a game.
    const id = state.sheetGame;
    const board = id === 'board:f1' ? f1Board() : id.startsWith('board:fut|') ? futuresBoard(id.slice('board:fut|'.length)) : null;
    const found = board ? null : sheetGameOf(id);
    $('game-sheet-title').replaceChildren(...(board ? board.title : found ? [leagueImg(found.game.sport, 'logo-xs'), el('span', { text: gameSeries(found.game) })] : []));
    $('game-sheet-body').replaceChildren(board ? board.body : found ? gameDetail(found.game, found.bets) : kitUI.empty({ title: t('gameGone') }));
  });
  renderSlipBar();
  $('game-sheet').scrollTop = keep;
}
function openGameSheet(id) {
  const found = id.startsWith('board:') || sheetGameOf(id);
  if (!found) return;
  // The board's game has no markets of its own yet: the full read brings them (the sheet redraws then).
  wantFull();
  closeSlip();
  state.sheetGame = id;
  const dialog = kitSheet('game-sheet', {
    title: '',
    cls: 'game-sheet',
    body: [Object.assign(el('div'), { id: 'game-sheet-body' }), Object.assign(el('button'), { id: 'game-sheet-bar', className: 'slip-bar in-sheet', type: 'button', hidden: true, onclick: () => (closeGameSheet(), openSlip()) })],
    onClose: () => {
      state.sheetGame = null;
      marketTall.game = null;
      renderSlipBar();
    }
  });
  const title = dialog.querySelector('.q-sheet-head h2');
  title?.setAttribute('id', 'game-sheet-title');
  title?.classList.add('game-sheet-title');
  renderGameSheet();
  dialog.scrollTop = 0;
  if (found.game?.live) refreshLive();
}
// F1's or a championship's board, in the same sheet.
const openBoard = key => openGameSheet(`board:${key}`);
function closeGameSheet() {
  if ($('game-sheet')?.open) kit.closeSheet($('game-sheet'));
}
const tabNav = tabBar({ tabs: TABS.map(id => ({ id, label: state.t(`tab_${id}`), icon: TAB_ICONS[id] })), onSelect: (tab, { again }) => !again && showTab(tab) });
function renderTabs() {
  if (!tabAvailable(state.tab)) state.tab = 'home';
  for (const tab of TABS) tabNav.hide(tab, !tabAvailable(tab));
  // Every tab starts at its top: what was opened on it folds when it's left.
  tabNav.select(state.tab, { top: true });
}

// Everything opened on a tab folds back when you leave it (a game's 更多玩法,
// every folding card), so coming back starts tidy, not where you left off.
function collapseAll() {
  const had = state.dayPicked;
  // Back to the earliest day as well.
  state.dayPicked = false;
  for (const d of document.querySelectorAll('.tab-panel details[open]')) d.open = false;
  if (had && state.data) {
    renderDayFilter();
    renderGames();
  }
}

function showTab(tab) {
  // Going anywhere (a bet placed, a tab tapped) puts the slip away.
  closeSlip();
  closeGameSheet();
  // (On the proxy's board the home and 彩券 need nothing more; the games and 紀錄 read every league.)
  if (tab === 'games' || tab === 'history') wantFull();
  if (tab !== state.tab) collapseAll();
  state.tab = tab;
  renderTabs();
  renderSlipBar();
  if (tab === 'home') drawHome();
  if (tab === 'lottery') lotteryUi?.render();
  if (tab === 'history') renderStats();
  // The tab's live games and open bets, now rather than at the next beat.
  livePulse();
}

$('game-search').addEventListener('input', event => {
  wantFull();
  state.query = event.target.value.trim();
  if (state.data) renderGames();
});
{
  const fromHash = location.hash.slice(1);
  if (TABS.includes(fromHash)) state.tab = state.wantedTab = fromHash;
  if (fromHash === 'slip') state.wantSlip = true;
  if (fromHash === 'tickets') ((state.tab = state.wantedTab = 'history'), (state.historyView = 'tickets'));
}
window.addEventListener('hashchange', () => {
  const hash = location.hash.slice(1);
  // A notice's tap: its tab, or 紀錄's tickets.
  if (hash === 'tickets') return showTickets();
  if (hash === 'slip') return openSlip();
  if (TABS.includes(hash)) return showTab(hash);
});
// Opens a game (home's featured cards): its sheet with every market, over
// whichever tab is showing; no tab switch, no scrolling the board.
function openGame(id) {
  if (!sheetGameOf(id)) return showTab('games');
  openGameSheet(id);
}

// Redraw only when the width changes: phones fire resize when the address bar
// slides away, and that shouldn't reset the chart.
let resizeTimer;
let lastWidth = window.innerWidth;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
  }, 150);
});

// The same top-right in every Quadra app: help, refresh, then the account.
actions = topActions(q, { refresh: load });

// Big numbers on one line: each of these shrinks its font (down to 60%) to
// fit its box, instead of wrapping onto a second row on phones. Checked when
// its text changes and when its box resizes (which also covers a tab showing
// it for the first time). Only the slip and simulator
// have such numbers (and 首頁's picks' names, a ticket's picks and their
// second lines, and 你的投注's rows: a long name a little smaller, not cut). All reads, then all writes, so the page lays out once.
const FIT_SELECTOR = '.slip-bar-main small, .stat-value, .pay-cell strong, .pay-big, .pl-balance, .pl-combo-pay strong, .lt-big, .lt-hero-big, .saved-legs .leg-pick strong, .saved-legs .leg-sub:not(.leg-score-line), .player-line strong, .buy strong';
function fitNumbers(nodes) {
  for (const node of nodes) node.style.fontSize = '';
  const sizes = nodes.map(node => {
    // (Fractional widths: whole pixels rounded a 64.4px number into a 64px
    // box, which then showed 11,7… instead of shrinking.)
    const box = node.getBoundingClientRect().width;
    const range = document.createRange();
    range.selectNodeContents(node);
    const need = range.getBoundingClientRect().width;
    if (!box || need <= box) return null;
    const full = parseFloat(getComputedStyle(node).fontSize);
    return Math.max(full * 0.6, Math.floor(((full * (box - 0.5)) / need) * 10) / 10);
  });
  nodes.forEach((node, i) => sizes[i] && (node.style.fontSize = `${sizes[i]}px`));
  // Text doesn't narrow exactly with its size (−NT$1,052 at 13.2px was still
  // 75.9px in a 75px box, so cut): each one shrunk is checked again and
  // stepped down until it fits.
  // (In rounds, every one read and then every one written: a node at a time
  // laid the page out again at each step.)
  let left = nodes.map((node, i) => sizes[i] && { node, size: sizes[i], floor: sizes[i] * 0.85 }).filter(Boolean);
  while (left.length) {
    left = left.filter(x => {
      const range = document.createRange();
      range.selectNodeContents(x.node);
      return x.size > x.floor && range.getBoundingClientRect().width > x.node.getBoundingClientRect().width - 0.5;
    });
    for (const x of left) x.node.style.fontSize = `${(x.size -= 0.4)}px`;
  }
}
if ('ResizeObserver' in window) {
  const fitted = new WeakSet();
  const resized = new ResizeObserver(entries => fitNumbers(entries.map(entry => entry.target)));
  const watch = new MutationObserver(mutations => {
    const found = new Set();
    for (const m of mutations) {
      const target = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      if (!target) continue;
      const own = target.closest(FIT_SELECTOR);
      if (own) found.add(own);
      else for (const node of target.querySelectorAll(FIT_SELECTOR)) found.add(node);
    }
    for (const node of found) {
      if (fitted.has(node)) continue;
      fitted.add(node);
      resized.observe(node);
    }
    if (found.size) fitNumbers([...found]);
  });
  // (首頁: a 為你推薦 pick's name, whole in its card.)
  for (const id of ['slip-sheet', 'panel-history', 'panel-home', 'panel-lottery']) if ($(id)) watch.observe($(id), { childList: true, subtree: true, characterData: true });
  // Fitted before the font came, a number widens when it comes while its box
  // (already at its narrowest) doesn't move: fitted again once fonts load.
  document.fonts?.addEventListener('loadingdone', () => fitNumbers([...document.querySelectorAll(FIT_SELECTOR)]));
}

// Tells the page's failsafe (in index.html) that the scripts loaded and started.
window.__fxStarted = true;
// Phones and tablets: from the home screen only. Always the newest deploy.
const gated = installGate('odds', state.locale);
watchUpdates({ current: document.querySelector('meta[name="build-version"]')?.content, key: 'oddsStudy', cachePrefix: 'quadra-odds-' });
renderStatic();
renderTabs();
let tasteWas = '';
q.on('wallet', wallet => {
  state.wallet = wallet;
  renderAccount();
  renderParlay();
  // What 為你推薦 comes from changed (the pass's follows came in): home again.
  const taste = tasteKey(wallet);
  if (taste !== tasteWas && state.data && state.tab === 'home' && !state.booting) drawHome();
  tasteWas = taste;
});
q.on('active', live => {
  if (!live) return;
  syncNow();
  if (state.data) checkResults(true);
});

// What a parlay of these picks pays if all win (after tax, boost included).
function parlayPays(bets, stake) {
  const legs = bets.map(b => ({ gameId: b.gameId, market: b.market ?? b.kind, odds: effectiveOdds(b) }));
  return slipPayoutTable({ legs, sizes: [legs.length], stake }).net[(1 << legs.length) - 1];
}

// What the home tab and the lottery need from here.
// Home drawn again, its pictures kept.
function drawHome() {
  redraw($('home-body'), () => renderHome(homeCtx()));
}
function homeCtx() {
  // A ready-made parlay onto the slip in one tap (replacing what's there).
  const takeParlay = ids => {
    state.parlay = [...ids];
    state.slipMode = 'parlay';
    state.modeChosen = false;
    slipChanged();
    openSlip();
  };
  // A live game's card on the games tab, open with its markets (null: the live list's top).
  const openLive = id => {
    if (id && sheetGameOf(id)) return openGameSheet(id);
    state.tab = 'games';
    state.sport = 'all';
    state.query = '';
    state.day = dayKey(new Date().toISOString());
    state.dayPicked = true;
    renderAll();
    showTab('games');
    requestAnimationFrame(() => (id ? document.querySelector(`[data-game="${CSS.escape(id)}"]`) : $('live'))?.scrollIntoView({ block: id ? 'center' : 'start', behavior: 'smooth' }));
  };
  // The games tab with its search open.
  const openSearch = () => {
    showTab('games');
    scrollTo({ top: 0 });
    requestAnimationFrame(() => $('game-search').focus());
  };
  // Home's 彩券 card and the way into a game's sheet.
  const lotteryHome = () => lotteryUi?.homeLead?.() ?? null;
  const lotteryOpen = id => (showTab('lottery'), lotteryUi?.openGame?.(id));
  return {
    openSearch, effectiveOdds,
    logoUrl: (sport, en) => (/\//.test(en || '') ? null : teamLogo(sport, en) ?? findTeamLogo(futureTeamLeagues(sport), en) ?? (countryCode(en) ? flagUrl(countryCode(en)) : null)),
    leagueUrl: sport => leagueLogo(sport),
    lotteryHome, lotteryOpen, showTickets,
    openSlip: () => openSlip(),
    slipCount: () => slipLegs().legs.length, state, q, el, fmtMoney, fmtOdds, fmtTime, gameTime, legWhen, shortTeam: (sport, team) => shortTeamName(sport, team.en, teamName(team)), shortPick, legIcon, teamName, logoImg, leagueImg, toggleLeg, takeParlay, showTab, openGame, openLive, liveStateText, betKeys, track, funds, leagueTier: shownTier, winnerSides, parlayPays, boostPct: n => Math.round(boostRate(n) * 100) };
}
statsUi = mountStats({ state, q, el, fmtMoney, showTab, sportName: key => (key === 'mixed' ? state.t('sportMixed') : state.t(`sport_${key}`) === `sport_${key}` ? String(key).toUpperCase() : state.t(`sport_${key}`)) });
lotteryUi = mountLottery({ state, q, el, fmtMoney, funds, commitAccount, track, getAccount: () => state.account, syncNow, showTickets, setWallet: w => w && (state.wallet = w), redrawHome: () => drawHome(), boardLottery: () => (state.board ? boardLottery(state.board) : null) });

// The saved board, drawn while signing in (a network round trip).
// The games on now as last read (15 minutes at most): a reopen draws 場中焦點
// at once from it (it came in seconds after the loading screen lifted), its
// prices dimmed and not taken until today's read swaps them in place.
const LIVE_COPY_KEY = 'play.live.v1';
function saveLiveCopy(data) {
  try {
    localStorage.setItem(LIVE_COPY_KEY, JSON.stringify({ at: Date.now(), data }));
  } catch {}
}
function readLiveCopy() {
  try {
    const kept = JSON.parse(localStorage.getItem(LIVE_COPY_KEY) || 'null');
    return kept?.data && Date.now() - kept.at < 15 * 60_000 ? kept.data : null;
  } catch {
    return null;
  }
}
// The saved board taken in, not drawn yet (drawSnapshot): today's reads
// go out before its pricing.
function takeSnapshot(board) {
  // The proxy's board when it is fresh, else the saved one.
  if (board && takeBoard(board)) return finishTake();
  const saved = storedAccount() ? readSnapshot() : null;
  if (!saved) return;
  state.data = saved;
  state.fromSnapshot = true;
  finishTake();
}
function finishTake() {
  const live = readLiveCopy();
  if (live && !state.liveData) {
    const { games, bets } = buildLiveBets(live);
    Object.assign(state, { liveData: live, liveStale: true, liveGames: games, liveBets: bets, liveRecs: recommend(bets) });
  }
  if (state.wantedTab && tabAvailable(state.wantedTab)) state.tab = state.wantedTab;
  state.wantedTab = null;
}
function drawSnapshot() {
  // (Today's board already in: nothing to draw.)
  if (!state.fromSnapshot) return;
  try {
    renderAll();
  } catch (error) {
    // A saved board this version can't draw: a normal start.
    console.error(error);
    state.data = null;
    state.fromSnapshot = false;
    // (A board it can't draw: the full read, which start-up held back.)
    if (state.fromBoard) {
      state.fromBoard = false;
      state.board = null;
      fullRead = load().finally(() => (fullRead = null));
    }
  }
}
// The slip being made (picks not bought yet) stays on this device, under
// the pass: closed and opened again, it's as it was. Saved only when the
// person changes it (a board still loading never saves a pick away); a pick
// whose game is no longer offered just isn't shown. Buying the slip or
// clearing it empties it. Signing out wipes it with the rest.
const slipKey = () => (q.pass ? `play.slip:${q.pass}` : '');
let slipRestored = false;
function restoreSlip() {
  slipRestored = true;
  try {
    const saved = JSON.parse(localStorage.getItem(slipKey()) || 'null');
    if (!saved || !Array.isArray(saved.parlay)) return;
    state.parlay = saved.parlay.filter(id => typeof id === 'string').slice(0, SLIP_RULES.maxLegs);
    state.pickedOdds = saved.pickedOdds && typeof saved.pickedOdds === 'object' ? saved.pickedOdds : {};
    if (['single', 'parlay', 'system'].includes(saved.mode)) state.slipMode = saved.mode;
    state.modeChosen = saved.modeChosen === true;
    if (Array.isArray(saved.sizes) && saved.sizes.length) state.slipSizes = new Set(saved.sizes.filter(k => k === 'all' || Number.isInteger(k)));
  } catch {}
}
function saveSlip() {
  const key = slipKey();
  if (!slipRestored || !key) return;
  // Once the boards are all in, a pick on none of them is gone for good
  // (championships aside: their boards can come later still).
  if (!state.booting && !state.fromBoard) {
    const found = betById();
    // A pick on a game whose own markets (a player's, corners) aren't read yet stays.
    const waiting = id => gameWaiting(gameOfPick(id));
    state.parlay = state.parlay.filter(id => id.startsWith('fut|') || found.has(id) || waiting(id));
  }
  try {
    if (!state.parlay.length) return void localStorage.removeItem(key);
    const pickedOdds = Object.fromEntries(state.parlay.filter(id => id in state.pickedOdds).map(id => [id, state.pickedOdds[id]]));
    localStorage.setItem(key, JSON.stringify({ parlay: state.parlay, pickedOdds, mode: state.slipMode, modeChosen: Boolean(state.modeChosen), sizes: [...state.slipSizes] }));
  } catch {}
}

async function boot() {
  let accountDone;
  state.accountIn = new Promise(resolve => (accountDone = resolve));
  restoreSlip();
  // Signing in (a round trip) goes out first.
  const starting = q.start();
  // Today's board read while the sign-in is on its way (its reads through
  // the proxy wait for that sign-in, not a second one), not a round trip
  // after it. (Under a sign-in link, after: its hand-off is redeemed first.)
  const handoff = /[#&]q[hp]=/.test(location.hash);
  // The proxy's board, asked at once; the saved board and the league reads
  // wait for it a moment (a slow or missing file: they go ahead without it).
  const board = await within(readPlayBoard(), BOARD_WAIT_MS, null);
  takeSnapshot(board);
  // (A tab asked for in the address that needs every league.)
  if (state.fromBoard && (state.tab === 'games' || state.tab === 'history')) wantFull();
  let loading = state.fromBoard ? openOnBoard() : handoff ? null : load();
  // The saved board is drawn behind the loading screen, which lifts once
  // today's board, the balance and the games on now have replaced it (load:
  // SNAPSHOT_WAIT_MS at most), so nothing moves right after it lifts. Drawn
  // once today's reads have gone out (they wait for the sign-in's reply):
  // drawn before, its first pricing (a second on a fast computer) held
  // them back as long, and the loading screen with them.
  // The balance from this phone's own copy (its account and the pool as last
  // read) while the Pass answers: on a slow connection the sign-in took
  // seconds, and the balance said "—" all that time.
  if (q.pass) {
    state.wallet ||= q.wallet;
    state.account ||= await loadAccount();
  }
  await Promise.race([starting, new Promise(resolve => setTimeout(resolve, 1_500))]);
  await new Promise(resolve => setTimeout(resolve, 0));
  drawSnapshot();
  const first = await starting;
  state.wallet = first.wallet || q.wallet;
  loading ??= load();
  state.account = await loadAccount();
  state.accountReady = true;
  clearGuessedNotices();
  // (Until the Pass's copy is merged in; its save goes on behind.)
  if (first && !first.offline) await mergeFirst(first);
  if (!state.account) {
    state.account = freshAccount();
    saveAccountLocal();
  }
  renderAccount();
  // The slip bar waits for the account (a slip kept on the device shows now).
  renderSlipBar();
  renderSaved();
  lotteryUi.render();
  if (state.tab === 'home' && state.data) drawHome();
  accountDone();
  // The sign-in's reply was the pass's copy and inbox, just merged: asked
  // for again only when it couldn't come (offline).
  if (!first || first.offline) syncNow();
  await loading;
  checkResults();
  if (state.tab === 'home') drawHome();
}
if (!gated) boot();

// Back on the tab: pick up what another device did, and any games that ended.
// After ten minutes or more away, everything opened is folded again.
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') hiddenAt = Date.now();
  else if (hiddenAt && Date.now() - hiddenAt > 10 * 60_000) (collapseAll(), refreshBoard());
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  syncNow();
  // Whatever moved while away, at once.
  livePulse({ force: true });
});

// Opens without a connection: the kit registers the worker and has it keep every file loaded.
keepOffline();
// Every screen is live (an old copy would read as now): no connection, the kit's cover, not the saved copy.
onlineOnly({ zh: '賠率和下注需要網路連線', en: 'Odds and bets need a connection.' });
