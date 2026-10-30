// Longshot at phone width, as a person sees it: screenshots of every tab
// (or the ones named), and the layout faults a person would notice.
//
//   node tools/preview.mjs [home games lottery tickets history] [--width 320,390]
//        [--dark] [--both] [--webkit] [--out dir] [--click selector]
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
const valued = new Set(['--width', '--out', '--click']);
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
} finally {
  await browser.close();
  server.close();
}
console.log(`${shots.length} shots in ${out}`);
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
