// The 彩券 tab: Taiwan Lottery's computer-drawn games (lib/lottery.mjs) and
// scratch cards (lib/scratch.mjs), bought with the Longshot Pass balance. Tickets
// live on the account next to the slips, settle against the real draws as
// they come out, and pay into the same pool.
import { GAMES, GAME_ORDER, gameName, nextDraw, quickPick, betCount, checkSelection, buyTicket, settleTicket, ticketPrize, upcoming, nextDraws, dueTickets, drawFor, latestResults, choose, addTickets } from './lib/lottery.mjs';
import { CARDS, CARD_ORDER, face, facePays, buyScratch, revealScratch, topPrize, onSale as cardOnSale } from './lib/scratch.mjs';
import { buyTickets, buyCardsAt, revealCard } from './lib/settled.mjs';
import { balance, newSlipId } from './lib/account.mjs';
import { compactMoney } from './home.js';
import { faceDrawer, ticketLook } from './scratch-face.js';
import { TICKETS } from './tickets.js';
import { scratchTicket } from './scratch-ticket.js';
import { ask, tell } from './kit/core.mjs';
import * as kitUI from './kit/ui.mjs';
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
    today: '今天', yesterday: '昨天', filterAll: '全部', filterWins: '只看中獎', noWins: '還沒有中獎', daySum: '花 {spent}', dayNone: '沒中獎', outNone: '沒中獎', dayNet: '淨 {v}', earlier: '更早的 {n} 天', groupWon: '{n} 張中 {k} 張，共 {v}', groupLost: '{n} 注都沒中', cardsLost: '{n} 張都沒中',
    drawAt: '{when} 開獎', noTickets: '還沒有彩券', buyCard: '購買 {price}', scratchAll: '一次刮開', scratchHint: '刮開刮膜', youWon: '恭喜中獎！', noWin: '沒有中獎',
    top: '最高 {v}', winRateShort: '中獎率 {p}%', bought: '已購買', funds: '餘額不足', fundsBody: '需要 {v}', closed: '本期已截止', failed: '現在無法購買，稍後再試', retired: '已停售，本金退回', perBet: '{v} / 注', how: '玩法', winNumbers: '幸運號碼', yourNumbers: '您的號碼', dealer: '對手', you: '您', prizeCol: '獎金',
    called: '開出號碼', prizes: '獎項', unscratched: '未刮開', every5: '每 5 分鐘開獎', mult: '倍數 ×{m}', settled: '已開獎',
    quick1: '快選 1 注', quickN: '快選 {n} 注', addLine: '加入這注', lines: '已選 {n} 注', remove: '移除', buyAll: '購買 {n} 注 · {v}', boughtN: '已買 {n} 注，共 {v}', seeTickets: '看我的彩券', again: '再買', inMin: '{n} 分鐘後開獎', inHour: '{h} 小時 {m} 分後開獎', picked: '已選 {k}/{n}', starsN: '{n} 星', pickHint: '點下面的號碼，或用快選', slipN: '第 {n} 注', topPrize: '最高獎金', fillRest: '隨機補滿', addNext: '加入，選下一注', quickLines: '快選整注', clearAll: '全部清除', zone1: '第一區', bingoHint: '點 1–10 個號碼，或下面選大小單雙', lastLegend: '上期開出', anyPrize: '任一獎 1/{n}', odds: '機率', oneIn: '1/{n}', yourPick: '你的號碼', waiting: '等待開獎', drawnList: '已開獎', openSum: '{n} 張待開獎', wonSum: '累計中獎 {v}', basketHint: '可以一次買好幾注', sureTitle: '確定購買？', sureBody: '{what} · {v}', sureOk: '購買 {v}', special: '特',
    periods: '期數', periodsN: '{n} 期', buyAskP: '買 {n} 注 × {p} 期，共 {v}？', boughtNP: '已買 {n} 注 × {p} 期，共 {v}', betsP: '{n} 注 × {p} 期', drawsSpan: '{from} 至 {to}，共 {n} 期',
    pendingPay: '已開獎，等待派彩公告', system: '包牌', systemBets: '包牌 {n} 注', upTo: '包牌至 {n}', lastDraw: '上期開獎', bySize: '大小順序', byOrder: '開出順序', notPaidYet: '獎金尚未公告',
    seriesN: '多期 {k}/{n}', betsN: '{n} 注', winsN: '中 {n} 注', foldMore: '再看 {n} 注', foldLess: '收起', toScratch: '刮開', seriesLeft: '連續 {n} 期，還有 {k} 期待開獎', tooMany: '一次最多 {n} 注，請分次購買', comboNote: '每期獎金以台灣彩券公告為準',
    strongman: '大力士分數', yourScores: '您的分數', yourDice: '您的骰子', theirDice: '對手的骰子', threeOf: '3個{s}', roundN: '第{n}局', pickNow: '去選號', inMinShort: '{n} 分後截止', inHourShort: '{h} 小時後截止',
    gameN: '遊戲{n}', thanks: '謝謝', zoneX: '獎金{x}倍區', countN: '{n}個', xN: '{x}倍', sumTo: '兩數相加為 {n}', luckyCode: '幸運密碼', yourCode: '您的密碼', hitsN: '對中{n}個', hitsSp: '{n}個＋特別號', linesN: '{n}條連線', goldNums: '金樂透號碼 ＋ 特別號', onePt: '1分區', tenPt: '10分區', ptsTotal: '對中總分數', ptsN: '{n}分', soldUntil: '{d}停售', allPrices: '全部',
    kindsN: '{n} 款', winRate: '中獎率', everyN: '每 {n} 張中 1', topN: '共 {n} 張', price1: '售價', oddsTab: '獎金與機率', tapHint: '用手指刮，或點一下小格', partN: '第 {i}/{n} 區 · 刮完自動到下一區', nextCard: '下一張 · 剩 {n}', againCard: '再買 {v}', howShort: '玩法'
  },
  en: {
    draws: 'Draw games', scratch: 'Scratch cards', mine: 'My tickets', nextDraw: 'Next draw', closeInMin: 'Closes in {n} min', closeInHour: 'Closes in {h}h {m}m', closeAt: 'Closes {when}', jackpot: 'Jackpot', price: 'A bet', buy: 'Buy', cancel: 'Cancel', buyAsk: 'Buy {n} for {v}?', buyAskBody: '{name}; checked by itself after the draw.', scratchAsk: 'Buy a {name} card?', scratchAskBody: '{v}; scratch it straight away.', cost: 'Total', bets: 'bets', multiple: 'Multiple',
    quick: 'Quick pick', clear: 'Clear', pickN: 'Pick {n} numbers', zone2: 'Zone 2', straight: 'Straight', box: 'Box', pair: 'Pair', size: 'Play', combos: '{n} combinations',
    stars: 'Stars', sizeTitle: 'Big/Small', parityTitle: 'Odd/Even', big: 'Big', small: 'Small', odd: 'Odd', even: 'Even', bullseye: 'Super number', latest: 'Latest draw', open: 'Awaiting draw', won: 'Won', lost: 'No win',
    today: 'Today', yesterday: 'Yesterday', filterAll: 'All', filterWins: 'Wins only', noWins: 'No wins yet', daySum: 'Spent {spent}', dayNone: 'No wins', outNone: 'No prize', dayNet: 'Net {v}', earlier: '{n} earlier days', groupWon: '{k} of {n} won, {v}', groupLost: 'No win on {n} bets', cardsLost: 'No win on {n} cards',
    drawAt: 'Draw {when}', noTickets: 'No tickets yet', buyCard: 'Buy {price}', scratchAll: 'Scratch all', scratchHint: 'Scratch the latex', youWon: 'You won!', noWin: 'No win this time',
    top: 'Top {v}', winRateShort: 'Wins {p}%', bought: 'Bought', funds: 'Not enough money', fundsBody: 'Needs {v}', closed: 'Sales closed', failed: 'Can’t buy right now. Try again soon.', retired: 'No longer sold: stake refunded', perBet: '{v} a bet', how: 'How to play', winNumbers: 'Lucky numbers', yourNumbers: 'Your numbers', dealer: 'Opponent', you: 'You', prizeCol: 'Prize',
    called: 'Called', prizes: 'Prizes', unscratched: 'Not scratched', every5: 'Every 5 minutes', mult: 'Multiplier ×{m}', settled: 'Drawn',
    quick1: 'Quick pick 1', quickN: 'Quick pick {n}', addLine: 'Add this bet', lines: '{n} bets chosen', remove: 'Remove', buyAll: 'Buy {n} · {v}', boughtN: 'Bought {n} bets, {v}', seeTickets: 'My tickets', again: 'Buy more', inMin: 'Draw in {n} min', inHour: 'Draw in {h}h {m}m', picked: '{k}/{n} picked', starsN: '{n} stars', pickHint: 'Tap numbers below, or quick pick', slipN: 'Bet {n}', topPrize: 'Top prize', fillRest: 'Fill the rest', addNext: 'Add, next bet', quickLines: 'Quick-pick bets', clearAll: 'Clear all', zone1: 'Zone 1', bingoHint: 'Tap 1–10 numbers, or pick big/small/odd/even below', lastLegend: 'In the last draw', anyPrize: 'Any prize 1 in {n}', odds: 'Odds', oneIn: '1 in {n}', yourPick: 'Your numbers', waiting: 'Awaiting the draw', drawnList: 'Drawn', openSum: '{n} awaiting a draw', wonSum: 'Won so far {v}', basketHint: 'Buy several at once', sureTitle: 'Buy this?', sureBody: '{what} · {v}', sureOk: 'Buy for {v}', special: 'SP',
    periods: 'Draws', periodsN: '{n}', buyAskP: 'Buy {n} × {p} draws for {v}?', boughtNP: 'Bought {n} bets × {p} draws, {v}', betsP: '{n} × {p} draws', drawsSpan: '{from} to {to}, {n} draws',
    pendingPay: 'Drawn: awaiting the prize announcement', system: 'System', systemBets: 'System: {n} bets', upTo: 'system to {n}', lastDraw: 'Last draw', bySize: 'In order of size', byOrder: 'In order drawn', notPaidYet: 'Prizes not announced yet',
    seriesN: 'Multi-draw {k}/{n}', betsN: '{n} bets', winsN: '{n} won', foldMore: '{n} more bets', foldLess: 'Show fewer', toScratch: 'Scratch', seriesLeft: '{n} draws in a row, {k} still to come', tooMany: 'At most {n} bets at once: buy the rest after', comboNote: 'Each draw pays as Taiwan Lottery announces',
    strongman: 'Strongman', yourScores: 'Your scores', yourDice: 'Your die', theirDice: 'Their die', threeOf: '3 × {s}', roundN: 'Round {n}', pickNow: 'Pick numbers', inMinShort: '{n} min left', inHourShort: '{h}h left',
    gameN: 'Game {n}', thanks: 'ZERO', zoneX: '{x}× zone', countN: '{n}', xN: '{x}×', sumTo: 'Two that add up to {n}', luckyCode: 'Lucky code', yourCode: 'Your code', hitsN: '{n} match', hitsSp: '{n} + special', linesN: '{n} lines', goldNums: 'Gold lotto + special', onePt: '1-point zone', tenPt: '10-point zone', ptsTotal: 'Points', ptsN: '{n} pts', soldUntil: 'Ends {d}', allPrices: 'All',
    kindsN: '{n} cards', winRate: 'Win rate', everyN: '1 in {n}', topN: '{n} printed', price1: 'Price', oddsTab: 'Prizes and odds', tapHint: 'Scratch, or tap a box', partN: 'Part {i} of {n} · on to the next when it’s off', nextCard: 'Next · {n} left', againCard: 'Again {v}', howShort: 'How to play'
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
    const section = (title, body) => kitUI.section(title, body);
    root.replaceChildren(
      hero,
      section(t('draws'), drawGames(leadId)),
      section(t('scratch'), el('div', {}, [
        // Not scratched yet: a row a kind (twelve bought at once, one row ×12), the next one a tap away.
        open.length ? el('div', { class: 'q-rowcard lt-open' }, [...new Set(open.map(x => x.card))].map(card => { const mine = open.filter(x => x.card === card); return el('button', { class: 'q-ritem chevron', type: 'button', onclick: () => openScratch(mine[0].id) }, [cardArt(card, CARDS[card][lang], CARDS[card].color, 'sc-thumb'), el('span', { class: 'q-ritem-text' }, [el('span', { class: 'q-ritem-title q-fit-wrap', text: CARDS[card][lang] })]), el('span', { class: 'q-tag orange', text: mine.length > 1 ? `${t('unscratched')} ×${mine.length}` : t('unscratched') })]); })) : null,
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
        plays.length > 1 ? kitUI.pickSeg(plays.map(p => [p, playName(g, p)]), sel.play, p => ((sel.play = p), paint()), { cls: 'small', seg: true }) : null,
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
        kitUI.pickSeg(sizes.map(z => [z, COMBO_NAME[lang][z]]), sel.size, z => ((sel.size = z), paint()), { cls: 'small', seg: true }),
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
  // The counter: the cards on sale on a shelf a price (NT$100, NT$200 …), each
  // its whole ticket with its top prize and win rate. A tap opens its page
  // (how it plays, every prize and its odds) to buy one or more.
  function scratchCards() {
    const all = onSale();
    const prices = [...new Set(all.map(id => CARDS[id].price))].sort((a, b) => a - b);
    const soon = id => {
      const u = CARDS[id].until && new Date(`${CARDS[id].until}T17:00:00+08:00`);
      return u && u - Date.now() < 14 * 864e5 ? t('soldUntil', { d: `${u.getMonth() + 1}/${u.getDate()}` }) : null;
    };
    const tile = id => {
      const c = CARDS[id];
      const end = soon(id);
      return el('button', { class: 'sc-card q-press', type: 'button', style: `--lotto:${c.color}`, onclick: () => openCard(id) }, [
        el('span', { class: 'sc-card-pic' }, [sample(id, `art/ticket/s/${id}.webp`)]),
        el('span', { class: 'sc-card-name', text: c[lang] }),
        el('strong', { class: 'sc-card-top num', text: compactMoney(topPrize(id), lang).replace(/^NT/, '') }),
        el('small', { class: `sc-card-sub num${end ? ' soon' : ''}`, text: end || (rateOf(id) ? `${t('winRate')} ${rateOf(id)}%` : '') })
      ]);
    };
    return el(
      'div',
      { class: 'sc-shelves' },
      prices.map(p => {
        const ids = all.filter(id => CARDS[id].price === p);
        return el('div', { class: 'sc-shelf' }, [
          el('div', { class: 'sc-shelf-h' }, [el('strong', { class: 'num', text: money(p) }), el('small', { text: t('kindsN', { n: ids.length }) })]),
          el('div', { class: 'sc-rack' }, ids.map(tile))
        ]);
      })
    );
  }
  const onSale = () => CARD_ORDER.filter(id => cardOnSale(id));
  // A card as it sits at the counter: its ticket, latex on, what's printed
  // round it (a 局's tiles, its serial) a sample; as wide as its box (4:3), or
  // as tall. The picture alone for a card with no ticket layout.
  const sample = (id, src = `art/ticket/${id}.webp`) => {
    const [W, H] = TICKETS[id]?.size || [4, 3];
    const f = face(id, 0, 7);
    const real = faceEl.ticket(id, f, serialOf({ id: `sample-${id}`, card: id }), src);
    const node = real?.node || el('img', { class: 'tk-art', src, alt: CARDS[id][lang], decoding: 'async' });
    node.classList.add('tk-sample');
    node.style.width = `${Math.min(100, (W / H) * 75).toFixed(2)}%`;
    node.querySelector('img')?.setAttribute('loading', 'lazy');
    return node;
  };
  // Its win rate (中獎張數 of 發行張數), one decimal.
  const rateOf = id => {
    const c = CARDS[id];
    const wins = (c.prizes || []).reduce((n, [, k]) => n + k, 0);
    return c.issued && wins ? ((wins / c.issued) * 100).toFixed(1) : '';
  };
  // 玩法 in its steps (1. 2. …, or 遊戲一、遊戲二 …, else its sentences).
  const howSteps = text => {
    const by = [/(?=\b\d\.\s?)/, /(?=遊戲[一二三四五六七]：)/, /(?=Game \d:)/].find(re => text.split(re).length > 1);
    const parts = by ? text.split(by) : text.split(/(?<=[。；;]|\.\s)/);
    return parts.map(x => x.replace(/^\d\.\s?/, '').trim()).filter(Boolean);
  };

  // A card's page: its ticket, its numbers (win rate, top prize, price), how
  // it plays or every prize with its odds, and how many to buy.
  function openCard(id) {
    const c = CARDS[id];
    if (!c) return;
    const en = lang === 'en';
    const [W, H] = TICKETS[id]?.size || [4, 3];
    new Image().src = `art/ticket/${id}.webp`;
    const wins = (c.prizes || []).reduce((n, [, k]) => n + k, 0);
    const [top, tops] = (c.prizes || []).at(-1) || [topPrize(id), 0];
    const u = c.until && new Date(`${c.until}T17:00:00+08:00`);
    const stat = (label, value, sub) => el('div', { class: 'sc-stat' }, [el('small', { text: label }), el('strong', { class: 'num', text: value }), sub ? el('span', { class: 'num', text: sub }) : null].filter(Boolean));
    const stats = el('div', { class: 'sc-info' }, [
      wins ? stat(t('winRate'), `${rateOf(id)}%`, t('everyN', { n: (c.issued / wins).toFixed(1) })) : null,
      stat(en ? 'Top prize' : '頭獎', compactMoney(top, lang).replace(/^NT/, ''), tops ? t('topN', { n: tops }) : null),
      stat(t('price1'), money(c.price), u ? t('soldUntil', { d: `${u.getMonth() + 1}/${u.getDate()}` }) : null)
    ].filter(Boolean));
    const how = el('ol', { class: 'sc-how-list' }, howSteps(c.how[lang]).map(x => el('li', { text: x })));
    // Every prize, top first, and the odds of it (1 in N: 發行張數 over how many were printed).
    const odds = el('div', { class: 'sc-odds' }, [...(c.prizes || [])].reverse().map(([v, n]) =>
      el('div', { class: 'sc-odd' }, [el('strong', { class: 'num', text: compactMoney(v, lang).replace(/^NT/, '') }), el('span', { class: 'num', text: t('oneIn', { n: Math.round(c.issued / n).toLocaleString('en-US') }) })])
    ));
    let tab = 'how';
    const pane = el('div', { class: 'sc-pane' }, [how]);
    const tabs = el('div', { class: 'q-chips sc-tabs' }, [['how', t('howShort')], ['odds', t('oddsTab')]].map(([k, label]) =>
      el('button', { class: 'q-chip', type: 'button', 'aria-pressed': String(k === tab), text: label, onclick: e => {
        tab = k;
        for (const b of tabs.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
        pane.replaceChildren(k === 'how' ? how : odds);
      } })
    ));
    // How many: 1 to 10, the price on the button.
    let n = 1;
    const count = el('strong', { class: 'sc-n num', text: '1' });
    const buyBtn = el('button', { class: 'q-btn primary sc-buy', type: 'button', text: t('buyCard', { price: money(c.price) }), onclick: () => buyCards(id, n, sheet, on => ((buyBtn.disabled = on), buyBtn.classList.toggle('busy', on))) });
    const setN = k => {
      n = Math.max(1, Math.min(10, k));
      count.textContent = `×${n}`;
      buyBtn.textContent = t('buyCard', { price: money(c.price * n) });
      less.disabled = n <= 1;
      more.disabled = n >= 10;
    };
    const less = el('button', { class: 'sc-step', type: 'button', 'aria-label': '−', text: '−', onclick: () => setN(n - 1) });
    const more = el('button', { class: 'sc-step', type: 'button', 'aria-label': '+', text: '+', onclick: () => setN(n + 1) });
    const foot = el('div', { class: 'lotto-buybar sc-bar q-sheet-foot' }, [el('div', { class: 'sc-stepper' }, [less, count, more]), buyBtn]);
    const sheet = kitUI.sheet({
      title: c[lang],
      body: [el('div', { class: 'sc-hero', style: `--lotto:${c.color};--ar:${W / H}` }, [sample(id)]), stats, tabs, pane],
      foot,
      cls: 'lotto-sheet sc-card-sheet',
      detent: 'large',
      closeLabel: en ? 'Close' : '關閉'
    });
    sheet.el.style.setProperty('--lotto', ticketLook(id)['--panel']);
    setN(1);
    // (One screen: a long 玩法 on a short phone, the picture smaller.)
    const ro = new ResizeObserver(() => requestAnimationFrame(() => {
      const d = sheet.el;
      d.classList.remove('tight');
      if (d.scrollHeight > d.clientHeight + 1) d.classList.add('tight');
    }));
    ro.observe(pane);
    sheet.el.addEventListener('close', () => ro.disconnect(), { once: true });
  }

  // Buys n of a card (each checked here, then sold by the Worker, which
  // draws its prize: lib/settled.mjs buyCardsAt), and opens the first.
  async function buyCards(id, n, page, buying = () => {}) {
    if (!cardOnSale(id)) return;
    const c = CARDS[id];
    const own = ctx.funds(ctx.getAccount());
    if (c.price * n > own) return void tellK({ lang, title: t('funds'), body: t('fundsBody', { v: money(c.price * n) }) }, 'coin');
    // Each checked here (the balance), then all sold by the Worker in one go
    // (one charge, each prize drawn there), kept and saved once.
    let acc = ctx.getAccount();
    const asked = [];
    for (let i = 0; i < n; i++) {
      const r = buyScratch(acc, { id: newSlipId(), card: id }, new Date(), { extra: extra(acc) });
      if (r.error) break;
      acc = r.account;
      asked.push(r.ticket);
    }
    if (!asked.length) return;
    buying(true);
    let got = [];
    let wallet = null;
    const sold = await buyCardsAt(asked).catch(() => null);
    if (sold?.tickets) [got, wallet] = [sold.tickets, sold.wallet];
    buying(false);
    if (!got.length) return void (sold?.refused?.problem === 'funds' ? tellK({ lang, title: t('funds'), body: t('fundsBody', { v: money(c.price * n) }) }, 'coin') : tell({ lang, icon: '⏳', title: t('failed') }));
    ctx.setWallet(wallet);
    ctx.commitAccount(addTickets(ctx.getAccount(), got));
    if (!got.length) return;
    ctx.track([`scratch:${id}`], got.length);
    page?.close();
    openScratch(got[0].id);
  }

  function openScratch(ticketId) {
    const ticket = ctx.getAccount().tickets.find(x => x.id === ticketId);
    if (!ticket) return;
    const c = CARDS[ticket.card];
    const f = face(ticket.card, ticket.gross ?? ticket.prize, ticket.seed);
    const pays = facePays(ticket.card, f);
    const fresh = ticket.status === 'open';
    let allBtn = null;
    let cover = null;
    let player = null;
    // Under the ticket, the same row before and after: how to scratch, then what it won.
    // Under the ticket once it's played: what it won (nothing of it before).
    const result = el('div', { class: 'sc-result', role: 'status' });
    // Another card still to scratch (any kind), the one bought next first.
    const nextOpen = () => ctx.getAccount().tickets.filter(x => x.card && x.status === 'open' && x.id !== ticketId);
    const done = () => {
      if (ctx.getAccount().tickets.find(x => x.id === ticketId)?.status === 'open') {
        ctx.commitAccount(revealScratch(ctx.getAccount(), ticketId));
        // The prize paid by the Worker (the same id: once); asked again at the next sync if this one fails.
        revealCard(ticketId).then(r => r?.wallet && ctx.setWallet(r.wallet)).catch(() => {});
        ctx.syncNow();
        if (pays && !player) navigator.vibrate?.([30, 40, 60]);
      }
      ticketEl.classList.add('revealed');
      // (Played: the ticket at its own height, its result and numbers under it.)
      dialog?.classList.remove('sc-playing');
      cover?.clear();
      player?.clear();
      if (fresh) player?.celebrate(pays > 0, pays >= c.price * 10);
      // 一次刮開 becomes the next card to scratch (or 關閉): the bar stays two buttons.
      const rest = nextOpen();
      if (allBtn) {
        allBtn.disabled = false;
        allBtn.textContent = rest.length ? t('nextCard', { n: rest.length }) : lang === 'en' ? 'Close' : '關閉';
        allBtn.onclick = () => (close(), rest.length && openScratch((rest.find(x => x.card === ticket.card) || rest[0]).id));
      }
      stepHint?.remove();
      bar.classList.remove('playing');
      if (againBtn) bar.append(againBtn);
      result.className = `sc-result ${pays ? 'won' : 'lost'}`;
      const amount = pays ? el('strong', { class: 'sc-result-amount num', text: money(fresh && player ? 0 : pays) }) : null;
      result.replaceChildren(...[pays ? kitGlyph(kitUI, 'spark', 'sc-result-icon') : null, el('strong', { class: 'sc-result-label', text: pays ? t('youWon') : t('noWin') }), amount].filter(Boolean));
      // The prize counted up, as a win is.
      if (amount && fresh && player) {
        const t0 = performance.now();
        const ms = Math.min(1400, 500 + Math.log10(pays) * 180);
        const step = now => {
          const k = Math.min(1, (now - t0) / ms);
          amount.textContent = money(k < 1 ? Math.round((pays * (1 - (1 - k) ** 3)) / 10) * 10 : pays);
          if (k < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
      info?.replaceWith((info = cardInfo(ticket.card)));
    };
    // A card on sale is its real ticket (its own picture, scratched where the
    // real one is), filling the sheet; a retired one its games on a panel under silver.
    const real = faceEl.ticket(ticket.card, f, serialOf(ticket));
    let ticketEl;
    let wrap = null;
    let info = null;
    let prizes = null;
    if (real) {
      player = scratchTicket({ el, label: t('scratchHint') }, real, { open: fresh, colors: [ticketLook(ticket.card)['--panel'], ticketLook(ticket.card)['--frame'], '#fbbf24', '#ffffff'] });
      player.onDone(done);
      ticketEl = el('div', { class: 'sc-real' }, [player.frame, result]);
      info = cardInfo(ticket.card);
      prizes = cardPrizes(ticket.card);
    } else {
      wrap = el('div', { class: 'sc-play', 'data-no-sheet-swipe': '' }, [faceEl(ticket.card, f)]);
      ticketEl = el('div', { class: 'sc-ticket', style: Object.entries(ticketLook(ticket.card)).map(([k, v]) => `${k}:${v}`).join(';') }, [
        cardArt(ticket.card, c[lang], c.color, 'sc-top-art'),
        wrap,
        result,
        el('p', { class: 'sc-how', text: c.how[lang] })
      ]);
    }
    // While it's played: the ticket and the bar only (what to do, then 一次刮開);
    // played: 下一張 (or 關閉) and 再買.
    const playing = real && fresh;
    const againBtn = !cardOnSale(ticket.card) ? null : el('button', { class: 'q-btn primary', type: 'button', text: t('againCard', { v: money(c.price) }), onclick: () => (close(), openCard(ticket.card)) });
    const stepHint = playing ? el('button', { class: 'sc-step-hint', type: 'button', onclick: () => tellK({ lang, title: c[lang], body: howSteps(c.how[lang]).map((x, i, all) => (all.length > 1 ? `${i + 1}. ${x}` : x)).join('\n') }, cardArt(ticket.card, c[lang], c.color, 'sc-ask')) }, [el('span', { class: 'sc-step-text', text: t('tapHint') }), el('small', { text: t('howShort') })]) : null;
    player?.onStep((i, n) => stepHint?.firstElementChild && (stepHint.firstElementChild.textContent = n ? t('partN', { i: i + 1, n }) : t('tapHint')));
    const bar = el('div', { class: `lotto-buybar sc-bar q-sheet-foot${playing ? ' playing' : ''}` }, [
      stepHint,
      (allBtn = el('button', { class: 'q-btn', type: 'button', text: t('scratchAll'), disabled: !fresh ? '' : null, onclick: () => ((allBtn.disabled = true), player ? player.all() : cover ? cover.all() : done()) })),
      playing ? null : againBtn
    ]);
    let dialog = null;
    const sheet = kitUI.sheet({ title: c[lang], body: real ? [ticketEl, info, prizes] : [ticketEl, bar], foot: real ? bar : null, cls: `lotto-sheet${real ? ' sc-real-sheet' : ''}${playing ? ' sc-playing' : ''}`, detent: 'large', closeLabel: lang === 'en' ? 'Close' : '關閉', onClose: () => render() });
    dialog = sheet.el;
    // (Its buttons in the ticket's own panel colour.)
    dialog.style.setProperty('--lotto', ticketLook(ticket.card)['--panel']);
    dialog.addEventListener('close', () => player?.stop(), { once: true });
    const close = () => sheet.close();
    if (real) {
      // (The sheet stays one screen: under a tall ticket on a short phone, no stats.)
      const roomy = () => {
        dialog.classList.remove('tight');
        if (dialog.scrollHeight > dialog.clientHeight + 1) dialog.classList.add('tight');
      };
      const ro = new ResizeObserver(() => requestAnimationFrame(roomy));
      ro.observe(player.frame);
      dialog.addEventListener('close', () => ro.disconnect(), { once: true });
    }
    if (!real) {
      // One screen, no scrolling, like a ticket in the hand.
      const over = () => dialog.scrollHeight - dialog.clientHeight;
      const fit = () => {
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
      addEventListener('resize', fit);
      dialog.addEventListener('close', () => removeEventListener('resize', fit), { once: true });
    }
    if (!fresh) return void done();
    if (!real) cover = scratchable(wrap, done);
  }

  // The ticket's serial (book-ticket, as printed: 548721-037), its own for good: from its id.
  const serialOf = ticket => {
    let h = 2166136261;
    for (const ch of String(ticket.id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    const book = 100_000 + ((h >>> 0) % 900_000);
    const per = CARDS[ticket.card].price >= 500 ? 50 : CARDS[ticket.card].price >= 200 ? 100 : 150;
    return `${book}-${String((Math.imul(h, 2654435761) >>> 0) % per).padStart(3, '0')}`;
  };
  // Its prize table (獎金結構: every prize and how many were printed), top
  // first, as many rows as the sheet has room for (whole rows, never cut).
  function cardPrizes(id) {
    const list = [...(CARDS[id].prizes || [])].reverse();
    const box = el('div', { class: 'sc-prizes' }, [
      el('small', { class: 'sc-prizes-h', text: lang === 'en' ? 'Prizes' : '獎金結構' }),
      el('div', { class: 'sc-prize-grid' }, list.map(([v, n]) => el('div', { class: 'sc-prize' }, [el('strong', { class: 'num', text: compactMoney(v, lang).replace(/^NT/, '') }), el('span', { class: 'num', text: lang === 'en' ? `×${n.toLocaleString('en-US')}` : `${n.toLocaleString('en-US')} 張` })])))
    ]);
    const grid = box.lastElementChild;
    new ResizeObserver(() => {
      const kids = [...grid.children];
      for (const k of kids) k.hidden = false;
      const top = grid.getBoundingClientRect().top + grid.clientHeight + 1;
      const fits = kids.map(k => k.getBoundingClientRect().bottom <= top);
      kids.forEach((k, i) => (k.hidden = !fits[i]));
      box.classList.toggle('none', kids.every(k => k.hidden));
    }).observe(box);
    return box;
  }
  // Under the ticket: its win rate and top prize (its own table: 中獎張數 of 發行張數),
  // and how this card has gone for them (every one scratched).
  function cardInfo(id) {
    const c = CARDS[id];
    const wins = (c.prizes || []).reduce((n, [, k]) => n + k, 0);
    const [top, tops] = (c.prizes || []).at(-1) || [topPrize(id), 0];
    const mine = ctx.getAccount().tickets.filter(x => x.card === id && x.status !== 'open');
    const won = mine.filter(x => (x.prize || 0) > 0).length;
    const net = mine.reduce((n, x) => n + (x.prize || 0) - (x.cost ?? c.price), 0);
    const tile = (label, value, sub, cls = '') => el('div', { class: `sc-stat${cls}` }, [el('small', { text: label }), el('strong', { class: 'num', text: value }), sub ? el('span', { class: 'num', text: sub }) : null].filter(Boolean));
    const en = lang === 'en';
    return el('div', { class: 'sc-info' }, [
      c.issued && wins ? tile(en ? 'Win rate' : '中獎率', `${((wins / c.issued) * 100).toFixed(1)}%`, en ? `1 in ${(c.issued / wins).toFixed(1)}` : `每 ${(c.issued / wins).toFixed(1)} 張中 1`) : null,
      tile(en ? 'Top prize' : '頭獎', compactMoney(top, lang).replace(/^NT/, ''), tops ? (en ? `${tops} printed` : `共 ${tops} 張`) : null),
      tile(en ? 'You on this card' : '你的戰績', mine.length ? (en ? `${won} of ${mine.length}` : `${mine.length} 張中 ${won}`) : en ? 'First one' : '第一張', mine.length ? `${net >= 0 ? '+' : '−'}${money(Math.abs(net))}` : null, mine.length ? (net >= 0 ? ' up' : ' down') : '')
    ].filter(Boolean));
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
      for (let y = -h; y < h * 2; y += 26) for (let x = -w; x < w * 2; x += 86) g.fillText('LONGSHOT', x + ((y / 26) % 2) * 43, y);
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
      g.roundRect ? g.roundRect((w - tw) / 2, h / 2 - 20, tw, 40, 20) : g.rect((w - tw) / 2, h / 2 - 20, tw, 40);
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
      // One card a draw (a 多期 purchase at its next draw), however many 注
      // were bought for it, and one a kind of scratch card not scratched yet.
      open.length ? el('div', { class: 'lotto-tickets' }, openGroups(open)) : null,
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
    const wins = list.filter(x => x.prize > 0).length;
    const key = `d:${x0.game}:${x0.draw?.at}`;
    // The winners first; past FOLD 注, the rest a tap away.
    const lines = [...list].sort((a, b) => (b.prize || 0) - (a.prize || 0));
    return el('div', { class: 'lt-group', style: `--lotto:${g.color}` }, [
      el('div', { class: 'lt-head' }, [el('div', { class: 'lt-who' }, [gameLogo(x0.game, gameName(x0.game, lang), g.color, 'lt-mark-row'), el('div', { class: 'lt-title' }, [el('strong', { text: gameName(x0.game, lang) }), el('small', { class: 'num', text: termText(x0) || hourText(x0.draw.at) })])]), list.length > 1 ? el('span', { class: 'lt-sum' }, [netChip(got), el('small', { class: 'num', text: [t('betsN', { n: betsOf(list) }), wins ? t('winsN', { n: wins }) : ''].filter(Boolean).join(' · ') })]) : netChip(got)]),
      drawn ? el('div', { class: 'lt-drawn' }, [el('span', { class: 'lt-label', text: t('called') }), el('div', { class: 'balls' }, [...(drawn.digits || drawn.numbers || []).map(n => ball(n, 'dim', Boolean(drawn.digits))), drawn.special != null ? ball(drawn.special, 'dim special') : null, drawn.zone2 != null ? ball(drawn.zone2, 'dim special') : null].filter(Boolean))]) : null,
      foldedLines(key, lines, lineRow, Math.max(FOLD, wins))
    ]);
  }
  // A group's 注: the first `shown`, then one row to see the rest (and to fold them again).
  const FOLD = 3;
  ui.unfolded = new Set();
  function foldedLines(key, list, row, shown = FOLD) {
    const box = el('div', { class: 'lt-lines' });
    const paint = () => {
      const all = ui.unfolded.has(key) || list.length <= shown + 1;
      box.replaceChildren(
        ...(all ? list : list.slice(0, shown)).map(row),
        ...(list.length <= shown + 1 ? [] : [ el('button', { class: 'lt-fold', type: 'button', 'aria-expanded': String(all), onclick: () => (ui.unfolded.has(key) ? ui.unfolded.delete(key) : ui.unfolded.add(key), paint()) }, [el('span', { text: all ? t('foldLess') : t('foldMore', { n: list.length - shown }) }), el('i', { class: 'pl-chev', 'aria-hidden': 'true' })])])
      );
    };
    paint();
    return box;
  }
  // How many 注 a list of tickets is (a 包牌 its bets, a 倍數 counted once).
  const betsOf = list => list.reduce((s, x) => s + (x.bets || 1), 0);
  // One 注 on a draw card: its numbers (hits lit up), then what it won or how it was played.
  const lineRow = x => el('div', { class: `lt-line${x.prize > 0 ? ` won out-up` : ''}` }, [el('div', { class: 'balls' }, picksOf(x)), x.prize > 0 ? el('span', { class: 'lt-win' }, [tierText(x) ? el('small', { class: 'lt-tier', text: tierText(x) }) : null, el('span', { class: 'num', text: `+${money(x.prize)}` })].filter(Boolean)) : el('span', { class: 'num', text: [x.sel.play ? playName(GAMES[x.game] || RETIRED, x.sel.play) : x.sel.size ? COMBO_NAME[lang][x.sel.size] : isSystem(x.game, x.sel) ? t('systemBets', { n: x.bets }) : '', x.multiple > 1 ? `×${x.multiple}` : '', x.series ? t('seriesN', { k: x.series.n, n: x.series.of }) : ''].filter(Boolean).join(' · ') })]);
  // When an open draw is: a countdown under a day away, else its day and time.
  function drawWhen(x) {
    const ms = x.draw.at - Date.now();
    if (ms <= 0) return t('drawAt', { when: hourText(x.draw.at) });
    const mins = Math.ceil(ms / 60_000);
    if (mins < 60) return t('inMin', { n: mins });
    if (mins < 24 * 60) return t('inHour', { h: Math.floor(mins / 60), m: mins % 60 });
    return lang === 'en' ? timeText(x.draw.at).replace(/,/g, '') : t('drawAt', { when: timeText(x.draw.at) });
  }
  // 等待開獎: a card per game and draw (each 多期 purchase at its next one)
  // with its 注 count, cost and countdown, the 注 folded past three; scratch
  // cards not scratched yet, one card per kind.
  function openGroups(open) {
    const draws = new Map();
    const cards = new Map();
    for (const s of bySeries(open.filter(x => !x.card))) {
      const k = `${s.first.game}:${s.first.draw?.at}`;
      if (!draws.has(k)) draws.set(k, []);
      draws.get(k).push(s);
    }
    for (const x of open.filter(x => x.card)) {
      if (!cards.has(x.card)) cards.set(x.card, []);
      cards.get(x.card).push(x);
    }
    const drawCards = [...draws.entries()].sort((a, b) => (a[1][0].first.draw?.at ?? 0) - (b[1][0].first.draw?.at ?? 0)).map(([k, series]) => {
      const list = series.map(s => s.first);
      const x0 = list[0];
      const g = GAMES[x0.game] || RETIRED;
      const cost = list.reduce((s, x) => s + (Number(x.cost) || 0), 0);
      const multi = series.find(s => s.first.series);
      const state = g === RETIRED ? t('retired') : list.some(x => ui.pending.has(x.id)) ? t('pendingPay') : drawWhen(x0);
      return el('div', { class: 'lt-group', style: `--lotto:${g.color}` }, [
        el('div', { class: 'lt-head' }, [
          el('div', { class: 'lt-who' }, [gameLogo(x0.game, gameName(x0.game, lang), g.color, 'lt-mark-row'), el('div', { class: 'lt-title' }, [el('strong', { text: gameName(x0.game, lang) }), el('small', { class: 'num', text: [openTerm(x0), state].filter(Boolean).join(' · ') })])]),
          el('span', { class: 'lt-sum' }, [el('strong', { class: 'num', text: money(cost) }), el('small', { class: 'num', text: t('betsN', { n: betsOf(list) }) })])
        ]),
        foldedLines(`o:${k}`, list, lineRow),
        multi ? el('small', { class: 'lt-series', text: t('seriesLeft', { n: multi.first.series.of, k: multi.all.length }) }) : null
      ]);
    });
    return [...drawCards, ...[...cards.values()].map(scratchGroup)];
  }
  // Scratch cards of one kind that day: a tile each, tap to see it again
  // (one card: its tile says what it won, no second figure in the head).
  function scratchGroup(list) {
    const c = CARDS[list[0].card];
    const got = list.reduce((s, x) => s + (x.prize || 0), 0);
    const open = list[0].status === 'open';
    const cost = list.reduce((s, x) => s + (Number(x.cost) || 0), 0);
    // Not scratched yet: what they cost, a tile each to scratch.
    return el('div', { class: 'lt-group', style: `--lotto:${c.color}` }, [
      el('div', { class: 'lt-head' }, [el('div', { class: 'lt-who' }, [cardArt(list[0].card, c[lang], c.color, 'sc-thumb'), el('div', { class: 'lt-title' }, [el('strong', { text: `${c[lang]}${list.length > 1 ? ` ×${list.length}` : ''}` }), el('small', { class: 'num', text: open ? `${t('scratch')} · ${t('unscratched')}` : t('scratch') })])]), open ? el('span', { class: 'lt-sum' }, [el('strong', { class: 'num', text: money(cost) })]) : list.length > 1 ? netChip(got) : null]),
      // Even rows: at most four a row, the rows as full as each other.
      el('div', { class: 'lt-cards', style: `--n:${Math.ceil(list.length / Math.ceil(list.length / 4))}` }, list.map(x => el('button', { type: 'button', class: `lt-card${!open && x.prize > 0 ? ' won out-up' : ''}${open ? ' unscratched' : ''}`, onclick: () => openScratch(x.id), text: open ? t('toScratch') : x.prize > 0 ? compactMoney(x.prize, lang) : t('outNone') })))
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
  // 紀錄's 彩券 view.
  function renderTickets(root) {
    if (!root || !ctx.getAccount()) return;
    settleDue();
    root.replaceChildren(myTickets());
  }

  return { render, settleDue, renderTickets, homeLead, openGame };
}
