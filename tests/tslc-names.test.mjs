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
