// The tickets on the Longshot Pass (the 注單 payload: { v: 1, slips, gone })
// and on this phone (localStorage), put together: every ticket either has,
// a deleted one (its id in `gone`, kept 120 days) gone from both. The same
// ticket on both: the one edited last (`edited`), else the one whose games
// are further on (the phone that watched them live), else this phone's.
const GONE_DAYS = 120;
const STATE_RANK = { pre: 0, in: 1, post: 2, void: 2 };
const progress = slip => (slip?.legs || []).reduce((n, l) => n + (STATE_RANK[l.game?.state] ?? 0), 0);

export function decode(text) {
  try {
    const x = typeof text === 'string' ? JSON.parse(text) : text;
    return { slips: Array.isArray(x?.slips) ? x.slips.filter(s => s && typeof s.id === 'string' && Array.isArray(s.legs)) : [], gone: x?.gone && typeof x.gone === 'object' ? x.gone : {} };
  } catch {
    return { slips: [], gone: {} };
  }
}
export const encode = ({ slips, gone }) => JSON.stringify({ v: 1, slips, gone });
// A payload there is but this page can't read (not JSON, not tickets, or a
// newer version than this page knows): never saved over. Nothing ('', none)
// is readable: no tickets yet.
export function unreadable(text) {
  if (text == null || text === '') return false;
  try {
    const x = typeof text === 'string' ? JSON.parse(text) : text;
    return !(x && typeof x === 'object' && Array.isArray(x.slips) && x.v === 1);
  } catch {
    return true;
  }
}

export function merge(mine, theirs, now = Date.now()) {
  const cutoff = now - GONE_DAYS * 86_400_000;
  const gone = {};
  for (const [id, at] of [...Object.entries(mine.gone || {}), ...Object.entries(theirs.gone || {})]) if (Number(at) > cutoff) gone[id] = Math.max(gone[id] || 0, Number(at));
  const byId = new Map();
  for (const s of theirs.slips || []) byId.set(s.id, s);
  for (const s of mine.slips || []) {
    const t = byId.get(s.id);
    if (!t) byId.set(s.id, s);
    else {
      const [a, b] = [Date.parse(s.edited || s.created) || 0, Date.parse(t.edited || t.created) || 0];
      byId.set(s.id, a !== b ? (a > b ? s : t) : progress(t) > progress(s) ? t : s);
    }
  }
  const slips = [...byId.values()].filter(s => !gone[s.id]).sort((a, b) => String(a.created).localeCompare(String(b.created)));
  return { slips, gone };
}

