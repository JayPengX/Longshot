// A card on sale scratched as its real ticket (scratch-face.js ticketFace):
// the whole ticket in its frame, never cut off at a side (a double tap
// zooms onto where it's played, tickets.js `view`); its own printed latex over the
// scratch-offs, scraped off with a finger the way latex comes off (a ragged
// edge, the silver under the print round it, a little haze), flakes of it
// curling off and falling away under the finger, the coin heard on it
// (scratch-sound.js) and felt in small ticks, a fingertip-wide coin that takes
// work: a slow, firm stroke bites, a fast flick only scuffs, and it takes a
// couple of passes to clear a scratch-off;
// each win popping as it shows, and the card's prize
// celebrated once it's all off, the ticket left as it is to look at. Two fingers zoom and move it, one finger
// away from the latex (or once it's all off) moves it, and a double tap there
// goes from the play area to the whole ticket and back.

import { wake, rub, tick, chime, rest } from './scratch-sound.js';

const ease = k => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// A tick felt (the kit's: iOS's switch trick, a short buzz on Android).
const feel = (ms = 6) => {
  try {
    globalThis.__longshotHaptic?.();
    navigator.vibrate?.(ms);
  } catch {}
};

// Is a point (picture pixels) on one of these scratch-offs?
const inZones = (zones, px, py) =>
  zones.some(({ r: [x, y, rw, rh], shape, poly }) => {
    if (px < x || py < y || px > x + rw || py > y + rh) return false;
    if (shape === 'round') return ((px - x - rw / 2) / (rw / 2)) ** 2 + ((py - y - rh / 2) / (rh / 2)) ** 2 <= 1;
    if (!poly) return true;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  });

// The scratch-offs' outline, in picture pixels.
function outline(zones) {
  const path = new Path2D();
  for (const { r: [x, y, rw, rh], shape, rad, poly } of zones) {
    if (poly) {
      path.moveTo(...poly[0]);
      for (const p of poly.slice(1)) path.lineTo(...p);
      path.closePath();
    } else if (shape === 'round') path.moveTo(x + rw, y + rh / 2), path.ellipse(x + rw / 2, y + rh / 2, rw / 2, rh / 2, 0, 0, Math.PI * 2);
    else {
      // (A rounded rect by hand: older iPhones' Path2D has no roundRect.)
      const c = Math.min(rad ?? Math.min(rw, rh) * 0.12, rw / 2, rh / 2);
      path.moveTo(x + c, y);
      path.arcTo(x + rw, y, x + rw, y + rh, c);
      path.arcTo(x + rw, y + rh, x, y + rh, c);
      path.arcTo(x, y + rh, x, y, c);
      path.arcTo(x, y, x + rw, y, c);
      path.closePath();
    }
  }
  return path;
}

// real: ticketFace's { node, size, view, zones, items }. Returns the frame
// (to lay out: it fills what it's given) and its controls.
export function scratchTicket({ el, label }, real, { open, colors = [] }) {
  const { node, zones, items } = real;
  const [W, H] = real.size;
  const view = real.view || [0, 0, W, H];
  const img = node.querySelector('.tk-art');
  // While it's played (a card not scratched yet) it fills the sheet (`fill`);
  // once it's all off, the whole ticket at its own height.
  let fill = !!open;
  const frame = el('div', { class: `tk-frame${fill ? ' fill' : ''}`, 'data-no-sheet-swipe': '' }, [node]);
  const party = el('canvas', { class: 'tk-party', 'aria-hidden': 'true' });
  frame.append(party);

  // ---- The camera: s CSS px a picture px, (x, y) the picture's point at the
  // frame's top left. The ticket is laid out at `base` (crisp print) and
  // scaled from it while a finger or a glide moves it, then laid out again.
  let s = 0;
  let x = 0;
  let y = 0;
  let base = 0;
  let fw = 0;
  let fh = 0;
  const fitOf = ([, , w, h]) => Math.min(fw / w, fh / h);
  const whole = () => fitOf([0, 0, W, H]);
  const play = () => Math.max(whole(), Math.min(fitOf(view), (fw / W) * 4));
  const clamp = () => {
    s = Math.min(Math.max(play() * 3, whole() * 4, sT * 2), Math.max(whole(), s));
    const bound = (v, size, room) => (size * s <= room ? -(room / s - size) / 2 : Math.min(size - room / s, Math.max(0, v)));
    x = bound(x, W, fw);
    y = bound(y, H, fh);
  };
  const draw = () => {
    clamp();
    if (!base) base = s;
    node.style.width = `${W * base}px`;
    node.style.transform = `translate3d(${-x * s}px, ${-y * s}px, 0)${s === base ? '' : ` scale(${s / base})`}`;
    frame.classList.toggle('zoomed', s > whole() * 1.02);
    // (More of the ticket off a side: that side shaded, so it's known to move.)
    frame.classList.toggle('more-l', x > 2);
    frame.classList.toggle('more-r', x + fw / s < W - 2);
    // (The overview's box: what the frame shows.)
    if (ovBox) Object.assign(ovBox.style, { left: `${(Math.max(0, x) / W) * 100}%`, top: `${(Math.max(0, y) / H) * 100}%`, width: `${(Math.min(W, x + fw / s) - Math.max(0, x)) / W * 100}%`, height: `${(Math.min(H, y + fh / s) - Math.max(0, y)) / H * 100}%` });
  };
  const commit = () => ((base = 0), draw());
  // The camera on a rect (picture px), centred.
  const aim = r => {
    const k = fitOf(r);
    return [k, r[0] + r[2] / 2 - fw / (2 * k), r[1] + r[3] / 2 - fh / (2 * k)];
  };
  let glide = 0;
  const go = ([s1, x1, y1], ms = 450) => {
    cancelAnimationFrame(glide);
    if (reduced() || !ms) return void (([s, x, y] = [s1, x1, y1]), commit());
    const [s0, x0, y0] = [s, x, y];
    const t0 = performance.now();
    const step = now => {
      const k = ease(Math.min(1, (now - t0) / ms));
      // (Zoom in log space and the point in the middle on a straight line: a camera's move.)
      s = s0 * (s1 / s0) ** k;
      const [cx0, cy0, cx1, cy1] = [x0 + fw / (2 * s0), y0 + fh / (2 * s0), x1 + fw / (2 * s1), y1 + fh / (2 * s1)];
      x = cx0 + (cx1 - cx0) * k - fw / (2 * s);
      y = cy0 + (cy1 - cy0) * k - fh / (2 * s);
      draw();
      if (k < 1) glide = requestAnimationFrame(step);
      else commit();
    };
    glide = requestAnimationFrame(step);
  };
  const playView = () => {
    const [k, ax, ay] = aim(view);
    const p = play();
    // (Capped zoom: still centred on the play area.)
    return [p, ax + fw / (2 * k) - fw / (2 * p), ay + fh / (2 * k) - fh / (2 * p)];
  };
  // Sized to its frame (the sheet laid out, a phone turned): the whole ticket,
  // as wide as the sheet, or as tall as the room the sheet leaves it (its CSS
  // max-height), centred. Never cut off at a side: pinch or a double tap zooms.
  let laid = false;
  const resize = () => {
    const w = frame.clientWidth;
    const room = parseFloat(getComputedStyle(frame).maxHeight) || Infinity;
    const tall = fill ? '' : `${Math.floor(Math.min(room, (H * w) / W))}px`;
    if (w && frame.style.height !== tall) frame.style.height = tall;
    const h = frame.clientHeight;
    if (!w || !h || (w === fw && h === fh)) return;
    // (Laid out before and zoomed in: the frame changing size, the sheet
    // laid out again round it, keeps where the ticket is and how close.)
    const was = laid && fw && s > whole() * 1.02 ? [s / whole(), x + fw / (2 * s), y + fh / (2 * s)] : null;
    [fw, fh] = [w, h];
    party.width = Math.round(w * Math.min(2, devicePixelRatio || 1));
    party.height = Math.round(h * Math.min(2, devicePixelRatio || 1));
    plan();
    const i = fill ? stepAt() : -1;
    [s, x, y] = was ? [was[0] * whole(), 0, 0] : i >= 0 ? stepView(i) : [whole(), 0, 0];
    if (was) (x = was[1] - fw / (2 * s)), (y = was[2] - fh / (2 * s));
    laid = true;
    commit();
    if (i >= 0) (shownStep = i), onStep(i, steps.length);
  };

  // ---- Where it's played, a part at a time. A ticket whose scratch-offs are
  // small on the screen (大麻將's tiles: a centimetre on a phone) is played in
  // steps: the camera on a few of them at a fingertip's size, on to the next
  // few once they're off. A wide one also has the whole ticket over it (the
  // overview, the frame's box on it; a tap there goes to that part).
  let steps = [];
  let sT = 0;
  let shownStep = -1;
  let pending = -2;
  let onStep = () => {};
  const median = a => [...a].sort((p, q) => p - q)[Math.floor(a.length / 2)];
  const plan = () => {
    steps = [];
    sT = 0;
    if (!fill || finished) return;
    const small = median(zones.map(z => Math.min(z.r[2], z.r[3])));
    if (small * whole() >= 28) return;
    sT = 40 / small;
    // Reading order: a row at a time (centres within half a scratch-off's height), left to right.
    const cy = i => zones[i].r[1] + zones[i].r[3] / 2;
    const byY = zones.map((_, i) => i).sort((a, b) => cy(a) - cy(b));
    const row = [];
    let top = -Infinity;
    let n = -1;
    for (const i of byY) {
      if (cy(i) - top > small * 0.5) (top = cy(i)), n++;
      row[i] = n;
    }
    const order = byY.sort((a, b) => row[a] - row[b] || zones[a].r[0] - zones[b].r[0]);
    const union = (a, b) => {
      const [x0, y0] = [Math.min(a[0], b[0]), Math.min(a[1], b[1])];
      return [x0, y0, Math.max(a[0] + a[2], b[0] + b[2]) - x0, Math.max(a[1] + a[3], b[1] + b[3]) - y0];
    };
    let cur = null;
    for (const i of order) {
      const r = zones[i].r;
      const u = cur && union(cur.box, r);
      if (u && u[2] * sT <= fw * 0.9 && u[3] * sT <= fh * 0.9) (cur.ids.push(i), (cur.box = u));
      else steps.push((cur = { ids: [i], box: [...r] }));
    }
    if (W / H >= 1.8) overview();
  };
  // The first part with latex still on (-1: none).
  const stepAt = () => steps.findIndex(st => st.ids.some(i => !spots[i].gone));
  const stepView = i => {
    const [bx, by, bw, bh] = steps[i].box;
    const m = Math.min(bw, bh) * 0.25 + 8;
    const k = Math.min(sT, fitOf([bx - m, by - m, bw + 2 * m, bh + 2 * m]));
    return [k, bx + bw / 2 - fw / (2 * k), by + bh / 2 - fh / (2 * k)];
  };
  const toStep = (i, ms) => {
    shownStep = i;
    onStep(i, steps.length);
    if (i >= 0) go(stepView(i), ms);
  };
  let ov = null;
  let ovBox = null;
  let ovCover = null;
  let ovItems = [];
  const overview = () => {
    if (ov) return;
    const copy = node.cloneNode(true);
    copy.style.cssText = node.style.cssText.replace(/(^|;)\s*(width|transform)[^;]*/g, '');
    copy.classList.add('tk-copy');
    copy.querySelector('.tk-cover')?.remove();
    ovCover = el('canvas', { class: 'tk-cover' });
    ovBox = el('span', { class: 'tk-ov-box' });
    copy.append(ovCover, ovBox);
    ovItems = [...copy.querySelectorAll('.tk-i')];
    ov = el('div', { class: 'tk-ov', 'aria-hidden': 'true' }, [copy]);
    ov.addEventListener('pointerdown', e => {
      const r = copy.getBoundingClientRect();
      const q = [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
      const [, z] = nearest(q, spots.filter(z => !z.gone).length ? spots.filter(z => !z.gone) : spots);
      const i = steps.findIndex(st => st.ids.includes(spots.indexOf(z)));
      if (i >= 0) toStep(i);
      else go(aim([q[0] - 150, q[1] - 150, 300, 300]));
    });
    frame.before(ov);
    mirror();
  };
  // The overview's latex: the frame's, drawn small (a few times a second while scratched).
  let mirrored = 0;
  const mirror = () => {
    if (!ov || mirrored) return;
    mirrored = setTimeout(() => {
      mirrored = 0;
      if (!ovCover || !ov.isConnected) return;
      const w = Math.round(ov.clientWidth * Math.min(2, devicePixelRatio || 1));
      if (!w) return;
      if (ovCover.width !== w) (ovCover.width = w), (ovCover.height = Math.round((w * H) / W));
      const c = ovCover.getContext('2d');
      c.clearRect(0, 0, ovCover.width, ovCover.height);
      if (g) c.drawImage(cover, 0, 0, ovCover.width, ovCover.height);
      items.forEach((it, i) => ovItems[i] && (ovItems[i].className = it.el.className));
      ov.firstElementChild.classList.toggle('ready', node.classList.contains('ready'));
    }, 120);
  };
  new ResizeObserver(resize).observe(frame);

  // ---- The latex.
  const cover = el('canvas', { class: 'tk-cover', 'aria-label': label });
  node.append(cover);
  const clip = outline(zones);
  let g = null;
  let k = 1;
  let finished = !open;
  // What's been scraped, kept as points over each scratch-off (never read
  // back off the canvas: that stalled a phone mid-stroke). A scratch-off
  // half scraped (or tapped) comes off whole; the card is done when every one is off.
  const sp = Math.max(4, Math.sqrt(zones.reduce((n, z) => n + z.r[2] * z.r[3], 0) / 6000));
  const spots = zones.map((z, zi) => {
    const list = [];
    const [zx, zy, rw, rh] = z.r;
    for (let j = zy + sp / 2; j < zy + rh; j += sp) for (let i = zx + sp / 2; i < zx + rw; i += sp) if (inZones([z], i, j)) list.push({ x: i, y: j, zi, off: false, hits: 0 });
    // (A sliver of a zone still gets a point.)
    if (!list.length) list.push({ x: zx + rw / 2, y: zy + rh / 2, zi, off: false, hits: 0 });
    // (A big one, a whole panel, comes off only when it's mostly scraped: never its result early.)
    return { z, list, off: 0, gone: false, big: Math.min(rw, rh) > W * 0.15 };
  });
  const grid = new Map();
  for (const z of spots) for (const p of z.list) {
    const key = `${Math.floor(p.x / sp)},${Math.floor(p.y / sp)}`;
    grid.set(key, [...(grid.get(key) || []), p]);
  }
  const allPts = spots.flatMap(z => z.list);
  // The win items under the latex, each with its points (shown when most are off).
  const watch = items.filter(it => it.under).map(it => {
    // (Its middle, where it's printed: its box less 15% a side.)
    const [ix, iy, iw, ih] = [it.r[0] + it.r[2] * 0.15, it.r[1] + it.r[3] * 0.15, it.r[2] * 0.7, it.r[3] * 0.7];
    const pts = allPts.filter(p => p.x >= ix && p.x <= ix + iw && p.y >= iy && p.y <= iy + ih);
    return { it, pts: pts.length ? pts : allPts.filter(p => p.x >= it.r[0] && p.x <= it.r[0] + it.r[2] && p.y >= it.r[1] && p.y <= it.r[1] + it.r[3]), shown: false };
  });
  // (Each scratch-off's things.)
  for (const z of spots) z.watch = watch.filter(w => w.pts.length && w.pts.some(p => spots[p.zi] === z));
  let silver = null;
  let cmap = null;
  const colorAt = (px, py) => {
    const i = (Math.min(cmap.h - 1, Math.floor((py / H) * cmap.h)) * cmap.w + Math.min(cmap.w - 1, Math.floor((px / W) * cmap.w))) * 4;
    return `rgb(${cmap.d[i]},${cmap.d[i + 1]},${cmap.d[i + 2]})`;
  };
  // Where fresh latex still is (a coarse grid): only that comes off in flakes, not a bare spot rubbed again.
  const scraped = new Set();
  const cell = W / 110;
  const grain = () => {
    const tile = document.createElement('canvas');
    tile.width = tile.height = 48;
    const tg = tile.getContext('2d');
    for (let j = 0; j < 48; j += 2)
      for (let i = 0; i < 48; i += 2) {
        const v = 170 + Math.floor(Math.random() * 56);
        tg.fillStyle = `rgb(${v},${v},${v + 6})`;
        tg.fillRect(i, j, 2, 2);
      }
    return g.createPattern(tile, 'repeat');
  };
  // The coin's bite: a few stamps of uneven, streaky clearing (its edge
  // catching on the grain), each taking off only part of the latex, so a
  // stroke leaves scuffs and specks that a second pass rubs clean.
  let stamps = [];
  const makeStamps = () =>
    Array.from({ length: 4 }, () => {
      const n = 64;
      const t = document.createElement('canvas');
      t.width = t.height = n;
      const tg = t.getContext('2d');
      const im = tg.createImageData(n, n);
      const rows = Array.from({ length: n }, () => Math.random());
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const d = Math.hypot(i - n / 2 + 0.5, j - n / 2 + 0.5) / (n / 2);
          const streak = rows[j] * 0.55 + rows[Math.min(n - 1, j + 1)] * 0.15 + Math.random() * 0.3;
          const a = Math.max(0, Math.min(1, (streak - d ** 3 * 0.85) * 1.5));
          im.data[(j * n + i) * 4 + 3] = Math.round(a * 75);
        }
      tg.putImageData(im, 0, 0);
      return t;
    });
  const paint = () => {
    if (finished || g || !node.isConnected || !img.complete || !img.naturalWidth || !fw) return;
    // Its resolution once, for the play area's zoom (capped: a phone's canvas has a limit).
    const ratio = Math.min(3, devicePixelRatio || 1);
    let cw = Math.round(W * Math.max(play(), sT) * ratio);
    cw = Math.min(cw, Math.floor(Math.sqrt((9e6 * W) / H)), W * 2);
    cover.width = cw;
    cover.height = Math.round((cw * H) / W);
    k = cw / W;
    const c = cover.getContext('2d');
    c.setTransform(k, 0, 0, k, 0, 0);
    c.save();
    c.clip(clip);
    c.drawImage(img, 0, 0, W, H);
    const sheen = c.createLinearGradient(0, 0, W, H);
    sheen.addColorStop(0, 'rgba(255,255,255,0.10)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
    sheen.addColorStop(1, 'rgba(255,255,255,0.08)');
    c.fillStyle = sheen;
    c.fillRect(0, 0, W, H);
    c.restore();
    // The picture not drawable yet (a phone still decoding it): again shortly, and what's under stays hidden till then.
    // (Checked at one point on the latex, not the whole canvas.)
    // (A zone's middle: its rect's corner may be rounded off.)
    const [zx, zy, zw, zh] = zones[0].r;
    if (c.getImageData(Math.floor((zx + zw / 2) * k), Math.floor((zy + zh / 2) * k), 1, 1).data[3] < 200) return void setTimeout(paint, 150);
    g = c;
    silver = grain();
    stamps = makeStamps();
    // The print's colours, small: what a flake that comes off shows.
    const m = document.createElement('canvas');
    m.width = 96;
    m.height = Math.max(1, Math.round((96 * H) / W));
    const mg = m.getContext('2d');
    mg.drawImage(img, 0, 0, m.width, m.height);
    cmap = { d: mg.getImageData(0, 0, m.width, m.height).data, w: m.width, h: m.height };
    node.classList.add('ready');
    mirror();
  };
  if (open) {
    img.decode?.().then(paint, paint);
    img.addEventListener('load', paint);
    new ResizeObserver(() => paint()).observe(frame);
  } else {
    cover.remove();
  }

  // One dab of the coin (picture px): silver round it on the latex still there, then the hole.
  const dab = (px, py, R, dir, few, bite = 1) => {
    const r = R * (0.84 + Math.random() * 0.28);
    if (![[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].some(([dx, dy]) => inZones(zones, px + dx, py + dy))) return;
    const key = `${Math.floor(px / cell)},${Math.floor(py / cell)}`;
    if (!scraped.has(key) && inZones(zones, px, py)) {
      scraped.add(key);
      if (Math.random() < (few ? 0.2 : 0.8)) flake(px, py, dir);
    }
    mark(px, py, r, bite);
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = silver;
    g.beginPath();
    g.arc(px + (Math.random() - 0.5) * R * 0.1, py + (Math.random() - 0.5) * R * 0.1, r * 1.14, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.globalAlpha = bite;
    // (Never clean in one go: streaks and specks left where it was scraped once.)
    g.translate(px, py);
    g.rotate(Math.atan2(dir[1], dir[0]) + (Math.random() - 0.5) * 0.3);
    g.drawImage(stamps[Math.floor(Math.random() * stamps.length)], -r * 1.05, -r * 1.05, r * 2.1, r * 2.1);
    g.setTransform(k, 0, 0, k, 0, 0);
    // (Its edge chips: a few bits taken clean off round it.)
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = r * (0.85 + Math.random() * 0.3);
      g.beginPath();
      g.arc(px + Math.cos(a) * d, py + Math.sin(a) * d, r * (0.12 + Math.random() * 0.2), 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  };
  // The points under a dab, scraped.
  const mark = (px, py, r, bite = 1) => {
    const [c0, c1, r0, r1] = [Math.floor((px - r) / sp), Math.floor((px + r) / sp), Math.floor((py - r) / sp), Math.floor((py + r) / sp)];
    for (let cy = r0; cy <= r1; cy++)
      for (let cx = c0; cx <= c1; cx++)
        for (const p of grid.get(`${cx},${cy}`) || []) if (!p.off && (p.x - px) ** 2 + (p.y - py) ** 2 <= r * r && (p.hits += bite) >= 6) (p.off = true), spots[p.zi].off++;
  };
  // A scratch-off taken off whole (its last bits): the latex fades off it.
  const lift = (z, dir = [0, 1]) => {
    if (z.gone) return;
    z.gone = true;
    tick();
    // (Its latex flakes off as it goes.)
    const [zx, zy, zw, zh] = z.z.r;
    for (let i = 0; i < Math.min(14, 4 + (zw * zh) / 1200); i++) flake(zx + Math.random() * zw, zy + Math.random() * zh, dir);
    for (const p of z.list) p.off = true;
    z.off = z.list.length;
    let a = 0;
    const path = outline([z.z]);
    const step = () => {
      if (finished) return;
      a += 0.25;
      g.save();
      g.globalCompositeOperation = 'destination-out';
      g.globalAlpha = Math.min(1, a);
      g.fill(path);
      g.restore();
      if (a < 1) requestAnimationFrame(step);
    };
    step();
    setTimeout(() => !finished && (g.save(), (g.globalCompositeOperation = 'destination-out'), g.fill(path), g.restore()), 200);
  };
  // The coin: a coin edge's size on the screen where it's played (narrower
  // than a fingertip: a scratch-off takes a few strokes); zoomed in further
  // it stays that size on the ticket, so a pinch never makes it more work.
  const R = () => Math.max(11, Math.min(16, fw * 0.04)) / Math.min(s, sT || play());
  let travel = 0;
  // How hard the coin bites (1: a slow, firm stroke; a fast flick only scuffs
  // the latex): the finger's speed, CSS px a millisecond.
  let pace = 0;
  const bite = () => Math.max(0.3, Math.min(1, 1.15 - pace * 0.4));
  let onDone = () => {};
  let called = false;
  const doneOnce = () => called || ((called = true), onDone());
  const stroke = (a, b, quiet) => {
    const r = R();
    const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const step = Math.max(r * 0.3, 0.5);
    const dir = dist ? [(b[0] - a[0]) / dist, (b[1] - a[1]) / dist] : [0, 0];
    for (let d = 0; d <= dist; d += step) {
      const q = dist ? d / dist : 0;
      dab(a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q, r, dir, quiet, quiet ? 1 : bite());
    }
    travel += dist * s;
    // (Felt as it goes: a tick every finger's width or so.)
    if (travel > 48 && !quiet) (travel = 0), feel(3);
  };
  // What's showing: a win popped as it shows; a scratch-off half scraped
  // comes off whole; every one off, the card is done (only then its result).
  // Read off the latex itself as a finger lifts (never mid-stroke: that
  // stalled a phone): a thing whose middle is see-through enough to read is read,
  // however lightly it was scraped. (The points above count the coin's
  // bites; a fast, light stroke leaves a haze the eye reads through while
  // they're still short.)
  const seen = () => {
    if (finished || !g) return;
    for (const w of watch) {
      if (w.shown || !w.pts.length || !w.pts.some(p => p.hits > 0)) continue;
      const [ix, iy, iw, ih] = w.it.r;
      const [x0, y0] = [Math.floor((ix + iw * 0.15) * k), Math.floor((iy + ih * 0.15) * k)];
      const [rw, rh] = [Math.max(1, Math.floor(iw * 0.7 * k)), Math.max(1, Math.floor(ih * 0.7 * k))];
      let d;
      try {
        d = g.getImageData(x0, y0, rw, rh).data;
      } catch {
        return;
      }
      // (Every few pixels: enough to tell. The haze a quick stroke leaves,
      // the print read through it, is about half see-through.)
      let sum = 0;
      let n = 0;
      for (let i = 3; i < d.length; i += 4 * 5) n++, (sum += d[i]);
      if (n && sum / n <= 165) w.shown = true;
    }
  };
  const look = () => {
    if (finished || !g) return;
    for (const w of watch) {
      if (w.shown || !w.pts.length) continue;
      // (Read, not celebrated: a win shows only at 兌獎, reveal().)
      if (w.pts.filter(p => p.off).length / w.pts.length >= 0.6) w.shown = true;
    }
    // The standard: a scratch-off comes off whole once everything under it
    // can be read (each thing on it 60% scraped) or most of it is scraped;
    // once everything on the card can be read, the rest lifts by itself
    // (no scratching to the last speck).
    for (const z of spots) if (!z.gone && ((z.watch.length && z.watch.every(w => w.shown)) || z.off / z.list.length >= (z.big ? 0.9 : 0.72))) lift(z);
    if (watch.some(w => w.pts.length) && watch.every(w => w.shown || !w.pts.length)) for (const z of spots) lift(z);
    mirror();
    if (spots.every(z => z.gone)) return void setTimeout(doneOnce, 260);
    // (A part all off: on to the next, after a moment to see it.)
    if (steps.length) {
      const i = stepAt();
      if (i !== shownStep && i !== pending) {
        pending = i;
        setTimeout(() => ((pending = -2), !finished && stepAt() === i && toStep(i)), 380);
      }
    }
  };
  let lastLook = 0;
  const pop = it => {
    it.el.classList.add('shown');
    feel(12);
    chime();
    const [ix, iy, iw, ih] = it.r;
    burst((ix + iw / 2 - x) * s, (iy + ih / 2 - y) * s, 16, Math.max(iw, ih) * s * 0.5);
  };

  // The scratch-off nearest a point (picture px) of these, and how far its rect is.
  const nearest = ([qx, qy], list) =>
    list.reduce((best, z) => {
      const [zx, zy, zw, zh] = z.z.r;
      const d = Math.hypot(Math.max(zx - qx, 0, qx - zx - zw), Math.max(zy - qy, 0, qy - zy - zh));
      return d < best[0] ? [d, z] : best;
    }, [Infinity, null]);

  // ---- Fingers.
  const pts = new Map();
  let mode = null;
  let from = null;
  let last = null;
  let tapAt = 0;
  let tapAtXY = [0, 0];
  let down = null;
  const local = e => {
    const r = frame.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const pic = ([fx, fy]) => [x + fx / s, y + fy / s];
  frame.addEventListener('pointerdown', e => {
    cancelAnimationFrame(glide);
    const p = local(e);
    // (A first finger down starts afresh: a finger whose lift never came, as
    // iOS can after a pinch, would make every touch after it a pinch.)
    if (e.isPrimary) pts.clear();
    pts.set(e.pointerId, p);
    try {
      frame.setPointerCapture(e.pointerId);
    } catch {}
    if (pts.size === 2) {
      down = null;
      if (mode === 'scratch') look();
      const [a, b] = [...pts.values()];
      mode = 'pinch';
      from = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, s, at: pic([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]) };
      return;
    }
    if (pts.size > 2) return;
    // A double tap off the latex: the play area, or the whole ticket.
    const now = Date.now();
    const q = pic(p);
    // (Till it's all off, one finger scratches when it starts on or near the
    // latex, as a coin would; well away from it, it moves the ticket.)
    const onLatex = !finished && g && nearest(q, spots)[0] <= Math.max(R() * 2.5, 36 / s);
    // (Only after a real tap, one finger down and up in place: a pinch's
    // fingers landing again soon after, as when zooming in in steps, never
    // counts, which had thrown the camera back to the whole ticket.)
    if (!onLatex && now - tapAt < 320 && Math.hypot(p[0] - tapAtXY[0], p[1] - tapAtXY[1]) < 30) {
      tapAt = 0;
      mode = null;
      return void go(s > (whole() + play()) / 2 && play() > whole() * 1.05 ? [whole(), 0, 0] : playView());
    }
    tapAt = 0;
    down = { at: now, p };
    if (onLatex) {
      wake();
      mode = 'scratch';
      last = q;
      from = { p, moved: 0, q };
      stroke(q, q);
    } else {
      mode = 'pan';
      from = { p, x, y };
    }
  });
  frame.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    const p = local(e);
    pts.set(e.pointerId, p);
    if (mode === 'scratch' && !finished) {
      e.preventDefault();
      // (Every point the finger passed since the last frame, not just the last: no gaps, no corners cut.)
      const now = performance.now();
      const all = e.getCoalescedEvents?.() || [];
      from.moved = Math.max(from.moved, Math.hypot(p[0] - from.p[0], p[1] - from.p[1]));
      // (Heard as fast as the finger goes; still, silent.)
      const dt = Math.max(8, now - (from.t || now - 16));
      const v = Math.hypot(p[0] - (from.last || p)[0], p[1] - (from.last || p)[1]) / dt;
      pace = pace * 0.6 + v * 0.4;
      rub(v);
      from.t = now;
      from.last = p;
      clearTimeout(from.still);
      from.still = setTimeout(() => (rub(0), (pace = 0)), 70);
      for (const ev of all.length ? all : [e]) {
        const q = pic(local(ev));
        stroke(last, q);
        last = q;
      }
      if (now - lastLook > 40) (lastLook = now), look();
    } else if (mode === 'pan') {
      x = from.x - (p[0] - from.p[0]) / s;
      y = from.y - (p[1] - from.p[1]) / s;
      draw();
    } else if (mode === 'pinch' && pts.size >= 2) {
      const [a, b] = [...pts.values()];
      s = (from.s * Math.hypot(a[0] - b[0], a[1] - b[1])) / from.d;
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      clamp();
      x = from.at[0] - mid[0] / s;
      y = from.at[1] - mid[1] / s;
      draw();
    }
  });
  // (Safari: nothing behind scrolls or bounces while a finger is on the ticket.)
  frame.addEventListener('touchmove', e => e.cancelable && e.preventDefault(), { passive: false });
  const up = e => {
    if (!pts.delete(e.pointerId)) return;
    const p = local(e);
    if (down && !pts.size && mode !== 'pinch' && mode !== 'gesture' && Date.now() - down.at < 300 && Math.hypot(p[0] - down.p[0], p[1] - down.p[1]) < 12) [tapAt, tapAtXY] = [Date.now(), p];
    down = null;
    // (iOS opens audio only from a touch that ends: woken again here.)
    if (mode === 'scratch') clearTimeout(from?.still), rub(0), wake();
    if (mode === 'scratch') (seen(), look());
    if (mode === 'pinch') commit();
    if (pts.size === 1) {
      // (One finger left after a pinch: it moves the ticket, never scratches.)
      mode = 'pan';
      from = { p: [...pts.values()][0], x, y };
    } else if (!pts.size) mode = null;
  };
  frame.addEventListener('pointerup', up);
  frame.addEventListener('pointercancel', up);
  frame.addEventListener('lostpointercapture', up);
  // (Safari's own pinch, for when its second finger never comes as a pointer.)
  let gesture = null;
  frame.addEventListener('gesturestart', e => {
    e.preventDefault();
    if (mode === 'pinch') return;
    if (mode === 'scratch') clearTimeout(from?.still), rub(0), look();
    mode = 'gesture';
    down = null;
    gesture = { s, at: pic(local(e)) };
  });
  frame.addEventListener('gesturechange', e => {
    e.preventDefault();
    if (mode !== 'gesture' || !gesture) return;
    const p = local(e);
    s = gesture.s * e.scale;
    clamp();
    x = gesture.at[0] - p[0] / s;
    y = gesture.at[1] - p[1] / s;
    draw();
  });
  frame.addEventListener('gestureend', e => {
    e.preventDefault();
    if (!gesture) return;
    gesture = null;
    commit();
    if (mode === 'gesture') mode = pts.size ? 'pan' : null;
    if (mode === 'pan') from = { p: [...pts.values()][0], x, y };
  });
  frame.addEventListener(
    'wheel',
    e => {
      e.preventDefault();
      const p = local(e);
      const at = pic(p);
      s *= Math.exp(-e.deltaY * 0.0025);
      clamp();
      x = at[0] - p[0] / s;
      y = at[1] - p[1] / s;
      draw();
      clearTimeout(frame.wheelEnd);
      frame.wheelEnd = setTimeout(commit, 160);
    },
    { passive: false }
  );

  // ---- Confetti and coins over the frame (CSS px of the frame).
  let bits = [];
  let raf = 0;
  const pc = party.getContext('2d');
  const tint = colors.length ? colors : ['#f59e0b', '#ef4444', '#22c55e', '#3b82f6', '#ec4899'];
  // A flake of latex pushed off by the coin (picture px where it came from):
  // it's flung on the way the finger goes, curls over as it falls (the print
  // on one side, the latex's grey on the other), and is gone off the card.
  const flake = (px, py, [dx, dy]) => {
    if (reduced() || bits.length > 240) return;
    const size = 1.6 + Math.random() ** 2 * 4.2;
    const n = 5 + Math.floor(Math.random() * 3);
    bits.push({
      kind: 'flake',
      px,
      py,
      ox: 0,
      oy: 0,
      vx: dx * (0.08 + Math.random() * 0.12) + (Math.random() - 0.5) * 0.08,
      vy: dy * (0.08 + Math.random() * 0.12) - 0.04 - Math.random() * 0.06,
      r: Math.random() * 6,
      vr: (Math.random() - 0.5) * 0.03,
      curl: Math.random() * 6,
      vc: 0.008 + Math.random() * 0.018,
      shape: Array.from({ length: n }, (_, i) => [(i / n) * Math.PI * 2, size * (0.55 + Math.random() * 0.6)]),
      color: colorAt(px, py),
      born: performance.now(),
      life: 650 + Math.random() * 500
    });
    if (!raf) raf = requestAnimationFrame(frameParty);
  };
  const burst = (cx, cy, n, spread = 20, coins = false) => {
    if (reduced()) return;
    for (let i = 0; i < n; i++) {
      const a = coins ? -Math.PI / 2 + (Math.random() - 0.5) * 1.6 : Math.random() * Math.PI * 2;
      const v = coins ? 0.5 + Math.random() * 0.55 : 0.12 + Math.random() * 0.3;
      bits.push({
        x: cx + (coins ? (Math.random() - 0.5) * spread : Math.cos(a) * spread * 0.6),
        y: cy + (coins ? 0 : Math.sin(a) * spread * 0.6),
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        r: Math.random() * 6,
        vr: (Math.random() - 0.5) * 0.02,
        size: coins ? 7 + Math.random() * 6 : 2 + Math.random() * 3,
        kind: coins ? (Math.random() < 0.45 ? 'coin' : 'paper') : 'spark',
        color: tint[i % tint.length],
        born: performance.now(),
        life: coins ? 2200 : 650
      });
    }
    if (!raf) raf = requestAnimationFrame(frameParty);
  };
  let lastT = 0;
  const frameParty = now => {
    const dt = Math.min(32, now - (lastT || now));
    lastT = now;
    const q = party.width / (fw || 1);
    pc.setTransform(q, 0, 0, q, 0, 0);
    pc.clearRect(0, 0, fw, fh);
    bits = bits.filter(b => now - b.born < b.life);
    for (const b of bits) {
      const age = (now - b.born) / b.life;
      if (b.kind === 'flake') {
        b.vy += 0.0009 * dt;
        b.ox += b.vx * dt;
        b.oy += b.vy * dt;
        b.r += b.vr * dt;
        b.curl += b.vc * dt;
        const c = Math.cos(b.curl);
        pc.globalAlpha = Math.min(1, (1 - age) * 2.5);
        pc.save();
        pc.translate((b.px - x) * s + b.ox, (b.py - y) * s + b.oy);
        pc.rotate(b.r);
        pc.scale(1, Math.max(0.12, Math.abs(c)));
        pc.shadowColor = 'rgba(0,0,0,0.3)';
        pc.shadowBlur = 1.5;
        pc.shadowOffsetY = 1;
        pc.fillStyle = c > 0 ? b.color : '#b9bcc2';
        pc.beginPath();
        b.shape.forEach(([a, d], i) => pc[i ? 'lineTo' : 'moveTo'](Math.cos(a) * d, Math.sin(a) * d));
        pc.closePath();
        pc.fill();
        pc.restore();
        continue;
      }
      if (b.kind === 'spark') {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.vx *= 0.94;
        b.vy *= 0.94;
        pc.globalAlpha = 1 - age;
        pc.fillStyle = age < 0.3 ? '#fff7cc' : '#fbbf24';
        pc.beginPath();
        // A four-point twinkle.
        const z = b.size * (1 - age * 0.5);
        pc.moveTo(b.x, b.y - z * 2);
        pc.quadraticCurveTo(b.x, b.y, b.x + z * 2, b.y);
        pc.quadraticCurveTo(b.x, b.y, b.x, b.y + z * 2);
        pc.quadraticCurveTo(b.x, b.y, b.x - z * 2, b.y);
        pc.quadraticCurveTo(b.x, b.y, b.x, b.y - z * 2);
        pc.fill();
        continue;
      }
      b.vy += 0.0012 * dt;
      b.vx *= 0.995;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.r += b.vr * dt;
      pc.globalAlpha = Math.min(1, (1 - age) * 3);
      pc.save();
      pc.translate(b.x, b.y);
      if (b.kind === 'coin') {
        // A coin turning: its face narrows and widens.
        const sx = Math.abs(Math.cos(b.r));
        pc.scale(Math.max(0.15, sx), 1);
        const grad = pc.createLinearGradient(-b.size, -b.size, b.size, b.size);
        grad.addColorStop(0, '#fff3b0');
        grad.addColorStop(0.5, '#f5b301');
        grad.addColorStop(1, '#b7791f');
        pc.fillStyle = grad;
        pc.beginPath();
        pc.arc(0, 0, b.size, 0, Math.PI * 2);
        pc.fill();
        pc.strokeStyle = 'rgba(146,64,14,0.6)';
        pc.lineWidth = 1;
        pc.beginPath();
        pc.arc(0, 0, b.size * 0.7, 0, Math.PI * 2);
        pc.stroke();
      } else {
        pc.rotate(b.r);
        pc.scale(1, Math.cos(b.r * 1.7));
        pc.fillStyle = b.color;
        pc.fillRect(-b.size * 0.5, -b.size * 0.3, b.size, b.size * 0.6);
      }
      pc.restore();
    }
    pc.globalAlpha = 1;
    raf = bits.length ? requestAnimationFrame(frameParty) : ((lastT = 0), pc.clearRect(0, 0, fw, fh), 0);
  };

  return {
    frame,
    // Called once the latex is mostly off (or 一次刮開).
    onDone: f => (onDone = f),
    // Called with the part on now (i of n; -1 once there are none).
    onStep: f => (onStep = f),
    // The rest of the latex lifts off and every win still hidden pops, the
    // ticket left where it is to look at (`stay`); laid out again as the
    // whole ticket at its own height (no overview) when not, or at `settle`.
    clear(stay = false) {
      if (!finished) {
        finished = true;
        rub(0);
        cover.style.transition = 'opacity .45s';
        cover.style.opacity = '0';
        cover.style.pointerEvents = 'none';
        setTimeout(() => (cover.style.display = 'none'), 500);
      }
      if (stay) {
        // (Played a part at a time: after a moment the overview fades and the
        // whole ticket has the frame.)
        if (steps.length) {
          steps = [];
          setTimeout(() => {
            if (!ov) return go([whole(), 0, 0], 900);
            ov.style.transition = 'opacity .3s';
            ov.style.opacity = '0';
            setTimeout(() => (ov?.remove(), (ov = ovBox = null)), 300);
          }, 700);
        }
        return;
      }
      if (!fill) return;
      fill = false;
      steps = [];
      sT = 0;
      onStep(-1, 0);
      ov?.remove();
      ov = ovBox = null;
      frame.classList.remove('fill');
      fw = 0;
      laid = false;
      resize();
    },
    // 兌獎: each win on the ticket pops, one after another.
    reveal() {
      watch.filter(w => w.it.win).forEach((w, i) => setTimeout(() => pop(w.it), i * 140));
    },
    // The card's prize: coins and confetti (big: more).
    celebrate(won, big) {
      if (!won) return;
      chime(true);
      feel(20);
      setTimeout(() => feel(14), 160);
      const n = big ? 90 : 46;
      burst(fw / 2, fh + 10, n, fw * 0.8, true);
      if (big) setTimeout(() => burst(fw / 2, fh + 10, 60, fw, true), 380);
    },
    // 一次刮開: every scratch-off scraped back and forth, quickly.
    all() {
      if (finished || !g) return doneOnce();
      const r = R();
      const lines = [];
      for (const { r: [zx, zy, rw, rh] } of zones) {
        const rows = Math.max(1, Math.ceil(rh / (r * 1.3)));
        for (let i = 0; i < rows; i++) {
          const yy = zy + rh * ((i + 0.5) / rows);
          lines.push(i % 2 ? [[zx + rw, yy], [zx, yy]] : [[zx, yy], [zx + rw, yy]]);
        }
      }
      // (By the clock, not by frames: a slow or throttled phone takes no longer.)
      const t0 = performance.now();
      let i = 0;
      const tick = () => {
        if (finished) return;
        const to = Math.min(lines.length, Math.ceil((lines.length * (performance.now() - t0 + 16)) / 800));
        for (; i < to; i++) stroke(...lines[i], true);
        look();
        if (i < lines.length) requestAnimationFrame(tick);
        else setTimeout(doneOnce, 200);
      };
      tick();
      setTimeout(doneOnce, 1600);
    },
    stop: () => (rest(), cancelAnimationFrame(raf), cancelAnimationFrame(glide), 0)
  };
}
