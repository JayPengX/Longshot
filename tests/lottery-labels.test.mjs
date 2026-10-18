import test from 'node:test';
import assert from 'node:assert/strict';
import { termLabel, termOf, cutoffAt, tierName, tierRule, digitRule } from '../public/lottery-labels.mjs';
import { GAMES, nextDraw, CLOSE_MS } from '../public/lib/lottery.mjs';

test('期別 reads like the real site, and is empty without a term', () => {
  assert.equal(termLabel(115000083), '第 115000083 期');
  assert.equal(termLabel('115000083', 'en'), 'Draw 115000083');
  for (const none of [undefined, null, '', 0]) assert.equal(termLabel(none), '');
  assert.equal(termOf({}, { term: 115000083 }), 115000083);
  assert.equal(termOf({}, undefined), '');
});

test('sales close before the draw: the kit\'s half hour, a minute for BINGO', () => {
  const d = nextDraw('lotto649', Date.parse('2026-10-18T00:00:00+08:00'));
  assert.equal(d.at - cutoffAt('lotto649', d.at), CLOSE_MS);
  const b = nextDraw('bingo', Date.parse('2026-10-18T08:00:00+08:00'));
  assert.equal(b.at - cutoffAt('bingo', b.at), 60_000);
});

test('獎別 and the prize-table rules', () => {
  assert.equal(tierName('lotto649', 'second', 'zh'), '貳獎');
  assert.equal(tierName('star3', 'first', 'zh'), '壹獎');
  assert.equal(tierName('super638', 'normal', 'en'), 'Consolation');
  assert.equal(tierName('bingo', '5'), '');
  const t649 = GAMES.lotto649.tiers;
  assert.equal(tierRule(t649[1], 'zh'), '對中 5 個號碼＋特別號');
  assert.equal(tierRule(t649[1], 'en'), '5 + special number');
  assert.equal(tierRule(t649[2], 'zh'), '對中 5 個號碼');
  const s = GAMES.super638.tiers;
  assert.equal(tierRule(s[2], 'zh'), '第1區 5 個＋第2區');
  assert.equal(tierRule(s[3], 'en'), '5');
  assert.equal(tierRule(s[8], 'en'), '3');
  assert.equal(tierRule(s[6], 'en'), '3 + zone 2');
  assert.equal(digitRule({ hits: 2 }, 'zh'), '後 2 碼相同');
});
