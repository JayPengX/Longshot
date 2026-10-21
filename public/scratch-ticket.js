// A card on sale scratched as its real ticket (scratch-face.js ticketFace):
// the ticket filling its frame, the camera on where it's played (tickets.js
// `view`) so its print reads at a phone's size; its own printed latex over the
// scratch-offs, scraped off with a finger the way latex comes off (a ragged
// edge, the silver under the print round it, a little haze), flakes of it
// curling off and falling away under the finger (no sound: the owner's call);
// each win popping as it shows, and the card's prize
// celebrated once it's all off. Two fingers zoom and move it (one, once it's
// all off), and then a double tap goes from the play area to the whole
// ticket and back.

const ease = k => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// A tick felt (the kit's: iOS's switch trick, a short buzz on Android).
const feel = (ms = 6) => {
  try {
    globalThis.quadraHaptic?.();
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
  const frame = el('div', { class: 'tk-frame', 'data-no-sheet-swipe': '' }, [node]);
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
    s = Math.min(Math.max(play() * 2.5, whole() * 3), Math.max(whole(), s));
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
  let opened = false;
  // Sized to its frame (the sheet laid out, a phone turned): on the play area again.
  const resize = () => {
    const [w, h] = [frame.clientWidth, frame.clientHeight];
    // (Never taller than the ticket at the play area's zoom: what's left is the sheet's.)
    const tall = `${Math.ceil(H * Math.min(w / view[2], (w * 4) / W))}px`;
    if (w && frame.style.height !== tall) frame.style.height = tall;
    if (!w || !h || (w === fw && h === fh)) return;
    [fw, fh] = [w, h];
    party.width = Math.round(w * Math.min(2, devicePixelRatio || 1));
    party.height = Math.round(h * Math.min(2, devicePixelRatio || 1));
    if (!opened) [s, x, y] = [whole(), 0, 0];
    else [s, x, y] = playView();
    commit();
  };
  new ResizeObserver(resize).observe(frame);

  // ---- The latex.
  const cover = el('canvas', { class: 'tk-cover', 'aria-label': label });
  node.append(cover);
  const clip = outline(zones);
  let g = null;
  let k = 1;
  let finished = !open;
  let samples = [];
  // The win items under the latex, each with its points (shown when most are off).
  const watch = items.filter(it => it.under).map(it => {
    const [ix, iy, iw, ih] = it.r;
    const pts = [];
    for (let i = 0.2; i < 1; i += 0.3) for (let j = 0.2; j < 1; j += 0.3) if (inZones(zones, ix + iw * i, iy + ih * j)) pts.push([ix + iw * i, iy + ih * j]);
    return { it, pts, shown: false };
  });
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
  const alphaAt = (data, [px, py]) => data[(Math.floor(py * k) * cover.width + Math.floor(px * k)) * 4 + 3];
  const paint = () => {
    if (finished || g || !node.isConnected || !img.complete || !img.naturalWidth || !fw) return;
    // Its resolution once, for the play area's zoom (capped: a phone's canvas has a limit).
    const ratio = Math.min(3, devicePixelRatio || 1);
    let cw = Math.round(W * play() * ratio);
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
    const data = c.getImageData(0, 0, cover.width, cover.height).data;
    samples = [];
    for (const { r: [zx, zy, rw, rh] } of zones)
      for (let i = 0.1; i < 1; i += 0.2)
        for (let j = 0.1; j < 1; j += 0.2) {
          const p = [zx + rw * i, zy + rh * j];
          if (inZones(zones, ...p) && alphaAt(data, p) > 200) samples.push(p);
        }
    // The picture not drawable yet (a phone still decoding it): again shortly, and what's under stays hidden till then.
    if (!samples.length) return void setTimeout(paint, 150);
    g = c;
    silver = grain();
    // The print's colours, small: what a flake that comes off shows.
    const m = document.createElement('canvas');
    m.width = 96;
    m.height = Math.max(1, Math.round((96 * H) / W));
    const mg = m.getContext('2d');
    mg.drawImage(img, 0, 0, m.width, m.height);
    cmap = { d: mg.getImageData(0, 0, m.width, m.height).data, w: m.width, h: m.height };
    node.classList.add('ready');
    // In from the whole ticket to where it's played.
    opened = true;
    setTimeout(() => go(playView(), 750), 120);
  };
  if (open) {
    img.decode?.().then(paint, paint);
    img.addEventListener('load', paint);
    new ResizeObserver(() => paint()).observe(frame);
  } else {
    cover.remove();
    opened = true;
    requestAnimationFrame(() => fw && go(playView(), 0));
  }

  // One dab of the coin (picture px): silver round it on the latex still there, then the hole.
  const dab = (px, py, R, dir, few) => {
    const r = R * (0.84 + Math.random() * 0.28);
    if (![[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].some(([dx, dy]) => inZones(zones, px + dx, py + dy))) return;
    const key = `${Math.floor(px / cell)},${Math.floor(py / cell)}`;
    if (!scraped.has(key) && inZones(zones, px, py)) {
      scraped.add(key);
      if (Math.random() < (few ? 0.2 : 0.8)) flake(px, py, dir);
    }
    g.save();
    g.clip(clip);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = silver;
    g.beginPath();
    g.arc(px + (Math.random() - 0.5) * R * 0.1, py + (Math.random() - 0.5) * R * 0.1, r * 1.14, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    // (Not always clean: a thin haze where it was scraped once.)
    g.globalAlpha = 0.88 + Math.random() * 0.12;
    g.beginPath();
    g.arc(px, py, r, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = r * (0.85 + Math.random() * 0.3);
      g.beginPath();
      g.arc(px + Math.cos(a) * d, py + Math.sin(a) * d, r * (0.12 + Math.random() * 0.2), 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  };
  // The coin's size on the screen stays a fingertip's, however zoomed.
  const R = () => Math.max(10, Math.min(15, fw * 0.036)) / s;
  let travel = 0;
  let onDone = () => {};
  let called = false;
  const doneOnce = () => called || ((called = true), onDone());
  const stroke = (a, b, quiet) => {
    const r = R();
    const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const step = Math.max(r * 0.22, 0.5);
    const dir = dist ? [(b[0] - a[0]) / dist, (b[1] - a[1]) / dist] : [0, 0];
    for (let d = 0; d <= dist; d += step) {
      const q = dist ? d / dist : 0;
      dab(a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q, r, dir, quiet);
    }
    travel += dist * s;
    if (travel > 40 && !quiet) (travel = 0), navigator.vibrate?.(3);
  };
  // What's showing: a win popped as it shows; most of it off, the card is done.
  const look = () => {
    if (finished || !g) return;
    const data = g.getImageData(0, 0, cover.width, cover.height).data;
    for (const w of watch) {
      if (w.shown || !w.pts.length) continue;
      if (w.pts.filter(p => alphaAt(data, p) < 60).length / w.pts.length >= 0.6) {
        w.shown = true;
        if (w.it.win) pop(w.it);
      }
    }
    const off = samples.filter(p => alphaAt(data, p) < 40).length;
    if (off / samples.length > 0.55) doneOnce();
  };
  let lastLook = 0;
  const pop = it => {
    it.el.classList.add('shown');
    feel(12);
    const [ix, iy, iw, ih] = it.r;
    burst((ix + iw / 2 - x) * s, (iy + ih / 2 - y) * s, 16, Math.max(iw, ih) * s * 0.5);
  };

  // ---- Fingers.
  const pts = new Map();
  let mode = null;
  let from = null;
  let last = null;
  let lastMove = 0;
  let tapAt = 0;
  let tapAtXY = [0, 0];
  const local = e => {
    const r = frame.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const pic = ([fx, fy]) => [x + fx / s, y + fy / s];
  frame.addEventListener('pointerdown', e => {
    cancelAnimationFrame(glide);
    const p = local(e);
    pts.set(e.pointerId, p);
    try {
      frame.setPointerCapture(e.pointerId);
    } catch {}
    if (pts.size === 2) {
      if (mode === 'scratch') look();
      const [a, b] = [...pts.values()];
      mode = 'pinch';
      from = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, s, at: pic([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]) };
      return;
    }
    if (pts.size > 2) return;
    // A double tap (once it's all off): the play area, or the whole ticket.
    const now = Date.now();
    const q = pic(p);
    // (Till it's all off, one finger scratches wherever it starts, as a coin on the card; two move it.)
    const onLatex = !finished && g;
    if (!onLatex && now - tapAt < 320 && Math.hypot(p[0] - tapAtXY[0], p[1] - tapAtXY[1]) < 30) {
      tapAt = 0;
      mode = null;
      return void go(s > (whole() + play()) / 2 && play() > whole() * 1.05 ? [whole(), 0, 0] : playView());
    }
    [tapAt, tapAtXY] = [now, p];
    if (onLatex) {
      mode = 'scratch';
      last = q;
      lastMove = performance.now();
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
      const q = pic(p);
      const now = performance.now();
      const dist = Math.hypot(q[0] - last[0], q[1] - last[1]) * s;
      stroke(last, q);
      last = q;
      lastMove = now;
      if (now - lastLook > 90) (lastLook = now), look();
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
  const up = e => {
    if (!pts.delete(e.pointerId)) return;
    if (mode === 'scratch') look();
    if (mode === 'pinch') commit();
    if (pts.size === 1) {
      // (One finger left after a pinch: it moves the ticket, never scratches.)
      mode = 'pan';
      from = { p: [...pts.values()][0], x, y };
    } else if (!pts.size) mode = null;
  };
  frame.addEventListener('pointerup', up);
  frame.addEventListener('pointercancel', up);
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
    // The rest of the latex lifts off; every win still hidden pops.
    clear() {
      if (finished) return;
      finished = true;
      cover.style.transition = 'opacity .45s';
      cover.style.opacity = '0';
      cover.style.pointerEvents = 'none';
      setTimeout(() => (cover.style.display = 'none'), 500);
      for (const w of watch) if (!w.shown && w.it.win) w.it.el.classList.add('shown');
    },
    // The card's prize: coins and confetti (big: more).
    celebrate(won, big) {
      if (!won) return;
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
    stop: () => (cancelAnimationFrame(raf), cancelAnimationFrame(glide), 0)
  };
}
