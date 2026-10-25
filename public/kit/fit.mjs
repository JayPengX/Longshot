// ---- kit/fit.mjs: one-line figures shrink to fit their box (no DOM work on import) ----
//
//   import { fitNumbers, watchFit } from './fit.mjs';  (core.mjs re-exports both)

// Big numbers never wrap: they shrink (to 60% at most) to fit their box.
// (All reset, then all measured, then all set: one layout, not one a
// number. Widths are fractional: whole pixels rounded a 64.4px number into
// a 64px box, which then showed 11,7… instead of shrinking. Text doesn't
// narrow exactly with its size, −NT$1,052 at 13.2px still 75.9px in a 75px
// box, so each one shrunk is checked again and stepped down until it fits.)
// `node.__fit` is the text it was last fitted for (watchFit).
const textWidth = node => {
  const range = document.createRange();
  range.selectNodeContents(node);
  return range.getBoundingClientRect().width;
};
export function fitNumbers(nodes) {
  const list = [...nodes];
  for (const node of list) {
    node.style.fontSize = '';
    node.__fit = node.textContent;
  }
  const sizes = list.map(node => {
    const box = node.getBoundingClientRect().width;
    const need = textWidth(node);
    if (!box || need <= box) return null;
    const full = parseFloat(getComputedStyle(node).fontSize);
    return Math.max(full * 0.6, Math.floor(((full * (box - 0.5)) / need) * 10) / 10);
  });
  list.forEach((node, i) => sizes[i] && (node.style.fontSize = `${sizes[i]}px`));
  list.forEach((node, i) => {
    if (!sizes[i]) return;
    const floor = sizes[i] * 0.85;
    for (let size = sizes[i]; size > floor && textWidth(node) > node.getBoundingClientRect().width - 0.5; ) node.style.fontSize = `${(size -= 0.4)}px`;
  });
}
// Keeps every `selector` number fitted: when its text changes (only those
// new or changed since they were last fitted: every one on every redraw was
// most of a tap's time), when its box resizes, and once the fonts load (a
// number fitted before its font came widens while its box doesn't move).
// `roots`: where to watch for redraws (the page by default).
export function watchFit(selector, { roots = null } = {}) {
  if (typeof ResizeObserver !== 'function' || typeof MutationObserver !== 'function' || typeof document === 'undefined') return () => {};
  const resized = new ResizeObserver(entries => fitNumbers(entries.map(e => e.target)));
  const seen = new WeakSet();
  const watch = new MutationObserver(() => {
    const nodes = [...document.querySelectorAll(selector)].filter(node => node.__fit !== node.textContent);
    for (const node of nodes) if (!seen.has(node)) (seen.add(node), resized.observe(node));
    if (nodes.length) fitNumbers(nodes);
  });
  for (const root of roots || [document.body]) if (root) watch.observe(root, { childList: true, subtree: true, characterData: true });
  const fonts = () => fitNumbers(document.querySelectorAll(selector));
  document.fonts?.addEventListener?.('loadingdone', fonts);
  return () => {
    watch.disconnect();
    resized.disconnect();
    document.fonts?.removeEventListener?.('loadingdone', fonts);
  };
}
