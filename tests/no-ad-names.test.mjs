import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

// Ad blockers (EasyList, and the Safari content blockers built on it) hide
// any element named like an ad on every site: the owner's panel, all .ad-card
// and .ad-head, opened onto a black page. No class or id here may look like one.
const AD_LIKE = /^(ad|ads|advert\w*|banner|sponsor\w*|promo)([-_]|$)/i;

async function files(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await files(path)));
    else if (/\.(html|css|js|mjs)$/.test(e.name)) out.push(path);
  }
  return out;
}

test('no class or id named like an ad (ad blockers hide those)', async () => {
  const bad = [];
  for (const file of await files(new URL('../public', import.meta.url).pathname)) {
    const text = await readFile(file, 'utf8');
    const names = [
      ...[...text.matchAll(/\b(?:class|id)="([^"]*)"/g)].flatMap(m => m[1].split(/\s+/)),
      ...[...text.matchAll(/(?:^|[\s,{>~+(])[.#]([A-Za-z_][\w-]*)/gm)].map(m => m[1]),
      ...[...text.matchAll(/classList\.(?:add|remove|toggle)\(([^)]*)\)/g)].flatMap(m => [...m[1].matchAll(/['"]([\w-]+)['"]/g)].map(n => n[1]))
    ];
    for (const n of new Set(names)) if (AD_LIKE.test(n)) bad.push(`${file.split('/public/')[1]}: ${n}`);
  }
  assert.deepEqual(bad, []);
});
