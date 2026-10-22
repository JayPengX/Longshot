// Names in Chinese as 運彩 prints them: known players and pairs by surname,
// East Asian players whole, the rest Google's reading (asked a few at a
// time, kept), tours and draws in Chinese.
import test from 'node:test';
import assert from 'node:assert/strict';
import { nameZh, warm, useTranslator, eventZh, driverZh } from '../public/slips/lib/zh.mjs';
import { sideName } from '../public/slips/lib/words.mjs';

test('known players: surnames, pairs by the slash, Asian names either way round', () => {
  assert.equal(nameZh('Anastasia Zakharova', 'p'), '莎卡洛娃');
  assert.equal(nameZh('S. Errani/J. Paolini', 'p'), '艾拉尼/包莉妮');
  assert.equal(nameZh('Hsieh Su-Wei', 'p'), '謝淑薇');
  assert.equal(nameZh('Su-Wei Hsieh/J. Ostapenko', 'p'), '謝淑薇/奧斯塔朋柯');
  assert.equal(driverZh('George Russell'), '羅素');
  assert.equal(eventZh(['WTA Doubles', 'Osaka']), 'WTA 雙打 Osaka');
});

test('the rest read through Google, a few to a question, honorifics off, kept', async () => {
  const asked = [];
  const said = { 'Ms. Bucsa': '布薩女士', 'Ms. Moyuka Uchijima': '內島萌夏小姐', Osaka: '大阪', 'Ms. Zangar Nurlanuly': '', 'Mr. Zangar Nurlanuly': '贊加爾·努爾拉努利先生' };
  useTranslator(async q => {
    asked.push(q);
    return q
      .split('; ')
      .map(x => said[x] ?? '')
      .join('；');
  });
  const g = { league: 'tennis', women: true, home: { en: 'C. Bucsa/N. Melichar-Martinez', zh: 'C. Bucsa/N. Melichar-Martinez', short: 'Bucsa/Melichar-Martinez' }, away: { en: 'Zangar Nurlanuly', zh: 'Zangar Nurlanuly', short: 'Nurlanuly' }, event: ['WTA', 'Osaka'] };
  await warm([g]);
  assert.equal(sideName(g, 'home'), '布薩/梅利查爾馬丁內茲');
  assert.equal(nameZh('C. Bucsa', 'p'), '布薩');
  assert.equal(sideName(g, 'away'), '努爾拉努利');
  assert.equal(eventZh(g.event), 'WTA 大阪');
  const n = asked.length;
  await warm([g]);
  assert.equal(asked.length, n);
});

test('a volleyball club is asked by its town, a league by its press name', async () => {
  const { clubTown, eventZh } = await import('../public/slips/lib/zh.mjs');
  assert.equal(clubTown('Aluron CMC Warta Zawiercie'), 'Zawiercie');
  assert.equal(clubTown('CDA Volley Talmassons FVG'), 'Talmassons');
  assert.equal(clubTown('Uyba Volley Busto Arsizio'), 'Busto Arsizio');
  assert.equal(clubTown('Fenerbahce Medicana'), 'Fenerbahce');
  assert.equal(eventZh(['Italy', 'Serie A1 (W)']), '義甲女排');
  assert.equal(eventZh(['Poland', 'Tauron Liga']), '波蘭女排');
});
