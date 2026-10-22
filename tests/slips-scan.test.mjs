// A ticket read from a photo: its combinations, and each pick matched to its game.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { combosOf, gameFit, legOf, matchPicks, readOf, stakeOf, timesOf } from '../public/slips/lib/scan.mjs';
import { slipView } from '../public/slips/lib/ticket.mjs';

// Gemini's read of a real 4-pick parlay (2026-10-17, the EPL).
const read = JSON.parse(fs.readFileSync(new URL('./fixtures/slips/scan-epl-4fold.json', import.meta.url)));
const team = (en, zh) => ({ en, zh, short: zh, logo: '' });
const game = (id, away, home, start = '2026-10-17T14:00:00Z', league = 'epl') => ({ id, league, start, state: 'pre', away, home, score: null, market: null });
const EPL = [
  game('1', team('Chelsea', '切爾西'), team('Everton', '艾佛頓'), '2026-10-17T11:30:00Z'),
  game('2', team('Ipswich Town', '伊普斯維奇'), team('Manchester City', '曼城')),
  game('3', team('Liverpool', '利物浦'), team('Brentford', '布倫特福德')),
  game('4', team('Hull City', '赫爾城'), team('Fulham', '富勒姆')),
  game('5', team('Arsenal', '阿森納'), team('Manchester United', '曼聯'))
];
const NOW = Date.parse('2026-10-17T09:45:00Z');

test('the combinations as printed: 單場, 全部過關, N串1, N串M', () => {
  assert.deepEqual(combosOf(['4串1'], 4), { mode: 'parlay', sizes: [4] });
  assert.deepEqual(combosOf(['全部過關'], 3), { mode: 'parlay', sizes: [3] });
  assert.deepEqual(combosOf(['單場'], 2), { mode: 'single', sizes: [1] });
  assert.deepEqual(combosOf(['3串4'], 3), { mode: 'system', sizes: [2, 3] });
  assert.deepEqual(combosOf(['4串11'], 4), { mode: 'system', sizes: [2, 3, 4] });
  assert.deepEqual(combosOf(['2串1', '3串1'], 3), { mode: 'system', sizes: [2, 3] });
  assert.deepEqual(combosOf(['4串15'], 4), { mode: 'system', sizes: [1, 2, 3, 4] });
  assert.deepEqual(combosOf(['3串7'], 3), { mode: 'system', sizes: [1, 2, 3] });
  assert.deepEqual(combosOf(['2串3'], 2), { mode: 'system', sizes: [1, 2] });
  assert.deepEqual(combosOf(['4串4'], 4), { mode: 'system', sizes: [3] });
  assert.deepEqual(combosOf(['1串1', '2串1', '3串1'], 3), { mode: 'system', sizes: [1, 2, 3] });
  assert.equal(combosOf(['4串1'], 3), null, 'a pick that wasn’t matched: the person chooses');
  assert.equal(combosOf([], 3), null);
});

test('the real 4-pick parlay: every pick on its game and side, NT$700 a combination', async () => {
  const asked = [];
  const { legs, missed } = await matchPicks(read.picks, { now: NOW, games: async (l, d) => (asked.push(`${l}|${d}`), l === 'epl' && d === '2026-10-17' ? EPL : []) });
  assert.equal(missed.length, 0);
  assert.deepEqual(legs.map(l => [l.game.id, l.kind, l.side, l.odds]), [
    ['1', 'ml', 'away', 2.1],
    ['2', 'ml', 'home', 1.17],
    ['3', 'ml', 'home', 2.15],
    ['4', 'ml', 'home', 1.5]
  ]);
  assert.ok(asked.every(k => k.startsWith('epl|')), 'found in the league read first: no other league asked');
  assert.deepEqual(combosOf(read.combos, legs.length), { mode: 'parlay', sizes: [4] });
  assert.equal(stakeOf(read, 1), 700);
});

test('teams printed home first, or a league guessed wrong, still find the game', async () => {
  const pick = { sport: 'soccer', league: 'laliga', teams: ['富勒姆', '赫爾城'], teamsEn: ['Fulham', 'Hull City'], kind: 'ml', pick: '赫爾城', odds: 5.2 };
  const { legs } = await matchPicks([pick], { now: NOW, games: async (l, d) => (l === 'epl' && d === '2026-10-17' ? EPL : []) });
  assert.equal(legs[0].game.id, '4');
  assert.equal(legs[0].side, 'away');
});

test('a pick on no known game is left for the person; lines and sides read through', async () => {
  const none = { sport: 'soccer', league: 'epl', teams: ['熱刺', '紐卡索'], teamsEn: ['Tottenham Hotspur', 'Newcastle United'], kind: 'ml', pick: '熱刺', odds: 2 };
  const { legs, missed } = await matchPicks([none], { now: NOW, games: async () => EPL });
  assert.equal(legs.length, 0);
  assert.equal(missed.length, 1);
  const g = EPL[1];
  const fit = gameFit({ teams: ['伊普斯維奇', '曼城'], teamsEn: [] }, g);
  assert.equal(fit.flipped, false);
  assert.deepEqual(pick(legOf({ teams: ['伊普斯維奇', '曼城'], kind: 'spread', pick: '伊普斯維奇', line: 1.5, odds: 1.8 }, g, false)), ['spread', 'away', 1.5, 1.8]);
  assert.deepEqual(pick(legOf({ teams: ['伊普斯維奇', '曼城'], kind: 'total', pick: 'under', line: 3.5, odds: 1.9 }, g, false)), ['total', 'under', 3.5, 1.9]);
  assert.deepEqual(pick(legOf({ teams: ['伊普斯維奇', '曼城'], kind: 'ml', pick: 'draw', odds: 6 }, g, false)), ['ml', 'draw', undefined, 6]);
  assert.equal(legOf({ teams: ['伊普斯維奇', '曼城'], kind: 'ml', pick: '曼城', odds: null }, g, false), null, 'no odds read: not guessed');
});
const pick = l => [l.kind, l.side, l.line, l.odds];

test('a spread whose line was unreadable is left for the person, not taken as 0', () => {
  const g = EPL[1];
  assert.equal(legOf({ teams: ['伊普斯維奇', '曼城'], kind: 'spread', pick: '曼城', line: null, odds: 1.8 }, g, false), null);
  assert.equal(legOf({ teams: ['伊普斯維奇', '曼城'], kind: 'spread', pick: '曼城', line: '', odds: 1.8 }, g, false), null);
});

test("Gemini's answer read safely: nothing, a bare value, or odd shapes are a failed read or emptied", () => {
  const reply = text => ({ candidates: [{ content: { parts: [{ text }] } }] });
  assert.deepEqual(readOf(reply('null')), { error: 'failed' });
  assert.deepEqual(readOf(reply('[1]')), { error: 'failed' });
  assert.deepEqual(readOf(reply('not json')), { error: 'failed' });
  assert.deepEqual(readOf({}), { error: 'failed' });
  const r = readOf(reply('{"isSlip":true,"picks":{"a":1},"combos":"4串1"}'));
  assert.deepEqual([r.picks, r.combos], [[], ['4串1']]);
  const p = readOf(reply('{"isSlip":true,"picks":[null,{"kind":"ml","teams":"x"}],"combos":[]}')).picks;
  assert.deepEqual(p, [{ kind: 'ml', teams: [], teamsEn: [] }]);
  assert.deepEqual(combosOf('4串1', 4), { mode: 'parlay', sizes: [4] });
});

test('every N串M the lottery prints, to the sizes it buys', () => {
  assert.deepEqual(combosOf(['4串6'], 4), { mode: 'system', sizes: [2] });
  assert.deepEqual(combosOf(['4串4'], 4), { mode: 'system', sizes: [3] });
  assert.deepEqual(combosOf(['4串5'], 4), { mode: 'system', sizes: [3, 4] });
  assert.deepEqual(combosOf(['5串26'], 5), { mode: 'system', sizes: [2, 3, 4, 5] });
  assert.deepEqual(combosOf(['5串16'], 5), { mode: 'system', sizes: [3, 4, 5] });
  assert.deepEqual(combosOf(['5串10'], 5), { mode: 'system', sizes: [2] });
  assert.deepEqual(combosOf(['6串20'], 6), { mode: 'system', sizes: [3] });
  assert.deepEqual(combosOf(['6串15'], 6), { mode: 'system', sizes: [2] });
  assert.deepEqual(combosOf(['3 串 1'], 4), { mode: 'system', sizes: [3] });
  assert.deepEqual(combosOf(['3串6'], 3), { mode: 'system', sizes: [1, 2] }, '過1關 ×3 and 2串1 ×3');
  assert.deepEqual(combosOf(['4串10'], 4), { mode: 'system', sizes: [2, 3] }, 'also 過1關 and 2串1: the larger sizes');
  assert.deepEqual(combosOf(['4串8'], 4), { mode: 'system', sizes: [1, 3] });
  assert.deepEqual(combosOf(['4串9'], 4), { mode: 'system', sizes: [1, 3, 4] });
  assert.equal(combosOf(['3串9'], 3), null, 'no mix of 3 picks makes 9');
  assert.deepEqual(combosOf(['單關'], 1), { mode: 'single', sizes: [1] });
  assert.deepEqual(combosOf(['1串1'], 2), { mode: 'single', sizes: [1] });
  assert.deepEqual(combosOf(['全部過關'], 1), { mode: 'single', sizes: [1] });
  assert.equal(combosOf(['2串1', '3串1'], 2), null, 'a size bigger than the picks matched');
  assert.deepEqual(combosOf(['4串7'], 4), { mode: 'system', sizes: [2, 4] }, '2串1 ×6 and 4串1');
  assert.equal(combosOf(['甚麼'], 2), null);
  assert.equal(combosOf(null, 2), null);
});

test('the amount a combination: as printed (to NT$10), else the total over the combinations', () => {
  assert.equal(stakeOf({ stakePer: 104 }, 1), 100);
  assert.equal(stakeOf({ stakePer: 0, total: 400 }, 4), 100);
  assert.equal(stakeOf({ total: 1000 }, 3), 330);
  assert.equal(stakeOf({ total: 1000 }, 0), null);
  assert.equal(stakeOf({}, 2), null);
  assert.equal(stakeOf({ stakePer: 'abc' }, 2), null);
});

test('picks read as legs: sides by name either way round, totals, odd/even, odds as text', () => {
  const g = EPL[1];
  // Teams printed home first: the game is flipped, the side still the right one.
  const fit = gameFit({ teams: ['曼城', '伊普斯維奇'], teamsEn: [] }, g);
  assert.deepEqual([fit.score, fit.flipped], [6, true]);
  assert.equal(legOf({ teams: ['曼城', '伊普斯維奇'], kind: 'ml', pick: '曼城', odds: '1.17' }, g, true).side, 'home');
  assert.equal(legOf({ teams: ['曼城', '伊普斯維奇'], kind: 'ml', pick: '曼城', odds: '1.17' }, g, true).odds, 1.17);
  // By the English name too.
  assert.equal(legOf({ teams: ['x', 'y'], teamsEn: ['Ipswich', 'Man City'], kind: 'ml', pick: 'Ipswich Town', odds: 4 }, g, false).side, 'away');
  assert.deepEqual(pick(legOf({ teams: [], kind: 'total', pick: '大', line: -2.5, odds: 1.9 }, g, false)), ['total', 'over', 2.5, 1.9]);
  assert.equal(legOf({ teams: [], kind: 'total', pick: '大', line: 0, odds: 1.9 }, g, false), null);
  assert.equal(legOf({ teams: [], kind: 'total', pick: '?', line: 2.5, odds: 1.9 }, g, false), null);
  assert.equal(legOf({ teams: [], kind: 'oddeven', pick: '單', odds: 1.9 }, g, false).side, 'odd');
  assert.equal(legOf({ teams: [], kind: 'oddeven', pick: 'even', odds: 1.9 }, g, false).side, 'even');
  assert.equal(legOf({ teams: [], kind: 'other', pick: 'x', odds: 1.9 }, g, false), null);
  assert.equal(legOf({ teams: ['伊普斯維奇', '曼城'], kind: 'ml', pick: '誰', odds: 2 }, g, false), null, 'a side it can’t tell');
  // A draw only where there are draws.
  const nba = { ...g, league: 'nba' };
  assert.equal(legOf({ teams: [], kind: 'ml', pick: '和', odds: 9 }, nba, false), null);
  assert.equal(legOf({ teams: [], kind: 'ml', pick: '和', odds: 1 }, g, false), null, 'odds of 1 are no odds');
  assert.notEqual(legOf({ kind: 'oddeven', pick: '單', odds: 2 }, g, false).id, legOf({ kind: 'oddeven', pick: '單', odds: 2 }, g, false).id);
});

test('matching: a printed date narrows the days; a league that fails is no games; called-off games are skipped; it says how far it is', async () => {
  const asked = [];
  const p = { sport: 'soccer', league: 'epl', teams: ['切爾西', '艾佛頓'], teamsEn: [], kind: 'ml', pick: '切爾西', odds: 2.1, date: '2026-10-17' };
  const steps = [];
  const r = await matchPicks([p], { now: NOW, games: async (l, d) => (asked.push(d), d === '2026-10-17' ? EPL : []), progress: (d, n) => steps.push(`${d}/${n}`) });
  assert.equal(r.legs.length, 1);
  assert.deepEqual([...new Set(asked)].sort(), ['2026-10-16', '2026-10-17', '2026-10-18']);
  assert.deepEqual(steps, ['1/1']);
  const off = await matchPicks([p], { now: NOW, games: async () => EPL.map(g => ({ ...g, state: 'void' })) });
  assert.equal(off.missed.length, 1);
  const broken = await matchPicks([p], { now: NOW, games: async () => Promise.reject(new Error('down')) });
  assert.equal(broken.missed.length, 1);
  assert.deepEqual(await matchPicks([], { now: NOW, games: async () => EPL }), { legs: [], missed: [] });
});

test('a team printed with 臺 matches the game that has it as 台, and the other way round', () => {
  const g = { ...game('9', team('Fubon Guardians', '富邦悍將'), team('TSG Hawks', '台鋼雄鷹'), '2026-10-17T10:35:00Z', 'cpbl') };
  assert.ok(gameFit({ teams: ['富邦悍將', '臺鋼雄鷹'], teamsEn: [] }, g).score >= 4);
  const h = { ...g, home: team('X', '臺鋼雄鷹') };
  assert.ok(gameFit({ teams: ['富邦悍將', '台鋼雄鷹'], teamsEn: [] }, h).score >= 4);
});

test('an old ticket: its games found from the day bought, settled on the final scores, kept on its own days', async () => {
  // Bought 2026-08-01 (民 115/08/01), scanned in October: a tied CPBL game (不讓分 void) and an NHL win in 60 minutes.
  const now = Date.parse('2026-10-19T03:00:00Z');
  const done = (id, league, away, home, start, score) => ({ ...game(id, away, home, start, league), state: 'post', score });
  const cpbl = done('cpbl:1', 'cpbl', team('Rakuten Monkeys', '樂天桃猿'), team('Uni-President Lions', '統一7-ELEVEn獅'), '2026-08-01T10:35:00Z', { home: 3, away: 3 });
  const nhl = done('nhl:2', 'nhl', team('Boston Bruins', '波士頓棕熊'), team('Toronto Maple Leafs', '多倫多楓葉'), '2026-08-01T23:00:00Z', { home: 4, away: 2 });
  const asked = [];
  const picks = [
    { sport: 'baseball', league: 'cpbl', teams: ['樂天桃猿', '統一獅'], teamsEn: ['Rakuten Monkeys', 'Uni-President Lions'], date: null, kind: 'ml', pick: '樂天桃猿', odds: 1.8 },
    { sport: 'hockey', league: 'nhl', teams: ['波士頓棕熊', '多倫多楓葉'], teamsEn: ['Boston Bruins', 'Toronto Maple Leafs'], date: null, kind: 'ml', pick: '多倫多楓葉', odds: 1.9 }
  ];
  const games = async (l, d) => (asked.push(d), l === 'cpbl' && d === '2026-08-01' ? [cpbl] : l === 'nhl' && d === '2026-08-02' ? [nhl] : []);
  const { legs, missed } = await matchPicks(picks, { now, bought: '2026-08-01', games });
  assert.equal(missed.length, 0);
  assert.ok(!asked.some(d => d.startsWith('2026-10')), 'looked around the day bought, not today');
  const v = slipView({ id: 's', mode: 'parlay', sizes: [2], stake: 100, legs });
  assert.deepEqual(v.legs.map(l => l.result), ['void', 'won']);
  assert.equal(v.status, 'won');
  assert.equal(v.paid.gross, 190, 'the tie at 1.00, so 100 × 1.9');
  assert.deepEqual(timesOf(legs, '2026-08-01', now), { created: '2026-08-01T04:00:00.000Z', settledAt: '2026-08-01T23:00:00.000Z' });
  // No day printed: just before the first game. A game still to come: bought now, settled when it ends.
  assert.equal(timesOf(legs, null, now).created, '2026-08-01T10:34:00.000Z');
  assert.deepEqual(timesOf([{ game: { ...nhl, start: '2026-10-20T00:00:00Z', state: 'pre' } }], '2026-10-19', now), { created: new Date(now).toISOString() });
  // A day bought said to be later than today is not believed.
  const later = await matchPicks([picks[1]], { now, bought: '2026-12-01', games: async (l, d) => (asked.push(d), []) });
  assert.equal(later.missed.length, 1);
  assert.ok(asked.includes('2026-10-19'));
});

test("運彩's newer bets read off a ticket: 第一球, 不讓分/大小, 半場雙勝, 上半場正確比數, 主客隊正確進球數, 得分較高半場", () => {
  const g = EPL[1];
  const t = ['伊普斯維奇', '曼城'];
  const L = more => legOf({ teams: t, odds: 3, ...more }, g, false);
  assert.equal(L({ kind: 'firstgoal', pick: '曼城' }).side, 'home');
  assert.equal(L({ kind: 'lastgoal', pick: 'none' }).side, 'none');
  assert.deepEqual([L({ kind: 'mltotal', pick: 'home|over', line: 2.5 }).side, L({ kind: 'mltotal', pick: 'home|over', line: 2.5 }).line], ['home|over', 2.5]);
  assert.equal(L({ kind: 'mlbtts', pick: '曼城|yes' }).side, 'home|yes');
  assert.equal(L({ kind: 'hdc', pick: 'away|home' }).side, 'home|away');
  assert.equal(L({ kind: 'hscore', pick: '1-0' }).score, '1-0');
  assert.deepEqual(L({ kind: 'hscore', pick: 'other' }).listed.length, 11);
  const tg = L({ kind: 'teamgoals', team: '伊普斯維奇', pick: '3+', band: '3+' });
  assert.deepEqual([tg.team, tg.lo, tg.hi], ['away', 3, null]);
  assert.equal(L({ kind: 'higherhalf', pick: '下半場' }).side, 'second');
  assert.deepEqual([L({ kind: 'qrunline', pick: '曼城', line: -2.5 }).line, L({ kind: 'qrunline', pick: '曼城', line: -2.5 }).period], [-2.5, 1]);
  assert.equal(L({ kind: 'raceto', pick: '伊普斯維奇', line: 3 }).line, 3);
  assert.equal(L({ kind: 'topperiod', pick: '平手' }).side, 'tie');
  assert.equal(L({ kind: 'teamhits', team: '曼城', pick: 'over', line: 8.5 }).team, 'home');
});
