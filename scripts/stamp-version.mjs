// Readies public/ for GitHub Pages (the deploy workflow only):
// - every script, module and stylesheet minified, and every reference to one
//   (import/from/src/href/new URL/importScripts) stamped with that file's own
//   content hash (scripts/hash.mjs): a deploy re-downloads only what changed;
// - the build's version in index.html (meta build-version) and version.json:
//   the page reloads itself onto a newer deploy (kit/core.mjs watchUpdates);
// - every module the page imports up front listed as modulepreload, so the
//   browser asks for them all at once instead of one import level at a time.
//
//   node scripts/stamp-version.mjs <version> [site folder]
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, dirname, relative, resolve } from 'node:path';
import { hashFiles } from './hash.mjs';

async function files(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await files(path)));
    else if (/\.(html|js|mjs|css)$/.test(entry.name)) out.push(path);
  }
  return out;
}

// './x.js', './kit/x.mjs', '../kit/x.mjs', './styles.css' inside
// import/from/src/href/new URL/importScripts, and a bare `import './x.mjs'`.
const LOCAL = /((?:from|import\(|\bimport|src=|href=|new URL\(|importScripts\()\s*['"])(\.{1,2}\/[^'"?]+\.(?:m?js|css))(['"])/g;
// The page's static import graph (read before minifying, as written).
const STATIC = /(?:^|[\s;])(?:import|export)\s[^'"]*?from\s*['"](\.{1,2}\/[^'"?]+)['"]|(?:^|[\s;])import\s*['"](\.{1,2}\/[^'"?]+)['"]/g;
async function graph(file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  const text = await readFile(file, 'utf8').catch(() => '');
  for (const m of text.matchAll(STATIC)) await graph(join(dirname(file), m[1] || m[2]), seen);
  return seen;
}

export async function stamp({ root, version, minify = true }) {
  if (!version) throw new Error('stamp: no version');
  root = resolve(root);
  const index = join(root, 'index.html');
  const indexHtml = await readFile(index, 'utf8');
  const entries = [...indexHtml.matchAll(/<script type="module" src="\.\/([^"?]+)"/g)].map(m => join(root, m[1]));
  const modules = new Set();
  for (const entry of entries) for (const f of await graph(entry)) if (!entries.includes(f)) modules.add(f);

  const texts = new Map();
  for (const path of await files(root)) texts.set(path, await readFile(path, 'utf8'));
  const refs = (text, path) =>
    [...text.matchAll(LOCAL)].map(m => ({ start: m.index, end: m.index + m[1].length + m[2].length, target: join(dirname(path), m[2]) }));
  // (index.html isn't minified, scripts/hash.mjs minifies only scripts and stylesheets.)
  const { files: stamped, hashes } = await hashFiles(texts, { refs, minify });
  for (const [path, text] of stamped) if (path !== index && text !== texts.get(path)) await writeFile(path, text);

  const preloads = [...modules]
    .filter(f => hashes.has(f))
    .map(f => `<link rel="modulepreload" href="./${relative(root, f)}?v=${hashes.get(f)}" />`)
    .join('\n');
  let page = stamped.get(index);
  page = page.replace('content="dev"', `content="${version}"`);
  if (preloads) page = page.replace('</head>', `${preloads}\n</head>`);
  await writeFile(index, page);
  await writeFile(join(root, 'version.json'), JSON.stringify({ version }) + '\n');
  return { files: hashes.size };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const version = process.argv[2];
  if (!version) throw new Error('usage: node scripts/stamp-version.mjs <version> [site folder]');
  const done = await stamp({ root: process.argv[3] || new URL('../public/', import.meta.url).pathname, version });
  console.log(`stamped ${done.files} files`);
}
