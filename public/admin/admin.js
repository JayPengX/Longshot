// The owner's panel (worker/admin.js's /admin): signed in with the owner's
// pass, the admin token kept for this tab only (12 hours at most).
import { compact } from '../kit/format.mjs';
import { watchFit } from '../kit/fit.mjs';

const asked = new URLSearchParams(location.search).get('worker') || '';
// (A Worker on this computer for a local check; never any other address.)
const WORKER = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(asked) ? asked : 'https://longshot.pengzjay.workers.dev';
const $ = id => document.getElementById(id);
const KEY = 'longshot.admin';
let token = '';
try {
  token = sessionStorage.getItem(KEY) || '';
} catch {}
const keep = t => {
  token = t;
  try {
    t ? sessionStorage.setItem(KEY, t) : sessionStorage.removeItem(KEY);
  } catch {}
};

const ERRORS = {
  NOT_OWNER: '這不是管理員的通行碼，或登入已過期。',
  CLAIMED: '已經有管理員了。',
  RATE_LIMITED: '太多次了，等一下再試。',
  OWNER: '不能刪除管理員自己的帳戶。',
  NOT_FOUND: '找不到這個帳戶。'
};
async function call(action, body = {}) {
  const res = await fetch(`${WORKER}/admin`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action, at: token, ...body }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = data?.error?.code || 'FAILED';
    if (code === 'NOT_OWNER' && action !== 'login') signedOut();
    throw Object.assign(new Error(ERRORS[code] || `出了點問題（${code}）`), { code });
  }
  return data;
}

const fmt = n => Number(n || 0).toLocaleString('en-US');
const money = n => `NT$${fmt(Math.round(n))}`;
// A tile's money in its half of the row: NT$123萬 (NT$1,234,567 was cut to NT$1,23…).
const short = n => `NT$${compact(Math.round(n || 0))}`;
// Each tile's figure shrinks to its box rather than being cut.
watchFit('.own-tile b', { roots: [document.getElementById('ov-tiles')] });
const when = t => {
  if (!t) return '還沒用過';
  const m = Math.round((Date.now() - t) / 60_000);
  if (m < 2) return '剛剛';
  if (m < 60) return `${m} 分鐘前`;
  if (m < 48 * 60) return `${Math.round(m / 60)} 小時前`;
  return `${Math.round(m / 1440)} 天前`;
};
const day = t => (t ? new Date(t + 8 * 3_600_000).toISOString().slice(5, 10).replace('-', '/') : '');
const pass = c => `${c.slice(0, 5)}-${c.slice(5)}`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---- Signing in -------------------------------------------------------------
function show(id) {
  for (const x of ['gate', 'born', 'app']) $(x).hidden = x !== id;
  $('out').hidden = id !== 'app';
}
function signedOut() {
  keep('');
  gate();
}
async function gate() {
  show('gate');
  $('gate-error').textContent = '';
  let owner = true;
  try {
    owner = (await call('state')).owner;
  } catch {}
  $('gate-form').hidden = !owner;
  $('claim').hidden = owner;
  $('gate-title').textContent = owner ? '管理員登入' : '還沒有管理員';
  $('gate-text').textContent = owner ? '用你的 Longshot Pass 登入。' : '建立你的帳戶，只有它能進這頁。';
}
$('gate-form').addEventListener('submit', async e => {
  e.preventDefault();
  const code = $('gate-pass').value.toUpperCase().replace(/[^0-9A-Z]/g, '');
  try {
    keep((await call('login', { passcode: code })).token);
    $('gate-pass').value = '';
    open();
  } catch (err) {
    $('gate-error').textContent = err.message;
  }
});
$('claim').addEventListener('click', async e => {
  e.currentTarget.disabled = true;
  try {
    const r = await call('claim');
    keep(r.token);
    $('born-code').textContent = pass(r.passcode);
    $('born-pass').value = pass(r.passcode);
    show('born');
  } catch (err) {
    $('gate-error').textContent = err.message;
    e.currentTarget.disabled = false;
  }
});
// (Sent as a form, so a password manager offers to keep the new pass.)
$('born-save').addEventListener('submit', e => e.preventDefault());
$('born-ok').addEventListener('click', () => {
  try {
    $('born-save').requestSubmit?.();
  } catch {}
  open();
});
$('out').addEventListener('click', signedOut);

// ---- The panel -----------------------------------------------------------------
const tabs = [...document.querySelectorAll('[data-tab]')];
let tab = 'ov';
for (const b of tabs) b.addEventListener('click', () => go(b.dataset.tab));
function go(t) {
  tab = t;
  for (const b of tabs) b.setAttribute('aria-pressed', String(b.dataset.tab === t));
  for (const p of document.querySelectorAll('[data-pane]')) p.hidden = p.dataset.pane !== t;
  ({ ov: overview, pass: accounts, guard: guards })[t]().catch(err => alert(err.message));
}
function open() {
  show('app');
  go(tab);
}

async function overview() {
  const o = await call('overview');
  const tiles = [
    ['帳戶', fmt(o.accounts), o.waiting ? `${o.waiting} 張還沒用` : '全部用過了'],
    ['本週活躍', fmt(o.active.week), `今天 ${o.active.day}・本月 ${o.active.month}`],
    ['流通的錢', short(o.money.total), `最多 ${short(o.money.top)}`],
    ['今天拍注單', `${fmt(o.today.scans)} / ${fmt(o.guards.scanCap)}`, o.guards.scans ? '開著' : '已暫停'],
    ['下注與彩券', o.guards.play ? '開著' : '已暫停', '在「防護」切換'],
    ['錢快用完', fmt(o.money.under), '餘額不到 NT$1,000']
  ];
  $('ov-tiles').innerHTML = tiles.map(([k, v, s]) => `<div class="own-tile"><small>${k}</small><b>${esc(v)}</b><span>${esc(s)}</span></div>`).join('');
  const top = Math.max(1, ...o.starts, ...o.lastSeen);
  const h = n => `${Math.round((n / top) * 100)}%`;
  $('ov-days').innerHTML = o.days.map((d, i) => `<div title="${d}"><i class="a" style="height:${h(o.starts[i])}"></i><i class="b" style="height:${h(o.lastSeen[i])}"></i></div>`).join('');
  $('ov-foot').innerHTML = `<span>${o.days[0].slice(5).replace('-', '/')}</span><span>今天</span>`;
  $('ov-rich').innerHTML = o.richest.length ? o.richest.map(r => `<div class="own-item"><span><b class="mono">${r.ref}</b>${r.owner ? '<span class="own-tag">管理員</span>' : ''}<small>${when(r.last)}</small></span><b class="num">${money(r.balance)}</b></div>`).join('') : '<p class="own-muted">還沒有人用過。</p>';
}

let count = 1;
const setCount = n => ($('n').textContent = String((count = Math.max(1, Math.min(20, n)))));
$('n-down').addEventListener('click', () => setCount(count - 1));
$('n-up').addEventListener('click', () => setCount(count + 1));
let issuedCodes = [];
$('issue').addEventListener('click', async e => {
  const b = e.currentTarget;
  b.disabled = true;
  try {
    const { passes } = await call('issue', { count });
    issuedCodes = passes.map(p => pass(p.passcode));
    $('issued-list').innerHTML = passes.map(p => `<div class="own-item"><b class="mono">${pass(p.passcode)}</b><small class="mono">${p.ref}</small></div>`).join('');
    $('issued').hidden = false;
    await accounts();
  } catch (err) {
    alert(err.message);
  } finally {
    b.disabled = false;
  }
});
$('copy').addEventListener('click', async e => {
  try {
    await navigator.clipboard.writeText(issuedCodes.join('\n'));
    e.currentTarget.textContent = '已複製';
    setTimeout(() => ($('copy').textContent = '全部複製'), 1500);
  } catch {}
});

async function accounts() {
  const { accounts: list } = await call('accounts');
  $('acct-n').textContent = `${list.length} 個`;
  $('acct-list').innerHTML = list
    .map(
      a => `<div class="own-item" data-ref="${a.ref}">
        <span><b class="mono">${a.ref}</b>${a.owner ? '<span class="own-tag">管理員</span>' : ''}${a.unused ? '<span class="own-tag gray">還沒用</span>' : ''}
        <small>${a.unused ? `${day(a.created)} 發放` : `${day(a.created)} 開始・${when(a.last)}`}</small></span>
        <b class="num">${a.unused ? '' : money(a.balance)}</b>
        <div class="own-acts"><button type="button" data-do="signout">登出所有裝置</button><button type="button" data-do="repass">換通行碼</button>${a.owner ? '' : '<button type="button" class="danger" data-do="delete">刪除</button>'}</div>
      </div>`
    )
    .join('');
}
const CONFIRM = {
  signout: ref => `讓 ${ref} 的所有裝置登出？`,
  repass: ref => `給 ${ref} 一組新的通行碼？舊的會失效，所有裝置登出。`,
  delete: ref => `刪除 ${ref}？帳戶和它的資料都會不見，不能復原。`
};
$('acct-list').addEventListener('click', async e => {
  const b = e.target.closest('[data-do]');
  if (!b) return;
  const ref = b.closest('[data-ref]').dataset.ref;
  const what = b.dataset.do;
  if (!confirm(CONFIRM[what](ref))) return;
  try {
    const r = await call(what, { ref });
    if (r.passcode) alert(`${ref} 的新通行碼（只顯示這一次）：\n${pass(r.passcode)}`);
    await accounts();
  } catch (err) {
    alert(err.message);
  }
});

async function guards(set) {
  const [g, o] = await Promise.all([call('guards', set ? { guards: set } : {}), set ? null : call('overview')]);
  $('g-scans').checked = g.guards.scans;
  $('g-cap').value = g.guards.scanCap;
  $('g-play').checked = g.guards.play;
  if (o) $('g-today').textContent = `今天 ${fmt(o.today.scans)} 次`;
}
$('g-save').addEventListener('click', async e => {
  const b = e.currentTarget;
  b.disabled = true;
  try {
    await guards({ scans: $('g-scans').checked, scanCap: Number($('g-cap').value), play: $('g-play').checked });
    $('g-note').textContent = '已儲存，一分鐘內生效。';
  } catch (err) {
    $('g-note').textContent = err.message;
  } finally {
    b.disabled = false;
  }
});

token ? open() : gate();
