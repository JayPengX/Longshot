// Longshot at phone width, as a person sees it: screenshots of every tab
// (or the ones named), and the layout faults a person would notice.
//
//   node tools/preview.mjs [home games lottery tickets history] [--width 320,390]
//        [--dark] [--both] [--webkit] [--out dir] [--click selector] [--signed-out]
//        [--against dir]  (an earlier run's folder: what changed, in pink, on changes.png)
//
// Serves public/ on http://localhost:8123, so the deployed Worker answers its
// data through the dev door (real board, real games); the Pass is stood in for
// (a signed-in account with NT$30,000), so nothing is written to a real one.
// Each shot is checked for what the rulebook calls faults:
//   overflow  the page wider than the screen (sideways scrolling)
//   cut       a name or a number clipped by its box (an ellipsis or hidden overflow)
//   wraps     a title, a tab or a button's label on two lines
//   errors    a script error on the page
// It prints the faults (none: "clean") and where the shots went. Exit code 1
// when there are any, so it can gate a push.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const valued = new Set(['--width', '--out', '--click', '--against']);
const tabs = args.filter((a, i) => !a.startsWith('--') && !valued.has(args[i - 1]));
const widths = String(opt('width', '320,390')).split(',').map(Number);
const themes = flag('both') ? ['light', 'dark'] : [flag('dark') ? 'dark' : 'light'];
const out = opt('out', join(process.env.TMPDIR || '/tmp', 'longshot-preview'));
const click = opt('click', '');
const PORT = 8123;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(root, path.endsWith('/') ? `${path}index.html` : path);
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));

// A stand-in Pass: a refresh token naming a made-up account, a session, and
// a wallet with the opening money.
const ACCOUNT = 'PREV1EW2ACC3UNT4';
const b64 = s => Buffer.from(s).toString('base64url');
const REFRESH = `${b64(JSON.stringify({ d: `${ACCOUNT}x`, e: Date.now() + 864e5 }))}.preview`;
const wallet = { v: 1, created: Date.now(), entries: [{ id: 'pass:start', t: Date.now(), app: 'pass', kind: 'start', amount: 30000 }], snap: {}, settings: {} };
const passAnswer = { token: 'preview-session', refresh: REFRESH, wallet, walletTime: 'preview', active: true };

const require = createRequire(import.meta.url);
const pw = require('playwright');
const engine = flag('webkit') ? pw.webkit : pw.chromium;
const browser = await engine.launch();
await mkdir(out, { recursive: true });
const faults = [];
const shots = [];
try {
  for (const theme of themes)
    for (const width of widths) {
      const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, colorScheme: theme, locale: 'zh-TW', timezoneId: 'Asia/Taipei' });
      if (!flag('signed-out'))
        await ctx.addInitScript(([account, refresh]) => {
          localStorage.setItem('longshot.account', account);
          localStorage.setItem('longshot.refresh', refresh);
        }, [ACCOUNT, REFRESH]);
      await ctx.route(/longshot\.pengzjay\.workers\.dev\/pass/, route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(route.request().method() === 'GET' || /"op":"(refresh|login)"/.test(route.request().postData() || '') ? passAnswer : { ok: true }) }));
      // (The stand-in session isn't the Worker's: data calls go without it, through the dev door.)
      await ctx.route(/longshot\.pengzjay\.workers\.dev\/(?!pass)[^]*[?&]qt=/, route => route.continue({ url: route.request().url().replace(/&qt=[^&]*/, '') }));
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(String(e.message || e).slice(0, 160)));
      page.on('response', r => r.status() >= 400 && /workers\.dev/.test(r.url()) && !(r.status() === 404 && /\/data\//.test(r.url())) && errors.push(`requests: ${r.status()} ${r.url().replace(/[?].*/, '')}`));
      await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.getElementById('loading')?.hidden !== false, null, { timeout: 30_000 }).catch(() => errors.push('the loading screen never lifted'));
      if (flag('signed-out')) {
        await page.waitForSelector('dialog.q-gate[open]', { timeout: 20_000 }).catch(() => errors.push('no sign-in screen'));
        await page.waitForTimeout(800);
        const name = `signin-${width}-${theme}.png`;
        await page.screenshot({ path: join(out, name) });
        shots.push(name);
        for (const f of [...(await page.evaluate(layoutFaults)), ...errors.splice(0).map(e => `errors: ${e}`)]) faults.push(`signin ${width} ${theme}: ${f}`);
        await ctx.close();
        continue;
      }
      const all = await page.$$eval('#tabs [role=tab]', bs => bs.map(b => b.id.replace(/^tab-/, '') || b.dataset.tab || b.textContent.trim()));
      for (const tab of tabs.length ? tabs : all) {
        const btn = page.locator(`#tabs [role=tab]#tab-${tab}`);
        if (await btn.count()) await btn.click();
        await page.waitForTimeout(2500);
        if (click) await page.locator(click).first().click().then(() => page.waitForTimeout(1200)).catch(() => errors.push(`no ${click} to tap`));
        const name = `${tab}-${width}-${theme}${click ? '-click' : ''}.png`;
        await page.screenshot({ path: join(out, name) });
        shots.push(name);
        const found = await page.evaluate(layoutFaults);
        for (const f of [...found, ...errors.splice(0).map(e => `errors: ${e}`)]) faults.push(`${tab} ${width} ${theme}: ${f}`);
      }
      await ctx.close();
    }
  // One picture of every shot (sheet.png); with --against, each changed one as before | after | diff (changes.png).
  const against = opt('against', '');
  const sheet = await browser.newPage({ viewport: { width: 1200, height: 600 } });
  const img = async f => `data:image/png;base64,${(await readFile(f)).toString('base64')}`;
  const changed = [];
  if (against)
    for (const name of shots) {
      const was = join(against, name);
      if (!existsSync(was)) continue;
      const [a, b] = [await img(was), await img(join(out, name))];
      const res = await sheet.evaluate(diffInPage, [a, b]);
      if (res.share > 0.002) changed.push({ name, was: a, now: b, diff: res.png, share: res.share });
    }
  const grid = (title, rows) => `<body style="margin:16px;font:13px system-ui;background:#f4f4f6"><h3>${title}</h3><div style="display:flex;flex-wrap:wrap;gap:10px">${rows}</div></body>`;
  await sheet.setContent(grid(`Longshot · ${shots.length} shots${faults.length ? ` · ${faults.length} faults` : ''}`, (await Promise.all(shots.map(async n => `<figure style="margin:0;width:195px"><img src="${await img(join(out, n))}" width="195"><figcaption>${n.replace(/\.png$/, '')}</figcaption></figure>`))).join('')));
  await sheet.screenshot({ path: join(out, 'sheet.png'), fullPage: true });
  if (changed.length) {
    await sheet.setContent(grid('What changed', changed.map(c => `<figure style="margin:0;display:flex;gap:6px;align-items:start"><figcaption style="width:90px">${c.name.replace(/\.png$/, '')}<br>${(c.share * 100).toFixed(1)}%</figcaption>${[c.was, c.now, c.diff].map(s => `<img src="${s}" width="195">`).join('')}</figure>`).join('')));
    await sheet.screenshot({ path: join(out, 'changes.png'), fullPage: true });
  }
  if (against) console.log(changed.length ? `${changed.length} changed: ${changed.map(c => c.name).join(', ')}` : 'nothing changed');
} finally {
  await browser.close();
  server.close();
}
console.log(`${shots.length} shots in ${out} (all on sheet.png)`);
console.log(faults.length ? faults.join('\n') : 'clean');
process.exitCode = faults.length ? 1 : 0;

// Runs in the page: what a person would see as broken, on screen now.
function layoutFaults() {
  const out = [];
  const W = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > W + 1) out.push(`overflow: the page is ${document.documentElement.scrollWidth - W}px wider than the screen`);
  const shown = el => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) return false;
    for (let n = el; n; n = n.parentElement) if (getComputedStyle(n).visibility === 'hidden' || n.hidden || n.closest?.('dialog:not([open])')) return false;
    return true;
  };
  const label = el => (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (!el.childElementCount && el.textContent.trim() && shown(el)) {
      const cs = getComputedStyle(el);
      // Wider than its own box and clipped: an ellipsis or hidden overflow.
      if (el.scrollWidth > el.clientWidth + 1 && (cs.textOverflow === 'ellipsis' || cs.overflow === 'hidden' || cs.overflowX === 'hidden')) {
        const t = label(el);
        if (!seen.has(`cut${t}`)) (seen.add(`cut${t}`), out.push(`cut: “${t}”`));
      }
      // Right edge past the screen.
      const r = el.getBoundingClientRect();
      if (r.right > W + 1 && cs.position !== 'fixed' && !el.closest('[style*="overflow"], .q-rail, .q-day-strip, .q-chips, .q-seg, [class*="rail"], [class*="strip"], [class*="scroll"]')) {
        let scroller = false;
        for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) if (/auto|scroll|hidden/.test(getComputedStyle(n).overflowX)) scroller = true;
        if (!scroller) out.push(`overflow: “${label(el)}” runs off the right edge`);
      }
    }
  }
  // Titles, tabs and buttons on one line: a text of their own that breaks.
  for (const box of document.querySelectorAll('h1, h2, h3, [role=tab], button, .q-chip')) {
    if (!shown(box)) continue;
    for (const el of [box, ...box.querySelectorAll('*')]) {
      if (el.childElementCount || !el.textContent.trim() || getComputedStyle(el).display === 'none') continue;
      const range = document.createRange();
      range.selectNodeContents(el);
      const lines = new Set([...range.getClientRects()].filter(r => r.width > 1).map(r => Math.round(r.top / 6)));
      const t = label(el);
      if (lines.size > 1 && !seen.has(`wrap${t}`)) (seen.add(`wrap${t}`), out.push(`wraps: “${t}”`));
    }
  }
  return out;
}

// Runs in the page: the pixels that differ between two shots, in pink over the new one greyed.
async function diffInPage([x, y]) {
  const load = src => new Promise(ok => Object.assign(new Image(), { onload() { ok(this); }, src }));
  const [ia, ib] = await Promise.all([load(x), load(y)]);
  const w = Math.max(ia.width, ib.width);
  const h = Math.max(ia.height, ib.height);
  const pix = im => {
    const c = Object.assign(document.createElement('canvas'), { width: w, height: h }).getContext('2d');
    c.drawImage(im, 0, 0);
    return c.getImageData(0, 0, w, h).data;
  };
  const [pa, pb] = [pix(ia), pix(ib)];
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const g = c.getContext('2d');
  const d = g.createImageData(w, h);
  let changed = 0;
  for (let i = 0; i < pa.length; i += 4) {
    const grey = (pb[i] + pb[i + 1] + pb[i + 2]) / 3;
    if (Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]) + Math.abs(pa[i + 3] - pb[i + 3]) > 40) (changed++, d.data.set([255, 0, 170, 255], i));
    else d.data.set([grey * 0.35 + 150, grey * 0.35 + 150, grey * 0.35 + 150, 255], i);
  }
  g.putImageData(d, 0, 0);
  return { share: changed / (w * h), png: c.toDataURL('image/png') };
}
