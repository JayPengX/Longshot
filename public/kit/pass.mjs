// The account sheet (the account button; accountSheet in core.mjs opens it,
// loaded the first time). Two tabs:
//   帳戶   the Longshot Pass: the balance and its latest entries, the weekly
//          money, security, the debug log
//   真相   how the house earns, in real numbers, and this account's own
//          record (truth.mjs)
import { money, describeEntry, nextPayday, showNewPass, recRows, ask, errorText, el } from './core.mjs';
import { PLAY, houseKeep, scratchBacks, record } from './truth.mjs';
import { sheet, section, segmented } from './ui.mjs';

export const STRINGS = {
  zh: {
    tab_pass: '帳戶',
    tab_truth: '真相',
    balance: '餘額',
    since: '{date} 開戶 · 第 {n} 天',
    weekly: '每週一發 {v} 零用金，下次 {date}（一）',
    latest: '最近明細',
    noEntries: '還沒有明細',
    security: '帳戶安全',
    signOutOthers: '登出其他所有裝置',
    signOutOthersAsk: '登出其他所有裝置？',
    signOutOthersBody: '除了這台，所有裝置都會登出。',
    signOutOthersOk: '全部登出',
    signOutOthersDone: '其他裝置都已登出。',
    rotate: '更換通行碼',
    rotateAsk: '換一組新的通行碼？',
    rotateBody: '舊通行碼立即失效，其他裝置會登出。新通行碼只顯示一次。',
    rotateOk: '換新通行碼',
    signOut: '在這台裝置登出',
    signOutAsk: '在這台裝置登出？',
    signOutBody: '這台裝置上的資料會全部清除，都保留在你的 Longshot Pass。',
    signOutOk: '登出',
    forgot: '忘記通行碼？在已登入的裝置按「更換通行碼」。',
    debug: '除錯紀錄',
    truthLead: '用真實的數字，和你自己的紀錄，說明莊家怎麼從你身上賺錢。知道了，才是自己在做決定。',
    edgeTitle: '莊家優勢',
    edgeSub: '每個賠率裡都藏著抽成：機率加起來超過 100%，多出來的就是莊家的。下面是每下注 NT$100，長期平均會被留下多少。',
    edgeSingle: '單場',
    edgeLegs: '{n} 關串關',
    edgeSingleSub: '賠率背後的機率加起來 {cut} 倍（籃球、足球約 {high} 倍，不讓分三項 {three} 倍）',
    yourBets: '你的投注回收率',
    yourBetsSub: '投注 {staked}，拿回 {won}',
    edgeFoot: '串關關數越多，莊家留得越多：抽成每關相乘。每張彩金超過 {free} 還要扣 {tax} 所得稅。跟台灣運彩一樣，下注後不能取消、不能提前兌現，也沒有加成或免費投注。',
    lotteryTitle: '彩券和刮刮樂',
    lotterySub: '每 NT$100 長期平均拿回多少。',
    lotteryDraw: '電腦彩券（威力彩、大樂透、539…）',
    lotteryDrawSub: '一半多一點拿去當獎金，其餘是彩券的收入和公益金',
    scratchAt: '{price} 刮刮樂',
    scratchKeeps: '每張平均留下 {v}',
    yourTickets: '你的彩券回收率',
    yourTicketsSub: '買了 {paid}，中了 {won}',
    lotteryFoot: '刮刮樂最常開出的是「中回本」（獎金等於票價）和只差一個的牌面，讓你覺得快中了、再買一張；越貴的卡回收率越高，是要讓你買貴的。',
    close: '關閉'
  },
  en: {
    tab_pass: 'Account',
    tab_truth: 'Truth',
    balance: 'Balance',
    since: 'Opened {date} · day {n}',
    weekly: '{v} every Monday; next on Mon {date}',
    latest: 'Latest entries',
    noEntries: 'No entries yet',
    security: 'Security',
    signOutOthers: 'Sign out every other device',
    signOutOthersAsk: 'Sign out every other device?',
    signOutOthersBody: 'Every device but this one is signed out.',
    signOutOthersOk: 'Sign them out',
    signOutOthersDone: 'Every other device is signed out.',
    rotate: 'Change my pass',
    rotateAsk: 'Get a new pass?',
    rotateBody: 'The old pass stops working and other devices sign out. The new one is shown once.',
    rotateOk: 'Get a new pass',
    signOut: 'Sign out on this device',
    signOutAsk: 'Sign out on this device?',
    signOutBody: 'Everything on this device is wiped; it all stays on your Longshot Pass.',
    signOutOk: 'Sign out',
    forgot: 'Forgot your pass? Choose “Change my pass” on a signed-in device.',
    debug: 'Debug log',
    truthLead: 'Real numbers, and your own record, on how the house makes money from you. Knowing it, the choice is yours.',
    edgeTitle: 'The house edge',
    edgeSub: 'Every price hides a cut: the chances behind the odds add up to more than 100%, and the extra is the house’s. Here’s what it keeps of every NT$100 staked, on average, over time.',
    edgeSingle: 'A single',
    edgeLegs: 'A {n}-pick parlay',
    edgeSingleSub: 'The chances behind the odds add up to {cut}× (basketball and soccer about {high}×, a three-way winner {three}×)',
    yourBets: 'Your bets’ payback',
    yourBetsSub: 'Staked {staked}, back {won}',
    edgeFoot: 'The more picks on a parlay, the more the house keeps: the cut multiplies with every pick. A slip paying over {free} loses {tax} income tax. As at Taiwan Sports Lottery, a bet can’t be cancelled or cashed out, and there are no boosts or free bets.',
    lotteryTitle: 'Lottery and scratch cards',
    lotterySub: 'What comes back of every NT$100, on average, over time.',
    lotteryDraw: 'Number draws (Super Lotto, Lotto 6/49, 539…)',
    lotteryDrawSub: 'A little over half goes to prizes; the rest is the lottery’s takings and good causes',
    scratchAt: 'A {price} scratch card',
    scratchKeeps: 'Keeps {v} of each card on average',
    yourTickets: 'Your tickets’ payback',
    yourTicketsSub: 'Paid {paid}, won {won}',
    lotteryFoot: 'Scratch cards most often show a “money back” prize (the price of the card) and faces one short of a win, so luck feels close and you buy another; dearer cards pay back more, to sell you the dearer ones.',
    close: 'Close'
  }
};

const put = (box, ...kids) => box.replaceChildren(...kids.filter(k => k != null && k !== false));
const pct = (x, digits = 1) => `${(Math.round(x * 100 * 10 ** digits) / 10 ** digits).toFixed(digits).replace(/\.0+$/, '')}%`;
const row = (label, value, sub = '', cls = '') => el('div', { class: `t-row ${cls}` }, [el('span', { class: 't-label' }, [el('strong', { text: label }), sub ? el('small', { class: 'muted', text: sub }) : null]), el('strong', { class: 'num t-value', text: value })]);
const facts = (rows, foot = '') => el('div', { class: 'q-card list facts' }, [...rows.filter(Boolean), foot ? el('p', { class: 'facts-foot', text: foot }) : null]);
const accountNumber = id => (id ? `LS ${id.slice(0, 4).toUpperCase()} ${id.slice(4, 8).toUpperCase()} ${id.slice(8, 12).toUpperCase()}` : '');

let open = null;
export function openPass(s, { tab = 'pass' } = {}) {
  const locale = s.lang === 'en' ? 'en' : 'zh';
  const t = (key, vars = {}) => String(STRINGS[locale][key] ?? STRINGS.zh[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  open?.close();
  const body = el('div', { class: 'q-pass-body' });
  const note = el('p', { class: 'q-sheet-note', role: 'status' });
  let current = tab;
  const tabs = segmented(['pass', 'truth'].map(id => ({ id, label: t(`tab_${id}`) })), { value: current, onChange: id => ((current = id), paint()) });

  const act = (label, fn, cls = 'q-row-btn') =>
    el('button', {
      class: cls,
      type: 'button',
      text: label,
      onclick: async event => {
        const b = event.currentTarget;
        b.disabled = true;
        try {
          await fn();
        } catch (e) {
          note.textContent = errorText(e, s.lang);
        } finally {
          b.disabled = false;
        }
      }
    });
  function account() {
    const w = s.wallet || {};
    const date = x => new Date(x).toLocaleDateString(locale === 'en' ? 'en-US' : 'zh-TW', { year: 'numeric', month: 'short', day: 'numeric' });
    const short = x => new Date(x).toLocaleDateString(locale === 'en' ? 'en-US' : 'zh-TW', { month: 'numeric', day: 'numeric' });
    const days = Number.isFinite(w.created) ? Math.max(1, Math.round((Date.now() - w.created) / 86_400_000)) : 0;
    const recent = [...(w.entries || [])].filter(e => e.amount !== 0).sort((a, b) => b.t - a.t).slice(0, 8);
    return [
      el('div', { class: 'q-card-hero' }, [
        el('div', { class: 'q-hero-top' }, [el('span', { class: 'q-hero-brand', text: 'LONGSHOT PASS' }), el('span', { class: 'q-hero-no num', text: accountNumber(s.pass) })]),
        el('span', { class: 'q-hero-label', text: t('balance') }),
        el('strong', { class: 'q-hero-balance num', text: money(s.pool) }),
        el('span', { class: 'q-hero-sub', text: days ? t('since', { date: date(w.created), n: days }) : '' })
      ]),
      el('p', { class: 'q-payday', text: t('weekly', { v: money(10_000), date: short(nextPayday()) }) }),
      section(
        t('latest'),
        recent.length
          ? el('ul', { class: 'q-card list q-recent' }, recent.map(e => el('li', {}, [el('span', { class: 'q-recent-when num', text: short(e.t) }), el('span', { class: 'q-recent-what', text: describeEntry(e, locale) }), el('strong', { class: `num ${e.amount < 0 ? 'down' : 'up'}`, text: money(e.amount, { sign: true }) })])))
          : el('p', { class: 'muted', text: t('noEntries') })
      ),
      el('h3', { class: 'q-sheet-h', text: t('security') }),
      el('div', { class: 'q-rows' }, [
        act(t('signOutOthers'), async () => {
          if (!(await ask({ lang: s.lang, icon: '🔒', title: t('signOutOthersAsk'), body: t('signOutOthersBody'), ok: t('signOutOthersOk'), danger: true }))) return;
          await s.signOutEverywhere();
          note.textContent = t('signOutOthersDone');
        }),
        act(t('rotate'), async () => {
          if (!(await ask({ lang: s.lang, icon: '🔑', title: t('rotateAsk'), body: t('rotateBody'), ok: t('rotateOk'), danger: true }))) return;
          const passcode = await s.rotate();
          // The sheet closes first: a modal sheet stays above everything else.
          sh.close();
          await showNewPass(s, passcode);
        }),
        act(
          t('signOut'),
          async () => {
            if (!(await ask({ lang: s.lang, icon: '👋', title: t('signOutAsk'), body: t('signOutBody'), ok: t('signOutOk') }))) return;
            s.signOut();
            location.reload();
          },
          'q-row-btn danger'
        )
      ]),
      el('p', { class: 'q-sheet-sub', text: t('forgot') }),
      el('h3', { class: 'q-sheet-h', text: t('debug') }),
      recRows(s, note),
      note
    ];
  }
  function truth() {
    const r = record(s.wallet);
    return [
      el('p', { class: 'truth-lead', text: t('truthLead') }),
      section(
        t('edgeTitle'),
        facts(
          [
            ...[1, 2, 3, 5, 7].map(n => row(n === 1 ? t('edgeSingle') : t('edgeLegs', { n }), pct(houseKeep(n)), n === 1 ? t('edgeSingleSub', { cut: PLAY.cut, high: PLAY.cutHigh, three: PLAY.threeWay }) : '')),
            r.staked > 0 ? row(t('yourBets'), r.betBack == null ? '—' : pct(r.betBack), t('yourBetsSub', { staked: money(r.staked), won: money(r.won) }), r.won >= r.staked ? 'up' : 'down') : null
          ],
          t('edgeFoot', { tax: pct(PLAY.tax, 0), free: money(PLAY.taxFree) })
        ),
        { sub: t('edgeSub') }
      ),
      section(
        t('lotteryTitle'),
        facts(
          [
            row(t('lotteryDraw'), pct(PLAY.draw, 0), t('lotteryDrawSub')),
            ...scratchBacks().map(([price, lo, hi]) => row(t('scratchAt', { price: money(price) }), Math.round(lo * 100) === Math.round(hi * 100) ? pct(lo, 0) : `${Math.round(lo * 100)}–${pct(hi, 0)}`, t('scratchKeeps', { v: money(Math.round(price * (1 - (lo + hi) / 2))) }))),
            r.tickets > 0 ? row(t('yourTickets'), r.ticketBack == null ? '—' : pct(r.ticketBack), t('yourTicketsSub', { paid: money(r.tickets), won: money(r.prizes) }), r.prizes >= r.tickets ? 'up' : 'down') : null
          ],
          t('lotteryFoot')
        ),
        { sub: t('lotterySub') }
      )
    ];
  }
  function paint() {
    put(body, ...(current === 'truth' ? truth() : account()));
  }
  paint();
  const onWallet = () => sh.el.open && current === 'pass' && paint();
  s.on?.('wallet', onWallet);
  const sh = sheet({
    title: el('span', { class: 'q-pass-title' }, [el('img', { src: './favicon.svg', alt: '', width: 28, height: 28 }), document.createTextNode('Longshot Pass')]),
    label: 'Longshot Pass',
    cls: 'q-pass',
    closeLabel: t('close'),
    body: [tabs, body],
    onClose() {
      if (open === sh) open = null;
    }
  });
  open = sh;
  return sh.el;
}
