// F1 on a ticket: 冠軍 on a race or the season's championship. ESPN's season as races, the
// standings as the championship, a pick graded on the order, its chance as the race (or season) runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseF1Season, parseF1Standings, f1Championship, gradeF1, f1LegView, f1Live, placeOf, sameDriver, byTeam, f1Guess } from '../public/slips/lib/f1.mjs';
import { slipView, gameOver, nextRead, applyGames } from '../public/slips/lib/ticket.mjs';
import { pickText, statusOf } from '../public/slips/lib/words.mjs';
import { CUT } from '../public/slips/lib/slip.mjs';

const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/slips/${name}`, import.meta.url)));
const games = parseF1Season(fixture('f1-season.json'));
const standings = parseF1Standings(fixture('f1-standings.json'));
const byId = id => games.find(g => g.id === id);
let n = 0;
const leg = (game, driver, odds = 3) => ({ id: `l${++n}`, game, kind: 'f1', driver, odds });

test("ESPN's season as races (no sprints: 運彩 sells the race): called off, over with its order, to come with the last field", () => {
  assert.deepEqual(
    games.map(g => [g.id, g.state]),
    [
      ['f1:600057430:race', 'void'],
      ['f1:600057445:race', 'post'],
      ['f1:600057446:race', 'pre']
    ]
  );
  const sg = byId('f1:600057445:race');
  assert.equal(sg.start, '2026-10-11T12:00:00.000Z');
  assert.deepEqual(sg.order.slice(0, 3), ['Max Verstappen', 'Charles Leclerc', 'Kimi Antonelli']);
  assert.equal(sg.field.length, 22);
  const us = byId('f1:600057446:race');
  assert.equal(us.order, undefined);
  assert.deepEqual(us.field, sg.field);
  assert.ok(us.field[0].flag.startsWith('https://'));
});

test('the championship: the standings all season, its last race its time; over once that race is over and counted', () => {
  assert.deepEqual(standings.slice(0, 2).map(d => d.name), ['Kimi Antonelli', 'George Russell']);
  const c = f1Championship(games, standings, 2026);
  assert.equal(c.id, 'f1:champ:2026');
  assert.equal(c.state, 'pre');
  assert.equal(c.start, byId('f1:600057446:race').start);
  // Cancelled races don't count as held.
  assert.deepEqual(c.progress, { now: 1, of: 2 });
  assert.equal(c.order[0], 'Kimi Antonelli');
  assert.equal(c.field.length, standings.length);
  // Singapore as the last race: over, and the standings count it.
  const done = f1Championship(games.slice(0, 2), standings, 2026);
  assert.equal(done.state, 'post');
  assert.equal(gradeF1(leg(done, 'Andrea Kimi Antonelli')), 'won');
  assert.equal(gradeF1(leg(done, 'George Russell')), 'lost');
  // The last race over but not in the standings yet: still waiting.
  const late = f1Championship(games.slice(0, 2), standings.map(d => ({ ...d, races: new Set() })), 2026);
  assert.equal(late.state, 'pre');
  assert.equal(f1Championship([byId('f1:600057430:race')], standings, 2026), null);
  // Its time past: never void for waiting on the standings.
  const slips = [{ legs: [leg(late, 'Kimi Antonelli')] }];
  applyGames(slips, { [late.id]: late }, Date.parse(late.start) + 30 * 86_400_000);
  assert.equal(slips[0].legs[0].game.state, 'pre');
});

test('a driver by surname: ESPN and F1 timing name them differently', () => {
  assert.ok(sameDriver('Andrea Kimi Antonelli', 'Kimi Antonelli'));
  assert.ok(sameDriver('Nico Hülkenberg', 'Nico Hulkenberg'));
  assert.ok(!sameDriver('Max Verstappen', 'Lando Norris'));
  assert.equal(placeOf(['A Norris', 'B Piastri'], 'Oscar Piastri'), 2);
  assert.equal(placeOf(['A Norris'], 'Oscar Piastri'), Infinity);
});

test('graded on the order: the winner won, the rest lost; called off void; before, nothing', () => {
  const sg = byId('f1:600057445:race');
  assert.equal(gradeF1(leg(sg, 'Max Verstappen')), 'won');
  assert.equal(gradeF1(leg(sg, 'Charles Leclerc')), 'lost');
  assert.equal(gradeF1(leg(byId('f1:600057430:race'), 'Max Verstappen')), 'void');
  assert.equal(gradeF1(leg(byId('f1:600057446:race'), 'Max Verstappen')), null);
});

test("a pick's chance: its odds less the winner board's cut (a championship a future's), moving to whether the driver leads as the race or season runs", () => {
  const us = byId('f1:600057446:race');
  const pre = f1LegView(leg(us, 'Lando Norris', 4));
  assert.ok(Math.abs(pre.pre.win - 1 / (4 * CUT.threeWay)) < 1e-12);
  assert.equal(pre.estimated, true);
  const running = (now, of, order) => ({ ...us, state: 'in', order, lap: { now, of } });
  const lead = f1LegView(leg(running(50, 56, ['Lando Norris', 'Max Verstappen']), 'Lando Norris', 4));
  assert.equal(lead.live, true);
  assert.equal(lead.ahead, 'won');
  assert.ok(lead.now.win > 0.8);
  const second = f1LegView(leg(running(50, 56, ['Max Verstappen', 'Lando Norris']), 'Lando Norris', 4));
  assert.equal(second.ahead, 'lost');
  assert.ok(second.now.win < pre.pre.win);
  assert.ok(Math.abs(f1LegView(leg(running(1, 56, ['Max Verstappen', 'Lando Norris']), 'Lando Norris', 4)).now.win - pre.pre.win) < 0.01);
  // The championship: half its races run, the leader's chance up, not live.
  const c = f1Championship(games, standings, 2026);
  const champ = f1LegView(leg(c, 'Kimi Antonelli', 2));
  assert.ok(champ.pre.win < 1 / (2 * CUT.threeWay));
  assert.ok(champ.now.win > champ.pre.win);
  assert.equal(champ.live, false);
  assert.equal(champ.ahead, 'won');
});

test('a ticket with a race in it: settles and pays on the order; over only with an order', () => {
  const sg = byId('f1:600057445:race');
  const v = slipView({ id: 's1', mode: 'single', sizes: [1], stake: 100, legs: [leg(sg, 'Max Verstappen', 3.5)] });
  assert.equal(v.status, 'won');
  assert.equal(v.paid.gross, 350);
  assert.ok(gameOver(sg));
  assert.ok(!gameOver({ ...sg, order: undefined }));
  assert.ok(gameOver(byId('f1:600057430:race')));
  assert.equal(nextRead([leg({ ...byId('f1:600057446:race'), state: 'in' }, 'Lando Norris')]), 15_000);
  // The championship isn't read every few seconds all season.
  const c = f1Championship(games, standings, 2026);
  assert.ok(nextRead([leg(c, 'Kimi Antonelli')], Date.parse('2026-10-20T00:00:00Z')) >= 30_000);
});

test('words: the pick by surname; the lap while a race runs; the races run of a season', () => {
  const us = byId('f1:600057446:race');
  assert.equal(pickText(leg(us, 'Lando Norris')), 'Norris 奪冠');
  const c = f1Championship(games, standings, 2026);
  assert.equal(pickText(leg(c, 'Kimi Antonelli')), 'Antonelli 年度冠軍');
  assert.deepEqual(statusOf({ ...us, state: 'in', lap: { now: 12, of: 56 } }), { text: '第 12/56 圈', live: true });
  assert.deepEqual(statusOf(c), { text: '已賽 1/2 站', live: false });
});

test("F1's timing: the order as it stands, over at the flag; never for the championship", async () => {
  const us = byId('f1:600057446:race');
  const now = Date.parse(us.start) + 3_600_000;
  const kit = { f1Outcome: async (get, kind, start) => (kind === 'Race' && start === us.start ? { status: 'pending', order: ['Lando Norris', 'Max Verstappen'], lap: { now: 30, of: 56 } } : null) };
  const live = await f1Live(us, () => null, kit, now);
  assert.equal(live.state, 'in');
  assert.deepEqual(live.lap, { now: 30, of: 56 });
  const over = await f1Live(us, () => null, { f1Outcome: async () => ({ status: 'final', order: ['Max Verstappen'] }) }, now);
  assert.equal(over.state, 'post');
  assert.equal(await f1Live(us, () => null, { f1Outcome: async () => null }, now), null);
  assert.equal(await f1Live(us, () => null, kit, Date.parse(us.start) - 1), null);
  assert.equal(await f1Live(f1Championship(games, standings, 2026), () => null, kit, now), null);
});

test('the field by team, teammates side by side', () => {
  const sorted = byTeam([{ name: 'Lando Norris' }, { name: 'Charles Leclerc' }, { name: 'Oscar Piastri' }, { name: 'Lewis Hamilton' }, { name: 'Nobody Known' }]);
  assert.deepEqual(
    sorted.map(d => d.name),
    ['Lando Norris', 'Oscar Piastri', 'Charles Leclerc', 'Lewis Hamilton', 'Nobody Known']
  );
});

test("a photo's F1 picks matched: the driver and the Grand Prix, or the championship; several on one race", async () => {
  const { matchPicks, gameFit } = await import('../public/slips/lib/scan.mjs');
  const { twDay } = await import('../public/slips/lib/feed.mjs');
  const champ = f1Championship(games, standings, 2026);
  const list = (league, day) => Promise.resolve(league === 'f1' ? [...(day <= twDay(Date.parse(champ.start)) ? [champ] : []), ...games.filter(g => twDay(Date.parse(g.start)) === day)] : []);
  const pick = (en, event, odds) => ({ sport: 'racing', league: 'f1', kind: 'f1', teams: ['車手'], teamsEn: [en], event, pick: '車手', odds });
  const picks = [pick('Max Verstappen', 'Singapore Grand Prix', 3.4), pick('Charles Leclerc', 'Singapore Grand Prix', 5), pick('Kimi Antonelli', "Drivers' Championship", 2.2), pick('Nobody Known', 'Singapore Grand Prix', 9)];
  const { legs, missed } = await matchPicks(picks, { now: Date.parse('2026-10-20T00:00:00Z'), bought: '2026-10-08', games: list });
  assert.deepEqual(
    legs.map(l => [l.driver, l.game.id, l.odds]),
    [
      ['Max Verstappen', 'f1:600057445:race', 3.4],
      ['Charles Leclerc', 'f1:600057445:race', 5],
      ['Kimi Antonelli', 'f1:champ:2026', 2.2]
    ]
  );
  assert.equal(missed.length, 1);
  assert.equal(gameFit({ teams: ['a', 'b'], teamsEn: ['a', 'b'] }, byId('f1:600057445:race')).score, 0);
});

test('a blank F1 price is as it stood before the start: the grid and the points before, never the result', () => {
  const comp = (abbreviation, date, names, completed = true) => ({ type: { abbreviation }, date, status: { type: { completed, state: 'post', name: 'STATUS_FINAL' } }, competitors: names.map((n, i) => ({ order: i + 1, athlete: { displayName: n } })) });
  const data = {
    events: [
      { id: '1', name: 'Dutch Grand Prix', competitions: [comp('Qual', '2026-08-22T13:00Z', ['Lando Norris', 'Max Verstappen', 'George Russell']), comp('Race', '2026-08-23T13:00Z', ['Lando Norris', 'Max Verstappen', 'George Russell'])] },
      { id: '2', name: 'Italian Grand Prix', competitions: [comp('Qual', '2026-09-05T14:00Z', ['George Russell', 'Lando Norris', 'Max Verstappen']), comp('Race', '2026-09-06T13:00Z', ['Max Verstappen', 'Lando Norris', 'George Russell'])] }
    ]
  };
  const [, monza] = parseF1Season(data);
  assert.deepEqual(monza.grid, ['George Russell', 'Lando Norris', 'Max Verstappen']);
  assert.deepEqual(monza.before, { 'Lando Norris': 25, 'Max Verstappen': 18, 'George Russell': 15 });
  // From pole: the favourite, whoever won.
  assert.ok(f1Guess(monza, 'George Russell') < 2.5);
  assert.ok(f1Guess(monza, 'George Russell') < f1Guess(monza, 'Max Verstappen'));
});
