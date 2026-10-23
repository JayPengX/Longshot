// Names in Chinese as 運彩 prints them: clubs Taiwan has no name for read
// through Google (a few to a question, kept), shown as they were until
// then; drivers keep their own names.
import test from 'node:test';
import assert from 'node:assert/strict';
import { nameZh, warm, useTranslator } from '../public/slips/lib/zh.mjs';
import { sideName, driverName } from '../public/slips/lib/words.mjs';

test('a driver by surname, in their own name', () => {
  assert.equal(driverName('George Russell'), 'Russell');
});

test('a club read through Google, a few to a question, kept', async () => {
  const asked = [];
  const said = { 'Ulsan HD': '蔚山現代', 'Gangwon FC': '江原FC' };
  useTranslator(async q => {
    asked.push(q);
    return q
      .split('; ')
      .map(x => said[x] ?? '')
      .join('；');
  });
  const g = { league: 'kleague', home: { en: 'Ulsan HD', zh: 'Ulsan HD', short: 'Ulsan HD' }, away: { en: 'Gangwon FC', zh: 'Gangwon FC', short: 'Gangwon FC' } };
  assert.equal(nameZh('Ulsan HD'), null);
  await warm([g]);
  assert.equal(sideName(g, 'home'), '蔚山現代');
  assert.equal(sideName(g, 'away'), '江原FC');
  const n = asked.length;
  await warm([g]);
  assert.equal(asked.length, n);
});
