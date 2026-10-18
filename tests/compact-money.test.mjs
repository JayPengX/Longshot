import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compactMoney } from '../public/home.js';

test('zh: one decimal under 10萬, whole above, 億 at the top', () => {
  assert.equal(compactMoney(999, 'zh'), 'NT$999');
  assert.equal(compactMoney(15_000, 'zh'), 'NT$1.5萬');
  assert.equal(compactMoney(20_000, 'zh'), 'NT$2萬');
  assert.equal(compactMoney(10_000, 'zh'), 'NT$1萬');
  assert.equal(compactMoney(99_499, 'zh'), 'NT$9.9萬');
  assert.equal(compactMoney(99_500, 'zh'), 'NT$10萬');
  assert.equal(compactMoney(150_000, 'zh'), 'NT$15萬');
  assert.equal(compactMoney(99_999_999, 'zh'), 'NT$1億');
  assert.equal(compactMoney(159_000_000, 'zh'), 'NT$1.59億');
});
test('en: thousands in full, then M and B', () => {
  assert.equal(compactMoney(15_000, 'en'), 'NT$15,000');
  assert.equal(compactMoney(999_999, 'en'), 'NT$1.0M');
  assert.equal(compactMoney(158_800_000, 'en'), 'NT$158.8M');
  assert.equal(compactMoney(999_990_000, 'en'), 'NT$1.0B');
  assert.equal(compactMoney(2_500_000_000, 'en'), 'NT$2.5B');
});
