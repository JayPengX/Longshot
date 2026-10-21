// The 彩券 tab: Taiwan Lottery's computer-drawn games (lib/lottery.mjs) and
// scratch cards (lib/scratch.mjs), bought with the Quadra balance. Tickets
// live on the account next to the slips, settle against the real draws as
// they come out, and pay into the same pool.
import { GAMES, GAME_ORDER, gameName, nextDraw, quickPick, betCount, checkSelection, buyTicket, settleTicket, ticketPrize, upcoming, nextDraws, dueTickets, drawFor, latestResults, choose, addTickets } from './lib/lottery.mjs';
import { CARDS, CARD_ORDER, face, facePays, buyScratch, revealScratch, topPrize, onSale as cardOnSale } from './lib/scratch.mjs';
import { buyTickets, buyCard as sellCard, revealCard } from './lib/settled.mjs';
import { balance, newSlipId } from './lib/account.mjs';
import { compactMoney } from './home.js';
import { faceDrawer, ticketLook } from './scratch-face.js';
import { ask, tell } from '#kit/quadra.mjs';
import * as kitUI from '#kit/ui.mjs';
import { kitGlyph, kitDialog, gameLogo, cardArt } from './icons.js';
import { termLabel, termOf, nextTerm, cutoffAt, tierName, tierRule, digitRule, gameLimits, periodsFor, MAX_LINES, zoneMax, comboMax, isSystem, pendingPrize, winsText, jackpotOf, bySeries } from './lottery-labels.mjs';

// A card's name in its half-width card: in English, the short one (Daily Cash 539 and BINGO BINGO were cut off).
const CARD_EN = { daily539: 'Cash 539', bingo: 'BINGO' };
const cardName = (id, lang) => (lang === 'en' && CARD_EN[id]) || gameName(id, lang);
// (box 組彩 and pair 對彩 stay: retired in 2024, they name the tickets bought before.)
const T = {
  zh: {
    draws: '電腦彩券', scratch: '刮刮樂', mine: '我的彩券', nextDraw: '下一期', closeInMin: '{n} 分鐘後截止', closeInHour: '{h} 小時 {m} 分後截止', closeAt: '{when} 截止', jackpot: '頭獎累積', price: '每注', buy: '購買', cancel: '取消', buyAsk: '買 {n} 注，共 {v}？', buyAskBody: '{name}，開獎後自動對獎。', scratchAsk: '買一張「{name}」？', scratchAskBody: '{v}，買了馬上刮。', cost: '共', bets: '注', multiple: '倍數',
    quick: '電腦選號', clear: '清除', pickN: '選 {n} 個號碼', zone2: '第二區', straight: '正彩', box: '組彩', pair: '對彩', size: '玩法', combos: '{n} 組',
    stars: '星數', sizeTitle: '猜大小', parityTitle: '猜單雙', big: '大', small: '小', odd: '單', even: '雙', bullseye: '超級獎號', latest: '最近開獎', open: '待開獎', won: '中獎', lost: '未中獎',
    today: '今天', yesterday: '昨天', filterAll: '全部', filterWins: '只看中獎', noWins: '還沒有中獎', daySum: '花 {spent}', dayNone: '沒中獎', outWon: '中獎 {v}', outNone: '沒中獎', dayNet: '淨 {v}', earlier: '更早的 {n} 天', groupWon: '{n} 張中 {k} 張，共 {v}', groupLost: '{n} 注都沒中', cardsLost: '{n} 張都沒中',
    drawAt: '{when} 開獎', noTickets: '還沒有彩券', buyCard: '購買 {price}', scratchAll: '一次刮開', scratchHint: '刮開刮膜', zoomHint: '雙擊或兩指放大', youWon: '恭喜中獎！', noWin: '沒有中獎',
    top: '最高 {v}', winRateShort: '中獎率 {p}%', bought: '已購買', funds: '餘額不足', fundsBody: '需要 {v}', closed: '本期已截止', failed: '現在無法購買，稍後再試', retired: '已停售，本金退回', perBet: '{v} / 注', how: '玩法', winNumbers: '幸運號碼', yourNumbers: '您的號碼', dealer: '對手', you: '您', prizeCol: '獎金',
    called: '開出號碼', prizes: '獎項', unscratched: '未刮開', every5: '每 5 分鐘開獎', mult: '倍數 ×{m}', settled: '已開獎',
    quick1: '快選 1 注', quickN: '快選 {n} 注', addLine: '加入這注', lines: '已選 {n} 注', remove: '移除', buyAll: '購買 {n} 注 · {v}', boughtN: '已買 {n} 注，共 {v}', seeTickets: '看我的彩券', again: '再買', inMin: '{n} 分鐘後開獎', inHour: '{h} 小時 {m} 分後開獎', picked: '已選 {k}/{n}', starsN: '{n} 星', pickHint: '點下面的號碼，或用快選', slipN: '第 {n} 注', topPrize: '最高獎金', fillRest: '隨機補滿', addNext: '加入，選下一注', quickLines: '快選整注', clearAll: '全部清除', zone1: '第一區', bingoHint: '點 1–10 個號碼，或下面選大小單雙', lastLegend: '上期開出', anyPrize: '任一獎 1/{n}', odds: '機率', oneIn: '1/{n}', yourPick: '你的號碼', waiting: '等待開獎', drawnList: '已開獎', openSum: '{n} 張待開獎', wonSum: '累計中獎 {v}', basketHint: '可以一次買好幾注', sureTitle: '確定購買？', sureBody: '{what} · {v}', sureOk: '購買 {v}', special: '特', hitsN: '中 {n} 個',
    periods: '期數', periodsN: '{n} 期', buyAskP: '買 {n} 注 × {p} 期，共 {v}？', boughtNP: '已買 {n} 注 × {p} 期，共 {v}', betsP: '{n} 注 × {p} 期', drawsSpan: '{from} 至 {to}，共 {n} 期',
    pendingPay: '已開獎，等待派彩公告', system: '包牌', systemBets: '包牌 {n} 注', upTo: '包牌至 {n}', lastDraw: '上期開獎', bySize: '大小順序', byOrder: '開出順序', notPaidYet: '獎金尚未公告',
    seriesN: '多期 {k}/{n}', seriesLeft: '連續 {n} 期，還有 {k} 期待開獎', tooMany: '一次最多 {n} 注，請分次購買', perDraw: '{v} / 期', comboNote: '每期獎金以台灣彩券公告為準',
    strongman: '大力士分數', yourScores: '您的分數', yourDice: '您的骰子', theirDice: '對手的骰子', threeOf: '3個{s}', roundN: '第{n}局', pickNow: '去選號', inMinShort: '{n} 分後截止', inHourShort: '{h} 小時後截止',
    gameN: '遊戲{n}', thanks: '謝謝', zoneX: '獎金{x}倍區', countN: '{n}個', xN: '{x}倍', sumTo: '兩數相加為 {n}', luckyCode: '幸運密碼', yourCode: '您的密碼', hitsN: '對中{n}個', hitsSp: '{n}個＋特別號', linesN: '{n}條連線', goldNums: '金樂透號碼 ＋ 特別號', onePt: '1分區', tenPt: '10分區', ptsTotal: '對中總分數', ptsN: '{n}分', soldUntil: '{d}停售', allPrices: '全部'
  },
  en: {
    draws: 'Draw games', scratch: 'Scratch cards', mine: 'My tickets', nextDraw: 'Next draw', closeInMin: 'Closes in {n} min', closeInHour: 'Closes in {h}h {m}m', closeAt: 'Closes {when}', jackpot: 'Jackpot', price: 'A bet', buy: 'Buy', cancel: 'Cancel', buyAsk: 'Buy {n} for {v}?', buyAskBody: '{name}; checked by itself after the draw.', scratchAsk: 'Buy a {name} card?', scratchAskBody: '{v}; scratch it straight away.', cost: 'Total', bets: 'bets', multiple: 'Multiple',
    quick: 'Quick pick', clear: 'Clear', pickN: 'Pick {n} numbers', zone2: 'Zone 2', straight: 'Straight', box: 'Box', pair: 'Pair', size: 'Play', combos: '{n} combinations',
    stars: 'Stars', sizeTitle: 'Big/Small', parityTitle: 'Odd/Even', big: 'Big', small: 'Small', odd: 'Odd', even: 'Even', bullseye: 'Super number', latest: 'Latest draw', open: 'Awaiting draw', won: 'Won', lost: 'No win',
    today: 'Today', yesterday: 'Yesterday', filterAll: 'All', filterWins: 'Wins only', noWins: 'No wins yet', daySum: 'Spent {spent}', dayNone: 'No wins', outWon: 'Won {v}', outNone: 'No prize', dayNet: 'Net {v}', earlier: '{n} earlier days', groupWon: '{k} of {n} won, {v}', groupLost: 'No win on {n} bets', cardsLost: 'No win on {n} cards',
    drawAt: 'Draw {when}', noTickets: 'No tickets yet', buyCard: 'Buy {price}', scratchAll: 'Scratch all', scratchHint: 'Scratch the latex', zoomHint: 'Double-tap or pinch to zoom', youWon: 'You won!', noWin: 'No win this time',
    top: 'Top {v}', winRateShort: 'Wins {p}%', bought: 'Bought', funds: 'Not enough money', fundsBody: 'Needs {v}', closed: 'Sales closed', failed: 'Can’t buy right now. Try again soon.', retired: 'No longer sold: stake refunded', perBet: '{v} a bet', how: 'How to play', winNumbers: 'Lucky numbers', yourNumbers: 'Your numbers', dealer: 'Opponent', you: 'You', prizeCol: 'Prize',
    called: 'Called', prizes: 'Prizes', unscratched: 'Not scratched', every5: 'Every 5 minutes', mult: 'Multiplier ×{m}', settled: 'Drawn',
    quick1: 'Quick pick 1', quickN: 'Quick pick {n}', addLine: 'Add this bet', lines: '{n} bets chosen', remove: 'Remove', buyAll: 'Buy {n} · {v}', boughtN: 'Bought {n} bets, {v}', seeTickets: 'My tickets', again: 'Buy more', inMin: 'Draw in {n} min', inHour: 'Draw in {h}h {m}m', picked: '{k}/{n} picked', starsN: '{n} stars', pickHint: 'Tap numbers below, or quick pick', slipN: 'Bet {n}', topPrize: 'Top prize', fillRest: 'Fill the rest', addNext: 'Add, next bet', quickLines: 'Quick-pick bets', clearAll: 'Clear all', zone1: 'Zone 1', bingoHint: 'Tap 1–10 numbers, or pick big/small/odd/even below', lastLegend: 'In the last draw', anyPrize: 'Any prize 1 in {n}', odds: 'Odds', oneIn: '1 in {n}', yourPick: 'Your numbers', waiting: 'Awaiting the draw', drawnList: 'Drawn', openSum: '{n} awaiting a draw', wonSum: 'Won so far {v}', basketHint: 'Buy several at once', sureTitle: 'Buy this?', sureBody: '{what} · {v}', sureOk: 'Buy for {v}', special: 'SP', hitsN: '{n} hit',
    periods: 'Draws', periodsN: '{n}', buyAskP: 'Buy {n} × {p} draws for {v}?', boughtNP: 'Bought {n} bets × {p} draws, {v}', betsP: '{n} × {p} draws', drawsSpan: '{from} to {to}, {n} draws',
    pendingPay: 'Drawn: awaiting the prize announcement', system: 'System', systemBets: 'System: {n} bets', upTo: 'system to {n}', lastDraw: 'Last draw', bySize: 'In order of size', byOrder: 'In order drawn', notPaidYet: 'Prizes not announced yet',
    seriesN: 'Multi-draw {k}/{n}', seriesLeft: '{n} draws in a row, {k} still to come', tooMany: 'At most {n} bets at once: buy the rest after', perDraw: '{v} a draw', comboNote: 'Each draw pays as Taiwan Lottery announces',
    strongman: 'Strongman', yourScores: 'Your scores', yourDice: 'Your die', theirDice: 'Their die', threeOf: '3 × {s}', roundN: 'Round {n}', pickNow: 'Pick numbers', inMinShort: '{n} min left', inHourShort: '{h}h left',
    gameN: 'Game {n}', thanks: 'ZERO', zoneX: '{x}× zone', countN: '{n}', xN: '{x}×', sumTo: 'Two that add up to {n}', luckyCode: 'Lucky code', yourCode: 'Your code', hitsN: '{n} match', hitsSp: '{n} + special', linesN: '{n} lines', goldNums: 'Gold lotto + special', onePt: '1-point zone', tenPt: '10-point zone', ptsTotal: 'Points', ptsN: '{n} pts', soldUntil: 'Ends {d}', allPrices: 'All'
  }
};
const COMBO_NAME = { zh: { 2: '二合', 3: '三合', 4: '四合', 5: '五合' }, en: { 2: '2 numbers', 3: '3 numbers', 4: '4 numbers', 5: '5 numbers' } };

export function mountLottery(ctx) {
  const { state, el, fmtMoney } = ctx;
  const lang = state.locale === 'en' ? 'en' : 'zh';
  const t = (key, vars = {}) => String(T[lang][key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  const money = v => fmtMoney(v, { sign: false });
  const ui = { view: 'draws', latest: null, upcoming: null, settling: false, pending: new Set() };
  const box = () => document.getElementById('lottery-body');

  // The rest of the pool, which is below zero when other apps have spent
  // more than they have (money moved into Securities, say): never floored at
  // zero, or Play would sell tickets the pool can't pay for.
  const extra = (account = ctx.getAccount()) => ctx.funds(account) - balance(account);
  const timeText = ms => new Date(ms).toLocaleString(lang === 'en' ? 'en-US' : 'zh-TW', { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei' });

  // A random selection for a game (quick pick), in the picker's shape.
  function randomSel(id, like = null) {
    const g = GAMES[id];
    if (g.digits) return { digits: Array.from({ length: g.digits }, () => Math.floor(Math.random() * 10)), play: like?.play || 'straight' };
    if (g.combo) {
      const size = like?.size || 2;
      return { numbers: quickPick(size, g.combo.max), size };
    }
    if (id === 'bingo') return { numbers: quickPick(like?.numbers?.length || 5, 80) };
    return { zones: g.zones.map(z => quickPick(z.n, z.max)) };
  }
  const blankSel = id => {
    const g = GAMES[id];
    return g.digits ? { digits: Array(g.digits).fill(0), play: 'straight' } : g.combo ? { numbers: [], size: 2 } : id === 'bingo' ? { numbers: [] } : { zones: g.zones.map(() => []) };
  };
  // The countdown that matters is to when sales close ("週四 20:00 截止"),
  // not to the draw half an hour later; the draw's time goes beside it.
  function untilText(id, at) {
    const cut = cutoffAt(id, at);
    const ms = cut - Date.now();
    if (ms <= 0) return t('closed');
    const mins = Math.ceil(ms / 60_000);
    if (mins < 60) return t('closeInMin', { n: mins });
    if (mins < 24 * 60) return t('closeInHour', { h: Math.floor(mins / 60), m: mins % 60 });
    // Days away: the weekday and time only, short enough for a tile.
    const when = new Date(cut).toLocaleString(lang === 'en' ? 'en-US' : 'zh-TW', { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei' });
    return t('closeAt', { when });
  }
  const drawAt = at => t('drawAt', { when: timeText(at) });
  const drawTimeText = at => t('drawAt', { when: hourText(at) });
  // A drawn tick, the same in every theme (no font's ✓).
  const checkMark = () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M5 12.5l4.5 4.5L19 7.5');
    svg.append(path);
    return svg;
  };
  // The balls a selection makes.
  function selBalls(id, sel) {
    const g = GAMES[id];
    if (g.digits) return sel.digits.map(d => ball(d, '', true));
    if (sel.side) return [el('span', { class: 'q-chip small', text: t(sel.side) })];
    const main = sel.zones ? sel.zones[0] : sel.numbers;
    return [...main.map(n => ball(n)), ...(sel.zones?.[1] || []).map(n => ball(n, 'special'))];
  }
  // Every purchase asks first: a tile or button bought on one tap, and a
  // stray tap spent money.
  const confirmBuy = (mark, title, body) => kitDialog(ask, { lang, title, body, ok: t('buy'), cancel: t('cancel') }, mark);
  const tellK = (o, name) => kitDialog(tell, o, name);
  // Buys a list of selections, one ticket each; { bought, cost } or { error }.
  // Checked here first (the selection, the draw, the balance), then sold by
  // the Worker (lib/settled.mjs buyTickets: its draw, the cost from the
  // pass), and its tickets kept as they are.
  // 多期 (`periods` draws in a row): the kit and the Worker make a ticket a
  // draw (<id>, <id>-2 …).
  async function buyLines(id, lines, multiple, periods = 1) {
    let account = ctx.getAccount();
    const asked = [];
    for (const sel of lines.slice(0, MAX_LINES)) {
      const r = buyTicket(account, { id: newSlipId(), game: id, sel: structuredClone(sel), multiple, ...(periods > 1 && { periods }) }, new Date(), { extra: extra(account) });
      if (r.error) {
        if (!asked.length) return { error: r.error };
        break;
      }
      account = r.account;
      asked.push({ id: r.ticket.id, game: id, sel: r.ticket.sel, multiple: r.ticket.multiple, ...(periods > 1 && { periods }) });
    }
    const sold = await buyTickets(asked).catch(() => null);
    if (!sold?.tickets) return { error: sold?.refused ? (sold.refused.problem === 'funds' ? 'funds' : 'closed') : 'failed' };
    ctx.setWallet(sold.wallet);
    ctx.commitAccount(addTickets(ctx.getAccount(), sold.tickets));
    ctx.track([`lotto:${id}`], 1);
    ctx.syncNow();
    // Selections bought (a 多期 one once) and the draws each covers.
    const firsts = sold.tickets.filter(x => !x.series || x.series.n === 1);
    return { bought: firsts.length, periods: Math.max(1, ...sold.tickets.map(x => x.series?.of || 1)), cost: sold.tickets.reduce((s, x) => s + x.cost, 0), draws: firsts[0]?.series ? sold.tickets.filter(x => x.series?.id === firsts[0].series.id).map(x => x.draw) : [firsts[0]?.draw].filter(Boolean) };
  }

  // ---- Settling: every open ticket whose draw is out --------------------------------
  async function settleDue() {
    const account = ctx.getAccount();
    if (!account || ui.settling) return;
    // A game no longer sold has no draw: the Worker refunds its tickets.
    const due = dueTickets(account).filter(x => GAMES[x.game]);
    if (!due.length) return;
    ui.settling = true;
    try {
      let next = account;
      for (const ticket of due) {
        const draw = await drawFor(ticket.game, ticket.draw).catch(() => null);
        if (!draw) continue;
        // Drawn, but a pool or capped prize it won isn't announced yet: it
        // stays open (the kit's settleTicket leaves it) and says so.
        if (pendingPrize(ticket, draw)) {
          ui.pending.add(ticket.id);
          continue;
        }
        ui.pending.delete(ticket.id);
        next = withWins(settleTicket(next, ticket.id, draw), ticket, draw);
      }
      if (next !== account) {
        ctx.commitAccount(next);
        render();
      }
    } finally {
      ui.settling = false;
    }
  }
  // A 包牌 that won several bets keeps them by tier ({ tier, n }), for 「參獎 ×2 · 普獎 ×5」.
  function withWins(account, ticket, draw) {
    const settled = account.tickets?.find(x => x.id === ticket.id);
    if (settled?.status !== 'settled') return account;
    let wins = null;
    try {
      wins = ticketPrize(ticket, draw)?.wins;
    } catch {}
    if (!winsText(ticket.game, wins)) return account;
    return { ...account, tickets: account.tickets.map(x => (x.id === ticket.id ? { ...x, wins: wins.map(w => ({ tier: w.tier, n: w.n })) } : x)) };
  }
  setInterval(() => document.visibilityState === 'visible' && settleDue(), 60_000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && settleDue());

  // ---- The tab ---------------------------------------------------------------------
  // The biggest jackpot on now as the hero; the draw games as tiles (name,
  // prize, countdown: the rest is in each game's sheet); the scratch cards
  // as a rail; the tickets bought in 紀錄, a row away.
  // (Through Play's redraw: the art already shown is moved into the new
  // layout, not loaded again, so the tab doesn't flash every time it opens.)
  function render() {
    return ctx.redraw ? ctx.redraw(box(), draw) : draw();
  }
  function draw() {
    const root = box();
    if (!root || !ctx.getAccount()) return;
    loadFeeds();
    settleDue();
    const jackpots = GAME_ORDER.map(id => ({ id, jp: jackpotOf(ui.upcoming?.[id], GAMES[id].of ? null : latestOf(id), lang) })).filter(x => x.jp && nextDraw(x.id));
    const lead = jackpots.sort((a, b) => b.jp.amount - a.jp.amount)[0];
    const leadId = lead?.id ?? GAME_ORDER[0];
    const leadDraw = nextDraw(leadId);
    const hero = el('button', { class: 'q-hero-card q-press lt-hero', type: 'button', style: `--q-hc-b:${GAMES[leadId].color}`, onclick: () => openGame(leadId) }, [
      el('span', { class: 'q-hc-eyebrow' }, [gameLogo(leadId, gameName(leadId, lang), GAMES[leadId].color, 'lt-mark-hero'), lang === 'en' ? el('span', { text: gameName(leadId, lang) }) : null].filter(Boolean)),
      el('strong', { class: 'q-hc-big num lt-hero-big', text: lead ? compactMoney(lead.jp.amount, lang) : topPrizeText(leadId) }),
      el('span', { class: 'q-hc-sub', text: [lead ? t('jackpot') : t('topPrize'), leadDraw ? shortUntil(leadId, leadDraw.at) : t('closed')].join(' · ') }),
      el('span', { class: 'q-hc-row' }, [el('span', { class: 'q-hc-btn', text: t('pickNow') })])
    ]);
    const open = (ctx.getAccount().tickets || []).filter(x => x.card && x.status === 'open');
    const section = (title, body) => el('section', { class: 'q-section' }, [el('div', { class: 'q-section-head' }, [el('h2', { text: title })]), body]);
    root.replaceChildren(
      hero,
      section(t('draws'), drawGames(leadId)),
      section(t('scratch'), el('div', {}, [
        open.length ? el('div', { class: 'q-rowcard lt-open' }, open.map(x => el('button', { class: 'q-ritem chevron', type: 'button', onclick: () => openScratch(x.id) }, [cardArt(x.card, CARDS[x.card][lang], CARDS[x.card].color, 'sc-thumb'), el('span', { class: 'q-ritem-text' }, [el('span', { class: 'q-ritem-title q-fit-wrap', text: CARDS[x.card][lang] })]), el('span', { class: 'q-tag orange', text: t('unscratched') })]))) : null,
        scratchCards()
      ])),
      el('div', { class: 'q-rowcard lt-mine' }, [
        el('button', { class: 'q-ritem chevron', type: 'button', onclick: () => ctx.showTickets() }, [el('span', { class: 'q-tile', style: '--t:var(--q-indigo)', 'aria-hidden': 'true' }, [kitGlyph(kitUI, 'ticket')]), el('span', { class: 'q-ritem-text' }, [el('span', { class: 'q-ritem-title q-fit-wrap', text: t('mine') })])])
      ])
    );
  }

  // The latest results and the next draws' advertised jackpots, fetched once; `done` counts the answers.
  // The proxy's board carries the next draws and the jackpots carried over (all home's card reads):
  // with it, opening the app makes no direct call to Taiwan Lottery; the draws' own numbers are read when the 彩券 tab is on screen.
  function seedFromBoard() {
    const lottery = ctx.boardLottery?.();
    if (!lottery?.upcoming || !lottery?.latest) return false;
    if (!ui.upcoming) ui.upcoming = lottery.upcoming;
    ui.boardLatest = lottery.latest;
    ui.done = Math.max(ui.done || 0, 2);
    return true;
  }
  // A game's last draw (its numbers, once read) or, until then, the board's jackpot carried over.
  const latestOf = id => ui.latest?.[id] ?? ui.boardLatest?.[id];
  function loadFeeds() {
    if (seedFromBoard() && ctx.state.tab !== 'lottery' && !ui.latest) return;
    if (!ui.latest) {
      ui.latest = {};
      latestResults()
        .then(r => (ui.latest = r))
        .catch(() => {})
        .finally(() => (ui.done = (ui.done || 0) + 1, render(), ctx.redrawHome?.()));
    }
    // The next draws as Taiwan Lottery shows them: 期別 and the 頭獎 it advertises.
    if (!ui.upcoming) {
      ui.upcoming = {};
      upcoming()
        .then(r => (ui.upcoming = r || {}))
        .catch(() => {})
        .finally(() => (ui.done = (ui.done || 0) + 1, render(), ctx.redrawHome?.()));
    }
  }
  // Home's 彩券 card: the biggest jackpot and the next two games; null until the feeds have answered.
  function homeLead() {
    loadFeeds();
    if ((ui.done || 0) < 2) return null;
    const row = id => {
      const jp = jackpotOf(ui.upcoming?.[id], GAMES[id].of ? null : latestOf(id), lang);
      const d = nextDraw(id);
      return { id, jp, name: cardName(id, lang), color: GAMES[id].color, amount: jp ? compactMoney(jp.amount, lang) : topPrizeText(id), untilText: id === 'bingo' ? t('every5') : d ? shortUntil(id, d.at) : t('closed') };
    };
    const ranked = GAME_ORDER.filter(id => nextDraw(id)).map(row).sort((a, b) => (b.jp?.amount || 0) - (a.jp?.amount || 0));
    return ranked.length ? { ...ranked[0], label: ranked[0].jp ? t('jackpot') : t('topPrize'), others: ranked.slice(1, 3) } : null;
  }
  // A tile a game: its logo (and its name, in English), its prize big, and one short countdown.
  function drawGames(leadId) {
    return el(
      'div',
      { class: 'lt-grid' },
      GAME_ORDER.filter(id => id !== leadId).map(id => {
        const g = GAMES[id];
        const d = nextDraw(id);
        const jp = jackpotOf(ui.upcoming?.[id], g.of ? null : latestOf(g.of || id), lang);
        return el('button', { class: 'lt-tile q-press', type: 'button', style: `--lotto:${g.color}`, onclick: () => openGame(id) }, [
          ...gameMark(id, cardName(id, lang), g.color),
          el('strong', { class: 'lt-big num', text: jp ? compactMoney(jp.amount, lang) : topPrizeText(id) }),
          el('small', { class: 'lt-when', text: id === 'bingo' ? t('every5') : d ? shortUntil(id, d.at) : t('closed') })
        ]);
      })
    );
  }
  // A tile's head: the game's own logo; in English its name under it too (the logos are in Chinese).
  function gameMark(id, name, color) {
    return [gameLogo(id, name, color, 'lt-logo'), lang === 'en' ? el('span', { class: 'lt-en', text: name }) : null].filter(Boolean);
  }
  // When sales close, as short as it goes: 25 分 · 3 小時 · 週四 20:00.
  function shortUntil(id, at) {
    const ms = cutoffAt(id, at) - Date.now();
    if (ms <= 0) return t('closed');
    const mins = Math.ceil(ms / 60_000);
    if (mins < 60) return t('inMinShort', { n: mins });
    if (mins < 24 * 60) return t('inHourShort', { h: Math.floor(mins / 60) });
    return t('closeAt', { when: new Date(cutoffAt(id, at)).toLocaleString(lang === 'en' ? 'en-US' : 'zh-TW', { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei' }) });
  }

  // ---- A game's sheet: pick and buy ---------------------------------------------------
  function openGame(id) {
    const g = GAMES[id];
    const st = { sel: blankSel(id), lines: [], multiple: 1, periods: 1, msg: '', done: null };
    // 倍數 and 多期 as this game takes them (none: no control).
    const lim = gameLimits(id);
    const box = el('div', { class: 'lotto-body' });
    const sheet = kitUI.sheet({ title: gameName(id, lang), body: [box], cls: 'lotto-sheet', detent: 'large', closeLabel: lang === 'en' ? 'Close' : '關閉', onClose: () => render() });
    sheet.el.style.setProperty('--lotto', g.color);
    const close = () => sheet.close();
    const fill = (...kids) => box.replaceChildren(...kids.filter(Boolean));
    const paint = () => {
      const check = checkSelection(id, st.sel);
      const d = nextDraw(id);
      // What 購買 buys: every pick added, and the one on the slip once it's complete.
      const lines = [...st.lines, ...(check.ok ? [st.sel] : [])];
      const bets = lines.reduce((s, x) => s + betCount(id, x), 0);
      st.multiple = Math.min(st.multiple, lim.multiple);
      // 多期: every selection a ticket a draw, within what one sale takes.
      const maxPeriods = periodsFor(id, lines.length);
      st.periods = Math.min(st.periods, maxPeriods);
      const cost = bets * g.price * st.multiple * st.periods;
      const tooMany = lines.length > MAX_LINES;
      if (st.done)
        return fill(
          // Bought: the tickets as they were picked, when they're drawn, and the two ways on.
          el('div', { class: 'lotto-bought' }, [
            el('div', { class: 'lotto-bought-mark', 'aria-hidden': 'true' }, [checkMark()]),
            el('strong', { class: 'lotto-bought-title', text: st.done.periods > 1 ? t('boughtNP', { n: st.done.bought, p: st.done.periods, v: money(st.done.cost) }) : t('boughtN', { n: st.done.bought, v: money(st.done.cost) }) }),
            el('span', { class: 'lotto-bought-when', text: st.done.draws?.length > 1 ? spanText(st.done.draws) : st.done.draws?.[0] ? drawAt(st.done.draws[0].at) : d ? drawAt(d.at) : '' }),
            st.done.lines?.length
              ? el('div', { class: 'lotto-bought-lines' }, [
                  ...st.done.lines.slice(0, 4).map((sel, i) => el('div', { class: 'lotto-bought-line' }, [el('small', { text: t('slipN', { n: i + 1 }) }), el('div', { class: 'balls' }, selBalls(id, sel))])),
                  st.done.lines.length > 4 ? el('small', { class: 'muted', text: `+${st.done.lines.length - 4}` }) : null
                ].filter(Boolean))
              : null,
            el('div', { class: 'lotto-bought-actions' }, [
              el('button', { class: 'q-btn', type: 'button', text: t('seeTickets'), onclick: () => (close(), ctx.showTickets()) }),
              el('button', { class: 'q-btn primary', type: 'button', text: t('again'), onclick: () => ((st.done = null), paint()) })
            ])
          ])
        );
      // The slip being filled: its slots, what's left, and the ways to finish it.
      const complete = check.ok;
      const addNow = () => ((st.lines = [...st.lines, structuredClone(st.sel)]), (st.sel = blankSel(id)), paint());
      const status = pickStatus(id, st.sel);
      const latest = ui.latest?.[g.of || id];
      const jp = jackpotOf(ui.upcoming?.[id], g.of ? null : latest, lang);
      // The next draw's 期別: Taiwan Lottery's own, else counted on from the latest.
      const up = ui.upcoming?.[id];
      const term = d ? termLabel((up?.date === d.date && up?.period) || nextTerm(id, d, latest), lang) : '';
      // The draws a 多期 buys.
      const draws = st.periods > 1 ? nextDraws(id, Date.now(), st.periods) : [];
      const stepper = (label, value, dec, inc, canDec, canInc) =>
        el('div', { class: 'stepper small', role: 'group', 'aria-label': label }, [
          el('button', { type: 'button', text: '−', 'aria-label': `${label} −`, disabled: canDec ? null : '', onclick: dec }),
          el('span', { class: 'ls-mult' }, [el('small', { text: label }), el('strong', { class: 'num', text: value })]),
          el('button', { type: 'button', text: '+', 'aria-label': `${label} +`, disabled: canInc ? null : '', onclick: inc })
        ]);
      const opts = [
        lim.multiple > 1 ? stepper(t('multiple'), `×${st.multiple}`, () => ((st.multiple = Math.max(1, st.multiple - 1)), paint()), () => ((st.multiple = Math.min(lim.multiple, st.multiple + 1)), paint()), st.multiple > 1, st.multiple < lim.multiple) : null,
        lim.periods > 1 ? stepper(t('periods'), t('periodsN', { n: st.periods }), () => ((st.periods = Math.max(1, st.periods - 1)), paint()), () => ((st.periods = Math.min(maxPeriods, st.periods + 1)), paint()), st.periods > 1, st.periods < maxPeriods) : null
      ].filter(Boolean);
      const buy = async () => {
              const ask = st.periods > 1 ? t('buyAskP', { n: bets, p: st.periods, v: money(cost) }) : t('buyAsk', { n: bets, v: money(cost) });
              if (!(await confirmBuy(gameLogo(id, GAMES[id][lang], GAMES[id].color, 'lt-mark-ask'), ask, t('buyAskBody', { name: GAMES[id][lang] || '' })))) return;
              const r = await buyLines(id, lines, st.multiple, st.periods);
              if (r.error) return void ((st.msg = t(r.error === 'funds' ? 'funds' : r.error === 'failed' ? 'failed' : 'closed')), paint());
              st.done = { ...r, lines: lines.slice(0, r.bought).map(x => structuredClone(x)) };
              st.lines = [];
              st.sel = blankSel(id);
              st.msg = '';
              paint();
            };
      fill(
        // sheetHero: the game's logo, the jackpot big, the cutoff in one line, price and draw time as tags.
        kitUI.sheetHero({ logo: gameLogo(id, g[lang], g.color, 'lt-mark-hero'), eyebrow: jp ? jp.label : t('topPrize'), big: jp ? compactMoney(jp.amount, lang) : topPrizeText(id), sub: d ? [term, untilText(id, d.at)].filter(Boolean).join(' · ') : t('closed'), tint: g.color, tags: [t('perBet', { v: money(g.price) }), d ? drawTimeText(d.at) : null].filter(Boolean) }),
        el('section', { class: `ls-slip${complete ? ' done' : ''}` }, [
          el('div', { class: 'ls-slip-head' }, [el('strong', { text: t('slipN', { n: st.lines.length + 1 }) }), el('span', { class: 'ls-status', text: status })]),
          // 3/4星彩: the steppers below are the slip's digits already.
          g.digits ? null : el('div', { class: 'ls-slots' }, slots(id, st.sel, paint)),
          el('div', { class: 'ls-actions' }, [
            el('button', { class: 'q-chip ls-fill', type: 'button', onclick: () => ((st.sel = fillRest(id, st.sel)), paint()) }, [kitGlyph(kitUI, 'spark'), el('span', { text: t('fillRest') })]),
            el('button', { class: 'q-chip', type: 'button', text: t('clear'), disabled: pickCount(id, st.sel) ? null : '', onclick: () => ((st.sel = blankSel(id)), paint()) }),
            complete ? el('button', { class: 'ls-add', type: 'button', onclick: addNow }, [kitGlyph(kitUI, 'check'), el('span', { text: t('addNext') })]) : null
          ])
        ]),
        picker(id, st, paint),
        el('div', { class: 'ls-quick' }, [
          el('span', { text: t('quickLines') }),
          ...[1, 5, 10].map(n => el('button', { class: 'q-chip', type: 'button', text: `+${n}`, onclick: () => ((st.lines = [...st.lines, ...Array.from({ length: n }, () => randomSel(id, st.sel))]), paint()) }))
        ]),
        st.lines.length
          ? el('div', { class: 'lotto-lines' }, [
              el('div', { class: 'ls-lines-head' }, [el('p', { class: 'lotto-h', text: t('lines', { n: st.lines.length }) }), el('button', { class: 'ls-clear-all', type: 'button', text: t('clearAll'), onclick: () => ((st.lines = []), paint()) })]),
              ...st.lines.map((x, i) => el('div', { class: 'lotto-line' }, [el('span', { class: 'num line-n', text: String(i + 1) }), el('div', { class: 'balls' }, [...selBalls(id, x), isSystem(id, x) ? el('span', { class: 'q-chip small', text: t('systemBets', { n: betCount(id, x) }) }) : null].filter(Boolean)), el('button', { class: 'icon-x', type: 'button', 'aria-label': t('remove'), text: '×', onclick: () => ((st.lines = st.lines.filter((_, j) => j !== i)), paint()) })]))
            ])
          : null,
        prizeTable(id, st.sel),
        lastDraw(id),
        tooMany ? el('p', { class: 'lotto-msg', role: 'status', text: t('tooMany', { n: MAX_LINES }) }) : null,
        st.msg ? el('p', { class: 'lotto-msg', role: 'status', text: st.msg }) : null,
        // sheetFoot: the total and the buy button, sticky.
        el('div', { class: 'ls-footwrap' }, [
          opts.length ? el('div', { class: 'ls-opts' }, opts) : null,
          draws.length > 1 ? el('small', { class: 'ls-draws', text: spanText(draws) }) : null,
          kitUI.sheetFoot({ summary: { small: st.periods > 1 ? t('betsP', { n: bets, p: st.periods }) : `${bets} ${lang === 'en' && bets === 1 ? 'bet' : t('bets')}`, big: money(cost) }, button: { label: t('buy'), disabled: !(bets && d && !tooMany), onClick: buy } })
        ].filter(Boolean))
      );
    };
    paint();
  }

  // 「10/20（週一） 至 11/13（週四），共 8 期」: the draws a 多期 ticket covers.
  function spanText(draws) {
    const day = at => new Date(at).toLocaleDateString(lang === 'en' ? 'en-US' : 'zh-TW', { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'Asia/Taipei' });
    const [a, b] = [draws[0].at, draws.at(-1).at];
    // (BINGO's run every 5 minutes: the times, the day once when it's one.)
    if (draws[0]?.slot != null) return t('drawsSpan', { from: `${day(a)} ${hourText(a)}`, to: day(a) === day(b) ? hourText(b) : `${day(b)} ${hourText(b)}`, n: draws.length });
    return t('drawsSpan', { from: day(a), to: day(b), n: draws.length });
  }
  // The latest draw, as the results page prints it: 大小順序, and 開出順序
  // when the kit keeps it (its `order`); its prizes not out yet, said so.
  function lastDraw(id) {
    const g = GAMES[id];
    const r = ui.latest?.[g.of || id];
    const nums = r?.digits || r?.numbers;
    if (!nums?.length) return null;
    const digit = Boolean(r.digits);
    const second = r.special != null && Number.isFinite(r.special) ? r.special : r.zone2 != null && Number.isFinite(r.zone2) ? r.zone2 : null;
    const head = [termLabel(termOf(r), lang), String(r.date || '').slice(5).replace('-', '/')].filter(Boolean).join(' · ');
    const row = (label, list) => el('div', { class: 'ls-last-row' }, [el('small', { text: label }), kitUI.ballRow(list.map(n => (digit ? String(n) : String(n).padStart(2, '0'))), { special: second != null ? [String(second).padStart(2, '0')] : [] })]);
    return el('section', { class: 'ls-last' }, [
      el('p', { class: 'lotto-h' }, [document.createTextNode(t('lastDraw')), head ? el('small', { text: ` ${head}` }) : null].filter(Boolean)),
      digit ? el('div', { class: 'balls mini' }, nums.map(n => ball(n, '', true))) : row(t('bySize'), nums),
      !digit && r.order?.length ? row(t('byOrder'), r.order) : null,
      r.paid === false && !g.digits && !g.combo ? el('small', { class: 'muted', text: t('notPaidYet') }) : null
    ]);
  }
  // A game's biggest fixed prize, for the sheet's header when there's no jackpot.
  function topPrizeText(id) {
    const g = GAMES[id];
    const prizes = [...(g.tiers || []).map(x => x.prize || 0), ...Object.values(g.mirror || {}), ...Object.values(g.combo?.sizes || {}), ...Object.values(g.plays || {}).flatMap(p => (p.prize ? [p.prize] : Object.values(p.prizes || {})))];
    // BINGO pays multiples of its stake (10 stars all hit: ×200,000).
    const stars = Object.values(g.stars || {}).flatMap(s => Object.values(s)).map(x => x * g.price);
    const top = Math.max(0, ...prizes, ...stars);
    return top ? compactMoney(top, lang) : money(g.price);
  }
  // How many numbers the selection holds (every zone), and what's left.
  function pickCount(id, sel) {
    const g = GAMES[id];
    if (g.digits) return g.digits;
    if (sel.side) return 1;
    return (sel.zones ? sel.zones.flat() : sel.numbers).length;
  }
  function pickStatus(id, sel) {
    const g = GAMES[id];
    if (g.digits) return t(sel.play);
    if (g.combo) return `${COMBO_NAME[lang][sel.size]} · ${t('picked', { k: sel.numbers.length, n: `${sel.size}–${comboMax(g)}` })} · ${t('combos', { n: sel.numbers.length >= sel.size ? choose(sel.numbers.length, sel.size) : 0 })}`;
    if (id === 'bingo') return sel.side ? t(sel.side) : t('starsN', { n: sel.numbers.length });
    // A 包牌 (more numbers than a bet takes): every bet it makes counted.
    if (isSystem(id, sel) && checkSelection(id, sel).ok) return t('systemBets', { n: betCount(id, sel) });
    return g.zones.map((z, i) => `${i ? `${t('zone2')} ` : ''}${sel.zones[i].length}/${z.n}`).join(' · ');
  }
  // The rest of the selection at random, keeping what's picked.
  const topUp = (have, n, max) => {
    const out = new Set(have);
    while (out.size < n) out.add(1 + Math.floor(Math.random() * max));
    return [...out].sort((a, b) => a - b);
  };
  function fillRest(id, sel) {
    const g = GAMES[id];
    if (g.digits) return { ...sel, digits: sel.digits.map(() => Math.floor(Math.random() * 10)) };
    if (g.combo) return { ...sel, numbers: topUp(sel.numbers, Math.max(sel.size, sel.numbers.length), g.combo.max) };
    if (id === 'bingo') return { numbers: topUp(sel.side ? [] : sel.numbers, Math.max(5, sel.side ? 0 : sel.numbers.length), 80) };
    return { zones: g.zones.map((z, i) => topUp(sel.zones[i], z.n, z.max)) };
  }
  // The slip's slots: each number picked (tap to take it back) and each still
  // to pick as an empty circle; the second zone in the game's colour.
  function slots(id, sel, paint) {
    const g = GAMES[id];
    const take = (list, n) => () => (list.splice(list.indexOf(n), 1), paint());
    const filled = (n, list, cls = '') => el('button', { class: `ls-slot on ${cls}`, type: 'button', 'aria-label': `${t('remove')} ${n}`, text: String(n).padStart(2, '0'), onclick: take(list, n) });
    const empty = (cls = '') => el('span', { class: `ls-slot ${cls}`, 'aria-hidden': 'true' });
    if (g.digits) return sel.digits.map(dg => el('span', { class: 'ls-slot on digit', text: String(dg) }));
    if (sel.side) return [el('span', { class: 'ls-slot on wide', text: t(sel.side) })];
    if (g.combo) return [...sel.numbers.map(n => filled(n, sel.numbers)), ...Array.from({ length: Math.max(0, sel.size - sel.numbers.length) }, () => empty())];
    if (id === 'bingo') return sel.numbers.length ? sel.numbers.map(n => filled(n, sel.numbers)) : [el('span', { class: 'ls-hint', text: t('bingoHint') })];
    return g.zones.flatMap((z, i) => [
      ...(i ? [el('span', { class: 'ls-plus', 'aria-hidden': 'true', text: '+' })] : []),
      ...sel.zones[i].map(n => filled(n, sel.zones[i], i ? 'special' : '')),
      ...Array.from({ length: Math.max(0, z.n - sel.zones[i].length) }, () => empty(i ? 'special' : ''))
    ]);
  }

  // A number two digits (06); a 3星彩 or 4星彩 digit as itself (6: its draw
  // read 06 01 01).
  const ball = (n, cls = '', digit = false) => el('span', { class: `ball ${cls}`, text: digit ? String(n) : String(n).padStart(2, '0') });

  // A slip's grid: ten numbers a row like the real slip (eight for a second
  // zone), the last draw's numbers marked with a dot. A zone of one bet's
  // numbers replaces its oldest pick when another is tapped; one that takes a
  // 包牌 (`limit` past `bet`) takes numbers up to its most, then no more.
  function numberGrid(max, chosen, limit, onPick, { hits = [], last = [], cols = 10, bet = limit } = {}) {
    return el(
      'div',
      { class: 'num-grid' },
      Array.from({ length: max }, (_, i) => {
        const n = i + 1;
        const on = chosen.includes(n);
        return el('button', {
          type: 'button',
          class: `num-cell${on ? ' on' : ''}${hits.includes(n) ? ' hit' : ''}${last.includes(n) ? ' last' : ''}`,
          'aria-pressed': String(on),
          text: String(n).padStart(2, '0'),
          onclick: () => {
            if (on) chosen.splice(chosen.indexOf(n), 1);
            else {
              if (chosen.length >= limit) {
                if (limit > bet) return;
                chosen.shift();
              }
              chosen.push(n);
            }
            chosen.sort((a, b) => a - b);
            onPick();
          }
        });
      })
    );
  }
  // The last draw's numbers (by zone, or all together), to mark on the grid.
  function lastOf(id, byZone = false) {
    const r = ui.latest?.[GAMES[id].of || id];
    if (!r?.numbers) return [];
    return byZone ? [r.numbers, r.special != null ? [r.special] : r.zone2 != null ? [r.zone2] : []] : r.numbers;
  }

  // What the dot on a number means: always drawn under a grid, with a last draw or without one.
  const lastLegend = () => el('p', { class: 'ls-legend' }, [el('span', { class: 'ls-dot', 'aria-hidden': 'true' }), document.createTextNode(t('lastLegend'))]);

  function picker(id, st, paint) {
    const g = GAMES[id];
    const sel = st.sel;
    if (g.digits) {
      const plays = Object.keys(g.plays);
      return el('div', { class: 'lotto-pick' }, [
        // One play (3星彩 and 4星彩 since 2024): nothing to choose.
        plays.length > 1 ? el('div', { class: 'q-seg small', role: 'group' }, plays.map(p => el('button', { type: 'button', 'aria-pressed': String(sel.play === p), text: playName(g, p), onclick: () => ((sel.play = p), paint()) }))) : null,
        el(
          'div',
          { class: 'digit-row' },
          sel.digits.map((d, i) =>
            el('div', { class: 'digit' }, [
              el('button', { type: 'button', text: '▲', 'aria-label': '+', onclick: () => ((sel.digits[i] = (d + 1) % 10), paint()) }),
              el('strong', { class: 'num', text: String(d) }),
              el('button', { type: 'button', text: '▼', 'aria-label': '−', onclick: () => ((sel.digits[i] = (d + 9) % 10), paint()) })
            ])
          )
        )
      ]);
    }
    if (g.combo) {
      const sizes = Object.keys(g.combo.sizes).map(Number);
      return el('div', { class: 'lotto-pick' }, [
        el('div', { class: 'q-seg small', role: 'group' }, sizes.map(z => el('button', { type: 'button', 'aria-pressed': String(sel.size === z), text: COMBO_NAME[lang][z], onclick: () => ((sel.size = z), paint()) }))),
        numberGrid(g.combo.max, sel.numbers, comboMax(g), paint, { last: lastOf(id), bet: sel.size }),
        lastLegend()
      ]);
    }
    if (id === 'bingo') {
      const sideChips = keys => el('div', { class: 'lotto-sides' }, keys.map(key => el('button', { type: 'button', class: `q-chip${sel.side === key ? ' on' : ''}`, 'aria-pressed': String(sel.side === key), text: t(key), onclick: () => ((sel.side = sel.side === key ? undefined : key), (sel.numbers = []), paint()) })));
      return el('div', { class: 'lotto-pick' }, [
        numberGrid(80, sel.numbers, 10, () => ((sel.side = undefined), paint()), { last: lastOf(id) }),
        lastLegend(),
        el('div', { class: 'lotto-side-group' }, [el('p', { class: 'lotto-h', text: t('sizeTitle') }), sideChips(['big', 'small'])]),
        el('div', { class: 'lotto-side-group' }, [el('p', { class: 'lotto-h', text: t('parityTitle') }), sideChips(['odd', 'even'])])
      ]);
    }
    const last = lastOf(id, true);
    return el('div', { class: 'lotto-pick' }, [
      ...g.zones.flatMap((z, i) => [
        el('p', { class: `ls-zone${sel.zones[i].length >= z.n ? ' full' : ''}` }, [
          el('strong', { text: i ? t('zone2') : t('zone1') }),
          // 「選 6 個號碼 · 包牌至 16 · 3/6」, then once past 6 「包牌 8/16」.
          el('span', { text: sel.zones[i].length > z.n ? `${t('system')} ${sel.zones[i].length}/${zoneMax(z)}` : [lang === 'en' && z.n === 1 ? 'Pick 1 number' : t('pickN', { n: z.n }), zoneMax(z) > z.n ? t('upTo', { n: zoneMax(z) }) : '', `${sel.zones[i].length}/${z.n}`].filter(Boolean).join(' · ') })
        ]),
        numberGrid(z.max, sel.zones[i], zoneMax(z), paint, { last: last[i] || [], cols: z.max <= 8 ? z.max : 10, bet: z.n })
      ]),
      lastLegend()
    ]);
  }

  function prizeTable(id, sel) {
    const g = GAMES[id];
    let rows = [];
    if (g.tiers)
      rows = g.tiers.map(x => [
        x[lang === 'en' ? 'en' : 'zh'],
        g.digits ? digitRule(x, lang) : tierRule(x, lang),
        x.prize ? money(x.prize) : lang === 'en' ? 'Pool' : '獎金池'
      ]);
    else if (g.mirror) rows = Object.entries(g.mirror).sort((a, b) => b[0] - a[0]).map(([k, v]) => [`${k} / ${12 - k}`, '', money(v)]);
    else if (g.digits) rows = Object.entries(g.plays).map(([k, p]) => [playName(g, k), '', p.prize ? money(p.prize) : Object.entries(p.prizes).map(([w, v]) => `${w}${lang === 'en' ? ' ways' : '組'} ${money(v)}`).join(' · ')]);
    else if (g.combo) rows = Object.entries(g.combo.sizes).map(([k, v]) => [COMBO_NAME[lang][k], '', money(v)]);
    else if (id === 'bingo') {
      const n = sel.numbers?.length || 5;
      rows = Object.entries(g.stars[n] || {}).sort((a, b) => b[0] - a[0]).map(([h, m]) => [`${n}${lang === 'en' ? ' stars' : '星'}`, t('hitsN', { n: h }), money(m * g.price)]);
    }
    if (!rows.length) return null;
    return el('details', { class: 'lotto-prizes' }, [
      el('summary', { text: t('prizes') }),
      el('table', {}, [el('tr', { class: 'lp-head' }, [el('th', { text: '' }), el('th', { text: '' }), el('th', { text: t('prizes') })]), ...rows.map(r => el('tr', {}, r.map(c => el('td', { text: c }))))]),
      // 樂合彩 settled from the draw's own prizes (the kit reads them since 2026-10).
      g.combo && g.api?.assign ? el('small', { class: 'muted', text: t('comboNote') }) : null
    ].filter(Boolean));
  }

  // ---- Scratch cards --------------------------------------------------------------------
  // On sale, cheapest first: a card each (its picture, name, top prize, price).
  // How it plays is on the card itself once bought.
  // On sale, by price (chips for each price), the newest first: a card each
  // (its picture, name, top prize, price; its last day when that's close).
  let shelfPrice = 0;
  function scratchCards() {
    const all = onSale();
    const prices = [...new Set(all.map(id => CARDS[id].price))];
    const list = all.filter(id => !shelfPrice || CARDS[id].price === shelfPrice);
    const soon = id => {
      const u = CARDS[id].until && new Date(`${CARDS[id].until}T17:00:00+08:00`);
      return u && u - Date.now() < 14 * 864e5 ? t('soldUntil', { d: `${u.getMonth() + 1}/${u.getDate()}` }) : null;
    };
    let shelf = null;
    const draw = () => shelf.replaceWith(scratchCards());
    const chips = el('div', { class: 'q-chips sc-prices' }, [0, ...prices].map(p => el('button', { class: 'q-chip', type: 'button', 'aria-pressed': String(p === shelfPrice), text: p ? money(p) : t('allPrices'), onclick: () => ((shelfPrice = p), draw()) })));
    shelf = el('div', { class: 'sc-shelf' }, [
      chips,
      el(
        'div',
        { class: 'q-rail sc-rail' },
        list.map(id => {
          const c = CARDS[id];
          const end = soon(id);
          return el('button', { class: 'q-rail-card sc-card q-press', type: 'button', style: `--lotto:${c.color}`, onclick: () => buyCard(id) }, [
            cardArt(id, c[lang], c.color, 'sc-card-art'),
            el('span', { class: 'sc-card-name q-fit-wrap', text: c[lang] }),
            el('strong', { class: 'num', text: compactMoney(topPrize(id), lang) }),
            el('span', { class: `q-tag${end ? ' orange' : ''}`, text: end ? `${money(c.price)} · ${end}` : money(c.price) })
          ]);
        })
      )
    ]);
    return shelf;
  }
  const onSale = () => CARD_ORDER.filter(id => cardOnSale(id));
  async function buyCard(id) {
    if (!cardOnSale(id)) return;
    // (Its ticket picture on its way while they decide.)
    new Image().src = `art/ticket/${id}.webp`;
    if (!(await confirmBuy(cardArt(id, CARDS[id][lang], CARDS[id].color, 'sc-ask'), t('scratchAsk', { name: CARDS[id][lang] }), t('scratchAskBody', { v: money(CARDS[id].price) })))) return;
    // Checked here first (the balance), then bought from the Worker, which
    // draws the card's prize (lib/settled.mjs buyCard).
    const r = buyScratch(ctx.getAccount(), { id: newSlipId(), card: id }, new Date(), { extra: extra() });
    if (r.error) return void tellK({ lang, title: t('funds'), body: t('fundsBody', { v: money(CARDS[id].price) }) }, 'coin');
    const sold = await sellCard(r.ticket.id, id).catch(() => null);
    if (!sold?.ticket) return void (sold?.refused?.problem === 'funds' ? tellK({ lang, title: t('funds'), body: t('fundsBody', { v: money(CARDS[id].price) }) }) : tell({ lang, icon: '⏳', title: t('failed') }));
    ctx.setWallet(sold.wallet);
    ctx.commitAccount(addTickets(ctx.getAccount(), [sold.ticket]));
    ctx.track([`scratch:${id}`], 1);
    openScratch(sold.ticket.id);
  }

  function openScratch(ticketId) {
    const ticket = ctx.getAccount().tickets.find(x => x.id === ticketId);
    if (!ticket) return;
    const c = CARDS[ticket.card];
    const f = face(ticket.card, ticket.gross ?? ticket.prize, ticket.seed);
    const pays = facePays(ticket.card, f);
    let allBtn = null;
    let cover = null;
    const result = el('div', { class: 'sc-result', role: 'status' });
    const done = () => {
      if (ctx.getAccount().tickets.find(x => x.id === ticketId)?.status === 'open') {
        ctx.commitAccount(revealScratch(ctx.getAccount(), ticketId));
        // The prize paid by the Worker (the same id: once); asked again at the next sync if this one fails.
        revealCard(ticketId).then(r => r?.wallet && ctx.setWallet(r.wallet)).catch(() => {});
        ctx.syncNow();
        if (pays) navigator.vibrate?.([30, 40, 60]);
      }
      ticketEl.classList.add('revealed');
      cover?.clear();
      // The result takes 一次刮開's place in the bar: the sheet stays one screen.
      if (allBtn?.isConnected) allBtn.replaceWith(result);
      result.className = `sc-result ${pays ? 'won' : 'lost'}`;
      result.replaceChildren(...[pays ? kitGlyph(kitUI, 'spark', 'sc-result-icon') : null, el('strong', { class: 'sc-result-label', text: pays ? t('youWon') : t('noWin') }), pays ? el('strong', { class: 'sc-result-amount num', text: money(pays) }) : null].filter(Boolean));
    };
    // A card on sale is its real ticket (its own picture, scratched where the
    // real one is); a retired one its games on a panel under silver.
    // (Scratching is the finger's, never a swipe that drags the sheet away.)
    const real = faceEl.ticket(ticket.card, f);
    let ticketEl;
    let wrap = null;
    const hint = real ? el('p', { class: 'tk-hint', text: t('zoomHint') }) : null;
    if (real) ticketEl = el('div', { class: 'sc-real', 'data-no-sheet-swipe': '' }, [el('div', { class: 'tk-frame' }, [real.node]), hint]);
    else {
      wrap = el('div', { class: 'sc-play', 'data-no-sheet-swipe': '' }, [faceEl(ticket.card, f)]);
      ticketEl = el('div', { class: 'sc-ticket', style: Object.entries(ticketLook(ticket.card)).map(([k, v]) => `${k}:${v}`).join(';') }, [
        cardArt(ticket.card, c[lang], c.color, 'sc-top-art'),
        wrap,
        el('p', { class: 'sc-how', text: c.how[lang] })
      ]);
    }
    const sheet = kitUI.sheet({ title: c[lang], body: [
      ticketEl,
      el('div', { class: 'lotto-buybar sc-bar' }, [
        (allBtn = el('button', { class: 'q-btn', type: 'button', text: t('scratchAll'), disabled: ticket.status !== 'open' ? '' : null, onclick: () => (allBtn.disabled = true, cover ? cover.all() : done()) })),
        !cardOnSale(ticket.card) ? null : el('button', { class: 'q-btn primary', type: 'button', text: t('buyCard', { price: money(c.price) }), onclick: () => (close(), buyCard(ticket.card)) })
      ])
    ], cls: 'lotto-sheet', detent: 'large', closeLabel: lang === 'en' ? 'Close' : '關閉', onClose: () => render() });
    const dialog = sheet.el;
    // (Its buttons in the ticket's own panel colour.)
    dialog.style.setProperty('--lotto', ticketLook(ticket.card)['--panel']);
    const close = () => sheet.close();
    // One screen, no scrolling, like a ticket in the hand.
    const over = () => dialog.scrollHeight - dialog.clientHeight;
    const fit = real
      ? () => {
          // The whole ticket as wide as fits the screen's height.
          const [W, H] = real.size;
          const frame = real.node.parentElement;
          frame.style.width = '';
          const full = frame.offsetWidth;
          const room = real.node.offsetHeight - over();
          frame.style.width = `${Math.max(160, Math.min(full, Math.floor((room * W) / H)))}px`;
          // Small print (a wide or a tall ticket on a phone): say it zooms.
          hint.style.visibility = (real.small * frame.offsetWidth) / W < 18 ? '' : 'hidden';
        }
      : () => {
          // The art shorter, then the rules hidden, then the games printed smaller until it fits.
          const faceNode = wrap.firstElementChild;
          faceNode.style.zoom = '';
          ticketEl.classList.remove('tight', 'tighter', 'tightest');
          if (over() <= 0) return;
          ticketEl.classList.add('tight');
          if (over() <= 0) return;
          ticketEl.classList.add('tighter');
          // (Smaller print reflows wider too, so the size is searched, not computed.)
          const shrink = floor => {
            let [lo, hi] = [floor, 1];
            for (let i = 0; i < 7; i++) {
              const z = (lo + hi) / 2;
              faceNode.style.zoom = String(z);
              if (over() > 0) hi = z;
              else lo = z;
            }
            faceNode.style.zoom = String(lo);
          };
          shrink(0.6);
          // A small phone and a big card: the games before the art.
          if (over() > 0) ticketEl.classList.add('tightest'), shrink(0.4);
        };
    fit();
    if (real) zoomable(ticketEl, real.node, () => ticketEl.classList.contains('revealed'));
    addEventListener('resize', fit);
    dialog.addEventListener('close', () => removeEventListener('resize', fit), { once: true });

    if (ticket.status !== 'open') return void done();
    cover = real ? latex(real, done) : scratchable(wrap, done);
  }

  const faceEl = faceDrawer({ el, t, lang, money });

  // The silver layer over the play area: scratched away with a finger or the
  // mouse; mostly gone (55%), it clears and the card pays. Sized to the play
  // area once it's laid out (and again if that changes before a scratch).
  function scratchable(wrap, done) {
    const canvas = el('canvas', { class: 'scratch-cover', 'aria-label': t('scratchHint') });
    wrap.append(canvas);
    const ratio = window.devicePixelRatio || 1;
    let g = null;
    let touched = false;
    let finished = false;
    let down = false;
    let last = null;
    const paint = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (!w || !h) return;
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
      g = canvas.getContext('2d');
      g.setTransform(ratio, 0, 0, ratio, 0, 0);
      g.globalCompositeOperation = 'source-over';
      const grad = g.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#e5e7eb');
      grad.addColorStop(0.25, '#a8adb6');
      grad.addColorStop(0.5, '#f3f4f6');
      grad.addColorStop(0.75, '#9ca3af');
      grad.addColorStop(1, '#d1d5db');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      // A faint pattern and sparkle, like foil.
      g.save();
      g.globalAlpha = 0.14;
      g.fillStyle = '#374151';
      g.font = '800 12px system-ui, sans-serif';
      g.rotate(-0.35);
      for (let y = -h; y < h * 2; y += 26) for (let x = -w; x < w * 2; x += 70) g.fillText('QUADRA', x + ((y / 26) % 2) * 35, y);
      g.restore();
      for (let i = 0; i < 90; i++) {
        g.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.5})`;
        g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
      }
      // The badge in the middle.
      const text = t('scratchHint');
      g.font = '800 15px system-ui, sans-serif';
      const tw = g.measureText(text).width + 36;
      g.fillStyle = getComputedStyle(wrap).getPropertyValue('--lotto').trim() || '#6b7280';
      g.beginPath();
      g.roundRect((w - tw) / 2, h / 2 - 20, tw, 40, 20);
      g.fill();
      g.fillStyle = '#fff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(`${text}`, w / 2, h / 2 + 1);
      g.globalCompositeOperation = 'destination-out';
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.lineWidth = 42;
    };
    const ro = new ResizeObserver(() => !touched && paint());
    ro.observe(wrap);
    requestAnimationFrame(paint);
    const point = e => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    // Strokes, not dots, so a quick swipe leaves no gaps.
    const scratch = e => {
      if (!down || finished || !g) return;
      e.preventDefault();
      const [x, y] = point(e);
      g.beginPath();
      g.moveTo(...(last || [x, y]));
      g.lineTo(x, y);
      g.stroke();
      last = [x, y];
    };
    const check = () => {
      if (finished || !g) return;
      const data = g.getImageData(0, 0, canvas.width, canvas.height).data;
      let clear = 0;
      let n = 0;
      for (let i = 3; i < data.length; i += 4 * 97) {
        n++;
        if (data[i] === 0) clear++;
      }
      if (clear / n > 0.55) done();
    };
    canvas.addEventListener('pointerdown', e => {
      touched = true;
      down = true;
      last = null;
      canvas.setPointerCapture(e.pointerId);
      scratch(e);
    });
    canvas.addEventListener('pointermove', scratch);
    const release = e => canvas.hasPointerCapture?.(e.pointerId) && canvas.releasePointerCapture(e.pointerId);
    canvas.addEventListener('pointerup', e => (release(e), (down = false), (last = null), check()));
    canvas.addEventListener('pointercancel', e => (release(e), (down = false), (last = null)));
    return {
      clear: () => {
        if (finished) return;
        finished = true;
        ro.disconnect();
        clearCover(canvas);
      },
      all: done
    };
  }
  // A ticket's small print up close, as with a photo: two fingers pinch it
  // bigger (to 3×) and move it, a double tap zooms in there or back out; once
  // it's all scratched, one finger moves it too. It stays in its frame.
  function zoomable(frame, node, free) {
    let z = 1;
    let tx = 0;
    let ty = 0;
    const pts = new Map();
    let start = null;
    let lastTap = 0;
    const apply = () => {
      const nw = node.offsetWidth;
      const nh = node.offsetHeight;
      z = Math.min(3, Math.max(1, z));
      // (Never past its edges: the ticket always fills what it filled.)
      tx = Math.min(0, Math.max(nw - nw * z, tx));
      ty = Math.min(0, Math.max(nh - nh * z, ty));
      if (z === 1) tx = ty = 0;
      node.style.transform = z === 1 ? '' : `translate(${tx}px, ${ty}px) scale(${z})`;
      frame.classList.toggle('zoomed', z > 1);
    };
    // Zoom to `nz` keeping the point at (px, py) (in the frame's ticket box) still.
    const zoomAt = (nz, px, py) => {
      const k = nz / z;
      tx = px - (px - tx) * k;
      ty = py - (py - ty) * k;
      z = nz;
      apply();
    };
    // (Where in the ticket's frame, unzoomed.)
    const box = e => {
      const r = node.parentElement.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    frame.addEventListener('pointerdown', e => {
      pts.set(e.pointerId, box(e));
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        start = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], tx, ty };
      } else if (pts.size === 1) {
        const now = Date.now();
        if (now - lastTap < 300) {
          const [px, py] = box(e);
          node.style.transition = 'transform .25s';
          zoomAt(z > 1 ? 1 : 2.5, px, py);
          setTimeout(() => (node.style.transition = ''), 260);
          lastTap = 0;
        } else lastTap = now;
        start = free() && z > 1 ? { pan: box(e), tx, ty } : null;
      }
    });
    frame.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, box(e));
      if (!start) return;
      if (pts.size === 2 && start.d) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const nz = Math.min(3, Math.max(1, (start.z * d) / start.d));
        // The point under the fingers' middle stays under it as they move.
        const k = nz / start.z;
        tx = mid[0] - (start.mid[0] - start.tx) * k;
        ty = mid[1] - (start.mid[1] - start.ty) * k;
        z = nz;
        apply();
      } else if (pts.size === 1 && start.pan) {
        const [x, y] = box(e);
        tx = start.tx + x - start.pan[0];
        ty = start.ty + y - start.pan[1];
        apply();
      }
    });
    const end = e => {
      pts.delete(e.pointerId);
      start = pts.size === 1 && free() && z > 1 ? { pan: [...pts.values()][0], tx, ty } : null;
    };
    frame.addEventListener('pointerup', end);
    frame.addEventListener('pointercancel', end);
    addEventListener('resize', () => ((z = 1), apply()));
  }

  // The real ticket's scratch-offs: its own printed latex (the picture, drawn
  // over each scratch-off), scraped away with a finger or the mouse the way
  // latex comes off: a ragged edge, the silver under the print showing round
  // it, flecks left stuck and crumbs on the card (brushed off at the end).
  // Mostly gone (55% of the scratch-offs), the rest comes off and it pays.
  function latex(real, done) {
    const node = real.node;
    const [W, H] = real.size;
    const img = node.querySelector('.tk-art');
    const cover = el('canvas', { class: 'tk-cover', 'aria-label': t('scratchHint') });
    const crumbs = el('canvas', { class: 'tk-crumbs', 'aria-hidden': 'true' });
    node.append(cover, crumbs);
    const ratio = Math.min(3, window.devicePixelRatio || 1);
    let g = null;
    let gc = null;
    let w = 0;
    let finished = false;
    let down = false;
    let last = null;
    let travel = 0;
    // The scratch-offs' outline, in CSS pixels at the current width.
    const outline = () => {
      const k = w / W;
      const path = new Path2D();
      for (const { r: [x, y, rw, rh], shape, rad, poly } of real.zones) {
        if (poly) {
          path.moveTo(poly[0][0] * k, poly[0][1] * k);
          for (const [px, py] of poly.slice(1)) path.lineTo(px * k, py * k);
          path.closePath();
          continue;
        }
        if (shape === 'round') path.moveTo((x + rw) * k, (y + rh / 2) * k), path.ellipse((x + rw / 2) * k, (y + rh / 2) * k, (rw / 2) * k, (rh / 2) * k, 0, 0, Math.PI * 2);
        else path.roundRect(x * k, y * k, rw * k, rh * k, (rad ?? Math.min(rw, rh) * 0.12) * k);
      }
      return path;
    };
    let clip = null;
    // Silver latex (under the print), a little grainy.
    let silver = null;
    const silverOf = ctx2 => {
      const tile = document.createElement('canvas');
      tile.width = tile.height = 48;
      const tg = tile.getContext('2d');
      for (let y = 0; y < 48; y += 2) for (let x = 0; x < 48; x += 2) {
        const v = 168 + Math.floor(Math.random() * 60);
        tg.fillStyle = `rgb(${v},${v},${v + 6})`;
        tg.fillRect(x, y, 2, 2);
      }
      return ctx2.createPattern(tile, 'repeat');
    };
    const paint = () => {
      const nw = node.clientWidth;
      if (!nw || finished || !img.complete || !img.naturalWidth) return;
      const nh = (nw * H) / W;
      const old = w && g ? (() => {
        const c2 = document.createElement('canvas');
        c2.width = cover.width;
        c2.height = cover.height;
        c2.getContext('2d').drawImage(cover, 0, 0);
        return c2;
      })() : null;
      w = nw;
      for (const c of [cover, crumbs]) (c.width = Math.round(nw * ratio)), (c.height = Math.round(nh * ratio));
      g = cover.getContext('2d');
      gc = crumbs.getContext('2d');
      g.setTransform(ratio, 0, 0, ratio, 0, 0);
      gc.setTransform(ratio, 0, 0, ratio, 0, 0);
      silver = silverOf(g);
      clip = outline();
      if (old) {
        // Bigger or smaller since some was scratched: the same scratches, scaled.
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.drawImage(old, 0, 0, cover.width, cover.height);
        g.setTransform(ratio, 0, 0, ratio, 0, 0);
        return;
      }
      node.classList.add('ready');
      g.save();
      g.clip(clip);
      g.drawImage(img, 0, 0, nw, nh);
      // The latex's sheen.
      const sheen = g.createLinearGradient(0, 0, nw, nh);
      sheen.addColorStop(0, 'rgba(255,255,255,0.10)');
      sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
      sheen.addColorStop(1, 'rgba(255,255,255,0.08)');
      g.fillStyle = sheen;
      g.fillRect(0, 0, nw, nh);
      g.restore();
    };
    new ResizeObserver(paint).observe(node);
    img.decode?.().then(paint, paint);
    img.addEventListener('load', paint);
    // One dab of the coin: silver round it on the latex still there, then the hole.
    const dab = (x, y, R) => {
      const r = R * (0.82 + Math.random() * 0.3);
      // (Off the scratch-offs, the card's print: nothing comes off.)
      const on = (dx, dy) => g.isPointInPath(clip, (x + dx) * ratio, (y + dy) * ratio);
      if (!on(0, 0) && !on(r, 0) && !on(-r, 0) && !on(0, r) && !on(0, -r)) return;
      g.save();
      g.clip(clip);
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = silver;
      g.beginPath();
      g.arc(x + (Math.random() - 0.5) * 2, y + (Math.random() - 0.5) * 2, r * 1.16, 0, Math.PI * 2);
      g.fill();
      g.globalCompositeOperation = 'destination-out';
      // (Not always clean: a thin haze of latex left where it was scraped once.)
      g.globalAlpha = 0.86 + Math.random() * 0.14;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
      // A ragged edge: bits torn off round the hole.
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = r * (0.85 + Math.random() * 0.3);
        g.beginPath();
        g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.12 + Math.random() * 0.2), 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
      // A fleck of latex that stays stuck, now and then.
      if (Math.random() < 0.06) {
        g.save();
        g.clip(clip);
        g.fillStyle = silver;
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * r * 0.7;
        speck(g, x + Math.cos(a) * d, y + Math.sin(a) * d, 0.8 + Math.random() * 1.6);
        g.restore();
      }
      // Crumbs pushed off to the side.
      if (Math.random() < 0.3) {
        const a = Math.random() * Math.PI * 2;
        const d = r * (1.05 + Math.random() * 0.8);
        const v = 150 + Math.floor(Math.random() * 80);
        gc.fillStyle = `rgba(${v},${v},${v + 8},0.95)`;
        speck(gc, x + Math.cos(a) * d, y + Math.sin(a) * d, 0.7 + Math.random() * 1.8);
      }
    };
    // An odd little shape (a crumb or a fleck), with its shadow.
    const speck = (c, x, y, s) => {
      c.beginPath();
      const n = 5 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const d = s * (0.55 + Math.random() * 0.6);
        c[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * d, y + Math.sin(a) * d);
      }
      c.closePath();
      c.shadowColor = 'rgba(0,0,0,0.35)';
      c.shadowOffsetY = 0.6;
      c.shadowBlur = 0.8;
      c.fill();
      c.shadowColor = 'transparent';
    };
    const R = () => Math.max(9, w * 0.034);
    const stroke = (from, to, quiet) => {
      const step = Math.max(1.5, R() * 0.22);
      const dist = Math.hypot(to[0] - from[0], to[1] - from[1]);
      for (let s2 = 0; s2 <= dist; s2 += step) {
        const k = dist ? s2 / dist : 0;
        dab(from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k, R());
      }
      travel += dist;
      // A light tick under the finger as the latex gives (phones that can).
      if (travel > 46 && !quiet) (travel = 0), navigator.vibrate?.(4);
    };
    // (In CSS pixels of the ticket at scale 1: it may be zoomed in.)
    const point = e => {
      const r = cover.getBoundingClientRect();
      return [((e.clientX - r.left) * w) / r.width, ((e.clientY - r.top) * w) / r.width];
    };
    // Two fingers zoom (zoomable): no scratching while they're down.
    const fingers = new Set();
    const move = e => {
      if (fingers.size > 1) return void ((down = false), (last = null));
      if (!down || finished || !g) return;
      e.preventDefault();
      const p = point(e);
      stroke(last || p, p);
      last = p;
    };
    // How much of the scratch-offs is off (points spread over them).
    const check = () => {
      if (finished || !g) return;
      const data = g.getImageData(0, 0, cover.width, cover.height).data;
      const k = (w / W) * ratio;
      let n = 0;
      let off = 0;
      for (const { r: [x, y, rw, rh] } of real.zones)
        for (let i = 0.1; i < 1; i += 0.2)
          for (let j = 0.1; j < 1; j += 0.2) {
            const px = Math.floor((x + rw * i) * k);
            const py = Math.floor((y + rh * j) * k);
            n++;
            if (data[(py * cover.width + px) * 4 + 3] < 40) off++;
          }
      if (off / n > 0.55) done();
    };
    cover.addEventListener('pointerdown', e => {
      fingers.add(e.pointerId);
      if (finished || fingers.size > 1) return void ((down = false), (last = null));
      down = true;
      last = null;
      try {
        cover.setPointerCapture(e.pointerId);
      } catch {}
      move(e);
    });
    cover.addEventListener('pointermove', move);
    const release = e => cover.hasPointerCapture?.(e.pointerId) && cover.releasePointerCapture(e.pointerId);
    cover.addEventListener('pointerup', e => (fingers.delete(e.pointerId), release(e), (down = false), (last = null), check()));
    cover.addEventListener('pointercancel', e => (fingers.delete(e.pointerId), release(e), (down = false), (last = null)));
    const clear = () => {
      if (finished) return;
      finished = true;
      // The latex left lifts off; the crumbs are brushed away.
      for (const c of [cover, crumbs]) (c.style.transition = 'opacity .5s'), (c.style.opacity = '0'), (c.style.pointerEvents = 'none');
      setTimeout(() => (cover.style.display = crumbs.style.display = 'none'), 600);
    };
    return {
      clear,
      // 一次刮開: every scratch-off scraped, back and forth, quickly.
      all: () => {
        if (finished || !g) return done();
        const k = w / W;
        const lines = [];
        for (const { r: [x, y, rw, rh] } of real.zones) {
          const gap = R() * 1.3;
          const rows = Math.max(1, Math.ceil((rh * k) / gap));
          for (let i = 0; i < rows; i++) {
            const yy = (y + rh * ((i + 0.5) / rows)) * k;
            lines.push(i % 2 ? [[(x + rw) * k, yy], [x * k, yy]] : [[x * k, yy], [(x + rw) * k, yy]]);
          }
        }
        const per = Math.max(1, Math.ceil(lines.length / 40));
        let i = 0;
        const tick = () => {
          if (finished) return;
          for (let j = 0; j < per && i < lines.length; j++, i++) stroke(...lines[i], true);
          if (i < lines.length) requestAnimationFrame(tick);
          else setTimeout(done, 250);
        };
        tick();
      }
    };
  }
  const clearCover = canvas => {
    canvas.style.transition = 'opacity .35s';
    canvas.style.opacity = '0';
    canvas.style.pointerEvents = 'none';
    // Hidden, not removed: a touch still held on a removed canvas never ends for the page.
    setTimeout(() => (canvas.style.display = 'none'), 400);
  };

  // ---- My tickets ------------------------------------------------------------------------
  // A ticket, draw or day shows what it won: the prize in green, or a quiet dash.
  const outcome = got => (got > 0 ? 'up' : 'none');
  const outcomeText = got => (got > 0 ? t('outWon', { v: money(got) }) : t('outNone'));
  const netChip = got => el('span', { class: `lt-net num out-${outcome(got)}`, text: got > 0 ? `+${money(got)}` : t('outNone') });
  function myTickets() {
    const tickets = ctx.getAccount().tickets || [];
    if (!tickets.length) return kitUI.empty({ title: t('noTickets') });
    const open = tickets.filter(x => x.status === 'open');
    const done = tickets.filter(x => x.status !== 'open');
    const won = done.reduce((s, x) => s + (x.prize || 0), 0);
    const drawn = el('div', { class: 'lotto-done' });
    const paint = () => drawn.replaceChildren(...drawnDays(done));
    ui.paintDone = paint;
    paint();
    return el('div', {}, [
      done.length ? el('div', { class: 'lotto-summary' }, [el('span', { text: t('wonSum', { v: '' }).trim() }), netChip(won)]) : null,
      open.length ? el('p', { class: 'lotto-h', text: t('waiting') }) : null,
      // A 多期 purchase once, at its next draw, with how many are still to come.
      open.length ? el('div', { class: 'lotto-tickets' }, bySeries(open).slice(0, 60).map(s => ticketRow(s.first, s.all))) : null,
      done.length ? el('div', { class: 'lotto-done-head' }, [el('p', { class: 'lotto-h', text: t('drawnList') }), el('div', { class: 'lotto-filter' }, ['all', 'wins'].map(k => el('button', { type: 'button', class: `q-chip${ui.doneFilter === k ? ' on' : ''}`, text: t(k === 'all' ? 'filterAll' : 'filterWins'), onclick: e => { ui.doneFilter = k; ui.doneDays = 7; e.currentTarget.parentNode.querySelectorAll('.q-chip').forEach(b => b.classList.toggle('on', b === e.currentTarget)); paint(); } }))) ]) : null,
      done.length ? drawn : null
    ]);
  }

  // 已開獎, a day at a time (newest first): the day's spend and winnings,
  // then one card per draw with every ticket on it, and scratch cards by kind.
  const dayOf = ms => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
  const whenOf = x => (x.card ? Date.parse(x.t) : x.draw?.at || Date.parse(x.t));
  const hourText = ms => new Date(ms).toLocaleTimeString(lang === 'en' ? 'en-US' : 'zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei' });
  function dayName(key) {
    const today = dayOf(Date.now());
    const yesterday = dayOf(Date.now() - 864e5);
    if (key === today) return t('today');
    if (key === yesterday) return t('yesterday');
    const [y, m, d] = key.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 4)).toLocaleDateString(lang === 'en' ? 'en-US' : 'zh-TW', { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'Asia/Taipei' });
  }
  function drawnDays(done) {
    ui.doneFilter ||= 'all';
    ui.doneDays ||= 7;
    const list = (ui.doneFilter === 'wins' ? done.filter(x => x.prize > 0) : done).slice().sort((a, b) => whenOf(b) - whenOf(a));
    if (!list.length) return [kitUI.empty({ title: t('noWins') })];
    const days = new Map();
    for (const x of list) {
      const k = dayOf(whenOf(x));
      if (!days.has(k)) days.set(k, []);
      days.get(k).push(x);
    }
    const keys = [...days.keys()];
    const out = keys.slice(0, ui.doneDays).map(k => {
      const items = days.get(k);
      const got = items.reduce((s, x) => s + (x.prize || 0), 0);
      const groups = new Map();
      for (const x of items) {
        const g = x.card ? `card:${x.card}` : `${x.game}:${x.draw?.at}`;
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g).push(x);
      }
      return el('section', { class: 'lotto-day' }, [
        el('div', { class: 'lotto-day-head' }, [
          el('strong', { text: dayName(k) }),
          netChip(got)
        ]),
        el('div', { class: 'lotto-tickets' }, [...groups.values()].map(g => (g[0].card ? scratchGroup(g) : drawGroup(g))))
      ]);
    });
    if (keys.length > ui.doneDays) out.push(el('button', { type: 'button', class: 'q-btn ghost lotto-more', text: t('earlier', { n: keys.length - ui.doneDays }), onclick: () => { ui.doneDays += 14; ui.paintDone?.(); } }));
    return out;
  }
  // A game no longer sold (雙贏彩, 大福彩, 38樂合彩): its old tickets still
  // list, plainly, and an open one is refunded by the Worker.
  const RETIRED = { color: '#8a8f98' };
  // A play's name as the kit gives it, else this page's word (old tickets'
  // 組彩 and 對彩 included).
  const playName = (g, p) => g.plays?.[p]?.[lang] || t(p);
  // 「第 115000083 期」 when the draw has a term, else '' (the caller keeps the time).
  const termText = x => {
    const label = termLabel(termOf(x.drawn, x.draw), lang);
    return label ? `${label} · ${hourText(x.draw.at)}` : '';
  };
  // One draw: its numbers once, then each ticket's picks (hits lit up).
  function drawGroup(list) {
    const x0 = list[0];
    const g = GAMES[x0.game] || RETIRED;
    const drawn = x0.drawn;
    const got = list.reduce((s, x) => s + (x.prize || 0), 0);
    return el('div', { class: 'lt-group', style: `--lotto:${g.color}` }, [
      el('div', { class: 'lt-head' }, [el('div', { class: 'lt-title' }, [el('strong', { text: gameName(x0.game, lang) }), el('small', { class: 'num', text: termText(x0) || hourText(x0.draw.at) })]), netChip(got)]),
      drawn ? el('div', { class: 'lt-drawn' }, [el('span', { class: 'lt-label', text: t('called') }), el('div', { class: 'balls' }, [...(drawn.digits || drawn.numbers || []).map(n => ball(n, 'dim', Boolean(drawn.digits))), drawn.special != null ? ball(drawn.special, 'dim special') : null, drawn.zone2 != null ? ball(drawn.zone2, 'dim special') : null].filter(Boolean))]) : null,
      el('div', { class: 'lt-lines' }, list.map(x => el('div', { class: `lt-line${x.prize > 0 ? ` won out-up` : ''}` }, [el('div', { class: 'balls' }, picksOf(x)), x.prize > 0 ? el('span', { class: 'lt-win' }, [tierText(x) ? el('small', { class: 'lt-tier', text: tierText(x) }) : null, el('span', { class: 'num', text: `+${money(x.prize)}` })].filter(Boolean)) : el('span', { class: 'num', text: [x.sel.play ? t(x.sel.play) : x.sel.size ? COMBO_NAME[lang][x.sel.size] : x.multiple > 1 ? `×${x.multiple}` : '', x.series ? t('seriesN', { k: x.series.n, n: x.series.of }) : ''].filter(Boolean).join(' · ') })]))),
    ]);
  }
  // Scratch cards of one kind that day: a tile each, tap to see it again.
  function scratchGroup(list) {
    const c = CARDS[list[0].card];
    const got = list.reduce((s, x) => s + (x.prize || 0), 0);
    return el('div', { class: 'lt-group', style: `--lotto:${c.color}` }, [
      el('div', { class: 'lt-head' }, [el('div', { class: 'lt-title' }, [el('strong', { text: `${c[lang]}${list.length > 1 ? ` ×${list.length}` : ''}` }), el('small', { class: 'num', text: t('scratch') })]), netChip(got)]),
      el('div', { class: 'lt-cards' }, list.map(x => el('button', { type: 'button', class: `lt-card${x.prize > 0 ? ` won out-up` : ''}`, onclick: () => openScratch(x.id), text: x.prize > 0 ? compactMoney(x.prize, lang) : t('outNone') }))),
    ]);
  }
  // A ticket's picks with what the draw hit lit up; a 大樂透 pick equal to the
  // 特別號 gets the 特 badge (貳, 肆, 陸 and 柒獎 depend on it).
  function picksOf(x) {
    const drawn = x.drawn;
    if (x.sel.digits) return x.sel.digits.map(d => ball(d, '', true));
    if (x.sel.side) return [el('span', { class: 'q-chip', text: t(x.sel.side) })];
    const isSpecial = n => x.game === 'lotto649' && drawn?.special != null && drawn.special === n && !drawn.numbers?.includes(n);
    return [
      ...(x.sel.zones?.[0] || x.sel.numbers || []).map(n => (isSpecial(n) ? el('span', { class: 'ball sp', 'data-sp': t('special'), title: t('special'), text: String(n).padStart(2, '0') }) : ball(n, drawn?.numbers?.includes(n) ? 'hit' : ''))),
      ...(x.sel.zones?.[1] || []).map(n => ball(n, drawn?.zone2 === n ? 'hit special' : 'special'))
    ];
  }
  // 獎別 of a won ticket ("頭獎"), or 中 n 個 for BINGO; '' when unknown.
  const tierText = x => (x.prize > 0 ? winsText(x.game, x.wins, lang) || tierName(x.game, x.tier, lang) || (x.game === 'bingo' && x.sel?.numbers && /^\d+$/.test(String(x.tier)) ? t('hitsN', { n: x.tier }) : '') : '');
  // An open ticket's 期別: its own once drawn, else the one it will have.
  const openTerm = x => termLabel(termOf(x.draw) || nextTerm(x.game, x.draw, ui.latest?.[GAMES[x.game]?.of || x.game]), lang);
  // `series`: every open ticket of its 多期 purchase (it shows once).
  function ticketRow(x, series = [x]) {
    if (x.card) {
      const c = CARDS[x.card];
      return el('button', { class: `lotto-ticket${x.status === 'open' ? '' : ` out-${outcome(x.prize || 0)}`}`, type: 'button', style: `--lotto:${c.color}`, onclick: () => openScratch(x.id) }, [
        el('div', { class: 'lt-head' }, [el('strong', { text: `${t('scratch')} · ${c[lang]}` }), el('span', { class: 'num', text: money(x.cost) })]),
        el('p', { class: `lt-state ${x.status === 'open' ? '' : `out-${outcome(x.prize || 0)}`}`, text: x.status === 'open' ? t('unscratched') : outcomeText(x.prize || 0) })
      ]);
    }
    const g = GAMES[x.game] || RETIRED;
    const drawn = x.drawn;
    const picked = picksOf(x);
    return el('div', { class: `lotto-ticket${x.status === 'open' ? '' : ` out-${outcome(x.prize || 0)}`}`, style: `--lotto:${g.color}` }, [
      el('div', { class: 'lt-head' }, [el('strong', { text: `${gameName(x.game, lang)}${x.sel.play ? ` · ${playName(g, x.sel.play)}` : x.sel.size ? ` · ${COMBO_NAME[lang][x.sel.size]}` : isSystem(x.game, x.sel) ? ` · ${t('systemBets', { n: x.bets })}` : ''}${x.multiple > 1 ? ` ×${x.multiple}` : ''}` }), el('span', { class: 'num', text: x.series ? t('perDraw', { v: money(x.cost) }) : money(x.cost) })]),
      el('div', { class: 'balls' }, picked),
      x.series && x.status === 'open' ? el('small', { class: 'lt-series', text: t('seriesLeft', { n: x.series.of, k: series.length }) }) : null,
      drawn ? el('div', { class: 'balls drawn' }, [...(drawn.digits || drawn.numbers || []).map(n => ball(n, 'dim', Boolean(drawn.digits))), drawn.special != null ? ball(drawn.special, 'dim special') : null, drawn.zone2 != null ? ball(drawn.zone2, 'dim special') : null].filter(Boolean)) : null,
      el('p', { class: `lt-state ${x.status === 'open' ? '' : `out-${outcome(x.prize || 0)}`}`, text: x.status === 'open' ? (g === RETIRED ? t('retired') : ui.pending.has(x.id) ? [openTerm(x), t('pendingPay')].filter(Boolean).join(' · ') : [openTerm(x), lang === 'en' && openTerm(x) ? timeText(x.draw.at).replace(/,/g, '') : t('drawAt', { when: timeText(x.draw.at) })].filter(Boolean).join(' · ')) : [termLabel(termOf(x.drawn, x.draw), lang), tierText(x), outcomeText(x.prize || 0)].filter(Boolean).join(' · ') })
    ]);
  }

  // 紀錄's 彩券 view.
  function renderTickets(root) {
    if (!root || !ctx.getAccount()) return;
    settleDue();
    root.replaceChildren(myTickets());
  }

  return { render, settleDue, renderTickets, homeLead, openGame };
}
