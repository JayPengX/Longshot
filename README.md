<p align="center">
  <img src="public/icons/icon-192.png" width="96" height="96" alt="">
</p>

<h1 align="center">Longshot</h1>

<p align="center">
  <b>A Taiwan sportsbook and lottery, on play money.</b><br>
  <a href="https://jaypengx.com/longshot/"><b>jaypengx.com/longshot</b></a>
</p>

<p align="center">
  <img alt="JavaScript" src="https://img.shields.io/badge/JavaScript-ES_modules-F7DF1E?logo=javascript&logoColor=000"> <img alt="PWA" src="https://img.shields.io/badge/PWA-works_offline-5A0FC8?logo=pwa&logoColor=fff"> <img alt="Cloudflare" src="https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=fff"> <img alt="GitHub" src="https://img.shields.io/badge/GitHub-Pages-24292F?logo=github&logoColor=fff"> <img alt="Tests" src="https://img.shields.io/badge/Tests-node_--test-339933?logo=nodedotjs&logoColor=fff">
</p>

A sportsbook priced and settled like a real one, Taiwan Lottery's games, and the real 台灣運彩 tickets you bought, followed live. Everything you bet here is play money: the house never loses on its own prices, and the numbers show it.

## What it does

- **Sportsbook:** winners, spreads, totals, players' markets and live betting across the major leagues, priced from bookmakers' lines.
- **The slip** follows 台灣運彩's own ticket rules: singles, parlays and systems.
- **Lottery:** the draw games and scratch cards, settled on the real results.
- **Your real tickets (注單):** add a 台灣運彩 ticket and watch each pick live.
- **真相:** the house's edge and your actual payback, in plain numbers.

## Stack

- Plain JavaScript (ES modules), HTML and CSS: no framework, no build step, no runtime dependencies.
- An installable phone web app (Add to Home Screen), cached by a service worker.
- Its own Cloudflare Worker places and settles every bet; its own account, the Longshot Pass. It shares nothing with the Orbit apps.
- Odds from ESPN (DraftKings' lines), Kambi and Polymarket, with the house's own model as a fallback.
- Hosted on GitHub Pages and served at jaypengx.com by a Cloudflare Worker; every push to `main` tests and deploys.

## For developers

```bash
npm test
```

How it works, file by file, and the decisions still in force: **[MAP.md](MAP.md)**.
