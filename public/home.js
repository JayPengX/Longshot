// The home tab asks one thing: what to bet on now.
//
// - The balance on the app's blue, with the open bets in one line (to 紀錄)
//   and a search pill into the games.
// - One row of starters: 場中 and each kind of sport with its games.
// - 場中焦點: games on now with live prices (a tap on a price puts it on the slip).
// - 為你推薦 (foryou.mjs) then 焦點賽事, as one rail of match cards: the
//   teams and leagues the person follows in Orbit Sports and bets on here,
//   then the games worth betting on (the shared recommender, quadra.mjs's
//   rank: their leagues, how soon). One a game.
// - 精選串關: ready-made parlays, one tap onto the slip.
// The open bets live in 紀錄, the lottery in 彩券, VIP and Plus in 戰績.
import { rank, affinity, plusMember, welcomeDue, WELCOME, cachedPayload } from '#kit/quadra.mjs';
import { tasteOf, gameInterest, forYouPicks, fixturesTaste, leagueTaste, spreadLeagues } from './lib/foryou.mjs';
import { icon } from './icons.js';
// The kit's premium glyphs, by name; none on an older kit (the place then just has no glyph).
import * as kitUI from '#kit/ui.mjs';
import { normalizeTeamName } from '#kit/logos.mjs';
import { familyOf } from './lib/teams.mjs';
import { slipsMost } from './lib/slip.mjs';

const glyph = name => {
  const s = document.createElement('span');
  s.className = 'q-gl';
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = kitUI.icons?.[name] || '';
  return s;
};

const TXT = {
  zh: {
    balance: 'Quadra 餘額', openBets: '{n} 張投注中 · 全中最多 {m}', search: '搜尋球隊、聯賽', live: '場中', liveTitle: '場中焦點',
    forYou: '為你推薦', featured: '焦點賽事', seeAll: '全部', none: '目前沒有開賣的比賽', draw: '和',
    overdrawn: '透支 · 月息 1%', cover: '賣出持股補足', welcome: '第一次下注送 {v} 免費投注',
    why_follow: '★ 追蹤', why_backed: '↺ 押過', why_like: '♥ 常看', why_value: '划算', why_steady: '穩', why_shot: '值博',
    combos: '精選串關', comboMine: '為你串 3 場', comboSafe: '穩膽 3 串', comboBold: '高賠 3 串', comboBoost: '+{b}%', comboStake: '投注 {v}', comboGo: '加入投注單'
  },
  en: {
    balance: 'Quadra balance', openBets: '{n} open · up to {m}', search: 'Search teams, leagues', live: 'Live', liveTitle: 'Live now',
    forYou: 'For you', featured: 'Featured', seeAll: 'See all', none: 'No games on sale right now', draw: 'Draw',
    overdrawn: 'Overdrawn · 1% a month', cover: 'Sell to cover', welcome: 'First bet: a {v} free bet',
    why_follow: '★ Following', why_backed: '↺ Backed', why_like: '♥ Watching', why_value: 'Value', why_steady: 'Steady', why_shot: 'Long shot',
    combos: 'Parlays of the day', comboMine: 'Your treble', comboSafe: 'Favourites', comboBold: 'Big prices', comboBoost: '+{b}%', comboStake: 'Stake {v}', comboGo: 'Add to slip'
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
  const group = list => {
    const map = new Map();
    for (const b of list || []) if (b.gameId) map.set(b.gameId, [...(map.get(b.gameId) || []), b]);
    return map;
  };
  const betsOf = group(state.bets);
  const liveBetsOf = group(state.liveBets);

  // ---- 為你推薦, then 焦點賽事 (other games, other teams, none already bet on).
  const mine = forYouPicks({ games: state.data?.games || [], bets: state.bets || [], recs: state.recs || new Map(), taste, now });
  const shownIds = new Set(mine.map(x => x.game.id));
  const shownTeams = new Set(mine.flatMap(x => ['home', 'away'].map(side => teamKey(x.game, side))));
  const later = (state.data?.games || []).filter(g => Date.parse(g.startUtc) > now && !taste.held.has(g.id) && !shownIds.has(g.id) && !shownTeams.has(teamKey(g, 'home')) && !shownTeams.has(teamKey(g, 'away')) && (betsOf.get(g.id) || []).some(b => b.kind === 'ml' && !b.lock));
  const items = later.map(g => {
    const hours = (Date.parse(g.startUtc) - now) / 3_600_000;
    const quality = TIER_WEIGHT[ctx.leagueTier(g.sport)] + (hours < 18 ? 0.3 : hours < 42 ? 0.15 : 0) + gameInterest(g, taste).score * 0.5;
    return { id: `game:${g.id}`, game: g, keys: gameKeys(g), quality, group: g.sport };
  });
  // One game a league (two of a league the person likes).
  const featured = spreadLeagues(rank(items, { wallet: state.wallet, n: 40, aff, now, diversity: 0.2, explore: 0 }), taste, { n: Math.max(2, 6 - mine.length) });

  // ---- 場中焦點: games on now with a live win price, ranked the same way.
  const onNow = (state.liveGames || []).filter(g => (liveBetsOf.get(g.id) || []).some(b => b.kind === 'ml' && !b.lock));
  const liveItems = onNow.map(g => ({ id: `live:${g.id}`, game: g, keys: gameKeys(g), quality: TIER_WEIGHT[ctx.leagueTier(g.sport)] + 0.3 + gameInterest(g, taste).score * 0.6 + (taste.held.has(g.id) ? 0.4 : 0), group: g.sport }));
  const liveTop = spreadLeagues(rank(liveItems, { wallet: state.wallet, n: 40, aff, now, diversity: 0.2, explore: 0 }), taste, { n: 4 });

  // A match card: its league and time (or live state) on top, each side with
  // its logo, (score) and win price; a 為你推薦 card's reason as a tag, and
  // its pick at the foot when it isn't a win price.
  const matchCard = (g, bets, { live = false, why = null, pick = null } = {}) => {
    const ml = bets.filter(b => b.kind === 'ml');
    const open = () => (live ? ctx.openLive(g.id) : ctx.openGame(g.id));
    return el('article', { class: `q-rail-card pl-mcard${live ? ' live' : ''}`, onclick: e => !e.target.closest('button.pick') && open() }, [
      el('div', { class: 'pl-mcard-top' }, [
        ctx.leagueImg(g.sport, 'logo-xs'),
        el('span', { class: 'pl-mcard-league', text: state.t(`sport_${g.sport}`) }),
        live
          ? el('span', { class: 'pl-when live' }, [el('i', { class: 'pl-dot', 'aria-hidden': 'true' }), el('span', { text: ctx.liveStateText(g.live) })])
          : why
            ? el('span', { class: `q-tag ${why === 'follow' || why === 'backed' || why === 'like' ? 'tint' : 'orange'}`, text: T[`why_${why}`] ?? '' })
            : el('span', { class: 'pl-when', text: g.timeTbd ? gameTime(g) : ctx.legWhen(g.startUtc) })
      ]),
      ...ctx.winnerSides(g, ml).map(side => {
        const bet = ml.find(b => b.side === side);
        if (side === 'draw') return bet ? el('div', { class: 'pl-team draw' }, [el('span', { class: 'pl-draw-mark', 'aria-hidden': 'true', text: '=' }), el('span', { class: 'pl-team-name', text: T.draw }), ctx.pickButton(bet, '')]) : null;
        return el('div', { class: 'pl-team' }, [
          ctx.logoImg(g.sport, g[side].en, ctx.teamName(g[side]), 'logo-sm'),
          el('span', { class: 'pl-team-name', text: ctx.shortTeam(g.sport, g[side]) }),
          live ? el('span', { class: 'pl-score', text: String(g.live?.[`${side}Score`] ?? '') }) : null,
          bet ? ctx.pickButton(bet, '') : el('span', { class: 'pick-none' })
        ]);
      }),
      pick ? el('div', { class: 'pl-mcard-pick' }, [el('span', { class: 'pl-mcard-pickname', text: ctx.shortPick(pick) }), ctx.pickButton(pick, '')]) : null
    ]);
  };

  // ---- 精選串關: ready-made parlays from the big leagues' win prices, one
  // of favourites, one of longer prices; one pick a game, games in the next
  // two days, none that must be bought with more picks.
  const soonest = (a, b) => a.start.localeCompare(b.start);
  const winPicks = (state.bets || []).filter(b => b.kind === 'ml' && b.side !== 'draw' && !b.lock && !b.cap && !(b.minLegs > 3) && ctx.leagueTier(b.sport) !== 'thin' && Date.parse(b.start) > now && Date.parse(b.start) - now < 48 * 3_600_000);
  const onePerGame = list => {
    const seen = new Set();
    return list.filter(b => !seen.has(b.gameId) && seen.add(b.gameId));
  };
  // The person's leagues first, then the big ones; three sports when it can.
  const build = (lo, hi) => {
    const pool = onePerGame(winPicks.filter(b => b.estOdds >= lo && b.estOdds <= hi).sort((a, b) => leagueTaste(b.sport, taste) - leagueTaste(a.sport, taste) || (ctx.leagueTier(a.sport) === 'major' ? 0 : 1) - (ctx.leagueTier(b.sport) === 'major' ? 0 : 1) || soonest(a, b)));
    const wide = spreadLeagues(pool, taste, { n: 3, liked: 1, perSport: 1, sportOf: b => b.sport });
    return wide.length === 3 ? wide : spreadLeagues(pool, taste, { n: 3, liked: 1, perSport: 2, sportOf: b => b.sport });
  };
  const safe = build(1.3, 1.8);
  const bold = build(1.9, 4).filter(b => !safe.some(x => x.gameId === b.gameId));
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
          el('span', { class: 'pl-combo-pick', text: ctx.shortPick(b) }),
          el('b', { class: 'num', text: ctx.fmtOdds(b.estOdds) })
        ]);
      })),
      el('div', { class: 'pl-combo-foot' }, [
        el('span', { class: 'pl-combo-pay' }, [el('small', { text: f('comboStake', { v: money(PARLAY_STAKE) }) }), el('strong', { class: 'num', text: money(ctx.parlayPays(legs, PARLAY_STAKE)) })]),
        el('button', { class: 'q-btn primary pl-combo-go', type: 'button', text: T.comboGo, onclick: () => (ctx.track([...new Set(legs.flatMap(b => ctx.betKeys(b)))], 1), ctx.takeParlay(legs.map(b => b.id))) })
      ])
    ]);
  };
  const mineLegs = mine.filter(x => !x.bet.cap && !(x.bet.minLegs > 3)).slice(0, 3).map(x => x.bet);
  const combos = [mineLegs.length === 3 ? parlayCard(mineLegs, T.comboMine, 'mine') : null, safe.length === 3 ? parlayCard(safe, T.comboSafe, 'safe') : null, bold.length === 3 ? parlayCard(bold, T.comboBold, 'bold') : null].filter(Boolean);

  // ---- The hero: the balance, the open bets in a line, the search pill.
  const open = (state.account?.slips || []).filter(s => s.status === 'open' && !s.recovered && s.legs?.length);
  const most = slipsMost(open);
  const member = plusMember(state.wallet);
  const cash = state.account ? ctx.funds() : null;
  const hero = el('section', { class: 'q-hero-card pl-hero' }, [
    el('span', { class: 'q-hc-eyebrow' }, [glyph('wallet'), el('span', { text: T.balance }), member ? el('span', { class: 'pl-plus', text: '✦ PLUS' }) : null]),
    // Drawn from the saved board before the account has loaded: the balance a moment later.
    el('strong', { class: 'q-hc-big num pl-balance', 'data-q-live': 'play:balance', text: cash == null ? '…' : fmtMoney(cash, { sign: cash < 0 }) }),
    cash < 0 ? el('button', { class: 'pl-hero-line', type: 'button', onclick: () => ctx.q.go('stock', 'portfolio') }, [el('span', { text: T.overdrawn }), el('strong', { text: `${T.cover} ›` })]) : null,
    open.length ? el('button', { class: 'pl-hero-line', type: 'button', onclick: () => ctx.showTab('history') }, [el('span', { class: 'num', text: f('openBets', { n: open.length, m: money(most) }) }), el('i', { class: 'pl-chev', 'aria-hidden': 'true' })]) : null,
    state.wallet && welcomeDue(state.wallet) ? el('p', { class: 'pl-hero-line plain' }, [icon('gift'), el('span', { text: f('welcome', { v: money(WELCOME.bet) }) })]) : null,
    el('button', { class: 'q-hc-pill pl-hero-search', type: 'button', onclick: () => ctx.openSearch() }, [el('span', { text: T.search }), el('i', { 'aria-hidden': 'true' })])
  ]);
  hero.querySelector('.pl-hero-search i').innerHTML = kitUI.icons?.search || '⌕';

  // ---- Starters: 場中, then each kind of sport with its games.
  const starters = [
    onNow.length ? el('button', { class: 'q-chip pl-starter live', type: 'button', onclick: () => ctx.openLive(null) }, [el('i', { class: 'pl-dot', 'aria-hidden': 'true' }), el('span', { text: T.live }), el('span', { class: 'chip-count', text: String(onNow.length) })]) : null,
    ...ctx.sportStarters().map(x => el('button', { class: 'q-chip pl-starter', type: 'button', onclick: x.go }, [x.icon, el('span', { text: x.label }), el('span', { class: 'chip-count', text: String(x.n) })]))
  ].filter(Boolean);

  const section = (title, body, more = null) =>
    el('section', { class: 'q-section' }, [el('div', { class: 'q-section-head' }, [el('h2', { text: title }), more ? el('button', { type: 'button', text: T.seeAll, onclick: more }) : null]), body]);

  const picks = [...mine.map(x => matchCard(x.game, betsOf.get(x.game.id) || [], { why: x.why, pick: x.bet.kind === 'ml' ? null : x.bet })), ...featured.map(x => matchCard(x.game, betsOf.get(x.game.id) || []))];
  const dateLine = new Date().toLocaleDateString(lang === 'en' ? 'en-US' : 'zh-TW', { month: 'numeric', day: 'numeric', weekday: lang === 'en' ? 'short' : 'long', timeZone: 'Asia/Taipei' });
  root.replaceChildren(
    ...[
      el('header', { class: 'q-page-head' }, [el('p', { class: 'q-over', text: dateLine }), el('h1', { text: 'Quadra Play' })]),
      hero,
      starters.length ? el('div', { class: 'q-chips pl-chips pl-starters' }, starters) : null,
      liveTop.length ? section(T.liveTitle, el('div', { class: 'q-rail pl-mcards' }, liveTop.map(x => matchCard(x.game, liveBetsOf.get(x.game.id) || [], { live: true }))), () => ctx.openLive(null)) : null,
      section(mine.length ? T.forYou : T.featured, picks.length ? el('div', { class: 'q-rail pl-mcards' }, picks) : el('p', { class: 'pl-empty', text: T.none }), () => ctx.showTab('games')),
      combos.length ? section(T.combos, el('div', { class: 'q-rail pl-combos' }, combos)) : null
    ].filter(Boolean)
  );
}
