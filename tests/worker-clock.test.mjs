// The clock (worker/clock.js): which jobs each minute runs, each minute run
// once whoever asks (the alarm or a cron), the alarm always set again first,
// and a job's failure never another's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { jobsAt, runMinute, Clock, wake, tick } from '../worker/clock.js';

const at = m => Date.UTC(2026, 9, 22, 4, m, 30);

test('jobs by minute: settle on odd minutes, the lottery every 4, Kambi on even ones, the board every 10', () => {
  assert.deepEqual(jobsAt(at(0)), ['kambi']);
  assert.deepEqual(jobsAt(at(1)), ['settle']);
  assert.deepEqual(jobsAt(at(3)), ['settle', 'lottery']);
  assert.deepEqual(jobsAt(at(8)), ['kambi', 'board']);
  assert.deepEqual(jobsAt(at(58)), ['kambi', 'board']);
  const hour = Array.from({ length: 60 }, (_, m) => jobsAt(at(m)));
  assert.equal(hour.filter(j => j.includes('settle')).length, 30);
  assert.equal(hour.filter(j => j.includes('lottery')).length, 15);
  assert.equal(hour.filter(j => j.includes('kambi')).length, 30);
  assert.equal(hour.filter(j => j.includes('board')).length, 6);
});

test("runMinute: the minute's jobs side by side, a failure noted and the rest still run; nothing without a store", async () => {
  const ran = [];
  const jobs = {
    settle: async () => (ran.push('settle'), { looked: 0 }),
    lottery: async () => {
      throw new Error('lottery down');
    },
    kambi: async () => (ran.push('kambi'), {}),
    board: async () => (ran.push('board'), {})
  };
  const out = await runMinute({ STORE: {} }, at(3), jobs);
  assert.deepEqual(ran, ['settle']);
  assert.deepEqual(out.lottery, { failed: 'lottery down' });
  assert.deepEqual(await runMinute({}, at(3), jobs), {});
});

// A Durable Object's state, in memory.
function fakeState() {
  const m = new Map();
  let alarm = null;
  return {
    m,
    get alarm() {
      return alarm;
    },
    storage: {
      get: async k => m.get(k),
      put: async (k, v) => void m.set(k, v),
      getAlarm: async () => alarm,
      setAlarm: async t => void (alarm = t)
    }
  };
}

test('the Clock: woken, its alarm set for the next minute; a minute run once, whoever asks first', async () => {
  const state = fakeState();
  const clock = new Clock(state, {});
  assert.equal(await (await clock.fetch(new Request('https://clock/wake'))).text(), 'ok');
  assert.ok(state.alarm > Date.now() && state.alarm % 60_000 === 0);
  const first = state.alarm;
  await clock.fetch(new Request('https://clock/wake'));
  assert.equal(state.alarm, first, 'an alarm already set is left');
  // (No store: runMinute answers {} but the minute is still marked.)
  assert.deepEqual(await clock.minute(at(5)), {});
  assert.equal(await clock.minute(at(5) + 10_000), null, 'the same minute again: nothing');
  assert.equal(await clock.minute(at(4)), null, 'an earlier minute: nothing');
  assert.deepEqual(await clock.minute(at(6)), {});
  await clock.fetch(new Request(`https://clock/tick?t=${at(6)}`));
  assert.equal(state.m.get('ran'), Math.floor(at(6) / 60_000));
});

test("the Clock's alarm sets the next one before it runs its minute", async () => {
  const state = fakeState();
  const clock = new Clock(state, {});
  const order = [];
  clock.minute = async () => order.push(['minute', state.alarm]);
  await clock.alarm();
  assert.equal(order.length, 1);
  assert.ok(order[0][1] > Date.now(), 'the alarm was already set');
});

test('wake: once a minute an isolate; tick: the clock asked to run the minute', async () => {
  const asked = [];
  const env = { CLOCK: { idFromName: n => n, get: () => ({ fetch: async url => (asked.push(url), new Response('ok')) }) } };
  const waits = [];
  const ctx = { waitUntil: p => waits.push(p) };
  const now = Date.UTC(2026, 9, 22, 4, 7, 0);
  wake(env, ctx, now);
  wake(env, ctx, now + 30_000);
  wake(env, ctx, now + 60_000);
  tick(env, ctx, now);
  await Promise.all(waits);
  assert.deepEqual(asked, ['https://clock/wake', 'https://clock/wake', `https://clock/tick?t=${now}`]);
  // No clock bound: a wake does nothing.
  wake({}, ctx, now + 120_000);
});
