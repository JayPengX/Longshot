// Longshot's shutdown (Jay 2026-10-31): backs up everything Longshot keeps on
// Cloudflare, then (with "delete") removes it. Run by .github/workflows/shutdown.yml.
//   node scripts/shutdown.mjs backup   writes backup/: D1 rows as JSON, every R2 object
//   node scripts/shutdown.mjs delete   R2 objects + bucket, D1 database, the Worker
// Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const TOKEN = process.env.CLOUDFLARE_API_TOKEN, ACCT = process.env.CLOUDFLARE_ACCOUNT_ID;
const API = `https://api.cloudflare.com/client/v4/accounts/${ACCT}`;
const H = { Authorization: `Bearer ${TOKEN}` };
const BUCKET = 'longshot-data', DB = 'longshot-store', WORKER = 'longshot';
const mode = process.argv[2];

async function cf(path, init = {}) {
  const r = await fetch(API + path, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
}

async function r2Keys() {
  const keys = []; let cursor = '';
  for (;;) {
    const { status, j } = await cf(`/r2/buckets/${BUCKET}/objects?per_page=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    if (status === 404) return null;
    if (!j.success) throw new Error('r2 list: ' + JSON.stringify(j.errors));
    keys.push(...j.result.map(o => o.key));
    cursor = j.result_info?.cursor;
    if (!j.result_info?.is_truncated || !cursor) return keys;
  }
}

async function dbId() {
  const { j } = await cf(`/d1/database?name=${DB}`);
  return (j.result || []).find(d => d.name === DB)?.uuid || null;
}

async function sql(id, q) {
  const { j } = await cf(`/d1/database/${id}/query`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sql: q }) });
  if (!j.success) throw new Error('d1: ' + JSON.stringify(j.errors));
  return j.result[0].results;
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); }));
}

if (mode === 'backup') {
  const out = 'backup';
  const summary = { at: new Date().toISOString(), d1: {}, r2: 0 };
  const id = await dbId();
  if (id) {
    const tables = await sql(id, "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'");
    mkdirSync(join(out, 'd1'), { recursive: true });
    writeFileSync(join(out, 'd1', 'schema.json'), JSON.stringify(tables, null, 1));
    for (const t of tables) {
      const rows = [];
      for (let off = 0; ; off += 5000) {
        const page = await sql(id, `SELECT * FROM "${t.name}" LIMIT 5000 OFFSET ${off}`);
        rows.push(...page);
        if (page.length < 5000) break;
      }
      writeFileSync(join(out, 'd1', `${t.name}.json`), JSON.stringify(rows));
      summary.d1[t.name] = rows.length;
    }
  } else summary.d1 = 'no database';
  const keys = await r2Keys();
  if (keys) {
    await pool(keys, 16, async key => {
      const r = await fetch(`${API}/r2/buckets/${BUCKET}/objects/${encodeURIComponent(key)}`, { headers: H });
      if (!r.ok) throw new Error(`r2 get ${key}: ${r.status}`);
      const file = join(out, 'r2', key);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    });
    summary.r2 = keys.length;
  } else summary.r2 = 'no bucket';
  writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 1));
  console.log(JSON.stringify(summary, null, 1));
} else if (mode === 'delete') {
  const keys = await r2Keys();
  if (keys) {
    await pool(keys, 16, async key => {
      const { status, j } = await cf(`/r2/buckets/${BUCKET}/objects/${encodeURIComponent(key)}`, { method: 'DELETE' });
      if (status !== 404 && !j.success) throw new Error(`r2 delete ${key}: ${JSON.stringify(j.errors)}`);
    });
    console.log(`R2 ${BUCKET}: ${keys.length} objects deleted`);
    const b = await cf(`/r2/buckets/${BUCKET}`, { method: 'DELETE' });
    console.log(`R2 ${BUCKET}: bucket`, b.j.success ? 'deleted' : JSON.stringify(b.j.errors));
  } else console.log(`R2 ${BUCKET}: already gone`);
  const id = await dbId();
  if (id) {
    const d = await cf(`/d1/database/${id}`, { method: 'DELETE' });
    console.log(`D1 ${DB}:`, d.j.success ? 'deleted' : JSON.stringify(d.j.errors));
  } else console.log(`D1 ${DB}: already gone`);
  const w = await cf(`/workers/scripts/${WORKER}?force=true`, { method: 'DELETE' });
  console.log(`Worker ${WORKER} (crons, workers.dev address, Durable Object, secrets):`, w.status === 404 ? 'already gone' : w.j.success ? 'deleted' : JSON.stringify(w.j.errors));
  // What's left, as Cloudflare has it.
  console.log('check: worker', (await cf(`/workers/scripts/${WORKER}/settings`)).status, '| d1', await dbId(), '| r2', (await cf(`/r2/buckets/${BUCKET}`)).status);
  const all = await cf('/workers/scripts');
  console.log('Workers left:', (all.j.result || []).map(x => x.id).join(' '));
} else throw new Error('usage: shutdown.mjs backup|delete');
