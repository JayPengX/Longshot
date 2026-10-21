// Play's own small pictures, drawn (never an emoji standing in for one): a
// race's marshal boards (the safety car's yellow SC board, the VSC board, the
// red flag), a pick's state on a ticket, a free bet's gift. Each comes as a
// span holding an inline SVG, sized by the class it's given.
const SVG = (body, view = '0 0 24 24') => `<svg viewBox="${view}" width="100%" height="100%" aria-hidden="true" focusable="false">${body}</svg>`;
const LINE = 'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"';

const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const ICONS = {
  // Each sport's own ball (a chip's mark, never a league's logo).
  sport_baseball: SVG(`<circle cx="12" cy="12" r="8.5" ${S}/><path d="M7.2 5.5c1.6 1.8 2.4 4 2.4 6.5s-.8 4.7-2.4 6.5M16.8 5.5c-1.6 1.8-2.4 4-2.4 6.5s.8 4.7 2.4 6.5" ${S}/>`),
  sport_basketball: SVG(`<circle cx="12" cy="12" r="8.5" ${S}/><path d="M3.5 12h17M12 3.5v17M6 6c2 1.8 3 3.8 3 6s-1 4.2-3 6M18 6c-2 1.8-3 3.8-3 6s1 4.2 3 6" ${S}/>`),
  sport_soccer: SVG(`<circle cx="12" cy="12" r="8.5" ${S}/><path d="m12 7.8 3.6 2.6-1.4 4.2H9.8l-1.4-4.2zM12 3.5v4.3M20.3 10.1l-4.7.3M17 19l-2.8-4.4M7 19l2.8-4.4M3.7 10.1l4.7.3" ${S}/>`),
  sport_football: SVG(`<path d="M5 19C4 14 6 8 10 6s8.6-1.6 9 -1c.4 .4 1 5-1 9s-8 6-13 5z" ${S}/><path d="M9.5 14.5l5-5M10.8 10.8l1.4 1.4M12.6 9l1.4 1.4M9 12.6l1.4 1.4" ${S}/>`),
  sport_hockey: SVG(`<ellipse cx="12" cy="9.5" rx="8.5" ry="3.5" ${S}/><path d="M3.5 9.5v5c0 1.9 3.8 3.5 8.5 3.5s8.5-1.6 8.5-3.5v-5" ${S}/>`),
  sport_tennis: SVG(`<circle cx="12" cy="12" r="8.5" ${S}/><path d="M4.4 8.2c2.9 1 4.6 2.3 4.6 3.8s-1.7 2.8-4.6 3.8M19.6 8.2c-2.9 1-4.6 2.3-4.6 3.8s1.7 2.8 4.6 3.8" ${S}/>`),
  sport_volleyball: SVG(`<circle cx="12" cy="12" r="8.5" ${S}/><path d="M12 3.5c0 4 1.5 7 4.5 8.5M12 12c-3.5 1.5-6 1.5-8.2-.2M12 12c.5 3.8 2.5 6.6 5.6 7.6" ${S}/>`),
  sport_badminton: SVG(`<path d="M9.2 14.5 5 3.5h14l-4.2 11z" ${S}/><path d="M8 9h8M12 3.5v11" ${S}/><circle cx="12" cy="17.8" r="2.7" ${S}/>`),
  sport_tabletennis: SVG(`<circle cx="10" cy="10" r="6.5" ${S}/><path d="M14.6 14.6 20 20" ${S}/><circle cx="18.6" cy="5.6" r="1.8" ${S}/>`),
  sport_esports: SVG(`<path d="M7 8h10a4 4 0 0 1 4 4.5l-.6 4a2.4 2.4 0 0 1-4.2 1.1L14.5 16h-5l-1.7 1.6a2.4 2.4 0 0 1-4.2-1.1l-.6-4A4 4 0 0 1 7 8z" ${S}/><path d="M8 11v3M6.5 12.5h3M15.5 12h.01M17.5 13.5h.01" ${S}/>`),
  sport_snooker: SVG(`<circle cx="12" cy="12" r="8.5" ${S}/><circle cx="12" cy="12" r="3.6" ${S}/><path d="M12 10.4v3.2" ${S}/>`),
  sport_darts: SVG(`<circle cx="11" cy="13" r="8" ${S}/><circle cx="11" cy="13" r="4" ${S}/><path d="M11 13l9-9M17 4h3v3" ${S}/>`),
  sport_handball: SVG(`<circle cx="12" cy="12" r="8.5" ${S}/><path d="M12 3.5l2.5 5.5h-5zM20 10l-5.5 1M4 10l5.5 1M8 19l2-5M16 19l-2-5" ${S}/>`),
  sport_rugby: SVG(`<ellipse cx="12" cy="12" rx="9" ry="5.5" transform="rotate(-35 12 12)" ${S}/><path d="M8.5 15.5l7-7M10.5 11.5l2 2M12.5 9.5l2 2" ${S}/>`),
  sport_futsal: SVG(`<circle cx="12" cy="12" r="8.5" ${S}/><path d="m12 7.8 3.6 2.6-1.4 4.2H9.8l-1.4-4.2zM12 3.5v4.3M20.3 10.1l-4.7.3M17 19l-2.8-4.4M7 19l2.8-4.4M3.7 10.1l4.7.3" ${S}/>`),
  sport_f1: SVG(`<path d="M6 21V4" ${S}/><path d="M6 4h12v9H6" ${S}/><path d="M6 4h3v3H6zM12 4h3v3h-3zM9 7h3v3H9zM15 7h3v3h-3zM6 10h3v3H6zM12 10h3v3h-3z" fill="currentColor"/>`),
  // The boards F1's marshals and screens show.
  f1sc: SVG('<rect x="1" y="5" width="30" height="22" rx="4" fill="#facc15"/><text x="16" y="21" text-anchor="middle" font-family="-apple-system,Helvetica,Arial,sans-serif" font-size="13" font-weight="900" fill="#111">SC</text>', '0 0 32 32'),
  f1vsc: SVG('<rect x="1" y="5" width="30" height="22" rx="4" fill="#111" stroke="#facc15" stroke-width="2.2"/><text x="16" y="20.5" text-anchor="middle" font-family="-apple-system,Helvetica,Arial,sans-serif" font-size="10" font-weight="900" fill="#facc15">VSC</text>', '0 0 32 32'),
  f1red: SVG('<path d="M7 4v24" stroke="#9ca3af" stroke-width="2.4" stroke-linecap="round"/><path d="M8 5c4-2 7 2 11 0s6-1 8 0v12c-2-1-4-2-8 0s-7-2-11 0z" fill="#dc2626"/>', '0 0 32 32'),
  // A pick's state on a ticket.
  won: SVG(`<path d="M5 12.5l4.5 4.5L19 7.5" ${LINE}/>`),
  lost: SVG(`<path d="M6.5 6.5l11 11M17.5 6.5l-11 11" ${LINE}/>`),
  void: SVG(`<path d="M5 12a7 7 0 1 0 2.2-5.1M5 4.5v4h4" ${LINE}/>`),
  live: SVG('<circle cx="12" cy="12" r="5" fill="currentColor"/>'),
  waiting: SVG(`<circle cx="12" cy="12" r="8.5" ${LINE}/><path d="M12 7.5V12l3 2" ${LINE}/>`),
  cashed: SVG(`<path d="M6 12h12" ${LINE}/>`),
  // A locked price (iOS's own lock: a body and a shackle, no emoji).
  lock: SVG('<rect x="5" y="10.5" width="14" height="10" rx="2.6" fill="currentColor"/><path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'),
  gift: SVG(`<rect x="3.5" y="9" width="17" height="11.5" rx="2" ${LINE}/><path d="M2.5 9h19M12 9v11.5M12 9c-1.5-3.5-6-4.5-6-1.5C6 9 9 9 12 9zm0 0c1.5-3.5 6-4.5 6-1.5C18 9 15 9 12 9z" ${LINE}/>`)
};

export const hasIcon = name => Boolean(ICONS[name]);
export function icon(name, cls = '') {
  const span = document.createElement('span');
  span.className = `pi pi-${name}${cls ? ` ${cls}` : ''}`;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = ICONS[name] || '';
  return span;
}

// A kit glyph by name (the kit's `icons`), as a 16px span.
export function kitGlyph(kitUI, name, cls = '') {
  const s = document.createElement('span');
  s.className = `q-gl${cls ? ` ${cls}` : ''}`;
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = kitUI.icons[name] || '';
  return s;
}
// A colour tile with the card's initial (the price digit or first character), never an emoji.
export function initialTile(name, color, cls = '') {
  const s = document.createElement('span');
  s.className = `q-tile init${cls ? ` ${cls}` : ''}`;
  s.style.setProperty('--t', color);
  s.setAttribute('aria-hidden', 'true');
  s.textContent = String(name || '').trim().slice(0, 1).toUpperCase();
  return s;
}
// Taiwan Lottery's own pictures (art/, from its site): a draw game's logo on a
// white plate, as its slips print it (dark mode: outlined, no plate); a scratch card's printed face. Without a
// picture (a retired game or card), the colour tile.
export function gameLogo(id, name, color, cls = '') {
  const s = document.createElement('span');
  s.className = `lt-mark${cls ? ` ${cls}` : ''}`;
  s.setAttribute('role', 'img');
  s.setAttribute('aria-label', name);
  const img = new Image();
  img.alt = '';
  img.decoding = 'async';
  img.onerror = () => s.replaceWith(initialTile(name, color, cls));
  img.src = `art/lotto/${id}.webp`;
  // In dark mode, no plate: its white-outlined version on the card (styles.css; lazy, so one loads).
  const dk = new Image();
  dk.alt = '';
  dk.className = 'dk';
  dk.loading = 'lazy';
  dk.decoding = 'async';
  dk.src = `art/lotto/${id}-dark.webp`;
  img.loading = 'lazy';
  s.append(img, dk);
  return s;
}
export function cardArt(id, name, color, cls = '') {
  const img = new Image();
  img.className = `sc-art${cls ? ` ${cls}` : ''}`;
  img.alt = name;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.onerror = () => img.replaceWith(initialTile(name, color, cls));
  img.src = `art/scratch/${id}.webp`;
  return img;
}
// ask()/tell() take a kit glyph's name as `icon`; given a node (a tile of its own) instead, the node goes in the icon's place.
export function kitDialog(call, opts, mark) {
  if (!(mark instanceof Node)) return call({ ...opts, icon: mark });
  const p = call({ ...opts, icon: '•' });
  const slot = [...document.querySelectorAll('dialog.q-ask .q-ask-icon')].pop();
  slot?.replaceChildren(mark);
  return p;
}
