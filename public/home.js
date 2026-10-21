// The home tab asks one thing: what to bet on now. Eight sections, in order:
//  1 wallet hero (balance + open bets + most) · 2 quick actions · 3 場中焦點 ·
//  4 為你推薦 · 5 今日焦點賽事 (vertical) · 6 精選串關 · 7 彩券 · 8 最近的投注.
// Each section is built by one small function below, on the kit's components.
import { rank, affinity, welcomeDue, WELCOME, cachedPayload } from '#kit/quadra.mjs';
import { tasteOf, gameInterest, forYouPicks, fixturesTaste, leagueTaste, spreadLeagues } from './lib/foryou.mjs';
import { icon, gameLogo, cardArt } from './icons.js';
import * as kitUI from '#kit/ui.mjs';
import { normalizeTeamName } from '#kit/logos.mjs';
import { familyOf } from './lib/teams.mjs';
import { slipsMost } from './lib/slip.mjs';
import { CARDS } from './lib/scratch.mjs';
import { GAMES } from './lib/lottery.mjs';

const glyph = name => {
  const s = document.createElement('span');
  s.className = 'q-gl';
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = kitUI.icons[name] || '';
  return s;
};

const TXT = {
  zh: {
    balance: 'Quadra 餘額', openBets: '{n} 張投注中 · 全中最多 {m}', search: '搜尋球隊、聯賽', live: '場中', liveTitle: '場中焦點',
    forYou: '為你推薦', featured: '焦點賽事', seeAll: '全部', none: '目前沒有開賣的比賽', draw: '和局',
    overdrawn: '透支 · 月息 1%', cover: '賣出持股補足', welcome: '第一次下注送 {v} 免費投注',
    why_follow: '追蹤', why_backed: '押過', why_league: '你的聯盟', why_sport: '你的運動', why_like: '常看', why_value: '划算', why_steady: '穩', why_shot: '值博',
    combos: '精選串關', comboMine: '為你串 3 場', comboSafe: '穩膽 2 串', comboEven: '均衡 3 串', comboBold: '高賠 4 串', comboTotals: '大小 3 串', comboSpread: '讓分 3 串', comboLeague: '{league} 3 串', comboBoost: '+{b}%', comboStake: '投注 {v}', comboGo: '加入投注單', openN: '投注中', most: '全中最多', unit: '張', actLive: '場中', actGames: '賽事', actLottery: '彩券', actSlip: '投注單', lottery: '彩券', jackpot: '頭獎累積', pickNow: '去選號', recent: '最近的投注', none2: '還沒有投注', won: '贏 {v}', lost: '未中', openTag: '進行中', cashed: '已兌現', ticket: '彩券', scratchT: '刮刮樂', parlayN: '{n} 串 1'
  },
  en: {
    balance: 'Quadra balance', openBets: '{n} open · up to {m}', search: 'Search teams, leagues', live: 'Live', liveTitle: 'Live now',
    forYou: 'For you', featured: 'Featured', seeAll: 'See all', none: 'No games on sale right now', draw: 'Draw',
    overdrawn: 'Overdrawn · 1% a month', cover: 'Sell to cover', welcome: 'First bet: a {v} free bet',
    why_follow: 'Following', why_backed: 'Backed', why_league: 'Your league', why_sport: 'Your sport', why_like: 'Watching', why_value: 'Value', why_steady: 'Steady', why_shot: 'Long shot',
    combos: 'Parlays of the day', comboMine: 'Your treble', comboSafe: 'Safe double', comboEven: 'Balanced treble', comboBold: 'Long-shot 4-fold', comboTotals: 'Totals treble', comboSpread: 'Handicap treble', comboLeague: '{league} treble', comboBoost: '+{b}%', comboStake: 'Stake {v}', comboGo: 'Add to slip', openN: 'Open bets', most: 'Up to', unit: '', actLive: 'Live', actGames: 'Games', actLottery: 'Lottery', actSlip: 'Slip', lottery: 'Lottery', jackpot: 'Jackpot', pickNow: 'Pick numbers', recent: 'Recent bets', none2: 'No bets yet', won: 'Won {v}', lost: 'Lost', openTag: 'Open', cashed: 'Cashed out', ticket: 'Ticket', scratchT: 'Scratch', parlayN: '{n}-leg parlay'
  }
};

// Big money, short: NT$1.59億 / NT$158.8M.
export function compactMoney(x, lang) {
  const plain = `NT$${Math.round(x).toLocaleString('en-US')}`;
  if (lang === 'en') {
    if (x >= 999_950_000) return `NT$${(x / 1e9).toFixed(1)}B`;
    return x >= 999_950 ? `NT$${(x / 1e6).toFixed(1)}M` : plain;
  }
  if (x >= 99_995_000) return `NT$${+(x / 1e8).toFixed(2)}億`;
  if (x >= 99_500) return `NT$${Math.round(x / 1e4).toLocaleString('en-US')}萬`;
  // Under 10萬 one decimal (1.5萬), dropped when whole (2萬).
  if (x >= 1e4) return `NT$${+(x / 1e4).toFixed(1)}萬`;
  return plain;
}

// A team's key as every Quadra app records it (app.js betKeys, foryou.mjs).
const norm = name => normalizeTeamName(String(name || ''));

const TIER_WEIGHT = { major: 0.6, minor: 0.3, thin: 0.05 };

// What 為你推薦 is drawn from on the pass (Orbit Sports' follows, every
// app's affinity): when it changes, home is drawn again (app.js).
export const tasteKey = wallet => JSON.stringify([fixturesTaste(cachedPayload, wallet), Object.keys(affinity(wallet, Date.now(), ['odds', 'stock', 'match'])).sort().slice(0, 40)]);

// 為你推薦 as first drawn, kept while its picks are still on sale: home is
// drawn again on every live read and when the pass's follows come in, and the
// row reshuffled (or filled in) seconds after the page opened.
let mineKept = [];
let grouped = { of: null, map: new Map() };
const groupOnce = list => {
  if (grouped.of === list) return grouped.map;
  const map = new Map();
  for (const b of list || []) {
    if (!b.gameId) continue;
    const had = map.get(b.gameId);
    if (had) had.push(b);
    else map.set(b.gameId, [b]);
  }
  grouped = { of: list, map };
  return map;
};

export function renderHome(ctx) {
  const { state, el, fmtMoney, gameTime } = ctx;
  const root = document.getElementById('home-body');
  if (!root) return;
  const lang = state.locale === 'en' ? 'en' : 'zh';
  const T = TXT[lang];
  const f = (k, v = {}) => String(T[k]).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
  const now = Date.now();
  const money = v => fmtMoney(v, { sign: false });

  // ---- What the person likes: every app's affinity, Orbit Sports' follows.
  const aff = affinity(state.wallet, now, ['odds', 'stock', 'match']);
  const taste = tasteOf({ aff, fixtures: fixturesTaste(cachedPayload, state.wallet), slips: state.account?.slips || [], now });
  const teamKey = (g, side) => `team:${g.sport}:${norm(g[side]?.en ?? g[side])}`;
  // A game's affinity keys, as a pick on it records them (app.js betKeys:
  // the sport by its family, 'sport:baseball', never the league again).
  const gameKeys = g => [`league:${g.sport}`, `sport:${familyOf(g.sport) || g.sport}`, teamKey(g, 'away'), teamKey(g, 'home')];
  // (Each game's picks, gathered once a board: copying a game's list for
  // every pick was most of drawing 首頁 on a full board.)
  const betsOf = groupOnce(state.bets);

  // ---- 為你推薦, then 焦點賽事 (other games, other teams, none already bet on).
  const fresh = forYouPicks({ games: state.data?.games || [], bets: state.bets || [], recs: state.recs || new Map(), taste, now });
  const betById = new Map((state.bets || []).map(b => [b.id, b]));
  const gameById = new Map((state.data?.games || []).map(g => [g.id, g]));
  const kept = mineKept
    .map(x => ({ ...x, bet: betById.get(x.bet.id), game: gameById.get(x.game.id) }))
    .filter(x => x.bet && !x.bet.lock && x.game && Date.parse(x.game.startUtc) > now);
  const mine = kept.length ? kept : fresh;
  mineKept = mine;
  const shownIds = new Set(mine.map(x => x.game.id));
  const shownTeams = new Set(mine.flatMap(x => ['home', 'away'].map(side => teamKey(x.game, side))));
  const later = (state.data?.games || []).filter(g => Date.parse(g.startUtc) > now && !taste.held.has(g.id) && !shownIds.has(g.id) && !shownTeams.has(teamKey(g, 'home')) && !shownTeams.has(teamKey(g, 'away')) && (betsOf.get(g.id) || []).some(b => b.kind === 'ml' && !b.lock));
  const items = later.map(g => {
    const hours = (Date.parse(g.startUtc) - now) / 3_600_000;
    const quality = TIER_WEIGHT[ctx.leagueTier(g.sport)] + (hours < 18 ? 0.3 : hours < 42 ? 0.15 : 0) + gameInterest(g, taste).score * 0.5;
    return { id: `game:${g.id}`, game: g, keys: gameKeys(g), quality, group: g.sport };
  });
  // One game a league (two of a league the person likes).
  const featured = spreadLeagues(rank(items, { wallet: state.wallet, n: 40, aff, now, diversity: 0.2, explore: 0 }), taste, { n: 4 });

  // ---- 場中焦點: games on now with a live win price, ranked the same way.
  // (Every game on now: the strip is scores, and a held game's sheet says so.)
  const onNow = state.liveGames || [];
  const liveItems = onNow.map(g => ({ id: `live:${g.id}`, game: g, keys: gameKeys(g), quality: TIER_WEIGHT[ctx.leagueTier(g.sport)] + 0.3 + gameInterest(g, taste).score * 0.6 + (taste.held.has(g.id) ? 0.4 : 0), group: g.sport }));
  const liveTop = spreadLeagues(rank(liveItems, { wallet: state.wallet, n: 40, aff, now, diversity: 0.2, explore: 0 }), taste, { n: 4 });

  // A match card: its league and time (or live state) on top, each side with its
  // logo, (score) and win price (the kit's matchCard: logos 48/40, a price row
  // 主/和/客), a 為你推薦 card's reason as a tag. It keeps to the win prices: 2 for
  // basketball/baseball, 3 for soccer.
  const matchCard = (g, bets, o = {}) => {
    const ml = bets.filter(b => b.kind === 'ml');
    const mark = { home: lang === 'zh' ? '主' : 'H', away: lang === 'zh' ? '客' : 'A', draw: T.draw };
    const price = (b, label) => ({ label, odds: b.lock ? '' : ctx.fmtOdds(ctx.effectiveOdds(b)), locked: Boolean(b.lock), selected: state.parlay?.includes(b.id), onTap: () => ctx.toggleLeg(b) });
    const prices = ctx.winnerSides(g, ml).map(side => ml.find(b => b.side === side) && price(ml.find(b => b.side === side), mark[side])).filter(Boolean);
    const open = () => (o.live ? ctx.openLive(g.id) : ctx.openGame(g.id));
    return kitUI.matchCard({
      league: state.t(`sport_${g.sport}`), leagueLogo: ctx.leagueUrl(g.sport), live: o.live, wide: o.wide,
      when: o.live ? ctx.liveStateText(g.live) : g.timeTbd ? gameTime(g) : ctx.legWhen(g.startUtc),
      tag: o.why && T[`why_${o.why}`] ? { text: T[`why_${o.why}`], tone: ['follow', 'backed', 'like', 'league', 'sport'].includes(o.why) ? 'tint' : 'orange' } : null,
      sides: ctx.winnerSides(g, ml).filter(x => x !== 'draw').map(side => ({ logo: ctx.logoUrl(g.sport, g[side].en), name: ctx.shortTeam(g.sport, g[side]), score: o.live ? g.live?.[`${side}Score`] : null })),
      prices, onOpen: open
    });
  };

  // ---- 精選串關: ready-made parlays in different styles: a safe double of
  // favourites, a balanced treble across sports, a long-shot 4-fold, a
  // totals treble, a handicap treble, one league's treble. One pick a game
  // (運彩 sells no same-game parlay), games in the next two days, nothing
  // locked or capped and no pick that must be bought with more picks
  // (限關) than the card has; each card leans on games the others left out.
  const soonest = (a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0);
  const open48 = b => !b.lock && !b.cap && ctx.leagueTier(b.sport) !== 'thin' && Date.parse(b.start) > now && Date.parse(b.start) - now < 48 * 3_600_000;
  const winPicks = (state.bets || []).filter(b => b.kind === 'ml' && b.side !== 'draw' && open48(b));
  const linePicks = kind => (state.bets || []).filter(b => b.kind === kind && open48(b) && (kind === 'total' ? b.mainLine || b.posted : b.posted));
  const onePerGame = list => {
    const seen = new Set();
    return list.filter(b => !seen.has(b.gameId) && seen.add(b.gameId));
  };
  const used = new Map();
  const ranked = list => list.sort((a, b) => (used.get(a.gameId) || 0) - (used.get(b.gameId) || 0) || leagueTaste(b.sport, taste) - leagueTaste(a.sport, taste) || (ctx.leagueTier(a.sport) === 'major' ? 0 : 1) - (ctx.leagueTier(b.sport) === 'major' ? 0 : 1) || soonest(a, b));
  // The person's leagues first, then the big ones; as many sports as it can.
  const build = (picks, n, lo, hi, { spread = true } = {}) => {
    const pool = onePerGame(ranked(picks.filter(b => b.estOdds >= lo && b.estOdds <= hi && !(b.minLegs > n))));
    let legs = spread ? spreadLeagues(pool, taste, { n, liked: 1, perSport: 1, sportOf: b => b.sport }) : pool.slice(0, n);
    if (spread && legs.length < n) legs = spreadLeagues(pool, taste, { n, liked: 2, perSport: 2, sportOf: b => b.sport });
    if (spread && legs.length < n) legs = pool.slice(0, n);
    if (legs.length < n) return [];
    legs.forEach(b => used.set(b.gameId, (used.get(b.gameId) || 0) + 1));
    return legs;
  };
  const styles = [];
  const add = (legs, title, tone) => legs.length && !styles.some(x => x.legs.map(b => b.id).sort().join() === legs.map(b => b.id).sort().join()) && styles.push({ legs, title, tone });
  const mineLegs = mine.filter(x => !x.bet.cap && !(x.bet.minLegs > 3)).slice(0, 3).map(x => x.bet);
  if (onePerGame(mineLegs).length === 3) (add(mineLegs, T.comboMine, 'mine'), mineLegs.forEach(b => used.set(b.gameId, 1)));
  add(build(winPicks, 2, 1.25, 1.6), T.comboSafe, 'safe');
  add(build(winPicks, 3, 1.55, 2.3), T.comboEven, 'even');
  add(build(winPicks, 4, 1.9, 4), T.comboBold, 'bold');
  add(build(linePicks('total'), 3, 1.5, 2.3), T.comboTotals, 'totals');
  add(build(linePicks('runline'), 3, 1.5, 2.3), T.comboSpread, 'spread');
  // One league's treble: the person's league, else the one with the most games.
  const byLeague = new Map();
  for (const b of onePerGame(winPicks.filter(b => b.estOdds >= 1.4 && b.estOdds <= 2.6 && !(b.minLegs > 3)))) byLeague.set(b.sport, [...(byLeague.get(b.sport) || []), b]);
  const league = [...byLeague.entries()].filter(([, list]) => list.length >= 3).sort(([a, x], [b, y]) => leagueTaste(b, taste) - leagueTaste(a, taste) || y.length - x.length)[0];
  if (league) add(build(league[1], 3, 1.4, 2.6, { spread: false }), f('comboLeague', { league: ctx.state.t(`sport_${league[0]}`) }), 'league');
  const PARLAY_STAKE = 500;
  const parlayCard = (legs, title, tone) => {
    const odds = legs.reduce((m, b) => m * b.estOdds, 1);
    const boost = ctx.boostPct(legs.length);
    return el('article', { class: `q-rail-card pl-combo ${tone}` }, [
      el('div', { class: 'pl-combo-head' }, [el('strong', { text: title }), el('span', { class: 'q-tag tint num', text: `×${ctx.fmtOdds(odds)}` }), boost ? el('span', { class: 'q-tag green', text: f('comboBoost', { b: boost }) }) : null]),
      el('div', { class: 'pl-combo-legs' }, legs.map(b => {
        const g = (state.data?.games || []).find(x => x.id === b.gameId);
        return el('div', { class: 'pl-combo-leg' }, [
          g && g[b.side] ? ctx.logoImg(g.sport, g[b.side].en, ctx.teamName(g[b.side]), 'logo-sm') : g ? ctx.leagueImg(g.sport, 'logo-sm') : null,
          el('span', { class: 'pl-combo-pick' }, [el('span', { text: ctx.shortPick(b) }), b.kind === 'ml' ? null : el('small', { text: ctx.shortMatchup(b) })]),
          el('b', { class: 'num', text: ctx.fmtOdds(b.estOdds) })
        ]);
      })),
      el('div', { class: 'pl-combo-foot' }, [
        el('span', { class: 'pl-combo-pay' }, [el('small', { text: f('comboStake', { v: money(PARLAY_STAKE) }) }), el('strong', { class: 'num', text: money(ctx.parlayPays(legs, PARLAY_STAKE)) })]),
        el('button', { class: 'q-btn primary pl-combo-go', type: 'button', text: T.comboGo, onclick: () => (ctx.track([...new Set(legs.flatMap(b => ctx.betKeys(b)))], 1), ctx.takeParlay(legs.map(b => b.id))) })
      ])
    ]);
  };
  const combos = styles.map(x => parlayCard(x.legs, x.title, x.tone));

  // ---- 1 The hero: the balance, two stat cells (open bets, most they pay), the search pill.
  const open = (state.account?.slips || []).filter(s => s.status === 'open' && !s.recovered && s.legs?.length);
  const most = slipsMost(open);
  const cash = state.account ? ctx.funds() : null;
  const cell = (label, value) => el('button', { class: 'pl-hc-cell', type: 'button', onclick: () => ctx.showTab('history') }, [el('small', { text: label }), el('strong', { class: 'num', text: value })]);
  const hero = el('section', { class: 'q-hero-card pl-hero' }, [
    el('span', { class: 'q-hc-eyebrow' }, [glyph('wallet'), el('span', { text: T.balance })]),
    // Drawn from the saved board before the account has loaded: the balance a moment later.
    el('strong', { class: 'q-hc-big num pl-balance', 'data-q-live': 'play:balance', text: cash == null ? '—' : fmtMoney(cash, { sign: cash < 0 }) }),
    cash < 0 ? el('button', { class: 'pl-hero-line', type: 'button', onclick: () => ctx.q.go('stock', 'portfolio') }, [el('span', { text: T.overdrawn }), el('strong', { text: `${T.cover} ›` })]) : null,
    el('div', { class: 'pl-hc-stats' }, [cell(T.openN, lang === 'zh' ? `${open.length} ${T.unit}` : String(open.length)), cell(T.most, money(most))]),
    state.wallet && welcomeDue(state.wallet) ? el('p', { class: 'pl-hero-line plain' }, [icon('gift'), el('span', { text: f('welcome', { v: money(WELCOME.bet) }) })]) : null,
    el('button', { class: 'q-hc-pill pl-hero-search', type: 'button', onclick: () => ctx.openSearch() }, [el('span', { text: T.search }), el('i', { 'aria-hidden': 'true' })])
  ]);
  hero.querySelector('.pl-hero-search i').innerHTML = kitUI.icons.search || '';

  // ---- 2 Quick actions: colour tiles with kit glyphs (場中, 賽事, 彩券, 投注單).
  const slipN = ctx.slipCount();
  const actionItems = [
      { icon: 'live', tint: 'var(--q-red)', label: T.actLive, badge: onNow.length, go: () => ctx.openLive(null) },
      { icon: 'calendar', tint: 'var(--q-blue)', label: T.actGames, badge: 0, go: () => ctx.showTab('games') },
      { icon: 'ticket', tint: 'var(--q-orange)', label: T.actLottery, badge: 0, go: () => ctx.showTab('lottery') },
      { icon: 'list', tint: 'var(--q-indigo)', label: T.actSlip, badge: slipN, go: () => ctx.openSlip() }
    ];
  const actions = () => kitUI.actionGrid(actionItems.map(a => ({ ...a, onTap: a.go })));

  // ---- 3 場中焦點: a compact strip, 28px logos, the minute in red.
  const liveStrip = list =>
    kitUI.liveStrip(list.map(x => ({ min: ctx.liveStateText(x.game.live), onOpen: () => ctx.openLive(x.game.id), rows: ['away', 'home'].map(side => ({ logo: ctx.logoUrl(x.game.sport, x.game[side].en), name: ctx.shortTeam(x.game.sport, x.game[side]), score: x.game.live?.[`${side}Score`] ?? '' })) })));

  // ---- 8 最近的投注: the newest slips and tickets as rows.
  const recentRows = () => {
    const tag = (cls, text) => el('span', { class: `q-tag ${cls}`, text });
    const slipRow = s => {
      const settled = s.status === 'settled';
      const profit = settled ? s.payout - s.cost : 0;
      const first = s.legs[0];
      const title = s.legs.length > 1 ? f('parlayN', { n: s.legs.length }) : ctx.shortPick(first);
      return { at: s.t, node: el('button', { class: 'q-ritem chevron', type: 'button', onclick: () => ctx.showTab('history') }, [
        ctx.legIcon(first, 'logo-md'),
        el('span', { class: 'q-ritem-text' }, [el('span', { class: 'q-ritem-title q-fit-wrap', text: title }), el('small', { text: [money(s.free ? s.stake : s.cost), ctx.fmtTime(s.t)].join(' · ') })]),
        settled ? (s.cashedOut ? tag('blue', T.cashed) : profit > 0 ? tag('green', f('won', { v: money(s.payout) })) : tag('gray', T.lost)) : tag('tint', T.openTag)
      ]) };
    };
    // A ticket by its own name and colour (錢進888, 大樂透), not the kind or its id.
    const ticketName = x => (x.card ? CARDS[x.card]?.[lang] : GAMES[x.game]?.[lang]) || (x.card ? T.scratchT : T.ticket);
    const ticketColor = x => (x.card ? CARDS[x.card]?.color : GAMES[x.game]?.color) || 'var(--q-orange)';
    const ticketRow = x => ({ at: x.t, node: el('button', { class: 'q-ritem chevron', type: 'button', onclick: () => ctx.showTickets?.() }, [
      x.card ? cardArt(x.card, ticketName(x), ticketColor(x), 'sc-thumb') : gameLogo(x.game, ticketName(x), ticketColor(x), 'lt-mark-row'),
      el('span', { class: 'q-ritem-text' }, [el('span', { class: 'q-ritem-title q-fit-wrap', text: ticketName(x) }), el('small', { text: [money(x.cost), ctx.fmtTime(x.t)].join(' · ') })]),
      x.status === 'settled' ? (x.prize > 0 ? tag('green', f('won', { v: money(x.prize) })) : tag('gray', T.lost)) : tag('tint', T.openTag)
    ]) });
    const slips = (state.account?.slips || []).filter(s => !s.recovered && s.legs?.length).map(slipRow);
    const tickets = (state.account?.tickets || []).map(ticketRow);
    const byNew = (a, b) => String(b.at).localeCompare(String(a.at));
    return [...slips.sort(byNew).slice(0, 3), ...tickets.sort(byNew).slice(0, 2)].sort(byNew).map(x => x.node);
  };

  const section = (title, body, more = null, count = null, panel = false) =>
    el('section', { class: `q-section${panel ? ' pl-panel' : ''}` }, [kitUI.sectionHead(title, { more: more ? T.seeAll : '', onMore: more, count }), body]);

  // 4 為你推薦: a rail of cards.
  // (A price reason, 划算/穩/值博, about a total or spread pick isn't shown over the win row.)
  const forYou = mine.map(x => matchCard(x.game, betsOf.get(x.game.id) || [], { why: x.bet.kind === 'ml' || !['value', 'steady', 'shot'].includes(x.why) ? x.why : null }));
  // 5 今日焦點賽事: a vertical list (up to 4), so the page is full (the card's `wide` variant).
  const wide = featured.slice(0, 4).map(x => matchCard(x.game, betsOf.get(x.game.id) || [], { wide: true }));
  const emptyGames = () => kitUI.empty({ icon: 'calendar', tint: 'var(--q-blue)', title: T.none, action: { label: lang === 'zh' ? '看賽事' : 'See games', onTap: () => ctx.showTab('games') } });

  // 7 彩券: the biggest jackpot as a hero card, the next two games under it; a skeleton while the feeds load.
  const lead = ctx.lotteryHome?.() ?? null;
  const lotteryCard = () => {
    if (!lead) return el('div', { class: 'q-skel pl-lottery-skel', 'aria-hidden': 'true' });
    const card = el('button', { class: 'q-hero-card q-press pl-lottery', type: 'button', style: `--q-hc-b:${lead.color}`, onclick: () => ctx.lotteryOpen?.(lead.id) }, [
      el('span', { class: 'q-hc-eyebrow' }, [gameLogo(lead.id, lead.name, lead.color, 'lt-mark-hero'), lang === 'en' ? el('span', { text: lead.name }) : null].filter(Boolean)),
      el('strong', { class: 'q-hc-big num', text: lead.amount }),
      el('span', { class: 'q-hc-sub', text: `${lead.label} · ${lead.untilText}` }),
      el('span', { class: 'q-hc-row' }, [el('span', { class: 'q-hc-btn', text: T.pickNow })])
    ]);
    const mini = lead.others.map(o => el('button', { class: 'lt-tile q-press pl-lt-mini', type: 'button', style: `--lotto:${o.color}`, onclick: () => ctx.lotteryOpen?.(o.id) }, [
      gameLogo(o.id, o.name, o.color, 'lt-logo'),
      lang === 'en' ? el('span', { class: 'lt-en', text: o.name }) : null,
      el('strong', { class: 'lt-big num', text: o.amount }),
      el('small', { class: 'lt-when', text: o.untilText })
    ]));
    return el('div', { class: 'pl-lottery-wrap' }, [card, mini.length ? el('div', { class: 'lt-grid' }, mini) : null]);
  };

  const recent = recentRows();
  const recentBody = recent.length ? el('div', { class: 'q-rowcard' }, recent) : kitUI.empty({ icon: 'ticket', tint: 'var(--q-indigo)', title: T.none2, action: { label: lang === 'zh' ? '去選比賽' : 'Pick a game', onTap: () => ctx.showTab('games') } });

  root.replaceChildren(
    ...[
      hero,
      actions(),
      liveTop.length ? section(T.liveTitle, liveStrip(liveTop), () => ctx.openLive(null), onNow.length, true) : null,
      forYou.length ? section(T.forYou, el('div', { class: 'q-rail pl-mcards' }, forYou), () => ctx.showTab('games')) : null,
      section(T.featured, wide.length ? el('div', { class: 'pl-wide' }, wide) : emptyGames(), () => ctx.showTab('games'), null, true),
      combos.length ? section(T.combos, el('div', { class: 'q-rail pl-combos' }, combos)) : null,
      section(T.lottery, lotteryCard(), () => ctx.showTab('lottery')),
      section(T.recent, recentBody, () => ctx.showTab('history'), null, true)
    ].filter(Boolean)
  );
}
