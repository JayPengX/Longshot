// Each card on sale as its real ticket (art/ticket/<id>.webp, Taiwan
// Lottery's own picture of it): where its scratch-offs are and what's printed
// under each, laid out from the kit's face (lib/scratch.mjs face). No DOM
// here: the sheet draws it (scratch-face.js ticketFace), and the picture's
// sample numbers under `print` items are painted out when it's made.
//
// Rects are [x, y, w, h] in the picture's own pixels (`size`). A card's
// `lay(f, k)` returns its parts:
//   k.zone(rect, o)        a scratch-off (o.shape 'round'; o.r its corner)
//   k.at(rect, v, o)       something printed there (o.win lit once revealed; o.rot degrees it leans);
//                          under a zone it's under the scratch-off
//   k.spot(rect, v, o)     a scratch-off with one thing under it
// and the things: k.num(n) (two digits), k.digit(n) (one), k.amt(a), k.sym(s), k.die(n), k.tile(x), k.free(),
// k.cell(thing, a) (a thing with its amount under it), k.pic(rect, scale) (that
// piece of the ticket's own picture, e.g. a symbol in its prize table, `scale` em tall).

// `n` rects across and down a box, row by row.
export const grid = ([x, y, w, h], cols, rows = 1, [gx, gy] = [0, 0]) => {
  const cw = (w - gx * (cols - 1)) / cols;
  const ch = (h - gy * (rows - 1)) / rows;
  const out = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push([x + c * (cw + gx), y + r * (ch + gy), cw, ch]);
  return out;
};
const inset = ([x, y, w, h], d) => [x + d, y + d, w - 2 * d, h - 2 * d];

export const TICKETS = {
  // <cards> (each card's entry; kept in CARD_ORDER's order)
  golddice: {
    size: [1080, 810],
    // (Its 第1局–第5局 in the play area too.)
    view: [34, 200, 625, 600],
    lay(f, k) {
      const [g] = f.games;
      return g.rows.flatMap((r, i) => {
        const y = 280 + i * 99.5;
        const win = r.you > r.them;
        return [k.spot([226, y, 104, 92], k.die(r.you), { win }), k.spot([372, y, 102, 92], k.die(r.them)), k.spot([506, y + 2, 94, 88], k.amt(r.a), { win })];
      });
    }
  },
  lucky7: {
    // One big scratch area (the 8 8 8 picture inside the pink frame): 8 numbers, each with its prize under it, 4 by 2.
    size: [1080, 1440],
    lay(f, k) {
      const [g] = f.games;
      return [
        k.zone([95, 481, 896, 793], { rad: 2 }),
        grid([125, 555, 836, 650], 4, 2, [24, 90]).map((r, i) => {
          const x = g.spots[i];
          return k.at(r, k.cell(k.sym(x.s), x.a), { win: !!g.win[x.s], fs: 0.5 });
        })
      ];
    }
  },
  hi123: {
    // One big scratch area (inside the purple frame): 7 symbols, each with its prize under it, 4 over 3.
    size: [1080, 810],
    lay(f, k) {
      const [g] = f.games;
      const cells = [...grid([70, 262, 940, 180], 4, 1, [24, 0]), ...grid([187, 470, 706, 180], 3, 1, [24, 0])];
      return [
        k.zone([36, 235, 1007, 447], { rad: 2 }),
        g.spots.map((x, i) => k.at(cells[i], k.cell(k.sym(x.s), x.a), { win: !!g.win[x.s], fs: 0.58 }))
      ];
    }
  },
  rolling: {
    // The hotpot scene is the latex (L-shaped round the printed prize table): 16 symbols, 12 on the left (4×3), 4 bottom right (2×2);
    // each is its icon from the prize table with its name under it.
    size: [1080, 720],
    lay(f, k) {
      const [g] = f.games;
      const counts = new Map();
      g.cells.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
      // Each symbol's icon, cut from the printed prize table.
      const ICON = { 蛋: [763, 137, 20, 23], 香菇: [762, 171, 29, 24], 玉米: [760, 204, 33, 25], 魚板: [760, 238, 23, 25], 牛排: [920, 136, 36, 24], 魚: [920, 171, 34, 24], 蝦: [918, 204, 33, 25], 螃蟹: [917, 240, 32, 23], 元寶: [820, 274, 26, 20] };
      const rects = [...grid([44, 278, 630, 404], 4, 3, [8, 6]), ...grid([706, 410, 330, 272], 2, 2, [8, 6])];
      return [
        k.zone([28, 266, 662, 428], { rad: 8 }),
        k.zone([690, 398, 360, 296], { rad: 8 }),
        g.cells.map((v, i) => {
          const [x, y, w, h] = rects[i];
          const win = counts.get(v) >= g.k;
          return [
            k.at([x, y + h * 0.04, w, h * 0.6], k.pic(ICON[v]), { win, fs: 0.9 }),
            k.at([x, y + h * 0.66, w, h * 0.26], k.sym(v), { fs: 0.8 })
          ];
        })
      ].flat(Infinity);
    }
  },
  gift: {
    // 遊戲1: 幸運號碼 under the 2 money bags, 您的號碼 (number + prize, or 🎁) under the 5 parachute gifts; 遊戲2: an amount under each of the 6 gift boxes.
    size: [1080, 1620],
    lay(f, k) {
      const [g1, g2] = f.games;
      const all = g1.yours.some(y => y.s === g1.bonus.s);
      const hit = y => (y.s ? y.s === g1.bonus.s : g1.winning.includes(y.n));
      const counts = new Map();
      for (const v of g2.cells) counts.set(v, (counts.get(v) || 0) + 1);
      return [
        g1.winning.map((n, i) => {
          const d = i * 187;
          const BAG = [[420, 714], [445, 714], [470, 728], [500, 738], [497, 770], [470, 784], [495, 800], [515, 830], [526, 862], [522, 895], [505, 914], [470, 926], [410, 926], [375, 914], [356, 895], [352, 862], [362, 830], [385, 800], [410, 784], [402, 765], [382, 740]];
          return [k.zone([350 + d, 712, 178, 216], { poly: BAG.map(([x, y]) => [x + d, y]) }), k.at([372 + d, 792, 134, 120], k.num(n), { win: g1.yours.some(y => !y.s && y.n === n), fs: 0.46 })];
        }),
        g1.yours.map((y, i) => k.spot([[140, 335, 532, 727, 920][i] - 60, 942, 120, 208], k.cell(y.s ? k.sym(y.s) : k.num(y.n), y.a), { win: all || hit(y), rad: 18, fs: 0.3 })),
        g2.cells.map((v, i) => k.spot([[122, 290, 455, 620, 786, 951][i] - 65, 1333, 130, 157], k.amt(v), { win: counts.get(v) >= g2.k, rad: 14, fs: 0.5 }))
      ];
    }
  },
  fruit: {
    // 6 rounds, each a row of the gold-brick pyramid scratched whole (a slanted latex shape): one number per brick (the 第N局 brick too), the prize under the 獎金 brick.
    size: [1080, 1620],
    lay(f, k) {
      const [g] = f.games;
      // each row: top y, bottom y, left x at top / bottom, right x at top / bottom, where the 獎金 brick starts
      const ROWS = [[433, 620, 364, 348, 768, 792, 560], [622, 811, 330, 308, 797, 831, 553], [812, 1002, 288, 258, 837, 869, 610], [1002, 1192, 218, 186, 882, 916, 655], [1192, 1382, 145, 120, 937, 971, 705], [1382, 1570, 86, 52, 988, 1024, 760]];
      return g.rows.map((r, i) => {
        const [T, B, Lt, Lb, Rt, Rb, P] = ROWS[i];
        const win = k.same(r.s);
        const L = (Lt + Lb) / 2 + 6, R = (Rt + Rb) / 2 - 6;
        return [
          k.zone([Lb, T, Rb - Lb, B - T], { poly: [[Lt, T], [Rt, T], [Rb, B], [Lb, B]] }),
          grid([L, T + 30, P - L, B - T - 60], r.s.length).map((c, j) => k.at(c, k.num(Number(r.s[j])), { win, fs: 0.4 })),
          k.at([P + 10, T + 30, R - P - 10, B - T - 60], k.amt(r.a), { win, fs: 0.5 })
        ];
      });
    }
  },
  battle: {
    // 遊戲1 3x3 on the wood (獎金欄 under the red button), 遊戲2 pyramid with its round prizes on the
    // yellow tags, 遊戲3 six coins (table printed), 您的號碼 under the 15 pixel icons.
    size: [1080, 720],
    lay(f, k) {
      const [g1, g2, g3] = f.games;
      const won = new Set();
      const ink = '#1d1d2b';
      const L = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
      const lit = new Set(L.filter(l => l.every(i => g1.cells[i] === null || k.has(g1.cells[i]))).flat());
      g1.cells.forEach((x, i) => lit.has(i) && x !== null && won.add(x));
      const one = g1.cells.map((x, i) => k.at([41 + (i % 3) * 60, 229 + Math.floor(i / 3) * 65.5, 50, 56], x === null ? k.free() : k.num(x), { win: lit.has(i), fs: 0.62, ink }));
      const box = k.spot([118, 144, 92, 56], k.amt(g1.a), { win: lit.size > 0, rad: 12, fs: 0.55 });
      const rows = [[403, 152], [370, 212], [337, 278]];
      const tags = [[336, 168, 46, 22], [304, 229, 50, 22], [272, 294, 50, 22]];
      const two = g2.rounds.map((r, i) => {
        const win = r.items.every(k.has);
        if (win) r.items.forEach(x => won.add(x));
        return [r.items.map((x, j) => k.at([rows[i][0] + j * 67, rows[i][1], 60, 52], k.num(x), { win, fs: 0.62, ink })), k.at(tags[i], k.amt(r.a), { win, fs: 0.8, ink: '#111', bg: '#f4eb9e' })];
      });
      const r3 = g3.rounds[0];
      r3.items.forEach(x => k.has(x) && won.add(x));
      const three = r3.items.map((x, i) => k.at([747 + (i % 3) * 107, 255 + Math.floor(i / 3) * 92, 68, 56], k.num(x), { win: k.has(x), fs: 0.62, ink }));
      const spots = [[226, 517, 92, 80], ...[1, 2, 3, 4, 5].map(i => [222 + i * 116.5, 494, 100, 96]), ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => [40 + i * 112.5, 596, 100, 96])];
      const yours = f.pool.map((n, i) => k.spot(spots[i], k.num(n), { win: won.has(n), rad: 14, fs: 0.55 }));
      return [one, box, two, three, yours].flat(Infinity);
    }
  },
  double: {
    // 6 rounds: 獎金 under the $, two 您的號碼 under the symbols, 倍數 under the cash stack.
    size: [1080, 1620],
    lay(f, k) {
      const [g] = f.games;
      return g.rows.map((r, i) => {
        const y = 442 + i * 175.2;
        const win = k.same(r.s);
        return [
          k.spot([200, y - 2, 124, 136], k.amt(r.a), { win, rad: 18, fs: 0.7 }),
          r.s.map((s, j) => k.spot([388 + j * 164, y, 148, 132], k.num(Number(s)), { win, rad: 18, fs: 0.55 })),
          k.spot([742, y, 208, 132], k.sym(`${r.x || 1}倍`), { win, rad: 18, fs: 0.45 })
        ];
      }).flat(Infinity);
    }
  },
  ingot: {
    // One big scratch area (the two ingots' picture), 15 symbols under it 5 x 3; table printed left.
    size: [1080, 720],
    lay(f, k) {
      const [g] = f.games;
      const n = g.cells.filter(x => x === g.need).length;
      const won = g.table.some(([c]) => c <= n);
      return [k.zone([296, 198, 748, 476], { rad: 4 }), grid([318, 216, 704, 438], 5, 3, [8, 8]).map((r, i) => k.at(r, k.sym(g.cells[i]), { win: won && g.cells[i] === g.need, fs: 0.36 }))];
    }
  },
  beat: {
    // 8 rounds: 您的分數 under the hammer, 大力士分數 under the $ on the tower, 獎金 under the word.
    size: [1080, 1620],
    lay(f, k) {
      const [g] = f.games;
      return g.rows.map((r, i) => {
        const y = 454 + i * 130.3;
        const win = r.you > r.them;
        return [k.spot([302, y - 58, 180, 116], k.num(r.you), { win, rad: 20, fs: 0.55 }), k.spot([600, y - 57, 100, 114], k.num(r.them), { rad: 20, fs: 0.55 }), k.spot([856, y - 33, 106, 68], k.amt(r.a), { win, rad: 14, fs: 0.8 })];
      }).flat(Infinity);
    }
  },
  code: {
    // 遊戲1/2: a digit at each of the 9 lit nodes under each purple board, 獎金欄 under the gold
    // plates; 遊戲3: 3 rounds of 幸運密碼 (locks), 您的密碼 (fingerprints), 獎金 ($).
    size: [1080, 1620],
    lay(f, k) {
      const [g1, g2, g3] = f.games;
      const L = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
      const board = (g, x0, px) => {
        const lit = new Set(L.filter(l => k.same(l.map(i => g.cells[i]))).flat());
        return [
          k.zone([x0, 474, 404, 358], { rad: 22 }),
          g.cells.map((d, i) => k.at([x0 + 6 + (i % 3) * 150, 474 + Math.floor(i / 3) * 130, 92, 92], k.digit(d), { win: lit.has(i), fs: 0.72 })),
          k.spot([px, 386, 192, 58], k.amt(g.a), { win: lit.size > 0, rad: 14, fs: 0.75 })
        ];
      };
      const three = g3.rows.map((r, i) => {
        const y = 1066 + i * 134.5;
        const win = r.lucky.every((d, j) => d === r.yours[j]);
        return [
          r.lucky.map((d, j) => k.spot([124 + j * 117, y, 104, 122], k.digit(d), { win, rad: 18, fs: 0.6 })),
          r.yours.map((d, j) => k.spot([482 + j * 135, y, 116, 122], k.digit(d), { win, rad: 14, fs: 0.6 })),
          k.spot([890, y, 134, 122], k.amt(r.a), { win, rad: 18, fs: 0.75 })
        ];
      });
      return [board(g1, 126, 320), board(g2, 552, 758), three].flat(Infinity);
    }
  },
  goldlotto: {
    // 6 金樂透號碼 + 特別號 printed on the pink balls (top), 15 您的號碼 under the $ balls (4/6/5).
    size: [1080, 1620],
    lay(f, k) {
      const [g] = f.games;
      const hits = g.lotto.filter(k.has).length;
      const sp = k.has(g.special);
      const tier = g.table.find(([n, needSp]) => n === hits && (!needSp || sp));
      const lit = new Set(tier ? [...g.lotto.filter(k.has), ...(tier[1] ? [g.special] : [])] : []);
      const ink = '#1a1a1a';
      const top = [...g.lotto.map((n, i) => k.at([61 + i * 138, 474, 84, 74], k.num(n), { win: lit.has(n), fs: 0.62, ink })), k.at([915, 474, 84, 74], k.num(g.special), { win: lit.has(g.special), fs: 0.62, ink })];
      const c = [...[168, 335, 507, 675].map(x => [x, 790]), ...[85, 255, 425, 592, 760, 930].map(x => [x, 940]), ...[185, 350, 520, 688, 860].map(x => [x, 1090])];
      const yours = f.pool.map((n, i) => k.spot([c[i][0] - 61, c[i][1] - 77, 152, 152], k.num(n), { win: lit.has(n), shape: 'round', fs: 0.42 }));
      return [top, yours].flat(Infinity);
    }
  },
  crazy10: {
    // One big latex area inside the yellow frame: 3 幸運號碼 across the $$$, 12 您的號碼 (4×3) with prizes below.
    size: [1080, 1620],
    lay(f, k) {
      const [g] = f.games;
      const won = new Set(g.yours.filter(y => y.n != null && g.winning.includes(y.n)).map(y => y.n));
      const lucky = grid([250, 560, 640, 180], 3, 1, [30, 0]).map((r, i) => k.at(r, k.num(g.winning[i]), { win: won.has(g.winning[i]), fs: 0.42 }));
      const yours = grid([70, 800, 940, 630], 4, 3, [16, 20]).map((r, i) => {
        const y = g.yours[i];
        if (!y) return [];
        const win = y.s ? y.s === g.bonus?.s : g.winning.includes(y.n);
        return k.at(r, k.cell(y.s ? k.sym(y.s) : k.num(y.n), y.a), { win, fs: 0.52 });
      });
      const label = (r, t) => k.at(r, k.sym(t), { fs: 0.7, cls: 'tk-lbl' });
      return [k.zone([40, 482, 1000, 980], { rad: 6 }), label([60, 500, 180, 50], '幸運號碼'), label([60, 760, 180, 50], '您的號碼'), lucky, yours];
    }
  },
  rising: {
    // 8 rounds up the gold steps (1 to 8 numbers, printed), 您的號碼 under the coins.
    size: [1080, 1620],
    lay(f, k) {
      const [g] = f.games;
      const won = new Set();
      const rounds = g.rounds.map((r, i) => {
        const win = r.items.every(k.has);
        if (win) r.items.forEach(x => won.add(x));
        return r.items.map((x, j) => k.at([53 + i * 110.7, 978 - (r.items.length - 1 - j) * 86.6, 94, 76], k.num(x), { win, fs: 0.6 }));
      });
      return [rounds, k.zone([42, 1152, 996, 418], { rad: 10 }), grid([80, 1178, 920, 366], 5, 4).map((r, i) => k.at(r, k.num(f.pool[i]), { win: won.has(f.pool[i]) }))];
    }
  },
  fafa: {
    // 1: 2 幸運號碼 + 4 您的號碼 under the 發 tiles and coins; 2: two symbols under the cash (two 8s win);
    // 3: six amounts under the 888 (three alike); 4: one amount under the money bag.
    size: [1080, 720],
    lay(f, k) {
      const [g1, g2, g3, g4] = f.games;
      const label = (r, t) => k.at(r, k.sym(t), { fs: 0.7 });
      const mine = g1.yours.map(y => y.n);
      const one = [
        k.zone([28, 212, 386, 482], { rad: 34 }),
        label([50, 222, 150, 36], '幸運號碼'),
        grid([45, 255, 350, 105], 2, 1, [20, 0]).map((r, i) => k.at(r, k.num(g1.winning[i]), { win: mine.includes(g1.winning[i]), fs: 0.62 })),
        label([50, 372, 150, 36], '您的號碼'),
        grid([42, 410, 360, 270], 2, 2, [16, 14]).map((r, i) => k.at(r, k.cell(k.num(g1.yours[i].n), g1.yours[i].a), { win: g1.winning.includes(g1.yours[i].n), fs: 0.56 }))
      ];
      const eights = g2.cells.filter(x => x === g2.need).length >= g2.table[0][0];
      const two = [k.zone([562, 204, 266, 152], { rad: 18 }), grid([580, 214, 230, 132], 2, 1, [20, 0]).map((r, i) => k.at(r, k.sym(g2.cells[i]), { win: eights && g2.cells[i] === g2.need, fs: 0.7 }))];
      const counts = new Map();
      g3.cells.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
      const three = [k.zone([485, 375, 572, 292], { rad: 44 }), grid([510, 392, 522, 258], 3, 2, [14, 14]).map((r, i) => k.at(r, k.amt(g3.cells[i]), { win: counts.get(g3.cells[i]) >= g3.k, fs: 0.62 }))];
      const sp = g4.spots[0];
      const four = [k.zone([858, 90, 186, 228], { rad: 60 }), k.at([868, 150, 166, 120], k.amt(sp.a), { win: !!g4.win[sp.s] && sp.a > 0, fs: 0.62 })];
      return [one, two, three, four];
    }
  },
  goal: {
    // 16 您的號碼 under the soccer balls up top; 6 colour rounds of 3 進球號碼 printed on the coloured balls
    // (each colour wired to its goal), the round's prize under the goal's 獎金 latex.
    size: [1080, 1620],
    lay(f, k) {
      const [g] = f.games;
      const X = [215, 358, 500, 645, 790, 935], Y = [795, 950, 1105];
      // Each colour's three balls [col,row] and its goal (the net under 獎金).
      const at = {
        orange: [[[0, 0], [0, 1], [1, 2]], [272, 1205, 172, 104]],
        navy: [[[1, 0], [2, 1], [3, 2]], [566, 1205, 170, 104]],
        green: [[[2, 0], [1, 1], [0, 2]], [136, 1346, 164, 106]],
        blue: [[[3, 0], [4, 1], [5, 2]], [850, 1205, 166, 104]],
        red: [[[4, 0], [3, 1], [2, 2]], [412, 1346, 168, 106]],
        yellow: [[[5, 0], [5, 1], [4, 2]], [706, 1346, 170, 106]]
      };
      const won = new Set();
      const rounds = g.rounds.map(r => {
        const [balls, net] = at[r.color];
        const win = r.items.every(k.has);
        if (win) r.items.forEach(x => won.add(x));
        return [
          r.items.map((x, j) => k.at([X[balls[j][0]] - 46, Y[balls[j][1]] - 40, 92, 78], k.num(x), { win, fs: 0.6, ink: '#151515' })),
          k.spot(net, k.amt(r.a), { win, rad: 14, fs: 0.5 })
        ];
      });
      const spots = [[230, 322], [362, 322], [728, 322], [850, 322], [105, 380], [963, 380], [230, 420], [362, 420], [728, 420], [850, 420], [105, 476], [963, 476], [230, 516], [362, 516], [728, 516], [850, 516]];
      const yours = f.pool.map((n, i) => k.spot([spots[i][0] - 45, spots[i][1] - 45, 90, 90], k.num(n), { shape: 'round', win: won.has(n), fs: 0.42 }));
      return [rounds, yours].flat(Infinity);
    }
  },
  multiply: {
    // 4 幸運號碼 under the gems; 您的號碼 (number + prize) under the 1倍/2倍/5倍/10倍 panels (4, 3, 2, 2).
    size: [1080, 1620],
    lay(f, k) {
      const [g] = f.games;
      const mine = g.yours.map(y => y.n);
      const lucky = [155, 410, 668, 925].map((cx, i) => k.spot([cx - 82, 408, 164, 168], k.num(g.winning[i]), { win: mine.includes(g.winning[i]), rad: 44, fs: 0.42 }));
      const panels = { 1: [130, 670, 825, 200], 2: [275, 885, 545, 195], 5: [328, 1095, 442, 195], 10: [355, 1310, 390, 196] };
      const zones = Object.entries(panels).map(([x, r]) => {
        const ys = g.yours.filter(y => y.x === +x);
        const [px, py, pw, ph] = r;
        return [
          k.zone(r, { rad: 10 }),
          k.at([px + 8, py + 6, 90, 40], k.sym(`${x}倍`), { fs: 0.75 }),
          grid([px + 20, py + 26, pw - 40, ph - 40], ys.length, 1, [10, 0]).map((c, i) => k.at(c, k.cell(k.num(ys[i].n), ys[i].a), { win: g.winning.includes(ys[i].n), fs: 0.5 }))
        ];
      });
      return [lucky, zones].flat(Infinity);
    }
  },
  numbers: {
    // One purple latex panel: 2 幸運號碼 at the gold bars, 10 您的號碼 (with prizes) at the diamonds (5×2);
    // game 2's one amount under the gold-bar stack at the bottom left.
    size: [1080, 1620],
    lay(f, k) {
      const [g, g2] = f.games;
      const label = (r, t) => k.at(r, k.sym(t), { fs: 0.7 });
      const mine = g.yours.map(y => y.n);
      const lucky = [245, 840].map((cx, i) => k.at([cx - 120, 570, 240, 150], k.num(g.winning[i]), { win: mine.includes(g.winning[i]), fs: 0.5 }));
      const yours = grid([80, 780, 922, 395], 5, 2, [10, 14]).map((r, i) => k.at(r, k.cell(k.num(g.yours[i].n), g.yours[i].a), { win: g.winning.includes(g.yours[i].n), fs: 0.5 }));
      const sp = g2.spots[0];
      return [
        k.zone([40, 485, 1002, 723], { rad: 6 }),
        label([440, 610, 200, 50], '幸運號碼'),
        label([60, 735, 200, 44], '您的號碼'),
        lucky, yours,
        k.zone([78, 1268, 384, 296], { rad: 44 }),
        k.at([110, 1330, 320, 170], k.amt(sp.a), { win: !!g2.win[sp.s] && sp.a > 0, fs: 0.5 })
      ];
    }
  },
  touch: {
    // 您的號碼 under the 4 stars across the top, 幸運號碼 under the 4 stars down the side, an amount (or 發) under each $ where their lines cross.
    size: [1080, 1620],
    lay(f, k) {
      const [g] = f.games;
      const X = c => 375 + c * 180, Y = r => 808 + r * 180;
      const hitCol = new Set(), hitRow = new Set();
      g.lucky.forEach((l, r) => g.yours.forEach((y, c) => { if (y === l && g.cells[r][c] !== g.bonus.s) { hitCol.add(c); hitRow.add(r); } }));
      return [
        g.yours.map((n, c) => k.spot([X(c) - 70, 499, 140, 140], k.num(n), { rad: 26, win: hitCol.has(c), fs: 0.42 })),
        g.lucky.map((n, r) => k.spot([88, Y(r) - 70, 140, 140], k.num(n), { rad: 26, win: hitRow.has(r), fs: 0.42 })),
        g.cells.flatMap((row, r) => row.map((v, c) => {
          const bonus = v === g.bonus.s;
          const win = bonus || (g.yours[c] === g.lucky[r]);
          return k.spot([X(c) - 63, Y(r) - 63, 126, 126], bonus ? k.sym(v) : k.amt(v), { rad: 20, win, fs: bonus ? 0.55 : 0.7 });
        }))
      ];
    }
  },
  hunter: {
    // 獎金號碼 printed on the balloons (16 in the two 1分區 columns each side, 5 in the 10分區 circle), 您的號碼 (15) under the darts.
    size: [1080, 1620],
    lay(f, k) {
      const [g] = f.games;
      const ONES = [[102, 378], [102, 518], [102, 660], [102, 806], [240, 380], [240, 515], [240, 650], [240, 785], [838, 360], [849, 505], [853, 645], [833, 785], [982, 370], [982, 507], [982, 660], [982, 795]];
      const TENS = [[548, 455], [410, 555], [688, 555], [462, 715], [635, 712]];
      const pts = g.ones.filter(k.has).length + 10 * g.tens.filter(k.has).length;
      const won = g.table.some(t => t[0] === pts);
      const lit = new Set(won ? [...g.ones, ...g.tens].filter(k.has) : []);
      const ball = ([x, y], n) => k.at([x - 44, y - 38, 88, 76], k.num(n), { win: lit.has(n), fs: 0.62, ink: '#141414' });
      return [
        g.ones.map((n, i) => ball(ONES[i], n)),
        g.tens.map((n, i) => ball(TENS[i], n)),
        k.zone([42, 1004, 646, 584], { rad: 4 }),
        grid([72, 1100, 616, 450], 5, 3).map((r, i) => k.at(r, k.num(f.pool[i]), { win: lit.has(f.pool[i]), fs: 0.36 }))
      ];
    }
  },
  machine: {
    // 9 rounds' numbers printed in the pink circles (round 1-6 left, 7-9 right), 22 幸運號碼 under the one big ball-machine latex.
    size: [904, 1920],
    lay(f, k) {
      const [g] = f.games;
      const L = [75, 185, 295, 405], R = [592, 702, 812];
      const at = [
        [[405, 293]],
        [[295, 400], [405, 400]],
        [[295, 570], [405, 570]],
        [[185, 740], [295, 740], [405, 740]],
        [[185, 910], [295, 910], [405, 910]],
        L.map(x => [x, 1085]),
        [[702, 333], [812, 333], ...R.map(x => [x, 440])],
        [[702, 655], [812, 655], ...R.map(x => [x, 765])],
        [...R.map(x => [x - 3, 983]), ...R.map(x => [x - 3, 1090])]
      ];
      const lit = new Set();
      const rounds = g.rounds.map((r, i) => {
        const hits = r.items.filter(k.has).length;
        const win = r.table.some(([n]) => n <= hits);
        if (win) r.items.filter(k.has).forEach(x => lit.add(x));
        return r.items.map((x, j) => {
          const [cx, cy] = at[i][j];
          return k.at([cx - 31, cy - 30, 62, 60], k.num(x), { win: win && k.has(x), fs: 0.6, ink: '#2a1530', bg: '#d66aa6' });
        });
      });
      // 22 numbers under the balls, rows of 6, 5, 6, 5 (staggered like the balls).
      const cw = 134, ch = 104, slots = [];
      [6, 5, 6, 5].forEach((n, r) => { for (let c = 0; c < n; c++) slots.push([52 + (6 - n) * cw / 2 + c * cw, 1268 + r * ch, cw, ch]); });
      const pool = f.pool.map((x, i) => k.at(inset(slots[i], 4), k.num(x), { win: lit.has(x), fs: 0.54 }));
      return [rounds, k.zone([33, 1250, 838, 455], { rad: 4 }), pool];
    }
  },
  super777: {
    // Each big 7 is a latex tile: orange = game 1 (2 幸運號碼 + 8 您的號碼) over game 3, pink = game 2 (6 amounts) over game 4, teal = game 5 over game 6.
    size: [1080, 508],
    lay(f, k) {
      const [g1, g2, g3, g4, g5, g6] = f.games;
      const mine = g1.yours.filter(y => !y.s).map(y => y.n);
      const lucky = g1.winning.map((n, i) => k.at([240 + i * 80, 132, 72, 52], k.num(n), { win: mine.includes(n), fs: 0.7 }));
      const yours = grid([197, 190, 232, 168], 4, 2, [2, 6]).map((r, i) => {
        const y = g1.yours[i];
        if (!y) return [];
        const win = y.s ? y.s === g1.bonus?.s : g1.winning.includes(y.n);
        return k.at(r, k.cell(y.s ? k.sym(y.s) : k.num(y.n), y.a), { win, fs: 0.5 });
      });
      const counts = new Map();
      for (const v of g2.cells) counts.set(v, (counts.get(v) || 0) + 1);
      const match = grid([460, 172, 236, 180], 2, 3, [10, 6]).map((r, i) => k.at(r, k.amt(g2.cells[i]), { win: counts.get(g2.cells[i]) >= g2.k, fs: 0.62 }));
      const tally = (g, box) => {
        const won = g.cells.filter(x => x === g.need).length >= g.table[0][0];
        return grid(box, 3, 1, [8, 0]).map((r, i) => k.at(r, k.sym(g.cells[i]), { win: won && g.cells[i] === g.need, fs: 0.75 }));
      };
      const one = (g, r) => { const s = g.spots[0]; return k.at(r, k.amt(s.a), { win: !!g.win[s.s] && s.a > 0, fs: 0.42 }); };
      return [
        k.zone([193, 124, 240, 316], { rad: 14 }), lucky, yours, tally(g3, [215, 368, 196, 62]),
        k.zone([452, 162, 252, 280], { rad: 14 }), match, tally(g4, [478, 366, 200, 64]),
        k.zone([686, 178, 262, 258], { rad: 14 }), one(g5, [702, 192, 230, 108]), one(g6, [702, 314, 230, 108])
      ];
    }
  },
  mjbingo: {
    // 27 您的麻將牌 under the green table latex (rows of 7), the 6×6 賓果區 printed on the yellow board (tiles and FREE painted over the sample).
    size: [904, 1920],
    lay(f, k) {
      const [g] = f.games;
      const n = g.size;
      const lines = [];
      for (let i = 0; i < n; i++) lines.push([...Array(n)].map((_, j) => i * n + j), [...Array(n)].map((_, j) => j * n + i));
      lines.push([...Array(n)].map((_, i) => i * n + i), [...Array(n)].map((_, i) => i * n + n - 1 - i));
      const lit = new Set(lines.filter(l => l.every(x => g.cells[x] === null || k.has(g.cells[x]))).flat());
      const litTiles = new Set([...lit].map(i => g.cells[i]).filter(x => x !== null));
      const board = g.cells.map((x, i) => {
        const r = [39 + (i % n) * 95.4, 1002 + Math.floor(i / n) * 113.6, 86, 104];
        return k.at(r, x === null ? k.free() : k.tile(x), { win: lit.has(i), fs: x === null ? 0.3 : 0.74 });
      });
      const cw = 118, ch = 150, slots = [];
      [7, 7, 7, 6].forEach((m, r) => { for (let c = 0; c < m; c++) slots.push([40 + (7 - m) * cw / 2 + c * cw, 302 + r * ch, cw, ch]); });
      const pool = f.pool.map((x, i) => k.at(inset(slots[i], 6), k.tile(x), { win: litTiles.has(x), fs: 0.72 }));
      return [k.zone([34, 293, 838, 620], { rad: 4 }), pool, board];
    }
  },
  ten: {
    // Game 1's 8 spots: 4 round spots on the roulette ring + 4 under the card fan; game 2 the 3×3 slot boxes + 獎金 tabs;
    // game 3 the gold coin; game 4 the $+$=cash rows; game 5 the six chips + the 獎金 circle.
    size: [1080, 1080],
    lay(f, k) {
      const [g1, g2, g3, g4, g5] = f.games;
      const spot = (x, r, o = {}) => k.spot(r, k.cell(k.sym(x.s), x.a), { win: !!g1.win[x.s] && x.a > 0, fs: 0.5, ...o });
      const wheel = [-50, -17, 17, 50].map(d => { const t = (d * Math.PI) / 180; return [12 + 166 * Math.cos(t) - 47, 360 + 166 * Math.sin(t) - 47, 94, 94]; });
      const cards = grid([762, 224, 268, 168], 2, 2, [8, 8]);
      const one = g1.spots.map((x, i) => (i < 4 ? spot(x, wheel[i], { shape: 'round' }) : spot(x, cards[i - 4])));
      const rows = g2.rows.flatMap((r, i) => {
        const y = 367 + i * 100;
        const win = r.s.every(s => s === r.s[0]) && r.s[0] === g2.need;
        return [...r.s.map((s, j) => k.spot([350 + j * 105, y, 95, 88], k.sym(s), { win, fs: s.length > 2 ? 0.34 : 0.48, rad: 10 })), k.spot([664, y, 56, 88], k.amt(r.a), { win, fs: 0.5, rad: 8 })];
      });
      const c = g3.spots[0];
      const coin = k.spot([74, 792, 136, 124], k.sym(c.s), { win: !!g3.win[c.s], fs: 0.6, shape: 'round' });
      const sums = g4.rows.flatMap((r, i) => {
        const y = 778 + i * 95, win = r.n[0] + r.n[1] === g4.target;
        return [k.spot([350, y, 72, 84], k.sym(String(r.n[0])), { win, fs: 0.62, rad: 12 }), k.spot([447, y, 72, 84], k.sym(String(r.n[1])), { win, fs: 0.62, rad: 12 }), k.spot([560, y + 8, 96, 68], k.amt(r.a), { win, fs: 0.6, rad: 10 })];
      });
      const [need, prize] = g5.table[0];
      const won = g5.cells.filter(x => x === g5.need).length >= need;
      const chips = [[1000, 617], [915, 663], [865, 747], [858, 845], [912, 927], [1000, 977]].map(([x, y], i) => k.spot([x - 43, y - 43, 86, 86], k.sym(g5.cells[i]), { win: won && g5.cells[i] === g5.need, fs: 0.42, shape: 'round' }));
      return [one, rows, coin, sums, chips, k.spot([930, 742, 118, 116], k.amt(prize), { win: won, fs: 0.5, shape: 'round' })];
    }
  },
  million: {
    // 4 幸運號碼 under the cash stacks, 20 您的號碼 (with prizes) under the red $ spots (4 x 5).
    size: [1080, 1080],
    lay(f, k) {
      const [g] = f.games;
      const mine = g.yours.filter(y => !y.s).map(y => y.n);
      const lucky = g.winning.map((n, i) => k.spot([463 + i * 140, 262, 138, 100], k.num(n), { win: mine.includes(n), fs: 0.56, rad: 12 }));
      const yours = g.yours.map((y, i) => {
        const win = y.s ? y.s === g.bonus?.s : g.winning.includes(y.n);
        const r = [480 + (i % 4) * 138, 395 + Math.floor(i / 4) * 130, 116, 118];
        return k.spot(r, k.cell(y.s ? k.sym(y.s) : k.num(y.n), y.a), { win, fs: 0.68, rad: 14 });
      });
      return [lucky, yours];
    }
  },
  mahjong: {
    // Game 1: 18 rounds as tile pyramids printed on the ticket (4 pyramids, rounds 1-5, 6-8, 9-12, 13-18), 18 您的麻將 under the green tiles;
    // game 2: two tiles under the 中中 pair by 遊戲二.
    size: [1080, 393],
    // (A wide ticket: its left half first, big enough to read; it moves for the rest.)
    view: [0, 0, 600, 393],
    lay(f, k) {
      const [g1, g2] = f.games;
      // Pyramid: centre x, first row's top, row pitch, rounds in it (a round a row).
      const P = [[224.5, 50, 42.75, 5], [466.7, 135, 42.5, 3], [680, 92, 42.7, 4], [893.3, 89, 43.6, 6]];
      const won = new Set();
      let i = 0;
      const rounds = P.flatMap(([cx, top, dy, n]) => [...Array(n)].map((_, r) => {
        const round = g1.rounds[i++];
        const win = round.items.every(k.has);
        if (win) round.items.forEach(x => won.add(x));
        const m = round.items.length;
        return round.items.map((x, j) => k.at([cx + (j - (m - 1) / 2) * 36.7 - 17, top + r * dy, 34, 41], k.tile(x), { win, fs: 0.74 }));
      }));
      const pool = f.pool.map((x, j) => k.spot([50 + j * 40.6, 297, 34, 55], k.tile(x), { win: won.has(x), fs: 0.62, rad: 5 }));
      const pair = g2.cells[0] === g2.cells[1];
      // (The 中中 pair is printed tilted: each scratch-off is its tile's face, and the tile under it leans the same way.)
      const two = [
        [[[325, 67], [363, 52], [382, 110], [348, 126]], [354.5, 88.75], 40, 60, -21.5],
        [[[390, 59], [430, 70], [419, 128], [380, 114]], [404.75, 92.75], 40, 55, 13]
      ].map(([poly, [cx, cy], w, h, rot], j) => {
        const xs = poly.map(q => q[0]);
        const ys = poly.map(q => q[1]);
        const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
        return [k.zone(box, { poly }), k.at([cx - w / 2, cy - h / 2, w, h], k.tile(g2.cells[j]), { win: pair, fs: 0.72, rot })];
      });
      return [rounds, pool, two];
    }
  }
  // </cards>
};

// Where each ticket prints its serial (the white box: a barcode and
// 123456-001 on the picture), painted out and printed with the ticket's own.
export const SERIAL = {
  lucky7: [[540,  33,  508,  100]],
  hi123: [[675,  25,  381,  75]],
  gift: [[675,  25,  381,  75]],
  fruit: [[676,  25,  380,  75]],
  battle: [[811,  17,  254,  50]],
  double: [[676,  26,  380,  74]],
  ingot: [[811,  17,  253,  50]],
  beat: [[676,  26,  380,  74]],
  code: [[676,  26,  380,  73]],
  goldlotto: [[676,  26,  379,  73]],
  crazy10: [[676,  25,  380,  75]],
  rising: [[676,  25,  380,  75]],
  fafa: [[810,  17,  253,  49]],
  goal: [[676,  27,  378,  72]],
  multiply: [[676,  26,  380,  74]],
  numbers: [[676,  26,  380,  73]],
  touch: [[676,  25,  380,  75]],
  hunter: [[676,  26,  380,  74]],
  machine: [[565,  22,  318,  62],  [565,  1838,  318,  62]],
  super777: [[12,  13,  179,  34],  [890,  13,  179,  34]],
  mjbingo: [[566,  22,  317,  61],  [566,  1838,  317,  61]],
  ten: [[810,  17,  253,  50]],
  million: [[811,  17,  253,  50]],
  mahjong: [[9,  9,  138,  27],  [934,  9,  138,  27]],
  golddice: [[675,  26,  381,  74]],
  rolling: [[811,  18,  253,  49]]
};

// The parts of a card's ticket for face `f` (null: it has no ticket picture).
export function ticketParts(id, f, has) {
  const t = TICKETS[id];
  if (!t || f?.kind !== 'games') return null;
  const parts = [];
  const k = {
    has,
    same: s => s.every(x => x === s[0]),
    zone: (r, o = {}) => ({ zone: true, r, ...o }),
    at: (r, v, o = {}) => ({ r, v, ...o }),
    spot: (r, v, o = {}) => [{ zone: true, r, shape: o.shape, rad: o.rad }, { r, v, under: true, ...o }],
    num: n => ({ t: 'num', n }),
    digit: n => ({ t: 'num', n, one: true }),
    pic: (r, scale = 1) => ({ t: 'pic', r, scale }),
    amt: a => ({ t: 'amt', a }),
    sym: s => ({ t: 'sym', s }),
    die: n => ({ t: 'die', n }),
    tile: x => ({ t: 'tile', x }),
    cell: (top, a) => ({ t: 'cell', top, a }),
    free: () => ({ t: 'free' }),
    inset
  };
  for (const p of t.lay(f, k).flat(2)) parts.push(p);
  // What the sheet opens onto: the card's play area (its `view`, or all its parts with a margin).
  const xs = parts.flatMap(p => [p.r[0], p.r[0] + p.r[2]]);
  const ys = parts.flatMap(p => [p.r[1], p.r[1] + p.r[3]]);
  const m = t.size[0] * 0.03;
  const [x0, y0] = [Math.max(0, Math.min(...xs) - m), Math.max(0, Math.min(...ys) - m)];
  const view = t.view || [x0, y0, Math.min(t.size[0], Math.max(...xs) + m) - x0, Math.min(t.size[1], Math.max(...ys) + m) - y0];
  for (const r of SERIAL[id] || []) parts.push({ r, v: { t: 'serial' }, under: false });
  // Whatever lies inside a scratch-off is under it.
  const zones = parts.filter(p => p.zone);
  const inside = ([x, y, w, h]) => zones.some(({ r: [zx, zy, zw, zh] }) => x + w / 2 > zx && x + w / 2 < zx + zw && y + h / 2 > zy && y + h / 2 < zy + zh);
  for (const p of parts) if (!p.zone && p.under === undefined) p.under = inside(p.r);
  return { size: t.size, parts, view };
}
