import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, CARD_ORDER, tiersOf, expectedReturn, face, facePays, drawPrize, buyScratch, revealScratch, topPrize } from '../public/lib/scratch.mjs';
import { newAccount as emptyAccount, balance } from '../public/lib/account.mjs';

const START_BALANCE = 10_000;
// An account with NT$10,000 of its own to bet with (the wallet's money, in the app).
const newAccount = (now, { start = true } = {}) => {
  const a = emptyAccount(now);
  return start ? { ...a, ledger: [{ id: 'start', t: a.created, kind: 'start', amount: START_BALANCE }] } : a;
};

// The cards are Taiwan Lottery's own (all 24 on sale since 2026-10); the earlier
// twelve are `retired`.

test('the cards on sale, each paying back like a real one of its price', () => {
  assert.ok(CARD_ORDER.length >= 5);
  assert.ok(CARD_ORDER.every(id => !CARDS[id].retired));
  // By price, the cheapest first.
  assert.deepEqual(CARD_ORDER.map(id => CARDS[id].price), CARD_ORDER.map(id => CARDS[id].price).sort((a, b) => a - b));
  // The card's own words: 大力士分數 and 幸運號碼.
  assert.match(CARDS.beat.how.zh, /大力士分數/);
  assert.match(CARDS.numbers.how.zh, /幸運號碼/);
  for (const id of CARD_ORDER) {
    // As Taiwan Lottery's 2026 cards: 60% back at NT$100 up to 75% at the dearest.
    const r = expectedReturn(id);
    assert.ok(r > 0.59 && r < 0.76, `${id}: ${r}`);
    // A real card's top prize can be as small as 440 times its price (好運發發's NT$88,000).
    assert.ok(topPrize(id) >= CARDS[id].price * 400, `${id} top`);
  }
});

test('every card face shows exactly the prize it was bought with', () => {
  for (const id of CARD_ORDER) {
    for (const prize of [0, ...tiersOf(id).map(t => t.prize)]) {
      for (let seed = 1; seed <= 60; seed++) {
        const f = face(id, prize, seed * 7919);
        assert.equal(facePays(id, f), prize, `${id} ${prize} seed ${seed}`);
      }
    }
  }
});

test('the prize draw follows the table', () => {
  let n = 0;
  let won = 0;
  let i = 0;
  const rand = () => ((i = (i * 1103515245 + 12345) % 2147483648), i / 2147483648);
  for (; n < 200_000; n++) won += drawPrize('lucky7', rand);
  // The top prizes are too rare to show in 200,000 cards: the rest of the
  // table is what's measured.
  const r = won / n / CARDS.lucky7.price;
  assert.ok(r > 0.45 && r < 0.8, `returned ${r}`);
});

test('buying costs the price; scratching pays the prize once', () => {
  const now = new Date('2026-09-28T10:00:00+08:00');
  // A NT$200 card on sale (獎金對決).
  const card = 'beat';
  const bought = buyScratch(newAccount(now), { id: 's1', card }, now, { rand: () => 0.01, seed: 5 });
  assert.equal(bought.ticket.prize, 200);
  assert.equal(balance(bought.account), 10_000 - 200);
  const shown = revealScratch(bought.account, 's1', now);
  assert.equal(balance(shown), 10_000);
  assert.equal(revealScratch(shown, 's1', now), shown);
  assert.equal(buyScratch(newAccount(now, { start: false }), { id: 's2', card: 'million' }, now).error, 'funds');
});

test('a retired card can\'t be bought, but one bought before still scratches and pays', () => {
  const now = new Date('2026-09-28T10:00:00+08:00');
  assert.equal(buyScratch(newAccount(now), { id: 's3', card: 'triple' }, now).error, 'game');
  // A 三個一樣 bought before the lineup changed: its face and prize as it was.
  const old = { ...newAccount(now), tickets: [{ id: 'old1', t: now.toISOString(), game: 'scratch:triple', card: 'triple', cost: 200, prize: 400, seed: 9, status: 'open' }] };
  assert.equal(facePays('triple', face('triple', 400, 9)), 400);
  assert.equal(revealScratch(old, 'old1', now).tickets[0].status, 'settled');
});
