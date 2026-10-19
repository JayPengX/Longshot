// What's under a scratch card's foil, drawn from the kit's face (lib/scratch.mjs
// face): a card on sale plays its own games (`kind: 'games'`), a retired one its
// one layout. Each item reads exactly as facePays counts it.
import * as scratch from './lib/scratch.mjs';
// A phone may still hold an older kit: read its names with fallbacks so Play opens.
const CARDS = scratch.CARDS || {};
const MAHJONG = scratch.MAHJONG || [];
const facePays = (...a) => scratch.facePays?.(...a) ?? 0;
import { compactMoney } from './home.js';

export function faceDrawer({ el, t, lang, money }) {
  // Amounts inside a card's spots: short ($2萬, $1,000).
  const spotMoney = v => (v >= 10_000 ? compactMoney(v, lang).replace('NT$', '$') : `$${v.toLocaleString('en-US')}`);
  const DIE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  // The card's own words (the kit's 玩法: 「幸運號碼」, 「大力士分數」), else this page's.
  const said = (id, word) => CARDS[id]?.how?.zh?.includes(word);
  function faceEl(id, f) {
    if (f?.kind === 'games') return gamesFace(id, f);
    if (!f) return el('div');
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

  // ---- A card on sale: its games (the kit's `games` face) --------------------
  // The pool (您的號碼, 幸運號碼, 您的麻將) as one area, then a panel a game
  // (遊戲1, 遊戲2…), each lit when it pays; what's in the pool boxed, as on the card.
  const MJ = new Set(MAHJONG);
  const SUIT = { 萬: 'man', 筒: 'pin', 條: 'sou' };
  const MJ_TONE = { 中: 'red', 發: 'green', 白: 'blue', 春: 'red', 夏: 'red', 秋: 'red', 冬: 'red', 梅: 'green', 蘭: 'green', 竹: 'green', 菊: 'green' };
  // A mahjong tile drawn as an ivory tile (phones lack the U+1F000 glyphs).
  const tile = (x, cls = '') => {
    const suit = x.length === 2 ? SUIT[x[1]] : null;
    return el('span', { class: `mj ${suit ? `mj-${suit}` : `mj-${MJ_TONE[x] || 'ink'}`}${cls}`, 'aria-label': x }, suit ? [el('b', { text: x[0] }), el('i', { text: x[1] })] : [el('b', { text: x === '白' ? '' : x })]);
  };
  // One item (a number, a tile or a symbol), boxed when `hit`, lit when `win`.
  const item = (x, { hit, win, cls = '' } = {}) => {
    const mark = `${hit ? ' hit' : ''}${win ? ' win' : ''}${cls ? ` ${cls}` : ''}`;
    if (x === null) return el('span', { class: `gf-n free${mark}`, text: 'FREE' });
    if (typeof x === 'string' && MJ.has(x)) return tile(x, mark);
    return el('span', { class: `gf-n num${mark}`, text: typeof x === 'number' ? String(x).padStart(2, '0') : x });
  };
  // A cell: something on top, an amount under it.
  const cell = (top, a, { hit, win } = {}) => el('span', { class: `gf-cell${hit ? ' hit' : ''}${win ? ' win' : ''}` }, [typeof top === 'string' || typeof top === 'number' ? el('b', { class: 'num', text: String(top) }) : top, a === undefined ? null : el('small', { class: 'num', text: a ? spotMoney(a) : t('thanks') })].filter(Boolean));
  const prize = (a, win) => el('strong', { class: `gf-prize num${win ? ' win' : ''}`, text: spotMoney(a) });
  const head = text => el('p', { class: 'gf-h', text });
  // A printed table: what a count (or points, or lines) pays; the row paid lit.
  const table = (rows, label, paid) => el('div', { class: 'gf-table' }, rows.map(([k, a]) => el('span', { class: a === paid && paid ? 'win' : '' }, [el('b', { class: 'num', text: label(k) }), el('small', { class: 'num', text: spotMoney(a) })])));
  const sameAll = s => s.every(x => x === s[0]);
  const linesOf = size => {
    const at = (r, c) => r * size + c;
    const out = [];
    for (let i = 0; i < size; i++) out.push([...Array(size)].map((_, j) => at(i, j)), [...Array(size)].map((_, j) => at(j, i)));
    out.push([...Array(size)].map((_, i) => at(i, i)), [...Array(size)].map((_, i) => at(i, size - 1 - i)));
    return out;
  };
  const BALL = { orange: '#f97316', navy: '#1e3a8a', green: '#16a34a', red: '#dc2626', yellow: '#eab308', blue: '#0ea5e9' };

  function gamesFace(id, f) {
    const c = CARDS[id];
    const pool = new Set(f.pool || []);
    const has = x => pool.has(x);
    const pays = g => facePays(id, { kind: 'games', pool: f.pool, games: [g] });
    const many = f.games.length > 1;
    return el('div', { class: 'scratch-face games' }, [
      f.pool ? el('div', { class: 'gf-pool' }, [head(c.pool?.[lang] || t('yourNumbers')), el('div', { class: 'gf-items' }, (f.pool.every(x => typeof x === 'number') ? [...f.pool].sort((a, b) => a - b) : f.pool).map(x => item(x)))]) : null,
      ...f.games.map((g, i) => {
        const won = pays(g);
        return el('section', { class: `gf-game gt-${g.type}${won ? ' won' : ''}` }, [many ? el('p', { class: 'gf-title', text: t('gameN', { n: i + 1 }) }) : null, ...gameBody(g, has, won)].filter(Boolean));
      })
    ]);
  }

  function gameBody(g, has, won) {
    if (g.type === 'spots') return [el('div', { class: `gf-cells${g.spots.length === 1 ? ' one' : ''}` }, g.spots.map(x => cell(x.s === '$' && g.spots.length === 1 ? '$' : x.s, x.a, { win: !!g.win[x.s] && x.a > 0 })))];
    if (g.type === 'numbers') {
      const b = g.bonus;
      const mine = y => cell(y.s ?? y.n.toString().padStart(2, '0'), y.a, { hit: y.s ? y.s === b?.s : g.winning.includes(y.n), win: y.s ? y.s === b?.s : g.winning.includes(y.n) });
      const zones = g.yours.some(y => y.x) ? [...new Set(g.yours.map(y => y.x))] : null;
      return [
        head(t('winNumbers')),
        el('div', { class: 'gf-items lucky' }, g.winning.map(n => item(n, { cls: 'gf-ball' }))),
        head(t('yourNumbers')),
        ...(zones ? zones.map(x => el('div', { class: 'gf-zone' }, [el('small', { class: 'gf-zone-h', text: t('zoneX', { x }) }), el('div', { class: 'gf-cells' }, g.yours.filter(y => y.x === x).map(mine))])) : [el('div', { class: 'gf-cells' }, g.yours.map(mine))])
      ];
    }
    if (g.type === 'match') {
      const counts = new Map();
      for (const v of g.cells) counts.set(v, (counts.get(v) || 0) + 1);
      const hit = v => counts.get(v) >= g.k;
      return [el('div', { class: 'gf-cells' }, g.cells.map(v => (g.a ? el('span', { class: 'gf-cell' }, [item(v, { win: hit(v) })]) : cell(spotMoney(v), undefined, { win: hit(v) })))), g.a ? el('div', { class: 'gf-box' }, [el('small', { text: t('prizeCol') }), prize(g.a, won)]) : null];
    }
    if (g.type === 'tally') return [el('div', { class: 'gf-cells' }, g.cells.map(x => cell(x, undefined, { win: x === g.need && won > 0, hit: x === g.need }))), table(g.table, k => t('countN', { n: k }), won)];
    if (g.type === 'rows')
      return [
        el('div', { class: 'gf-rows' }, g.rows.map((r, i) => {
          const win = sameAll(r.s) && (!g.need || r.s[0] === g.need);
          return el('div', { class: `gf-row${win ? ' win' : ''}` }, [el('small', { class: 'gf-round', text: t('roundN', { n: i + 1 }) }), el('span', { class: 'gf-row-items' }, r.s.map(x => item(x))), r.x ? el('small', { class: 'gf-x num', text: t('xN', { x: r.x }) }) : null, prize(r.a, win)].filter(Boolean));
        }))
      ];
    if (g.type === 'duel')
      return [
        el('div', { class: 'gf-grid3 head' }, [el('small'), el('small', { text: t('yourScores') }), el('small', { text: t('strongman') }), el('small', { text: t('prizeCol') })]),
        ...g.rows.map((r, i) => el('div', { class: `gf-grid3${r.you > r.them ? ' win' : ''}` }, [el('small', { class: 'gf-round num', text: String(i + 1) }), el('b', { class: 'num', text: String(r.you) }), el('b', { class: 'num them', text: String(r.them) }), prize(r.a, r.you > r.them)]))
      ];
    if (g.type === 'sum') return [head(t('sumTo', { n: g.target })), el('div', { class: 'gf-rows' }, g.rows.map((r, i) => el('div', { class: `gf-row${r.n[0] + r.n[1] === g.target ? ' win' : ''}` }, [el('small', { class: 'gf-round', text: t('roundN', { n: i + 1 }) }), el('span', { class: 'gf-row-items' }, [item(r.n[0]), el('i', { class: 'gf-op', text: '+' }), item(r.n[1])]), prize(r.a, r.n[0] + r.n[1] === g.target)])))];
    if (g.type === 'code')
      return [
        el('div', { class: 'gf-grid3 head' }, [el('small'), el('small', { text: t('luckyCode') }), el('small', { text: t('yourCode') }), el('small', { text: t('prizeCol') })]),
        ...g.rows.map((r, i) => {
          const win = r.lucky.every((d, j) => d === r.yours[j]);
          return el('div', { class: `gf-grid3${win ? ' win' : ''}` }, [el('small', { class: 'gf-round num', text: String(i + 1) }), el('b', { class: 'num gf-code', text: r.lucky.join('') }), el('b', { class: 'num gf-code', text: r.yours.join('') }), prize(r.a, win)]);
        })
      ];
    if (g.type === 'rounds')
      return [
        el('div', { class: `gf-rounds${g.rounds.length > 9 ? ' dense' : ''}` }, g.rounds.map((r, i) => {
          const hits = r.items.filter(has).length;
          const win = r.table ? r.table.some(([k]) => k <= hits) : hits === r.items.length;
          const paid = r.table ? r.table.filter(([k]) => k <= hits).reduce((m, [, a]) => Math.max(m, a), 0) : 0;
          return el('div', { class: `gf-round-box${win ? ' win' : ''}`, style: r.color ? `--ball:${BALL[r.color] || r.color}` : null }, [
            g.rounds.length > 1 ? el('small', { class: 'gf-round', text: t('roundN', { n: i + 1 }) }) : null,
            el('span', { class: `gf-pyramid${r.color ? ' balls' : ''}` }, r.items.map(x => item(x, { hit: has(x) }))),
            r.table ? table(r.table, k => t('hitsN', { n: k }), paid) : prize(r.a, win)
          ].filter(Boolean));
        }))
      ];
    if (g.type === 'grid') {
      const complete = linesOf(g.size).filter(l => (g.mode === 'same' ? sameAll(l.map(x => g.cells[x])) : l.every(x => g.cells[x] === null || has(g.cells[x]))));
      const lit = new Set(complete.flat());
      return [
        el('div', { class: 'gf-board-wrap' }, [
          el('div', { class: 'gf-board', style: `--n:${g.size}` }, g.cells.map((x, i) => item(g.mode === 'same' ? String(x) : x, { hit: g.mode === 'pool' && x !== null && has(x), win: lit.has(i) }))),
          g.table ? table(g.table, k => t('linesN', { n: k }), won) : el('div', { class: 'gf-box' }, [el('small', { text: t('prizeCol') }), prize(g.a, won)])
        ])
      ];
    }
    if (g.type === 'lotto') {
      const hits = g.lotto.filter(has).length;
      const sp = has(g.special);
      return [
        head(t('goldNums')),
        el('div', { class: 'gf-items lucky' }, [...g.lotto.map(n => item(n, { hit: has(n), cls: 'gf-ball' })), el('i', { class: 'gf-op', text: '+' }), item(g.special, { hit: sp, cls: 'gf-ball gf-sp' })]),
        el('div', { class: 'gf-table' }, g.table.map(([k, needSp, a]) => el('span', { class: won === a && k === hits && (!needSp || sp) ? 'win' : '' }, [el('b', { class: 'num', text: needSp ? t('hitsSp', { n: k }) : t('hitsN', { n: k }) }), el('small', { class: 'num', text: spotMoney(a) })])))
      ];
    }
    if (g.type === 'score') {
      const pts = g.ones.filter(has).length + 10 * g.tens.filter(has).length;
      return [
        head(t('onePt')),
        el('div', { class: 'gf-items' }, g.ones.map(n => item(n, { hit: has(n) }))),
        head(t('tenPt')),
        el('div', { class: 'gf-items tens' }, g.tens.map(n => item(n, { hit: has(n), cls: 'gf-ball' }))),
        el('p', { class: 'gf-total' }, [el('span', { text: t('ptsTotal') }), el('strong', { class: 'num', text: String(pts) })]),
        table(g.table, k => t('ptsN', { n: k }), won)
      ];
    }
    if (g.type === 'cross')
      return [
        head(`${t('yourNumbers')} → · ${t('winNumbers')} ↓`),
        el('div', { class: 'gf-cross', style: `--n:${g.yours.length}` }, [
          el('span', { class: 'gf-corner' }),
          ...g.yours.map(n => item(n, { cls: 'gf-ball' })),
          ...g.lucky.flatMap((l, r) => [
            item(l, { cls: 'gf-ball gf-lucky' }),
            ...g.yours.map((y, c2) => {
              const v = g.cells[r][c2];
              const win = v === g.bonus.s || y === l;
              return el('span', { class: `gf-cell${win ? ' win hit' : ''}` }, [el('small', { class: 'num', text: typeof v === 'number' ? spotMoney(v) : v })]);
            })
          ])
        ])
      ];
    return [];
  }

  return faceEl;
}
