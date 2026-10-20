import test from 'node:test';
import assert from 'node:assert/strict';
import { readBoard, boardLottery } from '../public/lib/boardstart.mjs';
import * as boardKit from '#kit/play-boardfile.mjs';

const NOW = Date.parse('2026-10-19T09:30:00Z');
const minutesAgo = m => new Date(NOW - m * 60_000).toISOString();
const game = (id, sport, hours) => ({
  id, sport, startUtc: new Date(NOW + hours * 3_600_000).toISOString(),
  away: { en: 'Away', zh: '客' }, home: { en: 'Home', zh: '主' },
  p: [{ i: 'ml|home', fairChance: 0.55, estOdds: 1.7, tag: 'steady' }, { i: 'ml|away', fairChance: 0.45, estOdds: 2.1 }]
});
const board = (over = {}) => ({
  v: 1, built: minutesAgo(5), until: minutesAgo(-4000), covered: ['mlb', 'epl'], missed: [], counts: { mlb: 40, epl: 12 }, f1: 1, live: ['mlb'],
  games: [game('mlb1', 'mlb', 3), game('epl1', 'epl', 20)],
  lottery: { upcoming: { super638: { date: '2026-10-22', jackpot: { amount: 480e6, desc: '上看' } } }, latest: { super638: { jackpot: 410e6 } } },
  ...over
});
const read = (file, extra = {}) => readBoard({ packJson: async () => file, now: NOW, ...extra });

test('a fresh board is used, with the kit that unpacks it', async () => {
  const used = await read(board());
  assert.ok(used);
  const { games, bets, recs } = used.mod.unpackBoard(used.file);
  assert.equal(games.length, 2);
  assert.equal(bets.length, 4);
  assert.equal(recs.get('mlb1|ml|home').tag, 'steady');
  assert.equal(bets[0].kind, 'ml');
  assert.equal(bets[0].estOdds, 1.7);
});

test('the board is asked for as play/board.json, one read', async () => {
  const asked = [];
  await readBoard({ packJson: async (path, opts) => (asked.push([path, opts.timeout]), board()), now: NOW });
  assert.deepEqual(asked, [['play/board.json', 4000]]);
});

test('a board older than 30 minutes is not used (the device may hand back an old copy)', async () => {
  assert.equal(await read(board({ built: minutesAgo(31) })), null);
  assert.ok(await read(board({ built: minutesAgo(29) })));
});

test('a missing, failing or broken board is not used', async () => {
  assert.equal(await read(null), null);
  assert.equal(await readBoard({ packJson: async () => { throw Object.assign(new Error('HTTP 404'), { status: 404 }); }, now: NOW }), null);
  assert.equal(await readBoard({ packJson: () => { throw new Error('no packs'); }, now: NOW }), null);
  assert.equal(await readBoard({ now: NOW }), null);
  assert.equal(await read({ nonsense: true }), null);
  assert.equal(await read('<html>'), null);
  assert.equal(await read(board({ v: 2 })), null);
  assert.equal(await read(board({ games: 'x' })), null);
  assert.equal(await read(board({ built: 'yesterday' })), null);
  assert.equal(await read(board({ games: [] })), null);
});

test('a kit file that does not load runs the current path', async () => {
  assert.equal(await read(board(), { loadKit: async () => { throw new Error('404'); } }), null);
});

test('the kit and the rule agree: the kit decides the age', () => {
  assert.equal(boardKit.BOARD_STALE_MS, 30 * 60_000);
});

test('the lottery feed is the board\'s only when whole', () => {
  assert.equal(boardLottery(board()).upcoming.super638.jackpot.amount, 480e6);
  assert.equal(boardLottery(board({ lottery: null })), null);
  assert.equal(boardLottery(board({ lottery: { upcoming: {}, latest: null } })), null);
  assert.equal(boardLottery(board({ lottery: { upcoming: null, latest: {} } })), null);
});
