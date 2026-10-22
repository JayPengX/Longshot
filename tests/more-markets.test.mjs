import { test } from 'node:test';
import assert from 'node:assert/strict';
import { goalMarkets, fitHockey, baseballMarkets } from '../public/kit/play-markets.mjs';
import { legResult } from '../public/lib/account.mjs';

const sum = picks => picks.reduce((s, p) => s + p.fair, 0);

test('Hockey: total goals, margin and 單雙 (on 60 minutes, as 台灣運彩 sells it)', () => {
  const markets = goalMarkets(fitHockey(0.55, { line: 5.5, overFair: 0.5 }), { family: 'hockey', totalLine: 5.5 });
  const kinds = new Set(markets.map(m => m.kind));
  // 運彩's hockey list: 正確進球數 in place of both teams to score and the goal bands.
  const goals = ['goalcount'];
  for (const k of ['runline', 'teamtotal', 'total', ...goals, 'margin']) assert.ok(kinds.has(k), k);
  // 單雙 on 60 minutes: on 運彩's hockey list.
  assert.ok(kinds.has('oddeven'));
  for (const k of [...goals, 'margin']) assert.ok(Math.abs(sum(markets.find(m => m.kind === k).picks) - 1) < 1e-6, k);
  assert.ok(!kinds.has('btts') && !kinds.has('goalbands'));
  // No final ends level.
  assert.equal(legResult({ kind: 'btts', side: 'yes' }, { status: 'final', awayScore: 3, homeScore: 2 }), 'won');
  assert.equal(legResult({ kind: 'goalbands', lo: 5, hi: 6 }, { status: 'final', awayScore: 3, homeScore: 2 }), 'won');
  // (A ticket bought on the earlier markets still settles.)
  assert.equal(legResult({ kind: 'goalcount', lo: 5, hi: 5 }, { status: 'final', awayScore: 3, homeScore: 2 }), 'won');
});

test('Baseball: first five innings total, settled from the innings', () => {
  const markets = baseballMarkets({ homeWin: 0.55, total: { line: 8.5, overFair: 0.5 } });
  const f5 = markets.filter(m => m.kind === 'f5total');
  assert.ok(f5.length >= 2);
  const main = f5.find(m => m.posted);
  assert.ok(main.line > 3 && main.line < 6, String(main.line));
  for (const m of f5) assert.ok(Math.abs(sum(m.picks) - 1) < 1e-9);
  const outcome = { status: 'final', awayScore: 5, homeScore: 3, awayInnings: [1, 0, 2, 0, 0, 1, 1, 0, 0], homeInnings: [0, 0, 1, 1, 0, 0, 1, 0, 0] };
  assert.equal(legResult({ kind: 'f5total', side: 'over', line: 4.5 }, outcome), 'won');
  assert.equal(legResult({ kind: 'f5total', side: 'under', line: 4.5 }, outcome), 'lost');
  assert.equal(legResult({ kind: 'f5total', side: 'over', line: 4.5 }, { status: 'final', awayScore: 1, homeScore: 0, awayInnings: [1, 0, 0, 0], homeInnings: [0, 0, 0, 0] }), 'void');
});

