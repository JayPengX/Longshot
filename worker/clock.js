// ---- clock.js ----
// The Worker's clock: one Durable Object (binding CLOCK, class Clock) whose
// alarm goes off every minute and runs that minute's jobs. Any request the
// Worker serves wakes it (at most once a minute an isolate: an alarm set
// if there's none), and so do the two crons (wrangler.toml: the even and
// the odd minutes), so the clock starts by itself after a deploy and comes
// back should its alarm ever be lost.
//
// A minute's jobs run once: the alarm and a cron's tick both ask, and the
// first to mark the minute (`ran`, in the object's storage) runs them. Every
// job is safe to run twice anyway (fixed entry ids, preconditions).
//
//   odd minutes            Play's slips whose games should be over (settle.js)
//   minute % 4 === 3       the lottery's drawn tickets (lotto.js)
//   even minutes           Kambi's watched matches (kambi.js)
//   minute % 10 === 8      Play's home board (board.js, /data/play/board.json)

import { settleCron } from './settle.js';
import { lottoCron } from './lotto.js';
import { refreshKambiWatch } from './kambi.js';
import { runPlay } from './board.js';
import { storeReady } from './doc-store.js';
import { playDeps, KAMBI_DEPS, builderProxy } from './deps.js';

const MINUTE = 60_000;
const nextMinute = t => (Math.floor(t / MINUTE) + 1) * MINUTE;
// A board build's time in all (its leagues past it are left to the phones):
// a minute's other jobs wait on the alarm that runs it.
const BOARD_BUDGET_MS = 100_000;

// The jobs of the minute of `t`, by name.
export function jobsAt(t) {
  const m = new Date(t).getUTCMinutes();
  const jobs = [];
  if (m % 2 === 1) jobs.push('settle');
  if (m % 4 === 3) jobs.push('lottery');
  if (m % 2 === 0) jobs.push('kambi');
  if (m % 10 === 8) jobs.push('board');
  return jobs;
}

const JOBS = {
  settle: env => settleCron(env, playDeps(env)),
  lottery: env => lottoCron(env, playDeps(env)),
  kambi: env => refreshKambiWatch(env, KAMBI_DEPS),
  board: (env, t) => runPlay(env, { proxy: builderProxy(env), now: t, budgetMs: BOARD_BUDGET_MS, log: () => {} })
};
// What's worth a log line of a job's result (nothing to do: none).
const worthTelling = {
  settle: r => r.looked,
  lottery: r => r.settled,
  kambi: r => r.checked || r.saved,
  board: () => true
};

// The minute's jobs, side by side; a failure logged, never thrown.
export async function runMinute(env, t, jobs = JOBS) {
  if (!storeReady(env)) return {};
  const names = jobsAt(t);
  const out = {};
  await Promise.all(
    names.map(name =>
      Promise.resolve()
        .then(() => jobs[name](env, t))
        .then(r => {
          out[name] = r;
          if (r && worthTelling[name]?.(r)) console.log(name, JSON.stringify(r));
        })
        .catch(error => {
          out[name] = { failed: String(error?.message || error).slice(0, 200) };
          console.log(`${name} failed`, out[name].failed);
        })
    )
  );
  return out;
}

export class Clock {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }
  // /wake (any request), /tick?t= (a cron): the alarm set if there's none;
  // a tick also runs its minute (if the alarm hasn't).
  async fetch(request) {
    const url = new URL(request.url);
    await this.arm();
    if (url.pathname === '/tick') await this.minute(Number(url.searchParams.get('t')) || Date.now());
    return new Response('ok');
  }
  async alarm() {
    // The next one first: a minute whose jobs fail never stops the clock.
    await this.state.storage.setAlarm(nextMinute(Date.now()));
    await this.minute(Date.now());
  }
  async arm() {
    if ((await this.state.storage.getAlarm()) == null) await this.state.storage.setAlarm(nextMinute(Date.now()));
  }
  // The minute's jobs, once.
  async minute(t) {
    const m = Math.floor(t / MINUTE);
    if (((await this.state.storage.get('ran')) || 0) >= m) return null;
    await this.state.storage.put('ran', m);
    return runMinute(this.env, m * MINUTE);
  }
}

// The one clock.
const clockOf = env => (env.CLOCK ? env.CLOCK.get(env.CLOCK.idFromName('clock')) : null);
let wokeAt = -1;
// Woken by a request: at most once a minute an isolate.
export function wake(env, ctx, now = Date.now()) {
  const m = Math.floor(now / MINUTE);
  const clock = clockOf(env);
  if (!clock || wokeAt === m) return;
  wokeAt = m;
  ctx.waitUntil(clock.fetch('https://clock/wake').catch(() => {}));
}
// A cron's tick: the clock woken and asked to run the minute.
export function tick(env, ctx, t) {
  const clock = clockOf(env);
  if (clock) ctx.waitUntil(clock.fetch(`https://clock/tick?t=${t}`).catch(error => console.log('clock failed', String(error?.message || error))));
  // (No clock bound: the minute run here, from the cron.)
  else ctx.waitUntil(runMinute(env, t));
}
