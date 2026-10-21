// What's under a scratch card's foil, drawn from the kit's face (lib/scratch.mjs
// face): a card on sale as its real ticket (tickets.js, `kind: 'games'`), a
// retired one its one layout. Each item reads exactly as facePays counts it.
import { CARDS } from './lib/scratch.mjs';
import { compactMoney } from './home.js';
import { ticketParts } from './tickets.js';

// Each card's own colours, read off the real ticket (art/scratch): `frame` the
// ticket around its games, `panel` the printed area the games sit on.
const LOOK = {
  golddice: ['#0ea5b7', '#f59e0b'], lucky7: ['#f9a8c9', '#e8243c'], hi123: ['#ffe500', '#f59e0b'], rolling: ['#facc15', '#db2777'],
  gift: ['#f9a8c0', '#f472b6'], fruit: ['#4c1d95', '#6d28d9'], battle: ['#22a7e0', '#0f766e'], double: ['#facc15', '#ef4444'],
  ingot: ['#e11d1d', '#f97316'], beat: ['#c2185b', '#7b1fa2'], code: ['#e11d1d', '#5b21b6'], goldlotto: ['#facc15', '#e11d74'],
  crazy10: ['#84cc16', '#16a34a'], rising: ['#e11d48', '#ec4899'], fafa: ['#e11d48', '#f43f5e'], goal: ['#facc15', '#15803d'],
  multiply: ['#e11d48', '#9f1239'], numbers: ['#facc15', '#3b1d8f'], touch: ['#e11d48', '#f97316'], hunter: ['#facc15', '#ec4899'],
  machine: ['#f59e0b', '#ea580c'], super777: ['#be185d', '#7e22ce'], mjbingo: ['#e11d74', '#16a34a'], ten: ['#facc15', '#7e22ce'],
  million: ['#f97316', '#e8559c'], mahjong: ['#b91c1c', '#dc2626']
};
// Dark or light print on a colour (its luminance).
const inkOn = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 165 ? '#1c1917' : '#ffffff';
};
// A ticket's colours as CSS variables (--frame, --panel and the ink on each).
export function ticketLook(id) {
  const c = CARDS[id];
  const [frame, panel] = LOOK[id] || [c?.color || '#6b7280', c?.color || '#6b7280'];
  return { '--frame': frame, '--frame-ink': inkOn(frame), '--panel': panel, '--panel-ink': inkOn(panel) };
}

export function faceDrawer({ el, t, lang, money }) {
  // Amounts inside a card's spots, printed as the real cards do: $1,000, $5,000; from 1萬 short ($1萬, $300萬; $10K, $3M).
  const spotMoney = v => (v < 10_000 ? `$${v.toLocaleString('en-US')}` : lang === 'en' ? `$${v >= 1e6 ? `${+(v / 1e6).toFixed(1)}M` : `${+(v / 1e3).toFixed(1)}K`}` : compactMoney(v, lang).replace(/^NT/, ''));
  const DIE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  // The card's own words (the kit's 玩法: 「幸運號碼」, 「大力士分數」), else this page's.
  const said = (id, word) => CARDS[id]?.how?.zh?.includes(word);
  function faceEl(id, f) {
    if (!f || f.kind === 'games') return el('div');
    if (f.kind === 'symbol')
      return el('div', { class: 'scratch-face symbol' }, [
        f.mult ? el('div', { class: 'scratch-mult', text: t('mult', { m: f.mult }) }) : null,
        el('div', { class: 'scratch-spots' }, f.spots.map(s => el('div', { class: `spot${s.win ? ' win' : ''}` }, [el('span', { class: 'spot-sym', text: s.s }), el('small', { class: 'num', text: spotMoney(s.a) })])))
      ]);
    if (f.kind === 'match3') return el('div', { class: 'scratch-face match3' }, f.cells.map(a => el('div', { class: `spot${f.cells.filter(x => x === a).length === 3 ? ' win' : ''}` }, [el('strong', { class: 'num', text: spotMoney(a) })])));
    if (f.kind === 'numbers')
      return el('div', { class: 'scratch-face numbers' }, [
        el('p', { class: 'sc-h', text: t('winNumbers') }),
        el('div', { class: 'sc-winning' }, f.winning.map(n => el('span', { class: 'sc-win-num num', text: String(n).padStart(2, '0') }))),
        el('p', { class: 'sc-h', text: t('yourNumbers') }),
        el('div', { class: 'scratch-spots yours' }, f.yours.map(y => el('div', { class: `spot${f.winning.includes(y.n) ? ' win' : ''}` }, [el('strong', { class: 'num', text: String(y.n).padStart(2, '0') }), el('small', { class: 'num', text: spotMoney(y.a) })])))
      ]);
    if (f.kind === 'bingo') {
      const called = new Set(f.called);
      return el('div', { class: 'scratch-face bingo' }, [
        el('div', { class: 'bingo-grid' }, f.grid.flatMap(row => row.map(n => el('div', { class: `bcell${!n || called.has(n) ? ' hit' : ''}`, text: n ? String(n) : '★' })))),
        el('p', { class: 'sc-h', text: `${t('called')} · ${money(CARDS[id].price * 2)}+` }),
        el('div', { class: 'called' }, f.called.map(n => el('span', { class: 'num', text: String(n) })))
      ]);
    }
    if (f.kind === 'slots') {
      // 金磚疊疊樂: 第1局至第6局, each its own row.
      const rounds = said(id, '局');
      return el('div', { class: `scratch-face slots${rounds ? ' rounds' : ''}` }, f.rows.map((r, i) => el('div', { class: `slot-row${r.s[0] === r.s[1] && r.s[1] === r.s[2] ? ' win' : ''}` }, [rounds ? el('small', { class: 'slot-round', text: t('roundN', { n: i + 1 }) }) : null, ...r.s.map(x => el('span', { class: 'reel', text: x })), el('strong', { class: 'slot-prize num', text: spotMoney(r.a) })].filter(Boolean))));
    }
    if (f.kind === 'beat')
      return el('div', { class: 'scratch-face beat' }, [
        el('div', { class: 'beat-dealer' }, [el('span', { text: said(id, '大力士分數') ? t('strongman') : t('dealer') }), el('strong', { class: 'num', text: String(f.dealer) })]),
        el('p', { class: 'sc-h', text: said(id, '您的分數') ? t('yourScores') : t('yourNumbers') }),
        el('div', { class: 'scratch-spots' }, f.rows.map(r => el('div', { class: `spot${r.n > f.dealer ? ' win' : ''}` }, [el('strong', { class: 'num big', text: String(r.n) }), el('small', { class: 'num', text: spotMoney(r.a) })])))
      ]);
    if (f.kind === 'treasure') {
      const counts = new Map();
      for (const x of f.cells) counts.set(x, (counts.get(x) || 0) + 1);
      return el('div', { class: 'scratch-face treasure' }, [
        el('div', { class: 'treasure-map' }, f.cells.map(x => el('div', { class: `dig${counts.get(x) >= 3 ? ' win' : ''}`, text: x }))),
        el('div', { class: 'treasure-key' }, f.key.map(k => el('span', {}, [el('b', { text: k.s }), el('small', { class: 'num', text: spotMoney(k.a) })])))
      ]);
    }
    if (f.kind === 'dice')
      return el('div', { class: 'scratch-face dice' }, [
        el('div', { class: 'dice-head' }, [el('span'), el('small', { text: t('you') }), el('small', { text: t('dealer') }), el('small', { text: t('prizeCol') })]),
        ...f.rounds.map((r, i) =>
          el('div', { class: `dice-row${r.you[0] + r.you[1] > r.them[0] + r.them[1] ? ' win' : ''}` }, [
            el('small', { class: 'num', text: String(i + 1) }),
            el('span', { class: 'die-pair' }, [el('b', { text: `${DIE[r.you[0]]}${DIE[r.you[1]]}` }), el('small', { class: 'num', text: String(r.you[0] + r.you[1]) })]),
            el('span', { class: 'die-pair them' }, [el('b', { text: `${DIE[r.them[0]]}${DIE[r.them[1]]}` }), el('small', { class: 'num', text: String(r.them[0] + r.them[1]) })]),
            el('strong', { class: 'num', text: spotMoney(r.a) })
          ])
        )
      ]);
    if (f.kind === 'wheel') {
      // The slice the pointer's on turned to the top.
      const n = f.slices.length;
      const step = 360 / n;
      const turn = -(f.at * step + step / 2);
      const stops = f.slices.map((v, i) => `${v ? (i % 2 ? 'var(--wheel-a)' : 'var(--wheel-b)') : 'var(--wheel-0)'} ${i * step}deg ${(i + 1) * step}deg`).join(', ');
      return el('div', { class: `scratch-face wheel${f.slices[f.at] ? ' won' : ''}` }, [
        el('div', { class: 'wheel-box' }, [
          el('div', { class: 'wheel-disc', style: `background: conic-gradient(${stops}); transform: rotate(${turn}deg)` }, f.slices.map((v, i) => el('span', { class: `wheel-label${i === f.at ? ' at' : ''}${((((i + 0.5) * step + turn) % 360) + 360) % 360 > 180 ? ' flip' : ''}${v ? '' : ' zero'}`, style: `transform: rotate(${i * step + step / 2 - 90}deg)` }, [el('b', { class: 'num', text: v ? spotMoney(v) : '✕' })]))),
          el('div', { class: 'wheel-pointer', 'aria-hidden': 'true' })
        ])
      ]);
    }
    return el('div');
  }

  // A mahjong tile drawn as an ivory tile (phones lack the U+1F000 glyphs).
  const SUIT = { 萬: 'man', 筒: 'pin', 條: 'sou' };
  const MJ_TONE = { 中: 'red', 發: 'green', 白: 'blue', 春: 'red', 夏: 'red', 秋: 'red', 冬: 'red', 梅: 'green', 蘭: 'green', 竹: 'green', 菊: 'green' };
  const tile = (x, cls = '') => {
    const suit = x.length === 2 ? SUIT[x[1]] : null;
    return el('span', { class: `mj ${suit ? `mj-${suit}` : `mj-${MJ_TONE[x] || 'ink'}`}${cls}`, 'aria-label': x }, suit ? [el('b', { text: x[0] }), el('i', { text: x[1] })] : [el('b', { text: x === '白' ? '' : x })]);
  };

  // ---- A card as its real ticket (tickets.js) --------------------------------
  // Its picture, and on it what's under each scratch-off printed as the real
  // ones are: on the card's wavy security print, black numbers with their check word (15 fvtn),
  // amounts with theirs in 大寫 ($1,000 壹仟元), dice with pips. Null for a
  // retired card (no ticket picture: its layout is drawn instead).
  const WORD1 = ['zero', 'one', 'two', 'thr', 'for', 'fiv', 'six', 'sev', 'eit', 'nin', 'ten', 'elvn', 'twlv', 'thtn', 'frtn', 'fvtn', 'sxtn', 'svtn', 'egtn', 'nitn'];
  const TENS = ['', '', 'tw', 'th', 'fr', 'ff', 'sx', 'sv', 'eg', 'ni'];
  const ONES = ['ty', 'on', 'tw', 'tr', 'fo', 'fv', 'sx', 'sv', 'eg', 'ni'];
  const word = n => (n < 20 ? WORD1[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ONES[n % 10] : 'ty'));
  const DIGIT = [...'零壹貳參肆伍陸柒捌玖'];
  const bigWord = a => {
    const w = (n, unit) => (n ? DIGIT[n] + unit : '');
    const say = n => [w(Math.floor(n / 1000) % 10, '仟'), w(Math.floor(n / 100) % 10, '佰'), w(Math.floor(n / 10) % 10, '拾'), w(n % 10, '')].join('');
    return a >= 10_000 ? `${say(Math.floor(a / 10_000))}萬${a % 10_000 ? say(a % 10_000) : ''}元` : `${say(a)}元`;
  };
  const tkMoney = a => (a < 100_000 ? `$${a.toLocaleString('en-US')}` : `$${compactMoney(a, 'zh').replace(/^NT\$?/, '')}`);
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const thing = (v, h, w) => {
    if (v.t === 'num') return [el('b', { class: 'tk-n num', text: v.one ? String(v.n) : String(v.n).padStart(2, '0') }), h > 40 ? el('small', { class: 'tk-w', text: word(v.n) }) : null];
    if (v.t === 'amt') {
      const s = v.a ? tkMoney(v.a) : t('thanks');
      const bw = v.a ? bigWord(v.a) : '';
      return [el('b', { class: 'tk-a num', style: `font-size:${Math.min(1, (w / h) * 2.1 / Math.max(4, s.length)).toFixed(3)}em`, text: s }), v.a && h > 40 ? el('small', { class: 'tk-w', style: `font-size:${Math.min(0.3, (w / h) * 1.6 / bw.length).toFixed(3)}em`, text: bw }) : null];
    }
    if (v.t === 'die') return [el('span', { class: 'tk-die', 'aria-label': String(v.n) }, [...Array(9)].map((_, i) => el('i', { class: PIPS[v.n].includes(i) ? 'on' : '' })))];
    if (v.t === 'tile') return [tile(v.x)];
    if (v.t === 'cell') return [el('span', { class: 'tk-cell' }, thing(v.top, h * 0.62, w).filter(Boolean)), el('b', { class: 'tk-ca num', text: v.a ? tkMoney(v.a) : t('thanks') })];
    if (v.t === 'free') return [el('b', { class: 'tk-s', text: 'FREE' })];
    if (v.t === 'serial') return [el('span', { class: 'tk-code', style: `background-image:url("${matrix(v.n)}")` }), el('b', { class: 'tk-sn', text: v.n })];
    return [el('b', { class: `tk-s${v.s === '$' ? ' tk-dollar' : ''}`, text: String(v.s) })];
  };
  // The ticket's own serial (book-ticket, 548721-037) beside its code: a
  // rectangular Data Matrix's look (solid left and foot, dotted top and
  // right), its modules from the serial, so the same ticket reads the same.
  const matrix = n => {
    let h = 2166136261;
    const bit = () => ((h = Math.imul(h ^ (h >>> 15), 2246822519) ^ 0x9e3779b9), (h >>> 7) & 1);
    for (const c of n) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    const [C, R] = [18, 8];
    let d = '';
    for (let y = 0; y < R; y++)
      for (let x = 0; x < C; x++) if (x === 0 || y === R - 1 || (y === 0 ? x % 2 === 0 : x === C - 1 ? y % 2 === 1 : bit())) d += `M${x} ${y}h1v1h-1z`;
    return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${C} ${R}' shape-rendering='crispEdges'><path d='${d}'/></svg>`)}`;
  };
  function ticketFace(id, f, serial = '') {
    const pool = new Set(f?.pool || []);
    const tk = ticketParts(id, f, x => pool.has(x));
    if (!tk) return null;
    for (const p of tk.parts) if (p.v?.t === 'serial') p.v = { t: 'serial', n: serial };
    if (!serial) tk.parts = tk.parts.filter(p => p.v?.t !== 'serial');
    const [W, H] = tk.size;
    const box = ([x, y, w, h]) => `left:${(x / W) * 100}%;top:${(y / H) * 100}%;width:${(w / W) * 100}%;height:${(h / H) * 100}%`;
    // (A picture off the ticket itself, k.pic: its own symbol from its prize table.)
    const pic = ([x, y, w, h], scale = 1) => el('span', { class: 'tk-pic', style: `width:${((w / h) * scale).toFixed(3)}em;height:${scale}em;background-image:url(art/ticket/${id}.webp);background-size:${(W / w) * 100}% ${(H / h) * 100}%;background-position:${W === w ? 0 : (x / (W - w)) * 100}% ${H === h ? 0 : (y / (H - h)) * 100}%` });
    const draw = (v, h, w) => (v.t === 'pic' ? [pic(v.r, v.scale)] : v.t === 'cell' && v.top.t === 'pic' ? [el('span', { class: 'tk-cell' }, [pic(v.top.r, v.top.scale)]), el('b', { class: 'tk-ca num', text: v.a ? tkMoney(v.a) : t('thanks') })] : thing(v, h, w));
    const items = tk.parts.filter(p => !p.zone).map(p => ({ ...p, el: el('span', { class: `tk-i${p.under ? ' under' : ''}${p.win ? ' win' : ''}${p.v.t === 'serial' ? ' tk-serial' : ''}${p.cls ? ` ${p.cls}` : ''}`, style: `${box(p.r)};font-size:${((p.r[3] * (p.fs || 0.5)) / W) * 100}cqw${p.ink ? `;color:${p.ink}` : ''}` }, draw(p.v, p.r[3], p.r[2]).filter(Boolean)) }));
    const zones = tk.parts.filter(p => p.zone);
    const node = el('div', { class: 'tk', style: `aspect-ratio:${W}/${H};--tint:${ticketLook(id)['--panel']}` }, [
      el('img', { class: 'tk-art', src: `art/ticket/${id}.webp`, alt: CARDS[id][lang], decoding: 'async' }),
      ...zones.map(p => el('span', { class: `tk-paper${p.shape === 'round' ? ' round' : ''}`, style: `${box(p.r)}${p.rad ? `;border-radius:${(p.rad / W) * 100}cqw` : ''}${p.poly ? `;border-radius:0;clip-path:polygon(${p.poly.map(([x, y]) => `${((x - p.r[0]) / p.r[2]) * 100}% ${((y - p.r[1]) / p.r[3]) * 100}%`).join(',')})` : ''}` })),
      ...items.map(p => p.el)
    ]);
    // (`view`: where it's played, what the sheet zooms onto.)
    return { node, size: tk.size, view: tk.view, zones, items };
  }
  faceEl.ticket = ticketFace;

  return faceEl;
}
