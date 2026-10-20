// Why a pick is sold only in a parlay, as the slip says it (a Mac tester's
// 1.06 on 單場 said only "needs a parlay of 3+ games"): its short odds, with
// them, or its game's own 限關 (the kit's eventMinLegs, 投注規範 §21). Passes on
// the kit before eventMinLegs too (there every minimum is the price band's).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as rules from '../public/lib/rules.mjs';
import { minLegsWhy, priceLimits } from '../public/lib/slip.mjs';
import { STRINGS, makeT } from '../public/lib/i18n.mjs';

const hasEvent = typeof rules.eventMinLegs === 'function';

test("a short price's 限關 says it comes from the odds, with them (a kit that has price bands); else never", () => {
  const bet = rules.withRules({ kind: 'ml', estOdds: 1.2 });
  assert.equal(minLegsWhy(rules.withRules({ kind: 'ml', estOdds: 1.9 })), null);
  assert.equal(priceLimits, bet.minLegs > 1);
  if (priceLimits) {
    assert.equal(bet.minLegs, 2);
    assert.deepEqual(minLegsWhy(bet), { from: 'odds', n: 2, odds: 1.2 });
  } else {
    // play-rules-r7: 1.06 sells as a single, and no minimum is ever put down to the odds.
    assert.equal(bet.minLegs, 1);
    assert.equal(minLegsWhy(bet), null);
    assert.deepEqual(minLegsWhy({ kind: 'ml', estOdds: 1.06, minLegs: 3 }), { from: 'event', n: 3 });
  }
  const zh = makeT('zh');
  assert.equal(zh('minLegsNote', { n: 3, odds: '1.06' }), '賠率 1.06 偏低：只能串 3 關以上');
  assert.equal(zh('slipError_minLegsOdds', { need: 3, odds: '1.06', pick: '' }), '賠率 1.06 偏低：只能串 3 關以上');
  assert.match(makeT('en')('slipError_minLegsOdds', { need: 3, odds: '1.06', pick: '' }), /1\.06.*3\+/);
});

test("a game's own minimum says it comes from the game, whatever its price", () => {
  const zh = makeT('zh');
  assert.equal(zh('minLegsNoteEvent', { n: 2 }), '這場比賽限串 2 關以上');
  assert.equal(zh('slipError_minLegsEvent', { need: 3, pick: '' }), '這場比賽限串 3 關以上');
  if (!hasEvent) return;
  // A game sold 限3關 at 1.90 (no price band would limit it), and 限2關 at 1.06 (the game's minimum wins).
  const at = (odds, minLegs) => rules.withRules({ kind: 'ml', estOdds: odds, game: { minLegs } });
  assert.deepEqual(minLegsWhy(at(1.9, 3)), { from: 'event', n: 3 });
  assert.deepEqual(minLegsWhy(at(1.06, 2)), { from: 'event', n: 2 });
  assert.equal(at(1.06, 2).minLegs, 2);
  assert.deepEqual(rules.houseRule('ml', 1.9, { event: 3 }), { lock: null, minLegs: 3 });
});

test('every minimum message is in both languages and says 關 in Chinese', () => {
  for (const k of ['minLegsNote', 'minLegsNoteEvent', 'slipError_minLegsOdds', 'slipError_minLegsEvent']) {
    assert.ok(STRINGS.zh[k] && STRINGS.en[k], k);
    assert.match(STRINGS.zh[k], /關/, k);
  }
  assert.doesNotMatch(STRINGS.zh.minLegsNoteEvent, /賠率/);
});
