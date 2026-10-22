import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newAccount as emptyAccount, balance, placeSlip, legResult, applyResults, mergeAccounts, topInning } from '../public/lib/account.mjs';
import { settleSlip, afterTax } from '../public/lib/odds.mjs';
import { parseEspnResults, parseEspnRace, parseFutureResult } from '../public/lib/sources.mjs';

const START_BALANCE = 10_000;
// An account with NT$10,000 of its own to bet with (the wallet's money, in the app).
const newAccount = (now, { start = true } = {}) => {
  const a = emptyAccount(now);
  return start ? { ...a, ledger: [{ id: 'start', t: a.created, kind: 'start', amount: START_BALANCE }] } : a;
};

const at = iso => new Date(iso);

test('a new account starts with NT$10,000; a pool-funded one opens empty', () => {
  assert.equal(balance(newAccount(at('2026-09-18T00:00:00Z'))), START_BALANCE);
  assert.equal(balance(newAccount(at('2026-10-01T00:00:00Z'), { start: false })), 0);
});

const slip = (id, cost, legs, extra = {}) => ({ id, mode: 'parlay', sizes: [legs.length], stake: cost, cost, legs, ...extra });

test('placing a slip takes its cost; not more than the balance', () => {
  const account = newAccount(at('2026-09-25T00:00:00Z'));
  assert.deepEqual(placeSlip(account, slip('a', 20_000, [{ id: 'x', odds: 2 }])), { error: 'funds' });
  const { account: after } = placeSlip(account, slip('a', 1000, [{ id: 'x', odds: 2 }]));
  assert.equal(balance(after), START_BALANCE - 1000);
  assert.equal(after.slips[0].status, 'open');
});

test('settling pays like a real ticket: voids count at 1.00, tax over NT$5,000', () => {
  // Parlay of 2.0 x 1.5 at NT$100: 300.
  assert.equal(settleSlip({ legs: [{ odds: 2, result: 'won' }, { odds: 1.5, result: 'won' }], sizes: [2], stake: 100 }).net, 300);
  assert.equal(settleSlip({ legs: [{ odds: 2, result: 'won' }, { odds: 1.5, result: 'lost' }], sizes: [2], stake: 100 }).net, 0);
  assert.equal(settleSlip({ legs: [{ odds: 2, result: 'won' }, { odds: 1.5, result: 'void' }], sizes: [2], stake: 100 }).net, 200);
  // Singles: each leg its own ticket.
  assert.equal(settleSlip({ legs: [{ odds: 2, result: 'won' }, { odds: 1.5, result: 'lost' }], sizes: [1], stake: 100 }).net, 200);
  // NT$10,000 at 1.8: 18,000 before tax; taxed as the kit says (since 台灣運彩 §29: only a NT$10 bet winning over NT$5,000).
  const big = settleSlip({ legs: [{ odds: 1.8, result: 'won' }], sizes: [1], stake: 10_000 });
  assert.equal(big.gross, 18_000);
  assert.ok(Math.abs(big.net - afterTax(18_000, 10_000)) < 1e-6);
});

test('each kind of leg is judged from the final score', () => {
  const game = { status: 'final', awayScore: 5, homeScore: 3, awayInnings: [0, 3, 0, 0, 2, 0, 0, 0, 0], homeInnings: [1, 0, 0, 0, 0, 2, 0, 0] };
  assert.equal(legResult({ kind: 'ml', side: 'away' }, game), 'won');
  assert.equal(legResult({ kind: 'ml', side: 'home' }, game), 'lost');
  assert.equal(legResult({ kind: 'total', side: 'over', line: 7.5 }, game), 'won');
  assert.equal(legResult({ kind: 'total', side: 'under', line: 8.5 }, game), 'won');
  assert.equal(legResult({ kind: 'runline', side: 'away', line: -1.5 }, game), 'won');
  assert.equal(legResult({ kind: 'runline', side: 'away', line: -2.5 }, game), 'lost');
  assert.equal(legResult({ kind: 'runline', side: 'home', line: 2.5 }, game), 'won');
  assert.equal(legResult({ kind: 'teamtotal', team: 'home', side: 'under', line: 3.5 }, game), 'won');
  assert.equal(legResult({ kind: 'teamtotal', team: 'away', side: 'over', line: 5.5 }, game), 'lost');
  // Innings: 2nd has 3 runs, the most on its own.
  assert.equal(legResult({ kind: 'inning', inning: 1 }, game), 'won');
  assert.equal(topInning([1, 0], [0, 1]), 9);
  assert.equal(legResult({ kind: 'ml', side: 'draw' }, { status: 'final', awayScore: 1, homeScore: 1 }), 'won');
  assert.equal(legResult({ kind: 'ml', side: 'away' }, { status: 'void' }), 'void');
  assert.equal(legResult({ kind: 'ml', side: 'away' }, { status: 'pending' }), null);
  assert.equal(legResult({ kind: 'f1', driver: 'Kimi Antonelli' }, { status: 'final', winner: 'Kimi Antonelli' }), 'won');
  assert.equal(legResult({ kind: 'future', team: 'Los Angeles Dodgers' }, { status: 'final', winner: 'New York Yankees' }), 'lost');
});

test('a slip settles once every leg is decided, and pays in once', () => {
  let account = newAccount(at('2026-09-25T00:00:00Z'));
  ({ account } = placeSlip(account, slip('s', 100, [{ id: 'a', odds: 2 }, { id: 'b', odds: 1.5 }])));
  account = applyResults(account, 's', ['won', null]);
  assert.equal(account.slips[0].status, 'open');
  assert.equal(account.slips[0].legs[0].result, 'won');
  account = applyResults(account, 's', [null, 'won']);
  assert.equal(account.slips[0].status, 'settled');
  assert.equal(account.slips[0].payout, 300);
  assert.equal(balance(account), START_BALANCE - 100 + 300);
  assert.equal(applyResults(account, 's', ['won', 'won']), account);
});

test('a parlay with a pick lost settles at once, the other games not waited for', () => {
  let account = newAccount(at('2026-09-25T00:00:00Z'));
  ({ account } = placeSlip(account, slip('p', 100, [{ id: 'a', odds: 2 }, { id: 'b', odds: 1.5 }, { id: 'c', odds: 1.8 }])));
  account = applyResults(account, 'p', [null, 'lost', null]);
  assert.equal(account.slips[0].status, 'settled');
  assert.equal(account.slips[0].payout, 0);
  assert.ok(!account.slips[0].legs[0].result);
  assert.equal(balance(account), START_BALANCE - 100);
  assert.equal(applyResults(account, 'p', ['won', null, 'won']), account);
  // One lost before this, still open: settled on the next check, nothing new in.
  let older = newAccount(at('2026-09-25T00:00:00Z'));
  ({ account: older } = placeSlip(older, slip('q', 100, [{ id: 'a', odds: 2 }, { id: 'b', odds: 1.5 }])));
  older = { ...older, slips: older.slips.map(s => ({ ...s, legs: s.legs.map((l, i) => (i ? l : { ...l, result: 'lost' })) })) };
  older = applyResults(older, 'q', [null, null]);
  assert.equal(older.slips[0].status, 'settled');
});

test('two devices merge without counting anything twice', () => {
  const base = newAccount(at('2026-09-25T00:00:00Z'));
  const { account: a } = placeSlip(base, slip('a', 500, [{ id: 'x', odds: 2 }]), at('2026-09-25T01:00:00Z'));
  const { account: b0 } = placeSlip(base, slip('b', 300, [{ id: 'y', odds: 3 }]), at('2026-09-25T02:00:00Z'));
  const b = applyResults(b0, 'b', ['won'], at('2026-09-25T05:00:00Z'));
  const merged = mergeAccounts(a, b);
  assert.equal(merged.slips.length, 2);
  assert.equal(balance(merged), START_BALANCE - 500 - 300 + 900);
  assert.deepEqual(mergeAccounts(merged, b).ledger, merged.ledger);
  // A slip settled on one device wins over the open copy on the other.
  const settledA = applyResults(a, 'a', ['lost']);
  assert.equal(mergeAccounts(a, settledA).slips.find(s => s.id === 'a').status, 'settled');
});

test('ESPN results: final scores and innings, postponed games void', () => {
  const data = {
    events: [
      {
        date: '2026-09-24T16:35Z',
        competitions: [{
          status: { type: { name: 'STATUS_FINAL', state: 'post', completed: true } },
          competitors: [
            { homeAway: 'home', score: '2', team: { displayName: 'Pittsburgh Pirates' }, linescores: [{ value: 1 }, { value: 0 }] },
            { homeAway: 'away', score: '1', team: { displayName: 'St. Louis Cardinals' }, linescores: [{ value: 1 }] }
          ]
        }]
      },
      {
        date: '2026-09-24T23:05Z',
        competitions: [{
          status: { type: { name: 'STATUS_POSTPONED', state: 'post', completed: false } },
          competitors: [
            { homeAway: 'home', score: '0', team: { displayName: 'A' } },
            { homeAway: 'away', score: '0', team: { displayName: 'B' } }
          ]
        }]
      }
    ]
  };
  const [played, postponed] = parseEspnResults(data, 'mlb');
  assert.equal(played.status, 'final');
  assert.equal(played.homeScore, 2);
  assert.deepEqual(played.homeInnings, [1, 0]);
  // A postponed game is left to the settler: 台灣運彩 voids it after 48 hours.
  assert.equal(postponed.status, 'pending');
});

test('F1 winner from ESPN, championship winner from Polymarket', () => {
  const race = {
    events: [{ competitions: [
      { type: { abbreviation: 'Qual' }, date: '2026-09-12T14:00Z', status: { type: { completed: true } }, competitors: [{ order: 1, athlete: { displayName: 'Lando Norris' } }] },
      { type: { abbreviation: 'Race' }, date: '2026-09-13T13:00Z', status: { type: { completed: true } }, competitors: [{ order: 2, athlete: { displayName: 'Max Verstappen' } }, { order: 1, winner: true, athlete: { displayName: 'Kimi Antonelli' } }] }
    ] }]
  };
  assert.deepEqual(parseEspnRace(race, '2026-09-13T13:00:00Z'), { status: 'final', winner: 'Kimi Antonelli' });
  // ESPN's 'session complete' (not yet final, no winner flag) already has the order.
  const complete = { events: [{ competitions: [{ type: { abbreviation: 'Race' }, date: '2026-09-26T11:00Z', status: { type: { name: 'STATUS_SESSION_COMPLETE', state: 'in', completed: false } }, competitors: [
    { order: 3, athlete: { displayName: 'Isack Hadjar' } }, { order: 1, athlete: { displayName: 'George Russell' } }, { order: 2, athlete: { displayName: 'Max Verstappen' } }
  ] }] }] };
  assert.deepEqual(parseEspnRace(complete, '2026-09-26T11:00:00Z'), { status: 'final', winner: 'George Russell', podium: ['George Russell', 'Max Verstappen', 'Isack Hadjar'] });
  // A pick's start a day off the race still finds it.
  assert.equal(parseEspnRace(complete, '2026-09-25T12:00:00Z').winner, 'George Russell');
  const running = { events: [{ competitions: [{ type: { abbreviation: 'Race' }, date: '2026-09-26T11:00Z', status: { type: { name: 'STATUS_IN_PROGRESS', state: 'in' } }, competitors: [] }] }] };
  assert.deepEqual(parseEspnRace(running, '2026-09-26T11:00:00Z'), { status: 'pending' });
  assert.equal(parseFutureResult([{ closed: false, markets: [] }]).status, 'pending');
  const done = parseFutureResult([{ closed: true, markets: [
    { question: 'Will the New York Yankees win the 2026 World Series?', outcomes: '["Yes","No"]', outcomePrices: '["0","1"]' },
    { question: 'Will the Los Angeles Dodgers win the 2026 World Series?', outcomes: '["Yes","No"]', outcomePrices: '["1","0"]' }
  ] }]);
  assert.deepEqual(done, { status: 'final', winner: 'Los Angeles Dodgers' });
});

test('saves are gzip-compressed and read back; old plain saves still read', async () => {
  const { pack, unpack } = await import('../public/lib/codec.mjs');
  let account = newAccount(at('2026-09-01T00:00:00Z'));
  for (let i = 0; i < 40; i++) {
    const legs = Array.from({ length: 4 }, (_, j) => ({ id: `mlb_2026-09-0${j}|tot|8.5|over`, kind: 'total', sport: 'mlb', label: 'Texas Rangers @ Minnesota Twins Over 8.5', shortLabel: 'Over 8.5', matchup: 'Texas Rangers @ Minnesota Twins', start: '2026-09-26T00:10:00.000Z', odds: 1.87, fairChance: 0.5, side: 'over', line: 8.5, away: 'Texas Rangers', home: 'Minnesota Twins' }));
    ({ account } = placeSlip(account, { id: `s${i}`, mode: 'parlay', sizes: [4], stake: 10, cost: 10, legs }));
  }
  const json = JSON.stringify(account);
  const packed = await pack(account);
  assert.ok(packed.startsWith('gz1:'));
  assert.ok(packed.length * 5 < json.length, `${packed.length} vs ${json.length}`);
  assert.deepEqual(await unpack(packed), account);
  assert.deepEqual(await unpack(json), account);
  assert.equal(await unpack('gz1:!!'), null);
});

test('slip history keeps itself: final scores with each pick, compact picks, backups merge', async () => {
  const { placeSlip, applyResults, compactLeg, mergeAccounts, balance } = await import('../public/lib/account.mjs');
  const now = new Date('2026-09-26T04:00:00Z');
  const leg = { id: 'g1|ml|home', kind: 'ml', sport: 'mlb', odds: 1.9, side: 'home', line: null, inning: null, driver: null, away: 'Houston Astros', home: 'Athletics' };
  let account = placeSlip(newAccount(now), { id: 's1', mode: 'single', sizes: [1], stake: 100, cost: 100, legs: [leg] }, now).account;
  // Empty fields aren't saved.
  assert.equal('line' in account.slips[0].legs[0], false);
  assert.deepEqual(compactLeg({ a: 1, b: null, result: null }), { a: 1, result: null });
  account = applyResults(account, 's1', ['won'], now, [{ away: 4, home: 6 }]);
  assert.deepEqual(account.slips[0].legs[0].final, { away: 4, home: 6 });
  assert.equal(account.slips[0].status, 'settled');
  // A backup restored onto a device that has it already changes nothing.
  const backup = JSON.parse(JSON.stringify(account));
  assert.equal(balance(mergeAccounts(account, backup)), balance(account));
  assert.equal(mergeAccounts(newAccount(now), backup).slips.length, 1);
});

test('the wallet: extra money to bet with, entries for the wallet', async () => {
  const { placeSlip, poolEntries, balance } = await import('../public/lib/account.mjs');
  const now = new Date('2026-09-23T04:00:00Z');
  const base = newAccount(new Date('2026-09-01T00:00:00Z'));
  const slip = (id, cost) => ({ id, mode: 'single', sizes: [1], stake: cost, cost, legs: [{ id: 'x', odds: 2 }] });
  // Beyond the ledger's own NT$10,000, with the wallet's extra.
  assert.deepEqual(placeSlip(base, slip('a', 15_000), now), { error: 'funds' });
  const { account } = placeSlip(base, slip('a', 15_000), now, { extra: 90_000 });
  assert.equal(balance(account), -5_000);
  // No weekly limit: anything the wallet covers.
  assert.ok(placeSlip(account, slip('b', 60_000), now, { extra: 90_000 }).account);
  const entries = poolEntries(account);
  assert.deepEqual(entries.map(e => [e.id, e.amount, e.app]), [['odds:start', 10_000, 'odds'], ['odds:stake-a', -15_000, 'odds']]);
});

test('the wallet brings back a lost ledger and slips, and a real slip wins over a recovered one', async () => {
  const { recoverFromWallet, mergeAccounts, balance } = await import('../public/lib/account.mjs');
  const empty = newAccount(new Date('2026-09-28T00:00:00Z'), { start: false });
  const wallet = {
    entries: [
      { id: 'pass:start', t: 1, app: 'pass', kind: 'start', amount: 200000 },
      { id: 'odds:start', t: 2, app: 'odds', kind: 'start', amount: 10000 },
      { id: 'odds:stake-a', t: 3, app: 'odds', kind: 'stake', amount: -1000 },
      { id: 'odds:payout-a', t: 4, app: 'odds', kind: 'payout', amount: 2500 },
      { id: 'odds:stake-b', t: 5, app: 'odds', kind: 'stake', amount: -500 }
    ]
  };
  const back = recoverFromWallet(empty, wallet);
  assert.equal(balance(back), 11000);
  assert.deepEqual(back.slips.map(s => [s.id, s.cost, s.payout, s.recovered]), [['b', 500, 0, true], ['a', 1000, 2500, true]]);
  assert.equal(recoverFromWallet(back, wallet), back);
  const real = { ...newAccount(new Date('2026-09-20T00:00:00Z')), slips: [{ id: 'a', t: '2026-09-20T01:00:00.000Z', mode: 'single', sizes: [1], stake: 1000, cost: 1000, status: 'open', legs: [{ id: 'x', odds: 2.5, result: null }] }] };
  assert.equal(mergeAccounts(back, real).slips.find(s => s.id === 'a').recovered, undefined);
  assert.equal(mergeAccounts(real, back).slips.find(s => s.id === 'a').recovered, undefined);
});

test('a rebuilt slip shows a refund as refunded, and what the Worker paid once it has', async () => {
  const { recoverFromWallet, balance } = await import('../public/lib/account.mjs');
  const t0 = Date.parse('2026-10-14T00:00:00Z');
  const stakes = [
    { id: 'odds:stake-b', t: t0, app: 'odds', kind: 'stake', amount: -2000 },
    { id: 'odds:stake-c', t: t0 + 1, app: 'odds', kind: 'stake', amount: -1500 }
  ];
  const empty = newAccount(new Date(t0), { start: false });
  const refund = { id: 'odds:refund-b', t: t0 + 2, app: 'odds', kind: 'refund', amount: 2000 };
  const back = recoverFromWallet(empty, { entries: [...stakes, refund] });
  const b = back.slips.find(s => s.id === 'b');
  assert.deepEqual([b.recovered, b.refunded, b.payout], [true, true, 2000]);
  // Unpaid, c shows nothing paid; the Worker's payout comes in and it shows that, the money once.
  const c = s => s.slips.find(x => x.id === 'c');
  assert.equal(c(back).payout, 0);
  const wallet = { entries: [...stakes, refund, { id: 'odds:payout-c', t: t0 + 3, app: 'odds', kind: 'payout', amount: 2400 }] };
  const paid = recoverFromWallet(back, wallet);
  assert.equal(c(paid).payout, 2400);
  assert.equal(balance(paid), -3500 + 2000 + 2400);
  assert.equal(recoverFromWallet(paid, wallet), paid);
});

test("a wallet entry that can't be dated or counted is left out, never a sync that throws", async () => {
  const { recoverFromWallet, balance } = await import('../public/lib/account.mjs');
  const empty = newAccount(new Date('2026-10-01T00:00:00Z'), { start: false });
  const wallet = {
    entries: [
      null,
      { id: 'odds:stake-a', app: 'odds', kind: 'stake', amount: -100 },
      { id: 'odds:stake-b', t: 'soon', app: 'odds', kind: 'stake', amount: -100 },
      { id: 'odds:stake-c', t: Date.parse('2026-10-02T00:00:00Z'), app: 'odds', kind: 'stake', amount: '-100' },
      { id: 'odds:stake-d', t: Date.parse('2026-10-02T00:00:00Z'), app: 'odds', kind: 'stake', amount: -300 },
      { id: 42, t: 1, app: 'odds', kind: 'stake', amount: -1 }
    ]
  };
  const back = recoverFromWallet(empty, wallet);
  assert.equal(balance(back), -300);
  assert.deepEqual(back.slips.map(s => s.id), ['d']);
  assert.equal(recoverFromWallet(empty, null), empty);
});

test('two copies merge: a settled copy wins, picks decided on either side are kept, tickets and the ledger by union', async () => {
  const { mergeAccounts, placeSlip, applyResults, balance } = await import('../public/lib/account.mjs');
  const t0 = new Date('2026-10-10T00:00:00Z');
  const legs = [
    { id: 'a', gameId: 'ga', odds: 2, start: '2026-10-10T10:00:00Z' },
    { id: 'b', gameId: 'gb', odds: 2, start: '2026-10-10T12:00:00Z' },
    { id: 'c', gameId: 'gc', odds: 2, start: '2026-10-10T14:00:00Z' }
  ];
  const base = placeSlip(newAccount(t0, { start: false }), { id: 'p', mode: 'parlay', sizes: [3], stake: 100, cost: 100, legs }, t0, { extra: 1000 }).account;
  // One device knows the first pick, the other the second, with its score.
  const one = applyResults(base, 'p', ['won', null, null], new Date('2026-10-10T13:00:00Z'));
  const two = applyResults(base, 'p', [null, 'won', null], new Date('2026-10-10T15:00:00Z'), [null, { away: 1, home: 2 }]);
  for (const merged of [mergeAccounts(one, two), mergeAccounts(two, one)]) {
    const p = merged.slips[0];
    assert.equal(p.status, 'open');
    assert.deepEqual(p.legs.map(l => l.result), ['won', 'won', null]);
    assert.deepEqual(p.legs[1].final, { away: 1, home: 2 });
    assert.equal(merged.ledger.length, 1);
  }
  // Settled on one: the settled copy, from either side, paid once.
  const done = applyResults(one, 'p', [null, 'won', 'won'], new Date('2026-10-11T00:00:00Z'));
  for (const merged of [mergeAccounts(done, two), mergeAccounts(two, done)]) {
    assert.equal(merged.slips[0].status, 'settled');
    assert.equal(merged.ledger.filter(e => e.id === 'payout-p').length, 1);
    assert.equal(balance(merged), balance(done));
  }
  // Nothing on one side: the other as it is.
  assert.equal(mergeAccounts(null, done), done);
  assert.equal(mergeAccounts(done, undefined), done);
  // The oldest creation and the newest change.
  const m = mergeAccounts({ ...done, created: '2026-01-01T00:00:00.000Z' }, { ...two, updated: '2027-01-01T00:00:00.000Z' });
  assert.deepEqual([m.created, m.updated], ['2026-01-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z']);
});

test("the account card counts a free bet's stake as riding (its cost is nothing)", async () => {
  const { accountRecord, slipAtStake } = await import('../public/lib/history.mjs');
  const free = { id: 'f', status: 'open', cost: 0, stake: 200, free: 'fb', freeValue: 200, legs: [] };
  const topped = { id: 'g', status: 'open', cost: 300, stake: 500, free: 'fb2', freeValue: 200, legs: [] };
  assert.deepEqual([slipAtStake(free), slipAtStake(topped), slipAtStake({ cost: 100 })], [200, 500, 100]);
  assert.equal(accountRecord({ slips: [free, topped], tickets: [], ledger: [] }).open, 700);
});
