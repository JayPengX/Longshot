// The page's words (Chinese under Node): times in Taiwan, picks, statuses, the share text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { when, dayText, statusOf, pickText, shareText, signedMoney, money, pct, odds2, signed, standOf } from '../public/slips/lib/words.mjs';
import { slipView } from '../public/slips/lib/ticket.mjs';

const team = (en, zh) => ({ en, zh, short: zh, abbr: '', logo: '' });
const game = (extra = {}) => ({ id: 'nba:1', league: 'nba', start: '2026-10-18T11:30:00Z', home: team('Boston Celtics', '塞爾提克'), away: team('New York Knicks', '尼克'), state: 'pre', score: null, period: 0, clock: '', detail: '', market: null, ...extra });
const NOW = Date.parse('2026-10-18T02:00:00Z'); // 10:00 on Sunday 10/18 in Taiwan

test("times are Taiwan's: today, tomorrow, yesterday, else the date and weekday", () => {
  assert.deepEqual(when('2026-10-18T11:30:00Z', NOW), { day: '今天', time: '19:30' });
  // 00:30 Taiwan on the 19th, still the 18th in UTC.
  assert.deepEqual(when('2026-10-18T16:30:00Z', NOW), { day: '明天', time: '00:30' });
  assert.deepEqual(when('2026-10-17T15:59:00Z', NOW), { day: '昨天', time: '23:59' });
  assert.deepEqual(when('2026-10-21T01:00:00Z', NOW), { day: '10/21（三）', time: '09:00' });
  assert.equal(dayText('2026-10-17T16:30:00Z'), '10/18');
  assert.equal(dayText('2026-01-01T00:00:00Z'), '1/1');
});

test('a game where it is: to come, on (innings, quarters, minutes), at half-time, over, called off', () => {
  assert.deepEqual(statusOf(game(), NOW), { text: '今天 19:30', live: false });
  assert.equal(statusOf(game({ state: 'in', period: 3, clock: '5:21' })).text, '第3節 5:21');
  assert.equal(statusOf(game({ state: 'in', period: 2, clock: '0.0', detail: 'End of 2nd' })).text, '第2節結束');
  assert.equal(statusOf(game({ state: 'in', period: 5, clock: '2:00' })).text, '延長賽 2:00');
  assert.equal(statusOf(game({ league: 'mlb', state: 'in', detail: 'Bot 7th' })).text, '7局下');
  assert.equal(statusOf(game({ league: 'mlb', state: 'in', detail: 'Top 1st' })).text, '1局上');
  assert.equal(statusOf(game({ league: 'mlb', state: 'in', detail: 'Mid 3rd' })).text, '3局中');
  assert.equal(statusOf(game({ league: 'mlb', state: 'in', detail: 'End 9th' })).text, '9局結束');
  assert.equal(statusOf(game({ league: 'cpbl', state: 'in' })).text, '進行中');
  assert.equal(statusOf(game({ league: 'epl', state: 'in', clock: "67'" })).text, "67'");
  assert.deepEqual(statusOf(game({ league: 'epl', id: 'epl:9', state: 'in', detail: 'HT' })), { text: '中場休息', live: true, ht: 'epl:9' });
  assert.equal(statusOf(game({ state: 'post', detail: 'Final/OT' })).text, '完賽（延長）');
  assert.equal(statusOf(game({ state: 'post', detail: 'Final' })).text, '完賽');
  assert.equal(statusOf(game({ state: 'void' })).text, '延賽或取消');
});

test('a pick in words', () => {
  const g = game();
  assert.equal(pickText({ kind: 'ml', side: 'home', game: g }), '塞爾提克 勝');
  assert.equal(pickText({ kind: 'ml', side: 'draw', game: g }), '和局');
  assert.equal(pickText({ kind: 'spread', side: 'away', line: 4.5, game: g }), '尼克 +4.5');
  assert.equal(pickText({ kind: 'spread', side: 'home', line: -4.5, game: g }), '塞爾提克 -4.5');
  assert.equal(pickText({ kind: 'total', side: 'under', line: 220.5, game: g }), '小 220.5');
  assert.equal(pickText({ kind: 'oddeven', side: 'even', game: g }), '雙');
  assert.equal(pickText({ kind: 'what', game: g }), '');
});

test('numbers: NT$ with separators and one minus sign, percentages, odds', () => {
  assert.equal(money(1234567.4), 'NT$1,234,567');
  assert.equal(signedMoney(1200), '+NT$1,200');
  assert.equal(signedMoney(-300), '−NT$300');
  assert.equal(signedMoney(0), 'NT$0');
  assert.equal(pct(0.256), '26%');
  assert.equal(pct(0.0456, 1), '4.6%');
  assert.equal(odds2(1.5), '1.50');
  assert.equal(odds2(Infinity), '—');
  assert.equal(odds2(null), '—');
  assert.equal(signed(0), '0');
  assert.equal(signed(-1.5), '-1.5');
});

test('a ticket shared as words: each pick marked with its score, what it pays', () => {
  const won = game({ state: 'post', score: { home: 110, away: 100 } });
  const on = game({ id: 'nba:2', state: 'in', period: 1, clock: '3:00', score: { home: 10, away: 12 } });
  const slip = { id: 's', mode: 'parlay', sizes: [2], stake: 100, legs: [{ id: 'a', kind: 'ml', side: 'home', odds: 1.8, game: won }, { id: 'b', kind: 'total', side: 'over', line: 210.5, odds: 1.9, game: on }] };
  const text = shareText(slip, slipView(slip));
  const lines = text.split('\n');
  assert.equal(lines[0], '我的運彩注單：2串1 · NT$100');
  assert.equal(lines[1], '✓ 塞爾提克 勝 @1.80（尼克 @ 塞爾提克 100–110）');
  assert.equal(lines[2], '● 大 210.5 @1.90（尼克 @ 塞爾提克 12–10）');
  assert.match(lines[3], /^全中可得 NT\$342 · 現在價值 NT\$\d+/);
  assert.equal(lines.at(-1), '— Longshot');
  const lost = { ...slip, legs: [{ ...slip.legs[0], side: 'away' }, slip.legs[1]] };
  assert.equal(shareText(lost, slipView(lost)).split('\n')[3], '未中獎');
});

test('a live pick says how it stands on the score', () => {
  const g = { league: 'nba', state: 'in', score: { away: 71, home: 78 }, away: { zh: '尼克', en: 'Knicks' }, home: { zh: '塞爾提克', en: 'Celtics' } };
  assert.deepEqual(standOf({ kind: 'spread', side: 'home', line: -4.5, game: g }), { text: '讓分後領先 2.5 分', tone: 'ahead' });
  assert.deepEqual(standOf({ kind: 'ml', side: 'away', game: g }), { text: '落後 7 分', tone: 'behind' });
  assert.deepEqual(standOf({ kind: 'total', side: 'over', line: 220.5, game: g }), { text: '已 149 分 · 還差 72 分', p: 149 / 220.5, tone: '' });
  assert.equal(standOf({ kind: 'spread', side: 'home', line: -4.5, game: { ...g, state: 'post' } }), null);
  assert.equal(standOf({ kind: 'ml', side: 'home', game: { ...g, league: 'epl', score: { away: 1, home: 2 } } }).text, '領先 1 球');
});
