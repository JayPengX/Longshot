# Working on Longshot

Read `docs/TRUTH.md` first (one page: how the owner works and what matters).
MAP.md is this repo's map (README.md is the short public front page).

- `npm test`, then `git push origin HEAD:main`.
- See it on a phone: `node tools/preview.mjs --both` (every tab, 320/390, light/dark, with its layout faults).
- Prices are the phone's, but the Worker checks every bet and is the only one paying out.
- Longshot is on its own: never import from, link to or depend on Orbit-Core or the Quadra/Orbit apps.
