// 冠軍 on a ticket past F1's (f1.mjs): the season championships 台灣運彩
// sells for the leagues 注單 follows. The same markets Play sells (the
// kit's play-sources FUTURES and EXTRA_FUTURES: 世界大賽, NBA 總冠軍, 英超…),
// read from the same Polymarket markets and priced as Play prices them. Each
// is a game a pick can be on: its contenders (`field`, by their chance) and,
// once the market is settled, its winner (`order`). No DOM, so it's tested.
import { FUTURES, EXTRA_FUTURES } from '../../kit/play-sources.mjs';
import { estimateFuturesOdds, FUTURES_OVERROUND, devigProportional } from '../../kit/play-odds.mjs';
import { futureTeamName, parseJsonArray, parseFutureResult } from '../../kit/settle.mjs';
import { normalizeTeamName } from '../../kit/logos.mjs';
import { STRINGS } from '../../lib/i18n.mjs';
import { isF1, isChamp } from './f1.mjs';

// The championships 注單 lists, in Play's order (F1's is f1.mjs's, from the standings).
export const CHAMP_MARKETS = [...FUTURES, ...EXTRA_FUTURES].filter(m => m.sport !== 'f1');
export const isTeamChamp = g => isChamp(g) && !isF1(g);
export const CHAMP_KINDS = { future: '冠軍' };
export const CHAMP_KINDS_EN = { future: 'Champion' };
export const sameTeam = (a, b) => Boolean(a && b) && normalizeTeamName(a) === normalizeTeamName(b);

// A market's name, Play's: 世界大賽冠軍 / World Series champion, with its
// season in front when given (2026 世界大賽冠軍); when it's settled (約 10 月底世界大賽結束).
const words = (en, key) => STRINGS[en ? 'en' : 'zh'][key] ?? '';
export const champName = (key, en = false, season = '') => words(en, `future_${key}`).replace('{season}', season).trim();
export const champSettles = (key, en = false) => words(en, `futureSettle_${key}`);

// Play's market (play-sources parseFutures: { key, sport, slug, season, ends,
// teams: [{ name: { en, zh }, fair }] }) as a game; `logoOf(sport, en)`: a
// club's logo, or null.
export function champGame(market, logoOf = () => null) {
  const ends = Date.parse(market.ends ?? '');
  return {
    id: `champ:${market.key}:${market.slug}`,
    league: market.sport,
    session: 'champ',
    market: market.key,
    slug: market.slug,
    title: market.season || '',
    // (When it's settled, about: the market's end.)
    start: new Date(Number.isFinite(ends) ? ends : Date.UTC(new Date().getUTCFullYear(), 11, 31)).toISOString(),
    state: 'pre',
    field: market.teams.map(t => ({ name: t.name.en, zh: t.name.zh || t.name.en, fair: t.fair, logo: logoOf(market.sport, t.name.en) || '' })),
    score: null
  };
}

// The game read again from its Polymarket event (`events`: /events?slug=…):
// settled, its winner first in `order`; else every contender's chance now,
// a club knocked out (its market closed at no) at 0 and `out`.
export function champRead(g, events) {
  const event = events?.[0];
  if (!event) return null;
  const done = parseFutureResult(events);
  if (done.status === 'final') return { ...g, state: 'post', order: [done.winner] };
  const rows = (event.markets || []).flatMap(m => {
    const name = futureTeamName(m);
    // (Polymarket's placeholders, as Play drops them: "Team A", "Other".)
    if (!name || /^(team [a-z]{1,3}|another team|other|driver [a-z]{1,3})$/i.test(name)) return [];
    const outcomes = parseJsonArray(m.outcomes);
    const prices = parseJsonArray(m.outcomePrices);
    const at = Array.isArray(outcomes) ? outcomes.findIndex(o => /^yes$/i.test(o)) : -1;
    const yes = at >= 0 ? Number(prices?.[at]) : NaN;
    return Number.isFinite(yes) ? [{ name, yes, out: Boolean(m.closed) && yes <= 0.01 }] : [];
  });
  const open = rows.filter(r => !r.out && r.yes > 0);
  const fair = devigProportional(open.map(r => r.yes));
  if (!fair) return null;
  const chance = new Map(open.map((r, i) => [normalizeTeamName(r.name), fair[i]]));
  const outs = new Set(rows.filter(r => r.out).map(r => normalizeTeamName(r.name)));
  const field = g.field.map(t => {
    const k = normalizeTeamName(t.name);
    return outs.has(k) ? { ...t, fair: 0, out: true } : { ...t, fair: chance.get(k) ?? t.fair, out: undefined };
  });
  return { ...g, field: field.sort((a, b) => b.fair - a.fair) };
}

// The lottery's likely price for each contender (Play's 冠軍 board's).
export function champOdds(g) {
  const fair = g.field.map(t => t.fair || 0);
  const odds = estimateFuturesOdds(fair, FUTURES_OVERROUND[g.market] ?? FUTURES_OVERROUND[g.league] ?? FUTURES_OVERROUND.other);
  return new Map(g.field.map((t, i) => [t.name, odds[i]]));
}
export const champGuess = (g, team) => champOdds(g).get(g.field.find(t => sameTeam(t.name, team))?.name) ?? null;

// 'won' or 'lost' once the market is settled; null before.
export function gradeChamp(leg) {
  const g = leg.game;
  if (g.state !== 'post' || !g.order?.length) return null;
  return sameTeam(g.order[0], leg.team) ? 'won' : 'lost';
}

// One pick as ticket.mjs's legView has it: before, the chance the market
// gave it when it was added (`fair`, else its odds less a futures cut); now,
// the market's chance as it stands; knocked out, lost already (`early`).
const FUTURE_CUT = 1.3;
export function champLegView(leg) {
  const g = leg.game;
  const pre = { win: leg.fair > 0 ? leg.fair : Math.min(0.97, 1 / (leg.odds * FUTURE_CUT)), push: 0 };
  const result = gradeChamp(leg);
  const me = (g.field || []).find(t => sameTeam(t.name, leg.team));
  const early = !result && me?.out ? 'lost' : null;
  const now = result === 'won' ? { win: 1, push: 0 } : result || early ? { win: 0, push: 0 } : me ? { win: me.fair, push: 0 } : pre;
  return { result, early, pre, now, live: false, held: null, ahead: null, estimated: !(leg.fair > 0) };
}
