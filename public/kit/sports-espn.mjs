// ---- kit/sports-espn.mjs: ESPN's game status, read the same way everywhere ----
// When a game counts as over (parseStatus, overByRule), shared by Longshot's
// settling on the phone (play-sources.mjs, settle.mjs) and the Worker's
// (settle.js, with SHORTEST_MIN). Pure: no page, no clock, no network.
import { CATALOG } from './catalog.mjs';

// ---- Parsing: statuses and sides --------------------------------------------------

// Called off. A delay (rain, a late start) or a suspension isn't: the game
// is still on, only waiting (Play keeps it live too).
const VOID = /POSTPONED|CANCELED|CANCELLED|FORFEIT|ABANDONED/;
const WAITING = /DELAYED|SUSPENDED|RAIN_DELAY/;
export function parseStatus(s) {
  const type = s?.type || {};
  return {
    state: type.state || 'pre',
    detail: type.detail || type.description || '',
    short: type.shortDetail || type.detail || '',
    completed: Boolean(type.completed),
    void: VOID.test(type.name || ''),
    delayed: WAITING.test(type.name || '') || /\bdelay/i.test(type.shortDetail || type.detail || ''),
    name: type.name || '',
    clock: s?.displayClock || '',
    period: s?.period || 0
  };
}

// Over by the rules, before ESPN's copy says so (it called an NBA game
// "End of 4th" for minutes after the horn; the owner, 2026-10-14: a result
// counts the moment it's final). Only what the rules settle exactly:
// basketball's last regulation period (or an overtime) ended with the
// scores apart; MLB's middle of the 9th or later with the home side
// ahead (it doesn't bat), or the end of an inning from the 9th apart, or
// the home side ahead in the bottom of the 9th or later (a walk-off ends it
// there).
// (`league`: a catalogue key, Orbit Sports' or Longshot's: the same keys.)
const REGULATION = { basketball: 4 };
export function overByRule(status, away, home, league) {
  if (!status || status.state !== 'in' || status.void) return status;
  const sport = CATALOG[league]?.sport;
  const a = Number(away?.score);
  const h = Number(home?.score);
  if (!Number.isFinite(a) || !Number.isFinite(h) || a === h) return status;
  const n = status.period || 0;
  const ended = /END_PERIOD|END_OF_PERIOD/.test(status.name || '') || /^end of/i.test(status.short || '');
  let over = false;
  if (REGULATION[sport]) {
    // (College basketball plays two halves.)
    const regulation = sport === 'basketball' && /half/i.test(`${status.detail} ${status.short}`) ? 2 : REGULATION[sport];
    over = ended && n >= regulation;
  } else if (sport === 'baseball' && league === 'mlb') {
    const m = /^(mid|middle|end|bot|bottom)\b\D*(\d+)/i.exec(status.short || status.detail || '');
    const inning = Number(m?.[2]) || n;
    over = Boolean(m) && inning >= 9 && (/^end/i.test(m[1]) || h > a);
  }
  return over ? { ...status, state: 'post', completed: true, detail: 'Final', short: 'Final', byRule: true } : status;
}

// The soonest a game of each sport can be over, in minutes from its start: when
// a final is first asked for (Orbit Sports' result notices, Play's settling),
// then every 2 minutes. A quick game is under its usual length (a 2 h 20
// baseball game, a blowout), so never that.
export const SHORTEST_MIN = { soccer: 105, baseball: 110, basketball: 110, football: 160, hockey: 115, sets: 60, racing: 90 };

// ---- Scoreboards -------------------------------------------------------------------

// ---- A game on now (Orbit Sports' lib/live.mjs liveOf) ----------------------------

// ---- Stage and round (Orbit Sports' lib/stage.mjs) --------------------------------
// special: true when it isn't an ordinary regular-season game (worth a tag).

