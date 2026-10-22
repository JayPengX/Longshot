// ---- doc-store.js ----
// Longshot's store (every wallet, the account's Play data and tickets,
// Play's slips, the token secret): documents of one text `payload` each, by
// collection and id, in Cloudflare D1 (binding STORE, database
// longshot-store).
//
// The calls (deps.js hands them to pass.js, settle.js, kambi.js, lotto.js):
// get, write (with an `{ updateTime }` or `{ exists: false }` precondition: a
// write that lost the race throws `precondition`), list, batch, delete.
//
// One table, docs(coll, id, payload, updated): `updated` is a document's
// version (a write only if it's still what was read). Beside it, days(key,
// n): counts by day (sign-ups, scans), countDay.

export const SCHEMA = 'CREATE TABLE IF NOT EXISTS docs (coll TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, updated TEXT NOT NULL, PRIMARY KEY (coll, id))';

// A new version: an ISO time to the microsecond, unique enough.
export const stamp = (now = Date.now()) => `${new Date(now).toISOString().slice(0, 23)}${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}Z`;
const precondition = msg => Object.assign(new Error(msg), { precondition: true });

// The table, made once an isolate (one cheap query; the deploy needn't run SQL).
const ready = new WeakMap();
const tableOf = db => {
  if (!ready.has(db)) ready.set(db, db.prepare(SCHEMA).run().catch(e => (ready.delete(db), Promise.reject(e))));
  return ready.get(db);
};
export function d1Store(raw) {
  // Every query waits on the table being there.
  const db = { prepare: sql => {
    const st = { args: [] };
    const go = fn => tableOf(raw).then(() => fn(raw.prepare(sql).bind(...st.args)));
    const self = { bind: (...a) => ((st.args = a), self), first: () => go(q => q.first()), run: () => go(q => q.run()), all: () => go(q => q.all()) };
    return self;
  } };
  return {
    async get(collection, id) {
      const row = await db.prepare('SELECT payload, updated FROM docs WHERE coll = ? AND id = ?').bind(collection, id).first();
      return row ? { exists: true, updateTime: row.updated, payload: row.payload } : { exists: false, updateTime: '', payload: '' };
    },
    async write(collection, id, payload, pre, updated = stamp()) {
      // A new version is never the one it replaces (the same millisecond and
      // the same three random digits would let a stale write through).
      while (pre?.updateTime && updated === pre.updateTime) updated = stamp();
      let r;
      if (pre?.updateTime) r = await db.prepare('UPDATE docs SET payload = ?, updated = ? WHERE coll = ? AND id = ? AND updated = ?').bind(payload, updated, collection, id, pre.updateTime).run();
      else if (pre?.exists === false) r = await db.prepare('INSERT OR IGNORE INTO docs (coll, id, payload, updated) VALUES (?, ?, ?, ?)').bind(collection, id, payload, updated).run();
      else r = await db.prepare('INSERT INTO docs (coll, id, payload, updated) VALUES (?, ?, ?, ?) ON CONFLICT (coll, id) DO UPDATE SET payload = excluded.payload, updated = excluded.updated').bind(collection, id, payload, updated).run();
      if (pre && !r.meta?.changes) throw precondition(`${collection}/${id}: changed since it was read`);
      return { updateTime: updated };
    },
    async list(collection, pageSize = 300, { limit = Infinity, idsOnly = false } = {}) {
      const { results } = await db.prepare(`SELECT id, ${idsOnly ? "'' AS payload" : 'payload'}, updated FROM docs WHERE coll = ? ORDER BY id LIMIT ?`).bind(collection, Number.isFinite(limit) ? limit : -1).all();
      return results.map(r => ({ id: r.id, payload: r.payload, updateTime: r.updated }));
    },
    // Each write on its own (one that loses its race doesn't stop the rest):
    // { status: [{} or { code: 9 (lost its race) | 13, message }] }.
    async batch(writes) {
      const status = [];
      for (const w of writes) {
        try {
          if (w.delete) await db.prepare('DELETE FROM docs WHERE coll = ? AND id = ?').bind(...w.delete).run();
          else await this.write(w.update[0], w.update[1], w.update[2], w.updateTime ? { updateTime: w.updateTime } : null);
          status.push({});
        } catch (e) {
          status.push({ code: e.precondition ? 9 : 13, message: String(e.message || e) });
        }
      }
      return { status };
    },
    async delete(collection, id) {
      await db.prepare('DELETE FROM docs WHERE coll = ? AND id = ?').bind(collection, id).run();
    }
  };
}

// Whether the store can be used: D1 bound.
export const storeReady = env => Boolean(env.STORE);

// The calls worker.js hands on, each (env, …).
export function docStore() {
  const d1 = env => d1Store(env.STORE);
  return {
    get: (env, c, id) => d1(env).get(c, id),
    write: (env, c, id, payload, pre) => d1(env).write(c, id, payload, pre),
    list: (env, c, pageSize, o) => d1(env).list(c, pageSize, o),
    batch: (env, writes) => d1(env).batch(writes),
    delete: (env, c, id) => d1(env).delete(c, id)
  };
}

// ---- One JSON document changed safely (every caller's read-change-write) ----

// A stored document's JSON (fsGet's answer), or null: missing or unreadable.
export function parseDoc(doc) {
  if (!doc?.exists) return null;
  try {
    return JSON.parse(doc.payload);
  } catch {
    return null;
  }
}

// Reads a document, changes it and writes it back only over the version it
// read; a write that lost the race (another got in between) reads and
// changes it again, up to `attempts` times. With deps' fsGet / fsWrite /
// fsDelete (deps.js's plumbing).
//   read(json|null)   the value `change` works on (a default for a missing one)
//   change(value)     the next value; the same value: nothing written
//   write(value)      what's stored (null: the document deleted)
// The value written (or the unchanged one), or undefined when every attempt
// lost its race.
export async function changeDoc(env, deps, collection, id, change, { read = v => v, write = v => v, attempts = 4 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const doc = await deps.fsGet(env, collection, id);
    const value = read(parseDoc(doc));
    const next = change(value);
    if (next === value) return value;
    const out = write(next);
    try {
      if (out == null) {
        if (doc.exists) await deps.fsDelete(env, collection, id);
      } else await deps.fsWrite(env, collection, id, JSON.stringify(out), doc.exists ? { updateTime: doc.updateTime } : { exists: false });
      return next;
    } catch (error) {
      if (!error.precondition) throw error;
    }
  }
  return undefined;
}

// ---- Counts by day ---------------------------------------------------------------
//
// One more of `key` (a sign-up, a scan, with its Taiwan day in it): the count
// so far, this one included. In D1 when it's bound (every isolate shares it),
// else in this isolate's memory. A failing store counts as over any cap.
const DAYS = 'CREATE TABLE IF NOT EXISTS days (key TEXT PRIMARY KEY, n INTEGER NOT NULL)';
const inMemory = new Map();
export async function countDay(env, key) {
  if (!env?.STORE) {
    if (inMemory.size > 1000) inMemory.clear();
    inMemory.set(key, (inMemory.get(key) || 0) + 1);
    return inMemory.get(key);
  }
  try {
    await env.STORE.prepare(DAYS).run();
    const row = await env.STORE.prepare('INSERT INTO days (key, n) VALUES (?1, 1) ON CONFLICT (key) DO UPDATE SET n = n + 1 RETURNING n').bind(key).first();
    return Number(row?.n) || Infinity;
  } catch {
    return Infinity;
  }
}
export const forgetDays = () => inMemory.clear();

// A Taiwan day (YYYY-MM-DD) of a time.
export const twDay = (t = Date.now()) => new Date(t + 8 * 3_600_000).toISOString().slice(0, 10);
