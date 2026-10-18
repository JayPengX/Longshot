// The markets and ticket types by the names 台灣運彩 itself uses (運動彩券投注規範
// 第 2 條第 11 款、第 23 條, https://article.sportslottery.com.tw/zh-tw/about-us/135;
// 過關組合's 過1關…過12關, https://article.sportslottery.com.tw/zh-tw/news/gm-talk/5041),
// not Hong Kong's or the forums' (波膽, 雙重機會, 2串1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS } from '../public/lib/i18n.mjs';

const zh = STRINGS.zh;

test('market headings are 台灣運彩 play names', () => {
  assert.equal(zh.secMoneyline, '不讓分');
  assert.equal(zh.secSpread, '讓分');
  assert.equal(zh.secHandicap, '讓分');
  for (const k of ['secTotal', 'secTotalGoals', 'secTotalPoints']) assert.equal(zh[k], '大小');
  assert.equal(zh.secOddEven, '單雙');
  assert.equal(zh.secScore, '正確比數');
  assert.equal(zh.secHtft, '半/全場');
  assert.equal(zh.secDoubleChance, '雙勝');
  assert.equal(zh.secBtts, '兩隊是否都進球');
  assert.equal(zh.secHalf, '半場不讓分');
  assert.equal(zh.secHalfTotal, '半場大小');
  assert.equal(zh.secTeamTotal, '主隊/客隊大小');
  assert.equal(zh.secCorners, '角球數大小');
  assert.equal(zh.secQ1, '第一節不讓分');
  assert.equal(zh.secGoalBands, '總進球數');
  assert.equal(zh.secMargin, '勝分差');
  assert.equal(zh.secNextRun, '第一分/下一分');
});

test('a parlay is 過N關, never N串1', () => {
  const values = Object.values(zh).join('\n');
  assert.doesNotMatch(values, /\d\s*串\s*1|\{n\}\s*串\s*1/);
  assert.match(zh.barParlay.replace('{n}', '3'), /過 ?3 ?關/);
  assert.match(zh.slipSize.replace('{k}', '2'), /過 ?2 ?關/);
});

// 投注規範 第 20 條 (betting closes at the listed start) and 第 32、34 條 (a game
// postponed or cancelled is void: a single's stake back, a parlay's pick at odds 1).
test("the slip's 運彩規則 say when betting closes and what a called-off game does", () => {
  assert.match(zh.slipRulesNote, /開賽時間.*截止/);
  assert.match(zh.slipRulesNote, /延賽.*取消/);
  assert.match(zh.slipRulesNote, /退.*賠率算 1/);
  assert.match(STRINGS.en.slipRulesNote, /listed start/);
  assert.match(STRINGS.en.slipRulesNote, /odds 1/);
});

// Ice hockey's 全場 leaves out overtime and shootouts (投注規範 第 2 條第 17 款):
// 台灣運彩's hockey 不讓分 is the 60 minutes, three ways. The winner with
// overtime in is a different market, and named so.
test("hockey's 不讓分 is the 60 minutes; the winner with overtime is named apart", () => {
  assert.match(zh.secRegulation, /^不讓分/);
  assert.match(zh.secRegulation, /60/);
  assert.match(zh.secMoneylineOt, /延長/);
  assert.doesNotMatch(zh.secMoneylineOt, /不讓分/);
  assert.ok(STRINGS.en.secMoneylineOt);
});

// The kit's 2026-10 markets (Shared-Proxy claude/play-rules-r6) under 台灣運彩's
// own names, and every kind either kit's board makes has a section on the
// game page (a kind with none was never shown).
test("the kit's newer markets read as 台灣運彩 names them, and every kind on the board has a section", async () => {
  assert.equal(zh.secHalfSpread, '半場讓分');
  assert.equal(zh.secTdTotal, '達陣數大小');
  assert.equal(zh.secGoalCount, '正確進球數');
  assert.equal(zh.secInningTotal, '單局大小');
  assert.equal(zh.secInningMl, '單局不讓分');
  assert.equal(zh.secF5RunLine, '[1-5局]讓分');
  assert.equal(zh.secSet1, '單盤不讓分');
  assert.equal(zh.secSetHcap, '讓盤');
  assert.equal(zh.secGameHcap, '讓局');
  assert.match(zh.secMargin6, /^勝分差/);
  assert.equal(zh.inningTotalN.replace('{n}', '1'), '[第1局]大小');
  assert.equal(zh.inningMlN.replace('{n}', '1'), '[第1局]不讓分');
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const sections = new Map([...src.matchAll(/\{ kind: '([a-z0-9]+)', title: '([A-Za-z0-9]+)'/g)].map(m => [m[1], m[2]]));
  const notSold = new Set([...(/const NOT_SOLD = \{([^}]*)\}/.exec(src)?.[1] ?? '').matchAll(/'([a-z0-9]+)'/g)].map(m => m[1]));
  for (const title of sections.values()) for (const l of ['zh', 'en']) assert.ok(STRINGS[l][title], `${l} ${title}`);
  for (const kind of ['margin', 'hrunline', 'tdtotal', 'goalcount', 'inningtotal', 'inningml', 'f5runline', 'set1', 'sethcap', 'gamehcap', 'gametotal', 'setscore']) assert.ok(sections.has(kind), kind);
  const { gameOptions } = await import('../public/lib/board.mjs');
  const g = (sport, extra) => ({ id: sport, sport, startUtc: '2026-10-20T00:00:00Z', home: { en: 'Home' }, away: { en: 'Away' }, draftKings: { home: 0.6, away: 0.4 }, ...extra });
  const games = [
    g('mlb', { total: { line: 8.5, overFair: 0.5 }, spread: { awayLine: 1.5, awayFair: 0.6 } }),
    g('nfl', { total: { line: 44.5, overFair: 0.5 }, spread: { awayLine: 3.5, awayFair: 0.5 } }),
    g('nba', { total: { line: 224.5, overFair: 0.5 }, spread: { awayLine: 4.5, awayFair: 0.5 } }),
    g('nhl', { total: { line: 5.5, overFair: 0.5 } }),
    g('epl', { draftKings: { home: 0.5, draw: 0.27, away: 0.23 }, total: { line: 2.5, overFair: 0.5 } })
  ];
  for (const game of games) for (const o of gameOptions(game)) assert.ok(sections.has(o.kind) || notSold.has(o.kind), `${game.sport} ${o.kind}`);
});
