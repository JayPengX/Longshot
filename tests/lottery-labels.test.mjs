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

// ---- What the slip offers ----
import * as L from '../public/lib/lottery.mjs';
import { gameLimits, periodsFor, MAX_SOLD, zoneMax, comboMax, isSystem, jackpotOf, bySeries, winsText, pendingPrize, nextTerm } from '../public/lottery-labels.mjs';
import { newAccount } from '../public/lib/account.mjs';

const at = new Date('2026-10-19T10:00:00+08:00');

test('倍數 and 多期 as each game takes them, never past what the kit sells', () => {
  // 台灣彩券's 投注方式: no 倍數 on 威力彩, 大樂透 and 今彩539; ×10 樂合彩; ×50 the rest.
  assert.deepEqual(['super638', 'lotto649', 'daily539', 'm39', 'm49', 'star3', 'star4', 'bingo'].map(id => gameLimits(id).multiple), [1, 1, 1, 10, 10, 50, 50, 50]);
  for (const id of L.GAME_ORDER) {
    const { multiple, periods } = gameLimits(id);
    const sel = id === 'bingo' ? { numbers: [1, 2, 3] } : GAMES[id].digits ? { digits: Array(GAMES[id].digits).fill(1), play: 'straight' } : GAMES[id].combo ? { numbers: [1, 2], size: 2 } : { zones: GAMES[id].zones.map(z => Array.from({ length: z.n }, (_, i) => i + 1)) };
    const r = L.buyTicket(newAccount(at), { id: 'x', game: id, sel, multiple, periods }, at, { extra: 1e9 });
    assert.ok(r.ticket, `${id}: ${r.error}`);
    assert.equal(r.ticket.multiple, multiple, id);
    assert.deepEqual({ multiple, periods }, L.limits(id), id);
    assert.equal(r.tickets.length, periods, id);
    // One past it is refused.
    if (multiple === 1) assert.equal(L.buyTicket(newAccount(at), { id: 'y', game: id, sel, multiple: 2 }, at, { extra: 1e9 }).error, 'multiple');
  }
  // One sale is 120 tickets at most (Shared-Proxy lotto.js MAX_SOLD).
  assert.ok(periodsFor('daily539', 10) * 10 <= MAX_SOLD);
  assert.equal(periodsFor('daily539', 200), 1);
});

test('多期: a ticket a draw, each with its series, shown once while open', () => {
  const r = L.buyTicket(newAccount(at), { id: 'abc12345', game: 'lotto649', sel: { zones: [[1, 2, 3, 4, 5, 6]] }, periods: 3 }, at);
  assert.deepEqual(r.tickets.map(x => x.id), ['abc12345', 'abc12345-2', 'abc12345-3']);
  assert.deepEqual(r.tickets.map(x => x.draw.date), L.nextDraws('lotto649', at.getTime(), 3).map(d => d.date));
  const groups = bySeries([...r.tickets].reverse());
  assert.equal(groups.length, 1);
  assert.equal(groups[0].first.id, 'abc12345');
  assert.equal(groups[0].all.length, 3);
  assert.equal(bySeries([{ id: 'a' }, { id: 'b' }]).length, 2);
});

test('包牌: as many numbers as the kit takes, its bets counted', () => {
  const z = GAMES.super638.zones;
  assert.deepEqual(z.map(zoneMax), [16, 8]);
  assert.equal(zoneMax(GAMES.lotto649.zones[0]), 16);
  assert.equal(comboMax(GAMES.m39), 10);
  // 台灣彩券's own example: 8 + 2 numbers make 28 × 2 = 56 bets.
  const sel = { zones: [[1, 2, 3, 4, 5, 6, 7, 8], [1, 2]] };
  assert.ok(L.checkSelection('super638', sel).ok);
  assert.ok(isSystem('super638', sel));
  assert.equal(L.betCount('super638', sel), 56);
  assert.ok(L.checkSelection('super638', { zones: [Array.from({ length: 16 }, (_, i) => i + 1), [1]] }).ok);
  assert.ok(L.checkSelection('super638', { zones: [Array.from({ length: 17 }, (_, i) => i + 1), [1]] }).error);
  for (const id of ['super638', 'lotto649', 'daily539']) {
    const most = { zones: GAMES[id].zones.map(z => Array.from({ length: zoneMax(z) }, (_, i) => i + 1)) };
    assert.ok(L.checkSelection(id, most).ok, id);
  }
  assert.equal(isSystem('lotto649', { zones: [[1, 2, 3, 4, 5, 6]] }), false);
});

test('results: 期別 from the kit\'s period, prizes not announced keep a ticket open, 包牌 wins by tier', () => {
  assert.equal(termOf({ period: 115000084 }), 115000084);
  assert.equal(termOf({ term: 115000083 }, { period: 1 }), 115000083);
  assert.equal(winsText('lotto649', [{ tier: 'third', n: 1, prize: 1 }]), '');
  assert.equal(winsText('lotto649', [{ tier: 'fifth', n: 2 }, { tier: 'normal', n: 5 }], 'zh'), `${tierName('lotto649', 'fifth')} ×2 · ${tierName('lotto649', 'normal')} ×5`);
  const ticket = { game: 'lotto649', sel: { zones: [[1, 2, 3, 4, 5, 6]] }, bets: 1 };
  // A 頭獎 drawn before its pool is out.
  const early = { numbers: [1, 2, 3, 4, 5, 6], special: 9, pools: {}, paid: false };
  assert.equal(pendingPrize(ticket, early), true);
  assert.equal(pendingPrize(ticket, null), false);
  assert.equal(L.settleTicket({ ...newAccount(at), tickets: [{ ...ticket, id: 't', status: 'open', cost: 50, draw: { date: '2026-10-20', at: 0 } }] }, 't', early).tickets[0].status, 'open');
  // BINGO's 期別 is exact before the draw.
  assert.equal(nextTerm('bingo', { date: '2026-10-17', slot: 0 }), 115058668);
});

test('the jackpot as Taiwan Lottery advertises it: 上看, or 保證 at the floor', () => {
  assert.deepEqual(jackpotOf({ jackpot: { amount: 320_000_000, desc: '上看' } }, { jackpot: 1 }), { label: '頭獎上看', short: '上看', amount: 320_000_000 });
  assert.equal(jackpotOf({ jackpot: { amount: 200_000_000, desc: '保證' } }, null).label, '頭獎保證');
  assert.equal(jackpotOf(null, { jackpot: 5e7 }, 'en').amount, 5e7);
  assert.equal(jackpotOf({}, {}), null);
});
