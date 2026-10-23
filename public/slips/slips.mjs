// 注單: the 台灣運彩 tickets you bought, followed live from a photo of each
// (a tab of Longshot's). Two views: 注單 (what the open tickets are worth
// now, each one's picks as they happen, the latest settled) and 戰績 (how
// they've gone). A ticket opens in a sheet with its scoreboards and its
// numbers; a new one comes from a photo (or the games picked by hand) in the
// add sheet. The Longshot Pass keeps the tickets (this phone's copy too, for
// opening offline); the games come through the Worker's sports proxy.
//
// app.js mounts it (mountSlips) the first time the tab opens, and calls
// refreshSlips on a pull to refresh while it's shown.
import { translate, notify, proxyJson, ask as kitAsk, watchHalftime, halftimeClock, halftimeEnd, halftimeAttrs } from '../kit/core.mjs';
import { passSync } from '../kit/pass-sync.mjs';
import { q as pass0 } from '../lib/session.mjs';
import { toast, segmented, sheet as kitSheet } from '../kit/ui.mjs';
import * as kitUI from '../kit/ui.mjs';
import { leagueLogo, teamBadge, small } from '../kit/logos.mjs';
// A team's logo: the feed's, else the kit's (CPBL's and the leagues the feeds leave bare), never a blank shield.
// (ESPN's 500 px files through its resizer, the kit's small: a third of the bytes.)
// (A player: their flag, as the picker's rows; never a badge guessed from a name.)
const sideLogo = (g, side) => (playersOf(g) ? flagsFor(g[side].en)[0] || '' : small(g[side].logo || teamBadge(g.league, g[side].en || g[side].name) || ''));
import { record, curve, sinceOf, monthSpend } from './lib/stats.mjs';
import { LEAGUES, gamesOn, gamesAround, shiftDay, refresh, twDay, espnSummary, useReader, useToken, closingMarket, isSetSport, tennisFlags, flagOf } from './lib/feed.mjs';
import { SLIP_RULES, KINDS, slipSizes, slipErrors, combosBySize, comboCount, modeName, newId } from './lib/slip.mjs';
import { decode, encode, merge, unreadable } from './lib/sync.mjs';
import { W, en, lang } from './lib/lang.mjs';
import { shrink, readSlip, matchPicks, combosOf, stakeOf, timesOf } from './lib/scan.mjs';
import { fitGame, pickChance, marketChance, lotteryOdds } from './lib/model.mjs';
import { slipView, earliest, openLegs, nextRead, isNear, applyGames, repriceBlank, specOf, sportOfLeague } from './lib/ticket.mjs';
import { money, pct, odds2, signedMoney, signed, nm, lg, kindName, sideName, when, dayText, statusOf as statusWords, pickText, shareText, raceText, driverName, standOf, matchText } from './lib/words.mjs';
import { warm, onNames, useTranslator, eventZh, playersOf } from './lib/zh.mjs';
import { isF1, isChamp, placeOf, teamColor, f1Chance, byTeam, f1Guess, gpName } from './lib/f1.mjs';
import { sectionsFor } from './lib/board.mjs';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = kitUI.escHtml;

// Glyphs: the kit's where it has them, the sports' drawn here.
const g24 = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const OWN = {
  x: g24('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
  minus: g24('<path d="M7 12h10"/>'),
  back: g24('<path d="M7 12h10"/>'),
  share: g24('<path d="M12 15V4M8 7.5 12 3.5l4 4M6 11v8.5h12V11"/>'),
  trash: g24('<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"/>'),
  ticket: g24('<path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h14a1.5 1.5 0 0 1 1.5 1.5V10a2 2 0 0 0 0 4v2.5A1.5 1.5 0 0 1 19 18H5a1.5 1.5 0 0 1-1.5-1.5V14a2 2 0 0 0 0-4zM9 10h6M9 14h6"/>'),
  camera: g24('<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.3L9.5 4.5h5L16.2 7h2.3A1.5 1.5 0 0 1 20 8.5v10a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z"/><circle cx="12" cy="13" r="3.5"/>'),
  plus: g24('<path d="M12 5v14M5 12h14"/>'),
  check: g24('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  live: g24('<circle cx="12" cy="12" r="2"/><path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>'),
  chart: g24('<path d="M4 19h16M7 15l4-4 3 3 5-6"/>'),
  list: g24('<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.5" cy="6.5" r=".8"/><circle cx="4.5" cy="12" r=".8"/><circle cx="4.5" cy="17.5" r=".8"/>')
};
const icon = name => kitUI.icons[name] || OWN[name] || '';
const SPORT_NAMES = { baseball: ['棒球', 'Baseball'], basketball: ['籃球', 'Basketball'], football: ['美式足球', 'Football'], hockey: ['冰球', 'Hockey'], soccer: ['足球', 'Soccer'], racing: ['F1', 'F1'], tennis: ['網球', 'Tennis'], volleyball: ['排球', 'Volleyball'], badminton: ['羽球', 'Badminton'], tabletennis: ['桌球', 'Table tennis'] };
const SPORTS = {
  baseball: { color: '#e5484d', svg: g24('<circle cx="12" cy="12" r="8.5"/><path d="M6.4 5.6c2.2 2.4 2.2 10.4 0 12.8M17.6 5.6c-2.2 2.4-2.2 10.4 0 12.8M8.6 8.6l1.7.6M8.9 12h1.8M8.6 15.4l1.7-.6M15.4 8.6l-1.7.6M15.1 12h-1.8M15.4 15.4l-1.7-.6"/>') },
  basketball: { color: '#f08a24', svg: g24('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5v17M6.2 5.9c2.6 2.2 2.6 9.9 0 12.2M17.8 5.9c-2.6 2.2-2.6 9.9 0 12.2"/>') },
  football: { color: '#a0673f', svg: g24('<path d="M4 16.5C4 9 9 4 16.5 4 18.7 4 20 5.3 20 7.5 20 15 15 20 7.5 20 5.3 20 4 18.7 4 16.5z"/><path d="M9 15l6-6M11 11.5l1.5 1.5M13 9.5l1.5 1.5M9.5 13.5 11 15"/>') },
  hockey: { color: '#3478f6', svg: g24('<path d="M6 3.5 10.5 16H16"/><ellipse cx="17.5" cy="18.5" rx="3" ry="1.6"/><path d="M14.5 18.5v1.8c0 .9 1.3 1.6 3 1.6s3-.7 3-1.6v-1.8"/>') },
  soccer: { color: '#2fb457', svg: kitUI.icons.ball },
  racing: { color: '#e10600', svg: kitUI.icons.flag || g24('<path d="M5 21V4M5 4h12l-2 4 2 4H5"/>') },
  tennis: { color: '#8fb31a', svg: g24('<circle cx="12" cy="12" r="8.5"/><path d="M4.4 8.2c2.9 1 4.6 2.3 4.6 3.8s-1.7 2.8-4.6 3.8M19.6 8.2c-2.9 1-4.6 2.3-4.6 3.8s1.7 2.8 4.6 3.8"/>') },
  volleyball: { color: '#f5a300', svg: g24('<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5c0 4 1.5 7 4.5 8.5M12 12c-3.5 1.5-6 1.5-8.2-.2M12 12c.5 3.8 2.5 6.6 5.6 7.6"/>') },
  badminton: { color: '#14a89a', svg: g24('<path d="M9.2 14.5 5 3.5h14l-4.2 11z"/><path d="M8 9h8M12 3.5v11"/><circle cx="12" cy="17.8" r="2.7"/>') },
  tabletennis: { color: '#7c5cff', svg: g24('<circle cx="10" cy="10" r="6.5"/><path d="M14.6 14.6 20 20"/><circle cx="18.6" cy="5.6" r="1.8"/>') }
};
// A ticket's tile: its sport's ball where every pick is one sport, else a ticket on the app's colour.
const tileOf = (slip, size = '') => {
  const sports = new Set(slip.legs.map(l => sportOfLeague(l.game.league)));
  const sp = sports.size === 1 ? SPORTS[[...sports][0]] : null;
  return tile(sp ? sp.svg : icon('ticket'), sp ? sp.color : '', size);
};
const tile = kitUI.tileHtml;
const tone = n => (n > 0 ? 'up' : n < 0 ? 'down' : '');

// ---- What's kept on the phone ---------------------------------------------------

const q = pass0.view('slip');
// Drawn once the tab first opens (mountSlips).
let started = false;
// ESPN's boards and the Asian months through the sports proxy, with the Pass.
useReader((url, fresh) => proxyJson(url, { ttl: fresh, persist: false }));
useToken(() => q.token || '');

// This phone's copy (tickets here only go up to the Pass at the first
// sign-in), and the Pass's: { slips, gone } (lib/sync.mjs).
const KEY = 'longshot.slips.v1';
// Whether this phone keeps a copy at all: with none, and the Pass's not read
// yet (offline, or the read failed), the page says it couldn't read the
// tickets rather than "no tickets".
const kept = (() => {
  try {
    return localStorage.getItem(KEY) != null;
  } catch {
    return false;
  }
})();
let { slips, gone } = (() => {
  try {
    return decode(localStorage.getItem(KEY) || 'null');
  } catch {
    return { slips: [], gone: {} };
  }
})();
// Kept here at every change; on the Pass when a ticket is added, deleted
// or settled (`share`), together a moment later.
let shareTimer = 0;
function save(share = false) {
  try {
    localStorage.setItem(KEY, encode({ slips, gone }));
  } catch {}
  if (share) {
    clearTimeout(shareTimer);
    shareTimer = setTimeout(sharePass, 1500);
  }
}
// The Pass's copy and this phone's kept together: this phone writes only
// after reading the Pass's since it became live (back from another phone, or
// back online), and never over a copy it can't read (the kit's shared Pass
// sync, kit/pass-sync.mjs).
const sync = passSync(q, {
  decode: t => (unreadable(t) ? null : decode(t)),
  apply: theirs => {
    const merged = merge({ slips, gone }, theirs);
    ({ slips, gone } = merged);
    save();
    // The Pass's copy is behind this phone's (tickets only here): it goes up now,
    // not at the next change (the kit writes only what `changed` marks).
    if ((merged.slips.length || Object.keys(merged.gone).length) && encode(merged) !== encode(theirs)) sync.changed();
    if (started) (render(), reprice());
  },
  encode: () => encode({ slips, gone })
});
const pass = {
  // Any readable copy of the Pass's put in since the page opened.
  get known() {
    return sync.known;
  },
  // The sign-in's reply put in beside this phone's tickets; true when written back.
  async open(first) {
    await sync.first(first, { local: Boolean(kept || slips.length) });
    sync.watch();
    if (!sync.dirty) return false;
    sync.sync();
    return true;
  },
  // A ticket added, deleted or settled: this phone's copy to the Pass.
  share() {
    sync.changed();
    sync.sync();
  }
};
function sharePass() {
  pass.share();
}

// ---- Words ---------------------------------------------------------------------

// Where a game is (lib/words.mjs), and at half-time how long the break has
// left (the kit's countdown, ticking where it's shown).
function statusOf(g) {
  const s = statusWords(g);
  if (s.ht) {
    watchHalftime(s.ht, { sport: sportOfLeague(g.league), league: g.league, read: () => espnSummary(g.id) });
    const clock = halftimeClock(halftimeEnd(s.ht));
    if (clock) s.text = `${s.text} ${clock}`;
  }
  return s;
}

// A ticket's state as a tag: [tone, label]. 運彩's words: 中獎, 未中獎, 退款;
// before its first game, when that starts.
function stateTag(slip, v) {
  const live = v.legs.filter(x => x.live).length;
  if (v.status === 'live') return ['red', `<span class="live-dot"></span>${live > 1 ? W(`${live} 場進行中`, `${live} live`) : W('進行中', 'Live')}`];
  if (v.status === 'won') return ['green', W('中獎', 'Won')];
  if (v.status === 'lost') return ['red', W('未中獎', 'Lost')];
  if (v.status === 'refund') return ['', W('退款', 'Refund')];
  if (v.status === 'held') return ['orange', v.legs.some(x => x.held === 'suspended') ? W('暫停', 'Suspended') : W('延賽', 'Postponed')];
  if (v.status === 'part') return ['blue', W('進行中', 'Under way')];
  // (Before it starts: each game shows its own start beside its score.)
  return ['', W('未開賽', 'Not started')];
}
// Its leagues, games and cost: MLB · NBA · 2 場 · NT$500.
const subOf = (slip, v) => [...new Set(slip.legs.map(l => (isF1(l.game) ? 'F1' : lg(l.game.league))))].join(' · ') + ` · ${money(v.pre.cost)}`;

// ---- Pictures -------------------------------------------------------------------

// A team's logo, ESPN's dark version on a dark page (its 500-dark files),
// the plain one if that's missing; an empty disc while there's none.
const dark = matchMedia('(prefers-color-scheme: dark)');
// The tennis players' flags (ESPN's, feed tennisFlags) once read.
let flags = null;
const flagsFor = name =>
  String(name || '')
    .split('/')
    .map(n => flagOf(flags, n))
    .filter(Boolean);
function logoImg(t, cls = 'logo', g = null) {
  // A player (a pair): their flags, stacked; none known, no picture (never a shield).
  if (g && playersOf(g)) {
    const f = flagsFor(t.en);
    const stand = f.length ? `<span class="${cls} pflags">${f.map(x => `<img src="${esc(x)}" alt="" onerror="this.remove()">`).join('')}</span>` : `<span class="${cls} nopic"></span>`;
    return playerFace(t.en, g.league, cls, stand);
  }
  // A club Kambi lists (volleyball): no logo anywhere, so none drawn (never a shield).
  if (!t.logo && g && isSetSport(g.league)) return `<span class="${cls} nopic"></span>`;
  // None: the kit's team mark on the team's colour (never a letter, never an empty disc).
  if (!t.logo) return kitUI.logoTileHtml('', { size: 28, kind: 'team', alt: nm(t) }).replace('class="q-logo text"', `class="q-logo text ${cls} none"`);
  const src = small(dark.matches && /\/500\//.test(t.logo) ? t.logo.replace('/500/', '/500-dark/') : t.logo);
  return `<img class="${cls}" src="${esc(src)}" data-plain="${esc(small(t.logo))}" alt="" onerror="if(this.src!==this.dataset.plain)this.src=this.dataset.plain;else this.style.visibility='hidden'">`;
}

// A driver's flag (ESPN's), on their team's colour while there's none.
function flagImg(g, name, cls = 'logo') {
  const flag = (g.field || []).find(d => d.name === name)?.flag;
  return flag ? `<img class="${cls} flag" src="${esc(flag)}" alt="" onerror="this.style.visibility='hidden'">` : `<span class="${cls} none" style="background:${esc(teamColor(name))}"></span>`;
}

// A driver's face, as every app shows it (the kit's driverPic: their
// headshot, their team's colour and initials until it comes): a stand-in
// (the flag) the page swaps for it once it's drawn.
function driverFace(g, name, cls = 'logo') {
  return `<span class="face" data-face="${esc(name)}" data-cls="${esc(cls)}">${flagImg(g, name, cls)}</span>`;
}
// A player (one, not a pair): their photo (the kit's personPhoto: one found
// before on this phone, else TheSportsDB's cutout by name), their flag
// standing in until it comes or when there's none.
function playerFace(name, league, cls, stand) {
  if (!name || /\//.test(name)) return stand;
  return `<span class="face pface ${esc(cls)}" data-player="${esc(name)}" data-lg="${esc(league)}" data-cls="${esc(cls)}">${stand}</span>`;
}
const photos = import('../kit/photos.mjs').catch(() => null);
const swapFaces = root =>
  photos.then(kit => {
    if (!kit?.driverPic) return;
    for (const el of root.querySelectorAll('[data-player]')) {
      const name = el.dataset.player;
      el.removeAttribute('data-player');
      // (Its stand-in kept until a photo has loaded: never a blank tile.)
      kit.findPhoto(name, el.dataset.lg).then(url => {
        if (!url || !el.isConnected) return;
        const img = new Image();
        img.onload = () => el.isConnected && el.replaceChildren(Object.assign(img, { className: 'pphoto', alt: '' }));
        img.src = url;
      });
    }
    for (const el of root.querySelectorAll('[data-face]')) {
      const pic = kit.driverPic(el.dataset.face, { cls: el.dataset.cls });
      el.removeAttribute('data-face');
      el.replaceChildren(pic);
    }
  });
// (Wherever a page part is drawn: one watcher for them all.)
new MutationObserver(() => document.querySelector('[data-face], [data-player]') && swapFaces(document)).observe(document.documentElement, { childList: true, subtree: true });

// ---- Numbers that move -------------------------------------------------------------

// A number eased from what it showed to what it is (never a jump).
function tween(el, value, fmt) {
  if (!el) return;
  const from = Number(el.dataset.v);
  el.dataset.v = String(value);
  if (!Number.isFinite(from) || from === value || document.hidden) {
    el.textContent = fmt(value);
    return;
  }
  const t0 = performance.now();
  const dur = 700;
  cancelAnimationFrame(el._raf);
  const step = t => {
    const k = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(from + (value - from) * e);
    if (k < 1) el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
}
const setText = (el, text) => {
  if (el && el.textContent !== text) el.textContent = text;
};
// Markup set only when it changed (a live dot redrawn would restart its beat).
const setHtml = (el, html) => {
  if (el && el._html !== html) (el._html = html), (el.innerHTML = html);
};
function flash(el) {
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

// ---- A ticket ----------------------------------------------------------------------
// Drawn once (its logos stay loaded) and filled in place at every reading:
// on the page as a card (each pick one row: the pick, its chance, a small
// scoreboard), in its sheet in full (each side on its own row, so the
// longest club names fit whole; the fair price and the lottery's cut; the
// numbers behind it).

const legHtml = (l, full) => {
  // A small scoreboard (Apple Sports'): a row per side (a race: the driver),
  // its logo, name and score; where the game is beside them.
  const row = (k, pic) => `<span class="board" data-${k}>${pic}<span class="tn"></span><b class="ts num"></b></span>`;
  const sides = isF1(l.game) ? row('d', driverFace(l.game, l.driver)) : row('away', logoImg(l.game.away, 'logo', l.game)) + row('home', logoImg(l.game.home, 'logo', l.game));
  return `<div class="leg${full ? ' full' : ''}" data-leg="${esc(l.id)}">
    <span class="mark"></span>
    <span class="pick"><b class="pt"></b><span class="odds num"></span></span>
    <span class="ch num"></span>
    <span class="match"><span class="sides">${sides}</span><span class="st"></span><span class="need" hidden><i class="nb"><i></i></i><span class="nt"></span></span></span>
    ${full ? '<span class="tags"><span class="q-tag fo"></span><span class="q-tag cut"></span></span>' : ''}
  </div>`;
};
// The three figures: what it's worth (or paid), its chance, what it pays all won (or made).
const figsHtml = () => `<div class="figs"><span><small class="l2"></small><b class="v2 num"></b></span><span><small class="l3"></small><b class="pb num"></b></span><span><small class="l1"></small><b class="v1 num"></b></span></div><div class="bar"><i></i><span class="pre"></span></div>`;

// A ticket as a Wallet pass: a band in its sport's colour (several sports:
// the app's) with its kind, state and what it's worth; its picks under it.
const passColor = slip => {
  const sports = new Set(slip.legs.map(l => sportOfLeague(l.game.league)));
  return sports.size === 1 ? SPORTS[[...sports][0]]?.color || 'var(--q-accent)' : 'var(--q-accent)';
};
const passTop = slip => `<div class="pass-top">
    <div class="pass-id">${tileOf(slip)}<span class="pass-name"><b class="mode"></b><small class="sub"></small></span><span class="state q-tag"></span></div>
    ${figsHtml()}
    ${slip.legs.length > 1 ? '<div class="pips"><span class="pip-row"></span><small class="pip-t"></small></div>' : ''}
  </div>`;
const passAttrs = slip => `class="tk pass${slip.legs.length === 1 ? ' one' : ''}" style="--pc:${passColor(slip)}"`;

const cardHtml = slip => `<article ${passAttrs(slip)} data-open="${esc(slip.id)}">
  ${passTop(slip)}
  <div class="tk-legs">${slip.legs.map(l => legHtml(l, false)).join('')}</div>
</article>`;

// The same picks on the play-money 投注單 (app.js's #slip= import: priced
// there, what isn't on sale dropped). Its plain bets only; null when none of
// the ticket's picks can go.
const PLAY_KINDS = { ml: 'ml', total: 'total', spread: 'runline' };
function playHash(slip) {
  const legs = slip.legs
    .filter(l => PLAY_KINDS[l.kind] && !isF1(l.game) && l.game.home?.en && l.game.away?.en && l.game.state !== 'post' && (l.kind === 'ml' || Number.isFinite(l.line)))
    .slice(0, 20)
    .map(l => ({ league: l.game.league, home: l.game.home.en, away: l.game.away.en, ...(l.game.start ? { start: l.game.start } : {}), kind: PLAY_KINDS[l.kind], side: l.side, ...(l.kind === 'ml' ? {} : { line: l.line }) }));
  if (!legs.length) return null;
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify({ legs })))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `slip=${b64}`;
}
const detailHtml = slip => `<div ${passAttrs(slip)}>${passTop(slip)}<div class="tk-legs">${slip.legs.map(l => legHtml(l, true)).join('')}</div></div>
  <div class="mx"></div>
  <div class="tkd-acts">${playHash(slip) ? `<button class="q-btn tinted" type="button" data-play>${icon('ticket')}${W('用模擬金下注', 'Bet it with play money')}</button>` : ''}<button class="q-btn tinted" type="button" data-share>${icon('share')}${W('分享', 'Share')}</button><button class="q-btn danger tinted" type="button" data-del>${icon('trash')}${W('刪除', 'Delete')}</button></div>`;

function fill(el, slip, v) {
  el.classList.toggle('won', v.status === 'won');
  el.classList.toggle('lost', v.status === 'lost');
  el.classList.toggle('is-live', v.status === 'live');
  setText($('.mode', el), modeName(slip.mode, slip.legs, slip.sizes, en));
  setText($('.sub', el), subOf(slip, v));
  const [t, label] = stateTag(slip, v);
  const st = $('.state', el);
  st.className = `state q-tag ${t}`.trim();
  setHtml(st, label);

  v.legs.forEach(x => {
    const row = el.querySelector(`[data-leg="${CSS.escape(x.leg.id)}"]`);
    if (!row) return;
    const full = row.classList.contains('full');
    const g = x.leg.game;
    const mark = $('.mark', row);
    const ahead = x.ahead === 'won' ? 'ahead' : x.ahead === 'lost' ? 'behind' : '';
    const cls = `mark ${x.result || (x.live ? `on ${ahead}` : '')}`.trim();
    if (mark.className !== cls) {
      mark.className = cls;
      mark.innerHTML = x.result === 'lost' ? icon('x') : x.result === 'void' ? OWN.back : x.result === 'won' ? icon('check') : '';
    }
    setText($('.pt', row), pickText(x.leg));
    setText($('.odds', row), `@${odds2(x.leg.odds)}${x.leg.est ? W(' 估', ' est.') : ''}`);
    if (isF1(g)) {
      // The driver's place as the race stands or ended (the championship: the
      // standings); leading, in full colour.
      const p = g.order?.length && (g.state !== 'pre' || isChamp(g)) ? placeOf(g.order, x.leg.driver) : null;
      const b = $('[data-d]', row);
      // (On a card the race beside the face: the pick already names the driver.)
      setText($('.tn', b), isChamp(g) ? W(`${g.title} 年度`, `${g.title} season`) : raceText(g));
      const sc = $('.ts', b);
      const text = p == null ? '' : Number.isFinite(p) ? `P${p}` : '—';
      if (sc.textContent !== text) {
        if (sc.textContent) flash(sc);
        sc.textContent = text;
      }
      b.classList.toggle('lead', p === 1);
    } else for (const side of ['away', 'home']) {
      const b = $(`[data-${side}]`, row);
      // (A pair's names apart at the slash, never inside a name.)
      const nm2 = sideName(g, side);
      setText($('.tn', b), nm2.replace(/\//g, '/\u200b'));
      b.classList.toggle('long', nm2.length > 9);
      const sc = $('.ts', b);
      const text = g.score ? String(g.score[side]) : '';
      if (sc.textContent !== text) {
        if (sc.textContent) flash(sc);
        sc.textContent = text;
      }
      // The side that's ahead, in full colour.
      b.classList.toggle('lead', Boolean(g.score && g.score[side] > g.score[side === 'home' ? 'away' : 'home']));
    }
    const s = statusOf(g);
    const stEl = $('.st', row);
    // Its league (a tour's event: WTA 大阪) before where it is: 完賽 · NBA.
    const ev = g.event?.length ? (en ? g.event.join(' ') : eventZh(g.event)) : '';
    const lead = `${isF1(g) ? 'F1' : ev || lg(g.league)} · `;
    setText(stEl, `${lead}${s.text}`);
    // At half-time the beat keeps its countdown going; after it, the line is the refresh's again.
    if (s.ht) Object.entries(halftimeAttrs(s.ht, `${lead}${W('中場休息', 'Halftime')}`)).forEach(([k, val]) => stEl.setAttribute(k, val));
    else stEl.removeAttribute('data-halftime');
    stEl.classList.toggle('live', s.live);
    // How the pick stands on the score as it's played (讓分後領先 2.5, 還差 72).
    const need = $('.need', row);
    const sd = x.result ? null : standOf(x.leg);
    need.hidden = !sd;
    if (sd) {
      setText($('.nt', need), sd.text);
      need.className = `need ${sd.tone || ''}`.trim();
      $('.nb', need).hidden = sd.p == null;
      if (sd.p != null) $('.nb i', need).style.setProperty('--p', String(sd.p));
    }
    const ch = $('.ch', row);
    if (x.result) setText(ch, x.result === 'won' ? W('贏', 'Won') : x.result === 'lost' ? W('輸', 'Lost') : W('退還', 'Void'));
    else tween(ch, x.now.win + x.now.push / 2, p => pct(p));
    ch.className = `ch num ${x.result || ''}`.trim();
    if (!full) return;
    const fair = x.pre.win > 0 ? (1 - x.pre.push) / x.pre.win : null;
    const fo = $('.fo', row);
    setText(fo, fair ? W(`公平賠率 ${odds2(fair)}`, `Fair ${odds2(fair)}`) : '');
    fo.hidden = !fair;
    // What the lottery keeps of this pick at its price; below nothing, the
    // ticket's price beat the market's (an edge).
    const take = 1 - (x.leg.odds * x.pre.win + x.pre.push);
    const cutEl = $('.cut', row);
    setText(cutEl, take >= 0 ? W(`${x.estimated ? '估' : ''}抽 ${pct(take, 1)}`, `${x.estimated ? 'est. ' : ''}cut ${pct(take, 1)}`) : W(`優勢 ${pct(-take, 1)}`, `edge ${pct(-take, 1)}`));
    cutEl.className = `q-tag cut ${take < 0 ? 'green' : 'orange'}`;
    // (An estimated price has no cut to tell.)
    cutEl.hidden = Boolean(x.leg.est);
  });

  // Each pick as a segment of the pass (won, lost, live and how it stands, to come) and the count.
  const pips = $('.pips', el);
  if (pips) {
    const state = x => x.result || (x.live ? `live ${x.ahead === 'won' ? 'ahead' : x.ahead === 'lost' ? 'behind' : ''}` : 'wait');
    setHtml($('.pip-row', pips), v.legs.map(x => `<i class="${state(x).trim()}"></i>`).join(''));
    const won = v.legs.filter(x => x.result === 'won').length;
    const lost = v.legs.filter(x => x.result === 'lost').length;
    const live = v.legs.filter(x => !x.result && x.live).length;
    setText($('.pip-t', pips), [W(`${won}/${v.legs.length} 已中`, `${won}/${v.legs.length} won`), lost ? W(`${lost} 未中`, `${lost} lost`) : '', live ? W(`${live} 進行中`, `${live} live`) : ''].filter(Boolean).join(' · '));
  }

  // What it pays.
  const sheetish = el.classList.contains('tkd');
  if (v.done) {
    setText($('.l2', el), W('派彩（稅後）', 'Paid (after tax)'));
    tween($('.v2', el), v.paid.net, money);
    setText($('.l1', el), W('損益', 'Profit'));
    const pl = v.paid.net - v.pre.cost;
    tween($('.v1', el), pl, signedMoney);
    $('.v1', el).className = `v1 num ${tone(pl)}`.trim();
  } else {
    setText($('.l2', el), v.status === 'pre' ? W('平均拿回', 'Average back') : W('現在價值', 'Worth now'));
    tween($('.v2', el), v.now.net, money);
    setText($('.l1', el), sheetish ? W('全中可得（稅後）', 'If all land') : W('全中可得', 'If all land'));
    tween($('.v1', el), v.pre.best.net, money);
    $('.v1', el).className = 'v1 num';
  }
  // The middle figure: the chance it pays, or once it's over how much of the stake came back.
  const p = v.done ? (v.paid.gross > 0 ? 1 : 0) : v.now.any;
  setText($('.l3', el), v.done ? W('回收率', 'Returned') : W('命中機率', 'Chance'));
  if (v.done) setText($('.pb', el), pct(v.pre.cost ? v.paid.net / v.pre.cost : 0));
  else tween($('.pb', el), p, x => pct(x, x < 0.1 && x > 0 ? 1 : 0));
  $('.bar i', el).style.setProperty('--p', String(p));
  $('.bar .pre', el).style.setProperty('--p0', String(v.pre.any));

  // The numbers behind it, as receipts (the sheet only).
  const mx = $('.mx', el);
  if (mx) setHtml(mx, mathHtml(slip, v));
}

// One receipt: a title, rows [label, amount, class, a line under the label], a note.
const receipt = (title, rows, note, extra = '') =>
  `<section><h3 class="sl-h">${title}</h3><dl>${rows
    .filter(Boolean)
    .map(([a, b, c, sub]) => `<div${c ? ` class="${c}"` : ''}><dt>${a}${sub ? `<small>${sub}</small>` : ''}</dt><dd>${b}</dd></div>`)
    .join('')}${extra}</dl>${note ? `<p class="sl-foot">${note}</p>` : ''}</section>`;
const minus = n => `−${money(n)}`;
// The tax on a payout: 20% income tax (no stamp duty for 運彩's members).
function taxRows(pay) {
  const tax = pay.gross - pay.net;
  return tax < 0.5 ? [] : [[W('所得稅 20%', 'Income tax 20%'), minus(tax), 'neg']];
}
function mathHtml(slip, v) {
  const { pre } = v;
  const cost = pre.cost;
  const pay = v.done ? v.paid : pre.best;
  const pl = pay.net - cost;
  const free = money(SLIP_RULES.taxFree);
  // 台灣運彩 withholds per NT$10 單注: only where odds multiply past 500.
  const per = money(SLIP_RULES.unit);
  const past = SLIP_RULES.taxFree / SLIP_RULES.unit;
  const taxNote = pay.taxed
    ? pre.combos > 1
      ? W(`每注 ${per} 派彩超過 ${free}（賠率過 ${past}）才扣稅：這張 ${pre.combos} 組${pay.taxed === pre.combos ? '都要扣' : `裡有 ${pay.taxed} 組要扣`}`, `Taxed only where ${per} pays over ${free} (odds past ${past}): ${pay.taxed === pre.combos ? `all ${pre.combos}` : `${pay.taxed} of ${pre.combos}`} here`)
      : W(`每注 ${per} 派彩超過 ${free}（賠率過 ${past}），要扣稅`, `Taxed: ${per} of it pays over ${free} (odds past ${past})`)
    : '';
  const paid = receipt(
    v.done ? W('這張的派彩', 'What it paid') : W('全中的話', 'If all land'),
    [[W('派彩（稅前）', 'Payout (before tax)'), money(pay.gross)], ...taxRows(pay), [W('實拿', 'You get'), money(pay.net), 'sum'], [W('本金', 'Stake'), minus(cost), 'neg', pre.combos > 1 ? W(`${pre.combos} 組 × ${money(slip.stake)}`, `${pre.combos} × ${money(slip.stake)}`) : ''], [pl >= 0 ? W('淨賺', 'Profit') : W('淨虧', 'Loss'), money(Math.abs(pl)), `sum ${tone(pl)}`]],
    taxNote
  );
  const one = pre.any > 0 && (pre.any >= 0.5 ? W(`約 10 張中 ${Math.round(pre.any * 10)} 張`, `about ${Math.round(pre.any * 10)} in 10`) : W(`約 ${Math.round(1 / pre.any).toLocaleString('en-US')} 張中 1 張`, `about 1 in ${Math.round(1 / pre.any).toLocaleString('en-US')}`));
  const odds = receipt(W('開賽前的機會', 'The chances before'), [[W('有派彩', 'Pays anything'), pct(pre.any, 1), '', one], Math.abs(pre.profit - pre.any) > 0.0005 && [W('派彩比本金多', 'Pays more than the stake'), pct(pre.profit, 1)]]);
  const take = pre.take * cost;
  const tax = pre.tax * cost;
  const bar = `<div class="where"><i class="back" style="flex-grow:${Math.max(0, pre.back)}"></i>${take > 0 ? `<i class="take" style="flex-grow:${pre.take}"></i>` : ''}${tax >= 0.5 ? `<i class="tax" style="flex-grow:${pre.tax}"></i>` : ''}</div>`;
  const avg = receipt(
    W('長期平均', 'In the long run'),
    [
      [W('本金', 'Stake'), money(cost)],
      take >= 0 ? [W(`運彩抽成${v.estimated ? '（估）' : ''}`, `The lottery’s cut${v.estimated ? ' (est.)' : ''}`), minus(take), 'cut k-take', W(`本金的 ${pct(pre.take, 1)}`, `${pct(pre.take, 1)} of the stake`)] : [W('你的優勢', 'Your edge'), `+${money(-take)}`, 'edge', W(`本金的 ${pct(-pre.take, 1)}`, `${pct(-pre.take, 1)} of the stake`)],
      tax >= 0.5 && [W('中獎稅', 'Tax on wins'), minus(tax), 'neg k-tax'],
      [W('平均拿回', 'Average back'), money(pre.back * cost), 'sum k-back']
    ],
    '',
    bar
  );
  return paid + odds + avg;
}
// Confetti over a ticket that just won.
function burst(el) {
  if (!el) return;
  const box = document.createElement('div');
  box.className = 'burst';
  const colors = ['var(--q-green)', 'var(--q-blue)', 'var(--q-orange)', 'var(--q-indigo)', '#ffcc00'];
  for (let i = 0; i < 28; i++) {
    const c = document.createElement('i');
    const a = Math.PI * (i / 28) * 2;
    c.style.cssText = `--c:${colors[i % colors.length]};--x:${Math.cos(a) * (80 + Math.random() * 90)}px;--y:${-Math.abs(Math.sin(a)) * (120 + Math.random() * 80) + 40}px;--r:${Math.round(Math.random() * 720 - 360)}deg;animation-delay:${Math.random() * 120}ms`;
    box.appendChild(c);
  }
  el.appendChild(box);
  setTimeout(() => box.remove(), 1600);
}

// ---- 注單: what's on, then what's settled ----------------------------------------------

let tab = 'open';
let views = new Map();
const statusSeen = new Map();
// Each pick's result as last drawn: one that lands (or misses) while the app
// is open gets a banner (the kit's notify; the 注單比賽結束 switch).
const legSeen = new Map();
const cards = new Map();
// The ticket open in its sheet: { id, el }, filled again at every reading.
let detail = null;

const home = $('#panel-open');
home.innerHTML = `<div class="q-hero-card sl-hero" id="hero"></div>
  <section class="q-section" id="sec-open" hidden><div class="q-section-head"><h2>${W('進行中', 'Open')}</h2></div><div class="tks" id="cards"></div></section>
  <section class="q-section" id="sec-today" hidden></section>
  <section class="q-section" id="sec-how" hidden></section>
  <section class="q-section" id="sec-month" hidden></section>
  <section class="q-section" id="sec-done" hidden><div class="sl-box"><div class="sl-box-head"><h2>${W('已結算', 'Settled')}</h2><button type="button" id="all-done">${W('全部', 'All')}</button></div><div id="done-rows"></div></div></section>`;
const list = $('#cards');

const sorted = {
  open: (a, b) => earliest(a).localeCompare(earliest(b)),
  done: (a, b) => (b.settledAt || b.created).localeCompare(a.settledAt || a.created)
};

// Names in Chinese (zh.mjs): Google's reading of those Taiwan has none for,
// asked through the proxy; the page drawn again once they're in.
useTranslator(translate);
let namesV = 0;
let redrawPicker = null;
onNames(() => {
  namesV++;
  if (started) render();
  redrawPicker?.();
});

function render() {
  views = new Map(slips.map(s => [s.id, slipView(s)]));
  const games = slips.flatMap(s => s.legs.map(l => l.game));
  if (!en) warm(games);
  if (!flags && games.some(g => g.league === 'tennis')) tennisFlags().then(m => ((flags = m), started && render())).catch(() => {});
  // A ticket that just finished is kept with the time it did (before the
  // order is taken, so it doesn't move a beat later).
  let changed = false;
  for (const s of slips) if (views.get(s.id).done && !s.settledAt) (s.settledAt = new Date().toISOString()), (changed = true);
  if (changed) save(true);
  // A ticket that just won (not at the first drawing): confetti.
  let won = false;
  for (const s of slips) {
    const now = views.get(s.id).status;
    const before = statusSeen.get(s.id);
    if (before && before !== 'won' && now === 'won') won = true;
    statusSeen.set(s.id, now);
    for (const x of views.get(s.id).legs) {
      const r = x.result || x.early || null;
      const had = legSeen.get(x.leg.id);
      legSeen.set(x.leg.id, r);
      if (had !== null || !r || r === 'void') continue;
      const title = r === 'won' ? W(`過關：${pickText(x.leg)}`, `Landed: ${pickText(x.leg)}`) : W(`沒中：${pickText(x.leg)}`, `Missed: ${pickText(x.leg)}`);
      const left = views.get(s.id).legs.filter(y => !(y.result || y.early)).length;
      const body = `${matchText(x.leg.game)}${s.legs.length > 1 ? W(` · 這張還有 ${left} 場`, ` · ${left} to go on this ticket`) : ''}`;
      notify(q, { title, body, tag: `leg:${x.leg.id}` });
    }
  }
  if (tab === 'open') drawHome();
  else drawStats();
  if (detail) {
    const s = slips.find(x => x.id === detail.id);
    if (s) fill(detail.el, s, views.get(s.id));
  }
  if (won && tab === 'open') burst($('#hero'));
}

function drawHome() {
  const open = slips.filter(s => !views.get(s.id).done).sort(sorted.open);
  const closed = slips.filter(s => views.get(s.id).done).sort(sorted.done);
  drawHero(open);

  // The open tickets as passes, kept and moved rather than redrawn; a deleted or settled one let go.
  $('#sec-open').hidden = !open.length;
  const keep = new Set(open.map(s => s.id));
  for (const [id, el] of cards) if (!keep.has(id)) (el.remove(), cards.delete(id));
  let prev = null;
  for (const s of open) {
    let el = cards.get(s.id);
    // (Drawn again once the players' flags come in.)
    const key = `${s.legs.map(l => l.id).join()}|${flags ? 1 : 0}`;
    if (!el || el.dataset.legs !== key) {
      const tmp = document.createElement('div');
      tmp.innerHTML = cardHtml(s);
      const fresh = tmp.firstElementChild;
      fresh.dataset.legs = key;
      if (el) el.replaceWith(fresh);
      el = fresh;
      cards.set(s.id, el);
    }
    if (prev ? prev.nextElementSibling !== el : list.firstElementChild !== el) prev ? prev.after(el) : list.prepend(el);
    prev = el;
    fill(el, s, views.get(s.id));
  }

  drawToday();
  drawHow(!slips.length && !unread());
  drawMonth();

  // The latest settled, five at most (全部: every one, by day).
  $('#sec-done').hidden = !closed.length;
  setHtml($('#done-rows'), closed.slice(0, 5).map(settledRow).join(''));
}

// 今天的比賽: the games of the league last picked from, today, as the kit's
// match cards; a tap goes straight to its bets. Read now and then, not at
// every reading of the tickets.
let today = { at: 0, want: '', league: '', games: [] };
let todayBusy = false;
let todayLoad = null;
function drawToday() {
  const sec = $('#sec-today');
  if (!todayBusy && (Date.now() - today.at > 5 * 60_000 || today.want !== lastLeague) && !unread()) {
    todayBusy = true;
    const want = lastLeague;
    const day = twDay(Date.now());
    // The league last picked from; with nothing on there today, an open
    // ticket's league, then the big ones.
    const tries = [...new Set([want, ...slips.flatMap(s => s.legs.map(l => l.game.league)), 'mlb', 'nba', 'epl', 'cpbl'])].filter(k => LEAGUES[k] && k !== 'f1').slice(0, 4);
    todayLoad = (async () => {
      for (const league of tries) {
        const games = await gamesOn(league, day, { fresh: 60_000 }).catch(() => []);
        if (games.some(g => !g.off && (g.state === 'pre' || g.state === 'in'))) {
          if (!en) await warm(games);
          return { league, games };
        }
      }
      return { league: want, games: [] };
    })()
      .then(r => (today = { at: Date.now(), want, ...r }))
      .finally(() => ((todayBusy = false), tab === 'open' && drawToday()));
  }
  const games = today.games.filter(g => !isF1(g) && !g.off && (g.state === 'pre' || g.state === 'in')).slice(0, 8);
  sec.hidden = !games.length;
  if (!games.length) return;
  // Players' flags read once (then the cards drawn again with them).
  if (games.some(g => LEAGUES[g.league]?.sport === 'tennis') && !flags) tennisFlags().then(m => ((flags = m), drawToday())).catch(() => {});
  const key = namesV + (flags ? 'f' : '') + games.map(g => `${g.id}:${g.state}:${g.score?.away}-${g.score?.home}:${statusOf(g).text}`).join('|');
  if (sec.dataset.key === key) return;
  sec.dataset.key = key;
  const head = kitUI.sectionHead(W(`今天的${lg(today.league)}`, `${lg(today.league)} today`), { more: W('選比賽', 'All games'), onMore: () => addSheet() });
  const cardsOf = games.map(g => {
    const s2 = statusOf(g);
    const live = g.state === 'in';
    return kitUI.matchCard({
      league: lg(g.league),
      leagueLogo: leagueLogo(g.league) || '',
      when: live ? s2.text : when(g.start).time,
      live,
      sides: ['away', 'home'].map(side => ({ logo: sideLogo(g, side), name: sideName(g, side), score: live ? g.score?.[side] : undefined })),
      onOpen: () => addSheet({ game: g })
    });
  });
  // No picture for a side (a player without a flag, a club Kambi lists): its sport's mark, never a shield.
  const sp = SPORTS[LEAGUES[today.league]?.sport];
  if (sp && isSetSport(today.league))
    for (const c of cardsOf)
      for (const t of c.querySelectorAll('.q-logo.text')) {
        t.innerHTML = sp.svg;
        t.style.setProperty('--t', sp.color);
      }
  sec.replaceChildren(head, kitUI.rail(cardsOf));
}

// With no tickets yet: what the app does, in three calm rows.
function drawHow(show) {
  const sec = $('#sec-how');
  sec.hidden = !show;
  if (!show || sec.firstChild) return;
  const rows = [
    [icon('camera'), '#ff8d28', W('拍下注單', 'Snap your ticket'), W('拍照或截圖，玩法賠率自動填', 'A photo or screenshot fills in every pick')],
    [icon('live'), '#ff383c', W('即時比分與機率', 'Live scores and chances'), W('比分、中的機會、現在值多少', 'Each score, its chance and what it is worth now')],
    [icon('chart'), '#3478f6', W('看清運彩抽多少', 'See the lottery’s cut'), W('公平賠率、抽成、稅後實拿', 'Fair odds, the cut and what you take home')]
  ];
  sec.innerHTML = `<div class="sl-box"><div class="sl-box-head"><h2>${W('怎麼用', 'How it works')}</h2></div>${rows.map(([svg, c, t, sub]) => `<div class="q-ritem">${tile(svg, c)}<span class="q-ritem-text"><span class="q-ritem-title">${t}</span><small>${sub}</small></span></div>`).join('')}</div>`;
}

// 本月: what this month's settled tickets made, and what was staked on all of them.
function drawMonth() {
  const sec = $('#sec-month');
  const spent = monthSpend(slips, s => views.get(s.id)?.pre.cost || 0);
  const mine = slips.filter(s => views.get(s.id)?.done && twDay(Date.parse(s.settledAt || s.created)).startsWith(spent.month));
  sec.hidden = !spent.count;
  if (!spent.count) return;
  const net = mine.reduce((n, s) => n + views.get(s.id).paid.net - views.get(s.id).pre.cost, 0);
  const won = mine.filter(s => views.get(s.id).status === 'won').length;
  const month = Number(spent.month.slice(5));
  const monthName = W(`${month} 月`, ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1]);
  const stat = (l, v) => `<span><small>${esc(l)}</small><b class="num">${esc(v)}</b></span>`;
  setHtml(
    sec,
    `<div class="sl-box sl-month"><div class="sl-box-head"><h2>${esc(monthName)}</h2><small>${W('已結算損益', 'Settled profit')}</small></div>
    <strong class="sl-month-net num ${tone(net)}">${esc(mine.length ? signedMoney(net) : '—')}</strong>
    <div class="sl-month-figs">${stat(W('投注', 'Staked'), money(spent.staked))}${stat(W('張數', 'Tickets'), String(spent.count))}${stat(W('中獎', 'Won'), mine.length ? `${won}/${mine.length}` : '—')}</div></div>`
  );
}

// The hero: what the open tickets are worth now, and the way to add one (a
// photo first, or the games); with none open, the start; nothing readable, why.
function drawHero(open) {
  const hero = $('#hero');
  const mode = unread() ? 'unread' : open.length ? 'open' : 'start';
  if (hero.dataset.mode !== mode) {
    hero.dataset.mode = mode;
    const acts = `<div class="hc-acts"><button type="button" class="hc-scan" data-scan>${icon('camera')}<span>${W('拍注單', 'Scan a ticket')}</span></button><button type="button" class="hc-add" data-add aria-label="${W('選比賽加入', 'Pick the games')}">${icon('plus')}</button></div>`;
    hero.innerHTML =
      mode === 'open'
        ? `<span class="q-hc-eyebrow">${icon('live')}<span>${W('現在價值', 'Worth now')}</span></span><span class="hc-live" hidden></span>
          <strong class="q-hc-big num" id="h-now"></strong>
          <div class="hc-figs"><span><small>${W('投注', 'Staked')}</small><b class="num" id="h-cost"></b></span><span><small>${W('全中可得', 'If all land')}</small><b class="num" id="h-best"></b></span></div>
          <div class="pips hc-pips"><span class="pip-row"></span><small class="pip-t"></small></div>${acts}`
        : mode === 'start'
          ? `<span class="q-hc-eyebrow">${icon('ticket')}<span>${W('我的注單', 'Your tickets')}</span></span>
          <strong class="q-hc-title">${W('把買的運彩放進來', 'Track your tickets')}</strong>
          <p class="q-hc-sub">${W('拍一張注單，結果自動更新', 'Snap one; results update by themselves')}</p>${acts}`
          : `<span class="q-hc-eyebrow">${icon('cloud')}<span>${W('離線', 'Offline')}</span></span>
          <strong class="q-hc-title">${W('讀不到注單', 'Couldn’t load your tickets')}</strong>
          <p class="q-hc-sub">${W('連上網路後會自動出現', 'They’ll show once you’re back online')}</p>`;
  }
  if (mode !== 'open') return;
  const sum = f => open.reduce((n, s) => n + f(views.get(s.id)), 0);
  tween($('#h-now'), sum(v => v.now.net), money);
  tween($('#h-cost'), sum(v => v.pre.cost), money);
  tween($('#h-best'), sum(v => v.pre.best.net), money);
  const live = open.reduce((n, s) => n + views.get(s.id).legs.filter(x => x.live).length, 0);
  const tag = $('.hc-live', hero);
  setHtml(tag, live ? `<span class="live-dot"></span>${W(`${live} 場進行中`, `${live} live`)}` : '');
  tag.hidden = !live;
  // Every open pick as a segment, and how they stand: 已中 2 · 領先 1 · 落後 1 · 未開賽 3.
  const legs = open.flatMap(s => views.get(s.id).legs);
  const st = x => {
    const r = x.result || x.early;
    return r || (x.live ? (x.ahead === 'won' ? 'live ahead' : x.ahead === 'lost' ? 'live behind' : 'live') : 'wait');
  };
  setHtml($('.hc-pips .pip-row', hero), legs.length > 1 ? legs.map(x => `<i class="${st(x)}"></i>`).join('') : '');
  const count = k => legs.filter(x => st(x).startsWith(k)).length;
  const ahead = legs.filter(x => st(x) === 'live ahead').length;
  const behind = legs.filter(x => st(x) === 'live behind').length;
  setText(
    $('.hc-pips .pip-t', hero),
    [
      count('won') && W(`已中 ${count('won')}`, `${count('won')} won`),
      count('lost') && W(`未中 ${count('lost')}`, `${count('lost')} lost`),
      ahead && W(`領先 ${ahead}`, `${ahead} ahead`),
      behind && W(`落後 ${behind}`, `${behind} behind`),
      count('wait') && W(`未開賽 ${count('wait')}`, `${count('wait')} to come`)
    ]
      .filter(Boolean)
      .join(' · ')
  );
  $('.hc-pips', hero).hidden = legs.length < 2;
}

// A settled ticket as a row: its result, what it was, what it made.
function settledRow(s) {
  const v = views.get(s.id);
  const net = v.paid.net - v.pre.cost;
  const [glyph, color] = v.status === 'won' ? [icon('check'), '#34c759'] : v.status === 'refund' ? [icon('swap'), '#8e8e93'] : [icon('x'), '#ff383c'];
  const single = s.legs.length === 1;
  const leagues = [...new Set(s.legs.map(l => lg(l.game.league)))].join(' · ');
  const title = single ? pickText(s.legs[0]) : modeName(s.mode, s.legs, s.sizes, en);
  const sub = single ? kindName(s.legs[0].kind) : leagues;
  return `<button class="q-ritem chevron sl-row" data-open="${esc(s.id)}" type="button">${tile(glyph, color)}<span class="q-ritem-text"><span class="q-ritem-title">${esc(title)}</span><small>${esc(sub)}</small></span><span class="q-ritem-end"><b class="num ${tone(net)}">${esc(signedMoney(net))}</b></span></button>`;
}
// Every settled ticket, by the day it settled (each day's net beside it).
function settledHtml(rows) {
  const groups = new Map();
  for (const s of rows) {
    const at = s.settledAt || s.created;
    const key = twDay(Date.parse(at));
    if (!groups.has(key)) groups.set(key, { at, rows: [] });
    groups.get(key).rows.push(s);
  }
  return [...groups.values()]
    .map(({ at, rows }) => {
      const net = rows.reduce((n, s) => n + views.get(s.id).paid.net - views.get(s.id).pre.cost, 0);
      return `<section class="q-section"><div class="sl-box"><div class="sl-box-head"><h2>${esc(when(at).day)}</h2><span class="sl-count num ${tone(net)}">${esc(signedMoney(net))}</span></div>${rows.map(settledRow).join('')}</div></section>`;
    })
    .join('');
}

// Nothing kept here and the Pass's copy not read: not "no tickets".
const unread = () => !kept && !slips.length && !pass.known;

home.addEventListener('click', e => {
  if (e.target.closest('[data-scan]')) return addSheet({ scan: true });
  if (e.target.closest('[data-add]')) return addSheet();
  if (e.target.closest('#all-done')) return allSettled();
  const row = e.target.closest('[data-open]');
  if (row) openTicket(row.dataset.open);
});

function allSettled() {
  const body = document.createElement('div');
  body.className = 'sl-days';
  body.innerHTML = settledHtml(slips.filter(s => views.get(s.id)?.done).sort(sorted.done));
  body.addEventListener('click', e => {
    const row = e.target.closest('[data-open]');
    if (row) openTicket(row.dataset.open);
  });
  kitSheet({ title: W('已結算', 'Settled'), body: [body], cls: 'sl-app sl-sheet', closeLabel: W('關閉', 'Close') });
}

// A ticket in full, in a sheet: its picks, its numbers, share, delete.
function openTicket(id) {
  const slip = slips.find(x => x.id === id);
  if (!slip) return;
  const body = document.createElement('div');
  body.className = 'tkd';
  body.innerHTML = detailHtml(slip);
  const s = kitSheet({ title: W('注單詳情', 'Ticket'), body: [body], cls: 'sl-app sl-sheet', closeLabel: W('關閉', 'Close'), onClose: () => detail?.el === body && (detail = null) });
  detail = { id, el: body };
  fill(body, slip, views.get(id) || slipView(slip));
  body.addEventListener('click', e => {
    if (e.target.closest('[data-play]')) (s.close(), (location.hash = playHash(slip)));
    else if (e.target.closest('[data-share]')) shareSlip(slip);
    else if (e.target.closest('[data-del]')) deleteSlip(slip.id, s.close);
  });
}
function deleteSlip(id, closeSheet) {
  kitAsk({ title: W('刪除這張注單？', 'Delete this ticket?'), body: W('每台登入這個 Longshot Pass 的手機都會刪除，無法復原。', 'It goes from every phone on this Longshot Pass, for good.'), ok: W('刪除', 'Delete'), danger: true, lang }).then(yes => {
    if (!yes) return;
    closeSheet();
    const card = cards.get(id);
    card?.classList.add('leaving');
    setTimeout(
      () => {
        gone[id] = Date.now();
        slips = slips.filter(s => s.id !== id);
        save(true);
        render();
        schedule(0);
      },
      card ? 340 : 0
    );
  });
}

// 分享: the ticket as words (lib/words.mjs shareText), to the share sheet, else copied.
async function shareSlip(slip) {
  const text = shareText(slip, views.get(slip.id) || slipView(slip));
  if (navigator.share) {
    try {
      await navigator.share({ text });
    } catch {}
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast(W('已複製注單', 'Ticket copied'));
  } catch {
    toast(W('這個瀏覽器不能分享', "This browser can't share"), { tone: 'bad' });
  }
}

// 總覽 and 收支 (紀錄 has Play's own 戰績): a segmented control under the 注單 title.
const views2 = segmented(
  [
    { id: 'open', label: W('總覽', 'Overview') },
    { id: 'stats', label: W('收支', 'Returns') }
  ],
  { value: tab, label: W('檢視', 'View'), onChange: id => showTab(id) }
);
views2.classList.add('sl-views');
home.before(views2);
function showTab(id) {
  tab = id;
  home.hidden = id !== 'open';
  $('#panel-stats').hidden = id !== 'stats';
  render();
}

// ---- 戰績: how the settled tickets went --------------------------------------------

let range = 'all';
let by = 'kind';
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MODES = { single: ['單場', 'Singles', 'target', '#e08a00'], parlay: ['過關', 'Parlays', 'list', '#6155f5'], system: ['組合', 'Systems', 'grid', '#00a3bf'] };
const KIND_TILES = { ml: ['trophy', '#34c759'], spread: ['swap', '#3478f6'], total: ['bars', '#6155f5'], oddeven: ['grid', '#ff8d28'], f1: ['flag', '#e10600'] };
const stats = $('#panel-stats');
stats.innerHTML = `<div class="st-range"></div><div class="st-body"></div>`;
const rangeSeg = segmented(
  [
    { id: 'all', label: W('全部', 'All') },
    { id: '30', label: W('近 30 天', '30 days') },
    { id: '7', label: W('近 7 天', '7 days') }
  ],
  { value: range, label: W('期間', 'Range'), onChange: id => ((range = id), drawStats()) }
);
$('.st-range', stats).append(rangeSeg);
stats.addEventListener('click', e => {
  if (e.target.closest('[data-scan]')) return addSheet({ scan: true });
  const b = e.target.closest('[data-by]');
  if (b && b.dataset.by !== by) (by = b.dataset.by), drawStats();
});

// A row of a card: { icon, color, title, sub, value, tone }.
const rowHtml = x => `<div class="q-ritem">${x.icon ? tile(x.icon, x.color, 'sm') : ''}<span class="q-ritem-text"><span class="q-ritem-title">${esc(x.title)}</span>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</span>${x.value ? `<span class="q-ritem-value ${x.tone || ''}">${esc(x.value)}</span>` : ''}</div>`;

function drawStats() {
  const done = slips
    .filter(s => views.get(s.id)?.done)
    .map(s => {
      const v = views.get(s.id);
      return { slip: s, cost: v.pre.cost, net: v.paid.net, results: Object.fromEntries(v.legs.map(x => [x.leg.id, x.result])) };
    });
  $('.st-range', stats).hidden = !done.length;
  const body = $('.st-body', stats);
  const r = record(done, { since: sinceOf(range) });
  const empty = (title, text, action = null) => kitUI.emptyHtml({ icon: 'chart', title, body: text, action });
  const open = slips.length - done.length;
  if (!done.length)
    return setHtml(
      body,
      unread()
        ? empty(W('讀不到注單', 'Couldn’t load your tickets'), W('連上網路後，戰績會自動出現。', 'Your record shows once you’re back online.'))
        : empty(
            W('還沒有結算的注單', 'Nothing settled yet'),
            open ? W(`${open} 張進行中，結算後這裡會出現淨損益、回收率和中獎率。`, `${open} open; once they settle, your profit, return and win rate show here.`) : W('加入注單，結算後這裡會出現淨損益、回收率和中獎率。', 'Add a ticket; once it settles, your profit, return and win rate show here.'),
            { label: W('拍注單新增', 'Scan a ticket'), data: { scan: '' } }
          )
    );
  if (!r.count) return setHtml(body, empty(W('這段期間沒有結算的注單', 'Nothing settled in this range'), W('換成「全部」看所有結算過的注單。', 'Pick “All” to see every settled ticket.')));

  // The hero: the profit, and its running curve drawn in white.
  let chart = '';
  if (r.series.length > 1) {
    const c = curve(r.series, 300, 84);
    chart = `<svg class="st-chart" viewBox="0 0 300 84" preserveAspectRatio="none" role="img" aria-label="${esc(W(`累計損益 ${signedMoney(r.profit)}`, `Running profit ${signedMoney(r.profit)}`))}">
        <line class="zero" x1="0" x2="300" y1="${c.zero.toFixed(1)}" y2="${c.zero.toFixed(1)}" vector-effect="non-scaling-stroke"/>
        <path class="area" d="${c.area}"/>
        <path class="line" d="${c.line}" vector-effect="non-scaling-stroke"/>
      </svg><div class="st-dates"><span>${esc(dayText(r.series[0].at))}</span><span>${esc(dayText(r.series.at(-1).at))}</span></div>`;
  }
  // This month's spending (any range, open tickets too): the budget line.
  const spent = monthSpend(slips, s => views.get(s.id)?.pre.cost || 0);
  const month = Number(spent.month.slice(5));
  const fig = (l, x) => `<span><small>${esc(l)}</small><b class="num">${esc(x)}</b></span>`;
  const hero = `<div class="q-hero-card sl-hero"><span class="q-hc-eyebrow">${icon('chart')}<span>${W('淨損益', 'Profit')}</span></span><strong class="q-hc-big num">${esc(signedMoney(r.profit))}</strong>${chart}
    <div class="hc-figs">${fig(W('張數', 'Tickets'), String(r.count))}${fig(W('回收率', 'Back'), pct(r.roi))}${fig(W('中獎率', 'Win rate'), pct(r.hit))}${fig(W('平均賠率', 'Avg odds'), r.odds ? odds2(r.odds) : '—')}</div></div>`;

  const money2 = n => ({ value: signedMoney(n), tone: tone(n) });
  const ticketName = x => `${modeName(x.slip.mode, x.slip.legs, x.slip.sizes, en)} · ${dayText(x.slip.settledAt || x.slip.created)}`;
  const highlights = [
    spent.count ? { icon: icon('coin'), color: '#e08a00', title: W(`${month} 月已投注`, `Staked in ${MONTHS_EN[month - 1]}`), sub: W(`${spent.count} 張，含進行中`, `${spent.count} tickets`), value: money(spent.staked) } : null,
    { icon: icon('flame'), color: r.streak.won ? '#ff8d28' : '#8e8e93', title: r.streak.won ? W(`連中 ${r.streak.n} 張`, `${r.streak.n} paid in a row`) : W(`連續 ${r.streak.n} 張未中獎`, `${r.streak.n} without a payout`) },
    r.best ? { icon: icon('trophy'), color: '#34c759', title: W('賺最多的一張', 'Best ticket'), sub: ticketName(r.best), ...money2(r.best.net - r.best.cost) } : null,
    r.worst && r.worst !== r.best ? { icon: icon('drop'), color: '#ff383c', title: W('賠最多的一張', 'Worst ticket'), sub: ticketName(r.worst), ...money2(r.worst.net - r.worst.cost) } : null
  ].filter(Boolean);

  const groupSub = g => W(`${g.count} 張 · 中 ${g.won} · 回收 ${pct(g.roi)}`, `${g.count} · ${g.won} won · ${pct(g.roi)} back`);
  const rows =
    by === 'kind'
      ? r.byKind.map(k => ({ icon: icon(KIND_TILES[k.key]?.[0] || 'target'), color: KIND_TILES[k.key]?.[1], title: kindName(k.key), sub: W(`${k.legs} 場 · 中 ${k.won} · 沒中 ${k.lost}${k.void ? ` · 退 ${k.void}` : ''}`, `${k.legs} picks · ${k.won} won · ${k.lost} lost${k.void ? ` · ${k.void} void` : ''}`), value: pct(k.hit) }))
      : by === 'mode'
        ? r.byMode.map(g => ({ icon: icon(MODES[g.key]?.[2] || 'ticket'), color: MODES[g.key]?.[3], title: (MODES[g.key] || [g.key, g.key])[en ? 1 : 0], sub: groupSub(g), ...money2(g.profit) }))
        : by === 'sport'
          ? r.bySport.map(g => {
              const sp = SPORTS[g.key];
              return { icon: sp ? sp.svg : icon('ticket'), color: sp?.color || '#8e8e93', title: g.key === 'mixed' ? W('跨運動過關', 'Across sports') : SPORT_NAMES[g.key]?.[en ? 1 : 0] || g.key, sub: groupSub(g), ...money2(g.profit) };
            })
          : r.byLeague.map(g => {
            const sp = g.key === 'mixed' ? null : SPORTS[sportOfLeague(g.key)];
            return { icon: sp ? sp.svg : icon('ticket'), color: sp?.color || '#8e8e93', title: g.key === 'mixed' ? W('跨聯盟過關', 'Across leagues') : lg(g.key) || g.key, sub: groupSub(g), ...money2(g.profit) };
          });
  const bySeg = `<div class="q-seg sl-by" role="tablist">${[
    ['kind', W('玩法', 'Bet')],
    ['mode', W('過關', 'Ticket')],
    ['sport', W('運動', 'Sport')],
    ['league', W('聯盟', 'League')]
  ]
    .map(([k, t]) => `<button type="button" role="tab" data-by="${k}" aria-selected="${by === k}">${t}</button>`)
    .join('')}</div>`;

  const box = (head, inner, extra = '') => `<section class="q-section"><div class="sl-box"><div class="sl-box-head"><h2>${esc(head)}</h2></div>${extra}${inner}</div></section>`;
  // Each month's profit (the last six), a bar up or down from the line.
  const months = r.byMonth.slice(-6);
  // (The line where the months sit: at the foot when none lost, at the top when none won.)
  const hi = Math.max(0, ...months.map(m => m.profit));
  const lo = Math.max(0, ...months.map(m => -m.profit));
  const span = hi + lo || 1;
  const monthBars =
    months.length > 1
      ? box(
          W('每月損益', 'By month'),
          `<div class="mo-bars" style="--n:${months.length};--z:${((lo / span) * 100).toFixed(1)}%">${months
            .map(m => {
              const h = Math.max(2, Math.round((Math.abs(m.profit) / span) * 100));
              const mo = Number(m.key.slice(5));
              return `<div class="mo ${m.profit >= 0 ? 'up' : 'down'}"><small class="num">${esc(signedMoney(m.profit).replace('NT$', ''))}</small><span class="mo-track"><i style="--h:${h}%"></i></span><b>${esc(W(`${mo}月`, MONTHS_EN[mo - 1].slice(0, 3)))}</b></div>`;
            })
            .join('')}</div>`
        )
      : '';
  setHtml(body, hero + monthBars + box(W('重點', 'Highlights'), highlights.map(rowHtml).join('')) + box(W('細項', 'Breakdown'), rows.map(rowHtml).join(''), bySeg));
}

// ---- Live: read only while it matters ------------------------------------------

// ESPN's games every 15 s while one of yours is on (straight from ESPN);
// Asia's baseball every minute (it comes through the proxy). Nothing while
// the page is hidden or no game is near; on coming back, read at once.
let timer = 0;
let busy = false;
const viewOf = s => views.get(s.id) || slipView(s);
async function tick(all = false) {
  if (busy || document.hidden) return;
  const now = Date.now();
  const legs = openLegs(slips, viewOf).filter(l => all || isNear(l, now));
  if (!legs.length) return schedule();
  busy = true;
  try {
    if (applyGames(slips, await refresh(legs))) (save(), render());
  } finally {
    busy = false;
    schedule();
  }
}
// Tickets already kept whose odds were left blank (估) on games now over:
// priced again once with the better estimate (the closing lines; F1 on its
// grid), quietly, settled ones too.
let repricing = false;
async function reprice() {
  if (repricing) return;
  repricing = true;
  try {
    const f1 = slips.flatMap(s => s.legs).filter(l => l.est && !l.closing && l.kind === 'f1' && !isChamp(l.game) && l.game.state === 'post');
    let changed = false;
    if (f1.length) {
      changed = applyGames(slips, await refresh(f1));
      for (const l of f1) (l.closing = true), (changed = true);
    }
    const sectionsOf = g => Promise.all([import('../kit/play-board.mjs'), import('../kit/play-teams.mjs')]).then(([board, teams]) => sectionsFor(g, board, teams.LEAGUES));
    if (await repriceBlank(slips, { closing: closingMarket, sectionsOf })) changed = true;
    if (changed) (save(true), render());
  } catch {
  } finally {
    repricing = false;
  }
}
// The next read: lib/ticket.mjs nextRead, or `ms` from now.
function schedule(ms) {
  clearTimeout(timer);
  if (document.hidden) return;
  ms ??= nextRead(openLegs(slips, viewOf));
  if (ms != null) timer = setTimeout(() => tick(), ms);
}
let lastAll = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return clearTimeout(timer);
  render();
  const all = Date.now() - lastAll > 10 * 60_000;
  if (all) lastAll = Date.now();
  tick(all);
});


// ---- Adding a ticket ------------------------------------------------------------------
// One sheet: a photo of the ticket first (read, matched, the draft filled in
// for the person to check), else the games picked by hand; the draft under
// it, and 儲存 at its foot once it's a ticket 運彩 would sell.

// The leagues' chips: each Kambi league by its kind (歐洲籃球 with the
// basketball, 韓K聯 with the soccer), the set sports after F1.
const ORDER = (() => {
  const keys = Object.keys(LEAGUES).filter(k => LEAGUES[k].data !== 'kambi');
  const after = (k, ...add) => keys.splice(keys.indexOf(k) + 1, 0, ...add);
  after('nbl', 'euroleague');
  after('jleague', 'kleague');
  after('f1', 'tennis', 'volleyball', 'badminton', 'tabletennis');
  return keys.filter(k => LEAGUES[k]);
})();
let lastLeague = (() => {
  try {
    return localStorage.getItem('slip.league') || 'mlb';
  } catch {
    return 'mlb';
  }
})();
// The picker's days: the game days from three back (a ticket added late) to
// ten ahead; any other from its calendar. F1's: every race of the season.
const BACK = 3;
const AHEAD = 10;
const WEEKDAY = en ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
const dayName = (day, today) => {
  const off = Math.round((Date.parse(day) - Date.parse(today)) / 86_400_000);
  if (off === 0) return W('今天', 'Today');
  if (off === 1) return W('明天', 'Tomorrow');
  if (off === -1) return W('昨天', 'Yesterday');
  return WEEKDAY[new Date(`${day}T12:00:00Z`).getUTCDay()];
};
// A race on the day strip: its place alone (巴林, not 巴林站（馬來西亞）), on one line.
const stripGp = g => gpName(g, en).replace(/\s*[（(].*?[）)]/g, '').replace(/站$|\s+GP$/, '');
const md = day => `${Number(day.slice(5, 7))}/${Number(day.slice(8))}`;
// A name searched: Chinese or English, whole or short, any case.
const norm = x => String(x || '').toLowerCase().replace(/\s+/g, '');
const teamHit = (t, q) => [t.zh, t.en, t.short, t.abbr].some(n => norm(n).includes(q));
// A game searched by its sides (as the page names them too) or its event (WTA 大阪, Osaka).
const gameHit = (g, q) => teamHit(g.home, q) || teamHit(g.away, q) || [sideName(g, 'home'), sideName(g, 'away'), (g.event || []).join(' '), eventZh(g.event)].some(n => norm(n).includes(q));
// A race searched by its Grand Prix, its country or its circuit, in either language (Monza, 蒙札, Italian GP).
const CIRCUITS = [
  [/ital/i, 'monza 蒙札 蒙扎'], [/brit/i, 'silverstone 銀石'], [/monaco/i, 'monte carlo 蒙地卡羅 摩納哥'], [/belgi/i, 'spa francorchamps 斯帕'],
  [/japan/i, 'suzuka 鈴鹿'], [/singapore/i, 'marina bay 濱海灣'], [/united states/i, 'austin cota 奧斯汀 美國'], [/são paulo|sao paulo|brazil/i, 'interlagos 英特拉格斯 巴西 聖保羅'],
  [/abu dhabi/i, 'yas marina 亞斯碼頭 阿布達比'], [/qatar/i, 'lusail 盧賽爾 卡達'], [/saudi/i, 'jeddah 吉達 沙烏地'], [/australia/i, 'melbourne albert park 墨爾本'],
  [/chin/i, 'shanghai 上海'], [/bahrain/i, 'sakhir 薩基爾'], [/canad/i, 'montreal gilles villeneuve 蒙特婁'], [/austria/i, 'red bull ring spielberg 紅牛賽道'],
  [/barcelona|catalunya/i, 'barcelona catalunya 巴塞隆納'], [/spanish|spain/i, 'madrid madring 馬德里'], [/azerbaijan/i, 'baku 巴庫'], [/emilia|imola/i, 'imola 伊莫拉'],
  [/hungar/i, 'hungaroring budapest 布達佩斯'], [/dutch/i, 'zandvoort 贊德沃特'], [/mexic/i, 'hermanos rodriguez 墨西哥城'], [/las vegas/i, 'vegas strip 拉斯維加斯'],
  [/miami/i, 'hard rock 邁阿密'], [/malaysia/i, 'sepang 雪邦 馬來西亞']
];
const raceHit = (g, q) => !isChamp(g) && [g.title, gpName(g, true), gpName(g, false), raceText(g), ...CIRCUITS.filter(([re]) => re.test(g.title)).map(([, w]) => w)].some(n => norm(n).includes(q));
const pressed = (box, b) => box.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));

function addSheet({ scan = false, game = null } = {}) {
  const today = twDay(Date.now());
  const from = shiftDay(today, -BACK);
  const to = shiftDay(today, AHEAD);
  // day: '' for every day around today; query: a team searched in every league.
  const draft = { legs: [], mode: 'single', chosen: [], stake: 100, league: game?.league || lastLeague, day: '', query: '' };
  const el = document.createElement('div');
  el.className = 'add';
  const lgChip = k => {
    const logo = leagueLogo(k);
    const sp = SPORTS[LEAGUES[k]?.sport];
    const mark = logo ? `<img class="lg-logo" src="${esc(logo)}" alt="" loading="lazy">` : sp ? `<span class="lg-mark" style="--t:${sp.color}">${sp.svg}</span>` : '';
    return `<button type="button" class="q-chip lg-chip" data-lg="${k}" aria-pressed="${k === draft.league}">${mark}<span>${esc(lg(k))}</span></button>`;
  };
  el.innerHTML = `
    <button class="scan q-hero-card q-press q-kb-hide" type="button" data-scan-btn>${tile(icon('camera'), '', 'lg')}<span class="scan-txt"><b>${W('拍注單自動填入', 'Scan a ticket')}</b><small class="scan-line">${W('拍照或選截圖', 'A photo or a screenshot')}</small></span></button>
    <input type="file" class="scan-file" accept="image/*" hidden>
    <div class="missed q-kb-hide"></div>
    <div class="dr"></div>
    <section class="pick-games q-kb-hide">
      <h3 class="sl-h">${W('選比賽', 'Pick a game')}</h3>
      <div class="pk-find"></div>
      <div class="q-chips lgs">${ORDER.map(lgChip).join('')}</div>
      <div class="pk-days"></div>
      <div class="games"></div>
    </section>
    <div class="save-bar" hidden><button class="q-btn primary large block" type="button" data-save disabled>${W('儲存注單', 'Save ticket')}</button></div>`;
  const s = kitSheet({ title: W('新增注單', 'Add a ticket'), body: [el], cls: 'sl-app sl-sheet q-full', closeLabel: W('關閉', 'Close') });
  // The chosen league in view.
  const centre = (row, chip) => row && chip && (row.scrollLeft = chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2);
  requestAnimationFrame(() => centre($('.lgs', el), $(`[data-lg="${draft.league}"]`, el)));
  // The days: the kit's strip (every app's), the league's game days (F1: its
  // races, by Grand Prix), the one picked in the accent; 📅 for any other day
  // (its games read for it); a swipe across the games for the day either side.
  const strip = {};
  let stripDays = [];
  const drawStrip = games => {
    const f1 = isF1({ league: draft.league });
    const seen = new Map();
    for (const g of games) if (!isChamp(g)) seen.set(twDay(Date.parse(g.start)), f1 ? stripGp(g) : null);
    // The day first shown: today's games, else the next day with any (else the last).
    const keys = [...seen.keys()].sort();
    draft.day ||= keys.find(d => d >= today) ?? keys.at(-1) ?? today;
    stripDays = [...new Set([...keys, draft.day])].sort();
    const bar = kitUI.dayBar(strip, {
      flat: true,
      days: stripDays,
      current: draft.day,
      today,
      follow: true,
      label: d => seen.get(d) ?? dayName(d, today),
      clamp: v => v,
      bounds: f1 ? { from: `${year}-01-01`, to: `${year}-12-31` } : null,
      // (Wide enough for 拉斯維加斯 whole, or Emilia-Romagna.)
      chipMin: f1 ? (en ? 100 : 72) : 56,
      onPick: pickDay
    });
    if (bar.parentElement !== $('.pk-days', el)) $('.pk-days', el).replaceChildren(bar);
  };
  // Search: a team in any league, Chinese or English (the kit's field).
  let typing = 0;
  $('.pk-find', el).append(
    kitUI.search({
      placeholder: W('搜尋球隊、選手或賽事', 'Search a team, player or race'),
      onInput: v => {
        clearTimeout(typing);
        typing = setTimeout(() => {
          draft.query = norm(v);
          el.classList.toggle('searching', Boolean(draft.query));
          loadGames();
        }, 250);
      }
    })
  );

  // The teams on this phone's tickets, newest first: a tap finds their games.
  const recent = (() => {
    const seen = new Map();
    for (const sl of [...slips].sort((a, b) => String(b.created || '').localeCompare(String(a.created || ''))))
      for (const l of sl.legs)
        if (!isF1(l.game) && !playersOf(l.game))
          for (const side of ['away', 'home']) {
            const t = l.game[side];
            const key = `${l.game.league}:${t.en || t.zh}`;
            if (t.logo && !seen.has(key)) seen.set(key, { t, g: l.game, side });
          }
    return [...seen.values()].slice(0, 10);
  })();
  if (recent.length) {
    const row = document.createElement('div');
    row.className = 'q-chips pk-recent';
    row.innerHTML = `<span class="pk-recent-l">${W('最近', 'Recent')}</span>` + recent.map((r, i) => `<button type="button" class="q-chip lg-chip" data-r="${i}">${logoImg(r.t, 'lg-logo', r.g)}<span>${esc(sideName(r.g, r.side))}</span></button>`).join('');
    row.onclick = e => {
      const b = e.target.closest('[data-r]');
      if (!b) return;
      const r = recent[Number(b.dataset.r)];
      const box = $('.pk-find .q-search', el);
      box.input.value = sideName(r.g, r.side);
      box.input.dispatchEvent(new Event('input'));
    };
    $('.pk-find', el).after(row);
  }

  let shownGames = [];
  // A game as the kit's match card (a race as a row): its league when
  // searching, when it starts or where it is, the two sides, the score.
  const card = (g, withLeague) => {
    const s2 = statusOf(g);
    const live = g.state === 'in';
    const at = g.off ? s2.text : g.state === 'pre' ? when(g.start).time : g.state === 'post' ? W('完賽', 'Final') : s2.text;
    const c = kitUI.matchCard({
      league: withLeague ? lg(g.league) : '',
      leagueLogo: withLeague ? leagueLogo(g.league) || '' : '',
      when: at,
      live,
      wide: true,
      sides: ['away', 'home'].map(side => ({ logo: sideLogo(g, side), name: sideName(g, side), score: g.score && g.state !== 'pre' ? g.score[side] : undefined })),
      onOpen: () => pickGame(g)
    });
    c.classList.add('pk-card');
    return c;
  };
  const raceRow = g => {
    const s2 = statusOf(g);
    const at = g.off ? esc(s2.text) : isChamp(g) && g.state === 'pre' ? W('年度', 'Season') : g.state === 'pre' ? when(g.start).time : g.state === 'post' ? W('完賽', 'Final') : esc(s2.text);
    const winner = g.state === 'post' ? g.order?.[0] : null;
    const row = document.createElement('div');
    row.className = 'q-rowcard';
    row.innerHTML = `<button class="q-ritem game" type="button" data-g="${esc(g.id)}">
      <span class="when ${s2.live ? 'live' : ''}">${at}</span>
      <span class="sides"><span>${tile(SPORTS.racing.svg, SPORTS.racing.color, 'sm')}${esc(raceText(g))}</span></span>
      <span class="sc">${winner ? `<span class="win">${icon('trophy')}${esc(driverName(winner))}</span>` : ''}</span>
    </button>`;
    return row;
  };
  // A one-on-one match (tennis, badminton, table tennis) as a compact row:
  // its time and event, each side's flag (tennis: ESPN's) and name, sets.
  const duoRow = (g, withLeague) => {
    const s2 = statusOf(g);
    const at = g.off ? s2.text : g.state === 'pre' ? when(g.start).time : g.state === 'post' ? W('完賽', 'Final') : s2.text;
    // (Its event a word group at a time: a line breaks between 雙打 and 阿拉木圖, never inside them.)
    const whole = en ? (g.event || []).join(' ') : eventZh(g.event);
    const parts = en || whole !== (g.event || []).map(p => eventZh([p])).join(' ') ? [whole] : (g.event || []).map(p => eventZh([p]));
    const ev = [withLeague ? lg(g.league) : '', ...parts].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join(' ');
    const pics = side =>
      flagsFor(g[side].en).map(f => `<img src="${esc(f)}" alt="" loading="lazy" onerror="this.remove()">`)
        .join('');
    const name = side => {
      const n = sideName(g, side);
      const lost = g.state === 'post' && g.score && g.score[side] < g.score[side === 'home' ? 'away' : 'home'];
      return `<span class="duo-side${lost ? ' lost' : ''}"><span class="duo-pic">${playersOf(g) ? playerFace(g[side].en, g.league, '', pics(side)) : pics(side)}</span><span class="duo-n${n.length > 9 ? ' long' : ''}">${esc(n).replace(/\//g, '/\u200b')}</span>${g.score && g.state !== 'pre' ? `<b class="num">${g.score[side]}</b>` : ''}</span>`;
    };
    const row = document.createElement('div');
    row.className = 'q-rowcard duo';
    row.innerHTML = `<button class="q-ritem game" type="button" data-g="${esc(g.id)}">
      <span class="duo-when"><b class="${s2.live ? 'live' : ''} num">${esc(at)}</b>${ev ? `<small>${ev}</small>` : ''}</span>
      <span class="duo-sides">${name('away')}${name('home')}</span>
    </button>`;
    return row;
  };
  const head = text => Object.assign(document.createElement('h4'), { className: 'day-head', textContent: text });
  const leagueHead = k => {
    const h = document.createElement('h5');
    h.className = 'lg-head';
    const logo = leagueLogo(k);
    const sp = SPORTS[LEAGUES[k]?.sport];
    h.innerHTML = `${logo ? `<img class="lg-logo" src="${esc(logo)}" alt="" onerror="this.style.visibility='hidden'">` : sp ? `<span class="lg-mark" style="--t:${sp.color}">${sp.svg}</span>` : ''}<span>${esc(lg(k))}</span>`;
    return h;
  };
  const note = text => Object.assign(document.createElement('div'), { className: 'note', textContent: text });
  // Today and the days ahead first, the days just gone after them.
  const dayOrder = d => (d >= today ? `0${d}` : `1${d}`);
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const playable = g => g.state !== 'void';

  let reading = 0;
  let paint = null;
  const fresh = { fresh: 60_000 };
  const year = today.slice(0, 4);
  // F1's whole season (its strip and its search); any other league's days around today.
  const around = k => (isF1({ league: k }) ? gamesAround(k, `${year}-01-01`, `${year}-12-31`, fresh) : gamesAround(k, from, to, fresh));
  const ready = async games => {
    if (!en) await warm(games);
    if (games.some(g => LEAGUES[g.league]?.sport === 'tennis')) flags = await Promise.race([tennisFlags().catch(() => null), new Promise(r => setTimeout(() => r(flags), 2500))]);
  };
  const loadGames = async () => {
    const box = $('.games', el);
    const n = ++reading;
    paint = null;
    box.replaceChildren(Object.assign(document.createElement('div'), { className: 'spin' }));
    try {
      if (draft.query) {
        // Every league (each read once, then kept): its sides, its event, a
        // race by its Grand Prix or circuit; drawn as each league comes in
        // (a slow one never holds the rest back).
        const q = draft.query;
        const found = [];
        let left = ORDER.length;
        let soon = 0;
        const draw = () => {
          clearTimeout(soon);
          soon = setTimeout(drawNow, left ? 200 : 0);
        };
        const drawNow = () => {
          if (n !== reading) return;
          const hits = [...found].sort((a, b) => cmp(dayOrder(twDay(Date.parse(a.start))), dayOrder(twDay(Date.parse(b.start)))) || cmp(a.start, b.start));
          shownGames = hits;
          if (!hits.length && left) return;
          paint = () => box.replaceChildren(...(hits.length ? byDay(hits, true) : [note(W('找不到符合的比賽', 'Nothing matches that'))]));
          paint();
        };
        await Promise.all(
          ORDER.map(async k => {
            const games = (await Promise.race([around(k).catch(() => []), new Promise(r => setTimeout(() => r([]), 8000))])).filter(playable);
            if (n !== reading) return;
            // (Players' names read in Chinese to be found by them; clubs Taiwan names already.)
            if (games.some(playersOf)) await ready(games.filter(playersOf));
            left--;
            found.push(...games.filter(g => (isF1(g) ? raceHit(g, q) : gameHit(g, q))));
            draw();
          })
        );
        return;
      }
      const f1 = isF1({ league: draft.league });
      const near = (await around(draft.league)).filter(playable);
      const outside = draft.day && !near.some(g => twDay(Date.parse(g.start)) === draft.day);
      const games = outside ? (await gamesOn(draft.league, draft.day, fresh)).filter(playable) : near;
      if (n !== reading) return;
      drawStrip(near);
      // The day's games; F1's championship above its race.
      const shown = [...(f1 ? near.filter(isChamp) : []), ...games.filter(g => !isChamp(g) && twDay(Date.parse(g.start)) === draft.day)];
      await ready(shown);
      if (n !== reading) return;
      shownGames = shown;
      paint = () => box.replaceChildren(...(shown.length ? byDay(shown, false) : [note(W('這天沒有比賽', 'No games that day'))]));
      paint();
    } catch {
      if (n !== reading) return;
      box.replaceChildren(note(W('暫時讀不到賽程', 'Can’t read the games just now')));
    }
  };
  // Names read in Chinese meanwhile: the same list drawn again, as it stands.
  redrawPicker = () => el.isConnected && paint?.();
  // Games under their day's head: 今天 · 10/21.
  const made = new Map();
  const byDay = (games, withLeague) => {
    const out = [];
    const groups = new Map();
    for (const g of games) {
      const d = isChamp(g) ? 'season' : twDay(Date.parse(g.start));
      if (!groups.has(d)) groups.set(d, []);
      groups.get(d).push(g);
    }
    const keys = [...groups.keys()].sort((a, b) => (a === 'season' ? -1 : b === 'season' ? 1 : cmp(dayOrder(a), dayOrder(b))));
    for (const d of keys) {
      // (One day's, under the strip: no day head, the strip says it.)
      if (withLeague || d === 'season') out.push(head(d === 'season' ? W('年度冠軍', 'Season') : `${dayName(d, today)} · ${md(d)}`));
      const one = g => {
        // (A card already drawn kept, its logos with it: a list drawn again as leagues come in never blinks.)
        const key = `${g.id}|${g.state}|${g.score?.away}-${g.score?.home}|${statusOf(g).text}|${isF1(g) ? '' : `${sideName(g, 'away')}|${sideName(g, 'home')}|${eventZh(g.event)}`}|${flags ? 1 : 0}`;
        const had = made.get(g.id);
        if (had?.key === key) return had.el;
        const el2 = isF1(g) ? raceRow(g) : isSetSport(g.league) ? duoRow(g, false) : card(g, false);
        made.set(g.id, { key, el: el2 });
        return el2;
      };
      if (!withLeague) {
        for (const g of groups.get(d)) out.push(one(g));
        continue;
      }
      // Found across leagues: each league under its own logo and name, in the leagues' order.
      const byLeague = new Map();
      for (const g of groups.get(d)) byLeague.set(g.league, [...(byLeague.get(g.league) || []), g]);
      for (const k of [...byLeague.keys()].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))) {
        if (!made.has(`lg:${d}:${k}`)) made.set(`lg:${d}:${k}`, { el: leagueHead(k) });
        out.push(made.get(`lg:${d}:${k}`).el);
        for (const g of byLeague.get(k)) out.push(one(g));
      }
    }
    return out;
  };

  $('.lgs', el).onclick = e => {
    const b = e.target.closest('[data-lg]');
    if (!b) return;
    draft.league = lastLeague = b.dataset.lg;
    try {
      localStorage.setItem('slip.league', lastLeague);
    } catch {}
    pressed($('.lgs', el), b);
    draft.day = '';
    loadGames();
  };
  function pickDay(day) {
    if (!day || day === draft.day) return;
    draft.day = day;
    loadGames();
  }
  kitUI.daySwipe($('.games', el), dir => {
    const d = !draft.query && kitUI.dayStep(stripDays, draft.day, dir);
    return Boolean(d && (pickDay(d), true));
  });
  $('.games', el).onclick = e => {
    const b = e.target.closest('.game');
    if (!b || b.disabled) return;
    const g = shownGames.find(x => x.id === b.dataset.g);
    if (g) pickGame(g);
  };
  // A game's bets in their sheet; the pick made, onto the draft.
  const pickGame = g =>
    (isF1(g) ? pickF1Sheet : pickSheet)(g, leg => {
      draft.legs.push(leg);
      drawDraft();
      requestAnimationFrame(() => $('.dr', el).scrollIntoView({ behavior: 'smooth', block: 'start' }));
    });

  // The draft's kind: one pick is 單場; two or more 過關 until the person
  // picks (or a scan says) otherwise; 組合 needs three.
  const settleMode = () => {
    const n = draft.legs.length;
    if (n === 1) draft.mode = 'single';
    else if (n > 1 && draft.mode === 'single' && !draft.touched) draft.mode = 'parlay';
    if (draft.mode === 'system' && n < 2) draft.mode = 'parlay';
  };
  // The ticket as drafted: its sizes, its picks with their games, its problems.
  const ticket = () => {
    settleMode();
    const sizes = slipSizes(draft.mode, draft.legs.length, draft.chosen);
    const legs = draft.legs.map(l => ({ ...l, gameId: l.game.id }));
    return { sizes, legs, errs: slipErrors({ mode: draft.mode, legs, sizes, stake: draft.stake }) };
  };
  // A stake typed and not yet left (a tap on 儲存 or ＋ while the keyboard is up).
  const takeStake = () => {
    const input = $('.stake', el);
    if (input) draft.stake = Math.max(0, Math.round(Number(String(input.value).replace(/[^\d.]/g, '')) || 0));
  };
  const drawDraft = () => {
    const box = $('.dr', el);
    const n = draft.legs.length;
    $('.save-bar', el).hidden = !n;
    if (!n) {
      box.innerHTML = '';
      $('[data-save]', el).disabled = true;
      return;
    }
    const { sizes, legs, errs } = ticket();
    const by = combosBySize(legs);
    const v = errs.length ? null : slipView({ legs: draft.legs, sizes, stake: draft.stake, mode: draft.mode, id: 'draft' });
    const modes = [
      ['single', W('單場', 'Single')],
      ['parlay', n >= 2 ? W(`過關 ${n}串1`, `${n}-leg parlay`) : W('過關', 'Parlay')],
      ['system', W('組合', 'System')]
    ];
    const stat = (label, value, cls = '') => `<div class="q-stat"><small>${label}</small><strong class="num ${cls}">${value}</strong></div>`;
    box.innerHTML = `<h3 class="sl-h q-kb-hide">${W(`這張注單 · ${n} 場`, `This ticket · ${n} game${n > 1 ? 's' : ''}`)}</h3>
      <div class="q-rowcard q-kb-hide">${draft.legs
        .map((l, i) => {
          const sp = SPORTS[sportOfLeague(l.game.league)];
          return `<div class="q-ritem">${tile(sp?.svg || icon('ticket'), sp?.color || '', 'sm')}<span class="q-ritem-text"><span class="q-ritem-title">${esc(pickText(l))} <span class="odds num">@${odds2(l.odds)}${l.est ? W(' 估', ' est.') : ''}</span></span><small>${esc(`${isF1(l.game) ? raceText(l.game) : `${sideName(l.game, 'away')} vs ${sideName(l.game, 'home')}`} · ${kindName(l.kind)}`)}</small></span><button class="del" type="button" data-del="${i}" aria-label="${W('移除', 'Remove')}">${OWN.minus}</button></div>`;
        })
        .join('')}</div>
      <div class="q-seg modes">${modes.map(([k, t]) => `<button type="button" data-m="${k}" aria-pressed="${k === draft.mode}" ${k !== 'single' && n < 2 ? 'disabled' : ''}>${t}</button>`).join('')}</div>
      ${
        draft.mode === 'system'
          ? `<div class="q-chips sizes">${Array.from({ length: n }, (_, i) => i + 1)
              .map(k => `<button type="button" class="q-chip" data-k="${k}" aria-pressed="${sizes.includes(k)}">${k === 1 ? W('過1關', '1-game') : W(`${k}串1`, `${k}-fold`)} ×${by[k] || 0}</button>`)
              .join('')}</div>`
          : ''
      }
      <label class="field"><span>${W('每組金額', 'Stake per bet')}</span><input class="stake num" inputmode="numeric" pattern="[0-9]*" value="${draft.stake}"><span class="step"><button type="button" data-s="-1" aria-label="${W('減少', 'Less')}">−</button><button type="button" data-s="1" aria-label="${W('增加', 'More')}">＋</button></span></label>
      ${
        v
          ? v.done
            ? // Every game over (an old ticket): what it paid, settled as it will be saved.
              `<div class="q-stats sums">${stat(W(`${v.pre.combos} 組 · 總金額`, `${v.pre.combos} bet${v.pre.combos > 1 ? 's' : ''} · total`), money(v.pre.cost))}${stat(W('派彩（稅後）', 'Paid'), money(v.paid.net))}${stat(W('結果', 'Result'), v.status === 'won' ? W('中獎', 'Won') : v.status === 'refund' ? W('退款', 'Refund') : W('未中獎', 'Lost'))}${stat(W('損益', 'Profit'), money(v.paid.net - v.pre.cost, { sign: true }), v.paid.net >= v.pre.cost ? '' : 'warn')}</div>`
            : `<div class="q-stats sums">${stat(W(`${v.pre.combos} 組 · 總金額`, `${v.pre.combos} bet${v.pre.combos > 1 ? 's' : ''} · total`), money(v.pre.cost))}${stat(W('全中可得（稅後）', 'If all land'), money(v.pre.best.net))}${stat(W('命中機率', 'Chance it pays'), pct(v.pre.any, 1))}${stat(W(`運彩抽成${v.estimated || draft.legs.some(l => l.est) ? '（估）' : ''}`, `The cut${v.estimated || draft.legs.some(l => l.est) ? ' (est.)' : ''}`), pct(v.pre.take, 1), 'warn')}</div>`
          : `<div class="errs">${errs.map(e => `<span class="q-tag red">${ERR[e] || ''}</span>`).join('')}</div>`
      }`;
    $('[data-save]', el).disabled = !v;
    $('.stake', box).onchange = () => (takeStake(), drawDraft());
  };
  $('.dr', el).onclick = e => {
    const del = e.target.closest('[data-del]');
    if (del) return draft.legs.splice(Number(del.dataset.del), 1), drawDraft();
    const m = e.target.closest('[data-m]');
    if (m && !m.disabled) {
      draft.mode = m.dataset.m;
      draft.touched = true;
      if (draft.mode === 'system' && !draft.chosen.length) draft.chosen = [2];
      return drawDraft();
    }
    const k = e.target.closest('[data-k]');
    if (k) {
      const size = Number(k.dataset.k);
      draft.chosen = draft.chosen.includes(size) ? draft.chosen.filter(x => x !== size) : [...draft.chosen, size];
      return drawDraft();
    }
    const st = e.target.closest('[data-s]');
    if (st) {
      e.preventDefault();
      takeStake();
      draft.stake = Math.max(SLIP_RULES.unit, (Math.round(draft.stake / 10) + Number(st.dataset.s) * (draft.stake >= 1000 ? 10 : draft.stake >= 200 ? 5 : 1)) * 10);
      return drawDraft();
    }
  };

  // A photo of the ticket: read by Gemini (a few a day), each pick matched to
  // its game, the draft filled in for the person to check.
  const scanBtn = $('[data-scan-btn]', el);
  const scanFile = $('.scan-file', el);
  const scanTile = $('.q-tile', scanBtn);
  const camera = scanTile.innerHTML;
  let shot = '';
  const scanLine = (text, state = '') => {
    scanBtn.dataset.state = state;
    $('.scan-line', el).textContent = text;
    // While it reads: the photo itself in the tile, a line sweeping it; after, the camera again.
    if (state !== 'busy' && shot) {
      URL.revokeObjectURL(shot);
      shot = '';
      scanTile.innerHTML = camera;
    }
  };
  scanBtn.onclick = () => scanBtn.dataset.state !== 'busy' && scanFile.click();
  scanFile.onchange = async () => {
    const f = scanFile.files?.[0];
    scanFile.value = '';
    if (!f) return;
    $('.missed', el).innerHTML = '';
    scanLine(W('讀取注單中…', 'Reading the ticket…'), 'busy');
    shot = URL.createObjectURL(f);
    scanTile.innerHTML = `<img class="scan-shot" src="${shot}" alt=""><i class="scan-sweep"></i>`;
    let data;
    try {
      data = await shrink(f);
    } catch {
      return scanLine(W('讀不了這張照片，換一張試試', 'Can’t open this photo; try another'), 'bad');
    }
    const read = await readSlip(data, (await q.ensureToken().catch(() => q.token)) || q.token);
    if (read.error) return scanLine(SCAN_ERR[read.error], 'bad');
    const picks = (read.picks || []).filter(p => p.kind !== 'other');
    if (!read.isSlip || !picks.length) return scanLine(W('看不出是運彩注單，換一張試試', 'That doesn’t look like a ticket; try another'), 'bad');
    scanLine(W(`對比賽中 0/${picks.length}`, `Matching games 0/${picks.length}`), 'busy');
    draft.bought = read.bought;
    const { legs, missed } = await matchPicks(picks, { bought: read.bought, progress: (d, n) => scanLine(W(`對比賽中 ${d}/${n}`, `Matching games ${d}/${n}`), 'busy') });
    draft.legs = legs;
    const c = combosOf(read.combos, legs.length);
    if (c && legs.length) {
      draft.mode = legs.length === 1 ? 'single' : c.mode;
      draft.chosen = c.mode === 'system' ? c.sizes : [];
      draft.touched = true;
    }
    // The amount a combination, from the ticket's kind as it will be drafted.
    const { sizes, legs: withGames } = ticket();
    const stake = stakeOf(read, comboCount(withGames, sizes));
    if (stake) draft.stake = stake;
    drawDraft();
    if (!missed.length) scanLine(W(`${legs.length} 場都對上了，檢查後儲存`, `All ${legs.length} matched: check, then save`), 'good');
    else {
      scanLine(legs.length ? W(`對上 ${legs.length}/${picks.length} 場，其餘請手動加入`, `${legs.length} of ${picks.length} matched; add the rest by hand`) : W('對不到比賽，請手動加入', 'No games matched; add them by hand'), 'bad');
      // Each pick not matched: a tap finds its game (its first team searched).
      $('.missed', el).innerHTML = `<div class="q-rowcard">${missed.map(p => `<button type="button" class="q-ritem chevron" data-find="${esc((p.teams || [])[0] || '')}">${tile(icon('search'), '#ff9500', 'sm')}<span class="q-ritem-text"><span class="q-ritem-title">${esc((p.teams || []).join(' @ '))}</span><small class="num">${esc(kindName(p.kind))} ${esc(p.pick)} @${odds2(Number(p.odds))} · ${W('點一下找這場', 'Tap to find it')}</small></span></button>`).join('')}</div>`;
    }
    if (legs.length) requestAnimationFrame(() => $('.dr', el).scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  $('.missed', el).onclick = e => {
    const b = e.target.closest('[data-find]');
    if (!b?.dataset.find) return;
    const box = $('.pk-find .q-search', el);
    box.input.value = b.dataset.find;
    box.input.dispatchEvent(new Event('input'));
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  $('[data-save]', el).onclick = () => {
    takeStake();
    const { sizes, errs } = ticket();
    if (!draft.legs.length || errs.length) return drawDraft();
    slips.push({ id: newId('s'), ...timesOf(draft.legs, draft.bought), mode: draft.mode, sizes, stake: draft.stake, legs: draft.legs });
    save(true);
    s.close();
    if (tab !== 'open') showTab('open');
    else render();
    tick(true);
  };
  loadGames();
  // From the hero's 拍注單: the photo picker at once (the same tap).
  if (scan) scanFile.click();
  else if (game) pickGame(game);
}
const SCAN_ERR = {
  limit: W('拍太多次了，稍後再試或手動輸入', 'Too many scans; try later or add it by hand'),
  busy: W('今天讀取次數已滿，請手動輸入', 'Today’s scans are used up; add it by hand'),
  offline: W('連不上網路，稍後再試', 'No connection; try again soon'),
  signin: W('登入 Longshot Pass 才能拍注單', 'Sign in to your Longshot Pass to scan'),
  failed: W('暫時讀不到，稍後再試或手動輸入', 'Can’t read it just now; try later or add it by hand')
};
const ERR = {
  sameGame: W('同一場比賽不能放在同一組過關', 'One game can’t be twice in a parlay'),
  stakeUnit: W('每組金額以 NT$10 為單位', 'Stakes go in NT$10s'),
  ticketMin: W(`一張注單至少 NT$${SLIP_RULES.minTicket}`, `At least NT$${SLIP_RULES.minTicket} a ticket`),
  ticketMax: W(`一張注單最多 NT$${SLIP_RULES.maxTicket.toLocaleString('en-US')}`, `At most NT$${SLIP_RULES.maxTicket.toLocaleString('en-US')} a ticket`),
  tooManyLegs: W(`最多 ${SLIP_RULES.maxLegs} 場`, `At most ${SLIP_RULES.maxLegs} games`),
  noSizes: W('選擇要買的組合', 'Pick the combinations'),
  systemNeedsTwo: W('過關組合至少要 2 場', 'A system takes 2 games or more'),
  odds: W('賠率要大於 1', 'Odds must be over 1')
};

// One game: the market, the side, the line, and the odds on the ticket.
function pickSheet(g, add) {
  const sport = sportOfLeague(g.league);
  const soccer = sport === 'soccer';
  // A draw to pick: soccer's, and hockey's on its 60 minutes.
  const three = soccer || sport === 'hockey';
  const spec = specOf(g.league);
  let m = g.market;
  // A set sport (網球, 排球, 羽球, 桌球): 不讓分, 讓盤, 讓局 (points: 讓分), 大小
  // on its games or points, the first set; lines typed (no market for them).
  const sets = isSetSport(g.league);
  const points = sets && sport !== 'tennis';
  const SET_TABS = { ml: W('不讓分', 'Winner'), sethcap: W('讓盤', 'Sets'), gamehcap: points ? W('讓分', 'Points') : W('讓局', 'Games'), gametotal: W('大小', 'Total'), set1: sport === 'tennis' ? W('首盤', '1st set') : W('首局', '1st set') };
  const SET_LINES = { sethcap: -1.5, gamehcap: points ? -4.5 : -3.5 };
  const SET_TOTAL = { tennis: 22.5, volleyball: 180.5, badminton: 80.5, tabletennis: 75.5 }[sport];
  const isHcap = k => k === 'spread' || k === 'sethcap' || k === 'gamehcap';
  const isTot = k => k === 'total' || k === 'gametotal';
  const pick = { kind: 'ml', side: null, homeLine: soccer ? (Number.isInteger(m?.spread?.line) && m.spread.line ? m.spread.line : -1) : m?.spread?.line ?? (sport === 'baseball' || sport === 'hockey' ? -1.5 : sport === 'football' ? -3.5 : -4.5), total: m?.total?.line ?? Math.floor(spec.avg) + 0.5, odds: '' };
  const el = document.createElement('div');
  el.className = 'pk';
  el.innerHTML = `<div class="matchup q-kb-hide"><div>${logoImg(g.away, 'big', g)}<b>${esc(sideName(g, 'away').replace(/\//g, '/\u200b'))}</b><small>${W('客', 'Away')}</small></div><span class="vs num">${g.score ? `${g.score.away} : ${g.score.home}` : 'vs'}</span><div>${logoImg(g.home, 'big', g)}<b>${esc(sideName(g, 'home').replace(/\//g, '/\u200b'))}</b><small>${W('主', 'Home')}</small></div></div>
    <div class="q-seg kinds q-kb-hide">${(sets ? Object.keys(SET_TABS) : [...Object.keys(KINDS), 'more'])
      .map((k, i) => `<button type="button" data-k="${k}" aria-pressed="${i === 0}">${sets ? SET_TABS[k] : k === 'more' ? W('更多', 'More') : kindName(k)}</button>`)
      .join('')}</div>
    <div class="pk-body"></div>`;
  const s = kitSheet({ title: W('選擇玩法', 'Pick the bet'), body: [el], cls: 'sl-app sl-sheet', closeLabel: W('關閉', 'Close') });
  const legOf = side => {
    const base = { id: newId('l'), kind: pick.kind, side, game: g };
    // (讓分和's line is the home side's.)
    if (isHcap(pick.kind)) base.line = side === 'away' ? -pick.homeLine : pick.homeLine;
    if (isTot(pick.kind)) base.line = pick.total;
    return base;
  };
  const chanceOf = side => {
    const leg = legOf(side);
    // A set sport's: its winner from the market, else (and its lines, set
    // near even) a coin: an estimate, so the odds can be left blank.
    if (sets) return (pick.kind === 'ml' && marketChance(leg, m)) || { win: 0.5, push: 0 };
    return marketChance(leg, m) ?? pickChance(leg, fitGame(g.league, sport, m, []));
  };
  // The pick's fair price and what 運彩 keeps at the odds typed (or the edge), as tags.
  const priceTags = (est, c = pick.side ? chanceOf(pick.side) : null) => {
    if (!c || !(c.win > 0)) return '';
    const o = Number(pick.odds);
    const cut = o > 1 ? 1 - (o * c.win + c.push) : null;
    return `<span class="q-tag">${W('公平賠率', 'Fair')} ${odds2((1 - c.push) / c.win)}</span>${cut == null ? '' : cut >= 0 ? `<span class="q-tag orange">${W(`${est ? '估' : ''}運彩抽 ${pct(cut, 1)}`, `${est ? 'est. ' : ''}cut ${pct(cut, 1)}`)}</span>` : `<span class="q-tag green">${W('優勢', 'edge')} ${pct(-cut, 1)}</span>`}`;
  };
  // 更多: every other bet the lottery sells on the game, by its sections
  // (the kit's board, read when first opened).
  let sections = null;
  const drawMore = box => {
    if (!sections) {
      box.innerHTML = `<p class="pk-wait">${W('讀取玩法中…', 'Loading the bets…')}</p>`;
      Promise.all([import('../kit/play-board.mjs'), import('../kit/play-teams.mjs')])
        .then(([board, teams]) => (sections = sectionsFor(g, board, teams.LEAGUES)))
        .catch(() => (sections = []))
        .then(() => pick.kind === 'more' && el.isConnected && draw());
      return;
    }
    if (!sections.length) {
      box.innerHTML = `<p class="pk-wait">${W('這場沒有其他玩法', 'No other bets on this game')}</p>`;
      return;
    }
    const sec = sections[pick.sec] ?? sections[0];
    const o = pick.opt != null ? sec.options[pick.opt] : null;
    const est = !m?.win;
    const wide = sec.options.length === 3 || ['htft', 'score', 'goalcount', 'goalbands', 'inning', 'dc'].includes(sec.kind);
    const ready = () => Boolean(o) && (Number(pick.odds) > 1 || o.est > 1);
    const chance = o?.leg.fair > 0 ? { win: o.leg.fair, push: 0 } : null;
    box.innerHTML = `
      <div class="q-chips secs">${sections.map((x, i) => `<button class="q-chip" type="button" data-sec="${i}" aria-pressed="${x === sec}">${esc(x.title)}</button>`).join('')}</div>
      <div class="sides" style="--n:${wide ? 3 : 2}">${sec.options
        .map((x, j) => `<button type="button" data-opt="${j}" aria-pressed="${x === o}"><b>${esc(pickText({ ...x.leg, game: g }))}</b><small class="num">${W(`${est ? '估 ' : ''}運彩約`, `${est ? 'est. ' : ''}lottery ~`)} ${odds2(x.est)}</small></button>`)
        .join('')}</div>
      <label class="field q-kb-hide"><span>${W('注單賠率', 'Ticket odds')}</span><input class="od num" inputmode="decimal" placeholder="${o ? odds2(o.est) : '1.75'}" value="${esc(pick.odds)}"></label>
      <small class="od-note q-kb-hide" ${o ? '' : 'hidden'}>${o ? W(`不記得就留空：用估計的 ${odds2(o.est)}，標「估」`, `Don’t remember? Leave it: est. ${odds2(o.est)}, marked est.`) : ''}</small>
      <div class="price">${priceTags(est, chance)}</div>
      <button class="q-btn primary large block" type="button" data-add ${ready() ? '' : 'disabled'}>${W('加入注單', 'Add to ticket')}</button>`;
    pick.guess = o?.est ?? null;
    const od = $('.od', box);
    od.oninput = () => {
      pick.odds = od.value.replace(/[^\d.]/g, '');
      $('[data-add]', box).disabled = !ready();
      $('.od-note', box).hidden = !o || Boolean(pick.odds);
      $('.price', box).innerHTML = priceTags(est, chance);
    };
    $('.secs [aria-pressed="true"]', box)?.scrollIntoView({ block: 'nearest', inline: 'center' });
  };
  const draw = () => {
    const box = $('.pk-body', el);
    if (pick.kind === 'more') return drawMore(box);
    const sides =
      pick.kind === 'ml' || pick.kind === 'set1'
        ? [['away', W(`${sideName(g, 'away')} 勝`, `${sideName(g, 'away')} win`)], ...(three ? [['draw', W('和局', 'Draw')]] : []), ['home', W(`${sideName(g, 'home')} 勝`, `${sideName(g, 'home')} win`)]]
        : isHcap(pick.kind)
          ? [['away', `${sideName(g, 'away')} ${signed(-pick.homeLine)}`], ...(soccer && Number.isInteger(pick.homeLine) && pick.homeLine ? [['draw', W('讓分和', 'Handicap draw')]] : []), ['home', `${sideName(g, 'home')} ${signed(pick.homeLine)}`]]
          : isTot(pick.kind)
            ? [['over', `${W('大', 'Over')} ${pick.total}`], ['under', `${W('小', 'Under')} ${pick.total}`]]
            : [['odd', W('單', 'Odd')], ['even', W('雙', 'Even')]];
    const est = !m || (pick.kind !== 'ml' && !marketChance(legOf(sides[0][0]), m));
    const line = isHcap(pick.kind) ? [W('主隊讓分', 'Home line'), pick.homeLine, 'hl'] : isTot(pick.kind) ? [W('總分', 'Total'), pick.total, 'tl'] : null;
    const chosen = pick.side ? chanceOf(pick.side) : null;
    const guess = (pick.guess = chosen ? Math.round(lotteryOdds(chosen.win + chosen.push / 2, three && pick.kind === 'ml') * 100) / 100 : null);
    box.innerHTML = `
      ${line ? `<label class="field q-kb-hide"><span>${line[0]}</span><input class="line num" data-line="${line[2]}" inputmode="decimal" value="${signedLine(pick.kind, line[1])}"><span class="step">${isHcap(pick.kind) ? `<button type="button" data-flip aria-label="${W('正負', 'Flip')}">±</button>` : ''}<button type="button" data-l="-0.5">−</button><button type="button" data-l="0.5">＋</button></span></label>` : ''}
      <div class="sides" style="--n:${sides.length}">${sides
        .map(([k, t]) => {
          const c = chanceOf(k);
          return `<button type="button" data-side="${k}" aria-pressed="${pick.side === k}"><b>${esc(t)}</b>${c ? `<small class="num">${W(`${est ? '估 ' : ''}運彩約`, `${est ? 'est. ' : ''}lottery ~`)} ${odds2(lotteryOdds(c.win + c.push / 2, three && pick.kind === 'ml'))}</small>` : ''}</button>`;
        })
        .join('')}</div>
      <label class="field q-kb-hide"><span>${W('注單賠率', 'Ticket odds')}</span><input class="od num" inputmode="decimal" placeholder="${guess > 1 ? odds2(guess) : '1.75'}" value="${esc(pick.odds)}"></label>
      <small class="od-note q-kb-hide" ${guess > 1 ? '' : 'hidden'}>${W(`不記得就留空：用估計的 ${odds2(guess)}，標「估」`, `Don’t remember? Leave it: est. ${odds2(guess)}, marked est.`)}</small>
      <div class="price">${priceTags(est)}</div>
      <button class="q-btn primary large block" type="button" data-add ${pick.side && (Number(pick.odds) > 1 || guess > 1) ? '' : 'disabled'}>${W('加入注單', 'Add to ticket')}</button>`;
    const od = $('.od', box);
    od.oninput = () => {
      pick.odds = od.value.replace(/[^\d.]/g, '');
      $('[data-add]', box).disabled = !(pick.side && (Number(pick.odds) > 1 || guess > 1));
      $('.od-note', box).hidden = !(guess > 1) || Boolean(pick.odds);
      $('.price', box).innerHTML = priceTags(est);
    };
    const lineInput = $('.line', box);
    if (lineInput) lineInput.onchange = () => (takeLine(), draw());
  };
  // A line typed and not yet left (a tap on a side, ± or ＋ while the
  // keyboard is up): the home line as typed, a total at least 0.5.
  const takeLine = () => {
    const input = $('.line', el);
    const text = String(input?.value ?? '').replace(/[^\d.+-]/g, '');
    const x = Number(text);
    if (!input || !text || !Number.isFinite(x)) return;
    if (input.dataset.line === 'hl') pick.homeLine = x;
    else pick.total = Math.max(0.5, Math.abs(x));
  };
  const signedLine = (kind, x) => (isHcap(kind) ? signed(x) : String(x));
  el.addEventListener('click', e => {
    if (e.target.closest('button')) takeLine();
    const k = e.target.closest('.kinds [data-k]');
    if (k) {
      pick.kind = k.dataset.k;
      pick.side = null;
      if (SET_LINES[pick.kind]) pick.homeLine = SET_LINES[pick.kind];
      if (sets && pick.kind === 'gametotal') pick.total = SET_TOTAL;
      pick.opt = null;
      pressed($('.kinds', el), k);
      return draw();
    }
    const sec = e.target.closest('[data-sec]');
    if (sec) {
      pick.sec = Number(sec.dataset.sec);
      pick.opt = null;
      return draw();
    }
    const opt = e.target.closest('[data-opt]');
    if (opt) {
      pick.opt = Number(opt.dataset.opt);
      draw();
      $('.od', el).focus();
      return;
    }
    const sd = e.target.closest('[data-side]');
    if (sd) {
      pick.side = sd.dataset.side;
      draw();
      $('.od', el).focus();
      return;
    }
    if (e.target.closest('[data-flip]')) {
      e.preventDefault();
      pick.homeLine = -pick.homeLine;
      return draw();
    }
    const l = e.target.closest('[data-l]');
    if (l) {
      e.preventDefault();
      const d = Number(l.dataset.l);
      if (isHcap(pick.kind)) pick.homeLine = Math.round((pick.homeLine + d) * 2) / 2;
      else pick.total = Math.max(0.5, Math.round((pick.total + d) * 2) / 2);
      return draw();
    }
    if (e.target.closest('[data-add]')) {
      // No odds typed: the estimate, marked so (est) wherever the pick shows.
      const typed = Number(pick.odds) > 1;
      if (pick.kind === 'more') {
        const o = (sections[pick.sec] ?? sections[0]).options[pick.opt];
        add({ id: newId('l'), ...o.leg, game: g, odds: typed ? Math.round(Number(pick.odds) * 100) / 100 : o.est, ...(typed ? {} : { est: true }) });
        return s.close();
      }
      add({ ...legOf(pick.side), odds: typed ? Math.round(Number(pick.odds) * 100) / 100 : pick.guess, ...(typed ? {} : { est: true }) });
      s.close();
    }
  });
  draw();
  // A game over: its closing lines from its summary (its day's scoreboard
  // drops them), so the prices and the estimate are the market's.
  if (!m && g.state === 'post')
    closingMarket(g).then(x => {
      if (!x || !el.isConnected) return;
      m = x;
      g = { ...g, market: x };
      sections = null;
      if (!pick.side && x.total) pick.total = x.total.line;
      draw();
    });
}

// One race (or the season's championship): 冠軍, the only F1 bet 運彩 sells.
// The driver and the odds on the ticket; no market to read for F1, so the
// odds are typed.
function pickF1Sheet(g, add) {
  const pick = { driver: null, odds: '' };
  // A race's field by team (teammates side by side, two a row); the championship's by the standings.
  const field = isChamp(g) ? g.field || [] : byTeam(g.field || []);
  const el = document.createElement('div');
  el.className = 'pk';
  const sub = isChamp(g) ? statusOf(g).text : `${when(g.start).day} ${when(g.start).time}`;
  el.innerHTML = `<div class="race-head q-kb-hide">${tile(SPORTS.racing.svg, SPORTS.racing.color, 'lg')}<b>${esc(raceText(g))}</b><small>${esc(sub)}</small></div><div class="pk-body"></div>`;
  const s = kitSheet({ title: W('選擇冠軍車手', 'Pick the winner'), body: [el], cls: 'sl-app sl-sheet', closeLabel: W('關閉', 'Close') });
  // Odds left blank: the estimate from the season's points, marked 估.
  const guess = () => (pick.driver ? f1Guess(g, pick.driver) : null);
  const ready = () => pick.driver && (Number(pick.odds) > 1 || guess() > 1);
  const draw = () => {
    const box = $('.pk-body', el);
    box.innerHTML = field.length
      ? `<div class="q-rowcard drivers">${field
          .map(d => {
            const on = pick.driver === d.name;
            return `<button class="q-ritem driver" type="button" data-dv="${esc(d.name)}" aria-pressed="${on}">${driverFace(g, d.name)}<span class="q-ritem-text"><span class="q-ritem-title">${esc(driverName(d.name))}</span></span>${on ? icon('check') : ''}</button>`;
          })
          .join('')}</div>
      <label class="field q-kb-hide"><span>${W('注單賠率', 'Ticket odds')}</span><input class="od num" inputmode="decimal" placeholder="${guess() > 1 ? odds2(guess()) : W('選車手', 'Pick a driver')}" value="${esc(pick.odds)}"></label>
      <small class="od-note q-kb-hide" ${guess() > 1 && !pick.odds ? '' : 'hidden'}>${guess() > 1 ? W(`不記得就留空：用估計的 ${odds2(guess())}，標「估」`, `Don’t remember? Leave it: est. ${odds2(guess())}, marked est.`) : ''}</small>
      <div class="price"></div>
      <button class="q-btn primary large block" type="button" data-add ${ready() ? '' : 'disabled'}>${W('加入注單', 'Add to ticket')}</button>`
      : `<div class="note">${W('還沒有這場的車手名單', 'No field for this race yet')}</div>`;
    const od = $('.od', box);
    if (!od) return;
    const tags = () => {
      const o = Number(pick.odds) > 1 ? Number(pick.odds) : guess();
      $('.price', box).innerHTML = o > 1 && pick.driver ? `<span class="q-tag">${W('約', '~')} ${pct(f1Chance({ odds: o, game: g }).win, 1)} ${W('機會', 'chance')}</span>` : '';
    };
    od.oninput = () => {
      pick.odds = od.value.replace(/[^\d.]/g, '');
      $('[data-add]', box).disabled = !ready();
      $('.od-note', box).hidden = !(guess() > 1) || Boolean(pick.odds);
      tags();
    };
    tags();
  };
  el.addEventListener('click', e => {
    const dv = e.target.closest('[data-dv]');
    if (dv) {
      pick.driver = pick.driver === dv.dataset.dv ? null : dv.dataset.dv;
      draw();
      if (pick.driver) $('.od', el)?.focus();
      return;
    }
    if (e.target.closest('[data-add]') && ready()) {
      const typed = Number(pick.odds) > 1;
      add({ id: newId('l'), kind: 'f1', driver: pick.driver, game: g, odds: typed ? Math.round(Number(pick.odds) * 100) / 100 : guess(), ...(typed ? {} : { est: true }) });
      s.close();
    }
  });
  draw();
}

// ---- Opening -------------------------------------------------------------------------

// The first time the tab opens (app.js), once the Pass has signed in: this
// phone's copy at once, the Pass's put in beside it.
export async function mountSlips() {
  if (started) return;
  started = true;
  render();
  lastAll = Date.now();
  tick(true);
  reprice();
  const first = q.active ? await q.read({ data: true }).catch(() => null) : null;
  await pass.open(first);
  render();
}
// A pull to refresh while the tab shows.
export const refreshSlips = () => tick(true);
