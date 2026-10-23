// 紀錄 › 戰績: the wins. What's been won (bets paid, lottery
// prizes) with its rhythm over time, the numbers worth bragging about,
// achievements to chase (each with its progress), the biggest moments, the
// sports that pay. A period filter on top.
import { gameName, GAMES } from './lib/lottery.mjs';
import { gameLogo, cardArt, kitGlyph } from './icons.js';
import { CARDS } from './lib/scratch.mjs';
import { winsOf, longestRun, achievementsOf } from './lib/stats.mjs';
import * as kitUI from './kit/ui.mjs';

const T = {
  zh: {
    all: '全部', d30: '30 天', d7: '7 天',
    total: '累計中獎', biggestV: '最大一筆 {v}', none: '還沒有中獎', byWeek: '每週中獎', byDay: '每日中獎',
    month: '本月中獎', streak: '最長連中', streakN: '{n} 張', top: '最高倍數', bigLotto: '彩券最大獎', winsNV: '中獎 {n} 次',
    badges: '成就', moments: '中獎時刻', sports: '拿手運動',
    slipWin: '{n} 場', lottery: '彩券', scratch: '刮刮樂',
    mixed: '混合串關',
    b_first: '首勝', b_firstD: '第一筆中獎',
    b_run3: '三連中', b_run3D: '連續 3 張投注單中獎',
    b_run5: '五連中', b_run5D: '連續 5 張投注單中獎',
    b_parlay3: '串關高手', b_parlay3D: '3 場以上串關全中',
    b_parlay5: '五串全中', b_parlay5D: '5 場以上串關全中',
    b_x10: '十倍奉還', b_x10D: '一張投注單拿回 10 倍以上',
    b_10k: '萬元大獎', b_10kD: '單筆中獎 NT$10,000 以上',
    b_lotto: '彩券得主', b_lottoD: '電腦彩券或刮刮樂中獎',
    b_100k: '十萬俱樂部', b_100kD: '累計中獎 NT$100,000',
    b_1m: '百萬贏家', b_1mD: '累計中獎 NT$1,000,000'
  },
  en: {
    all: 'All', d30: '30 days', d7: '7 days',
    total: 'Total won', biggestV: 'Biggest {v}', none: 'No wins yet', byWeek: 'Won by week', byDay: 'Won by day',
    month: 'Won this month', streak: 'Longest run', streakN: '{n} slips', top: 'Top multiple', bigLotto: 'Biggest lottery prize', winsNV: '{n} wins',
    badges: 'Achievements', moments: 'Big moments', sports: 'Your best sports',
    slipWin: '{n} picks', lottery: 'Lottery', scratch: 'Scratch card',
    mixed: 'Mixed parlays',
    b_first: 'First win', b_firstD: 'Your first win',
    b_run3: 'Hat trick', b_run3D: '3 winning slips in a row',
    b_run5: 'On fire', b_run5D: '5 winning slips in a row',
    b_parlay3: 'Parlay pro', b_parlay3D: 'A 3+ pick parlay, every pick right',
    b_parlay5: 'Five for five', b_parlay5D: 'A 5+ pick parlay, every pick right',
    b_x10: 'Ten-bagger', b_x10D: 'A slip that paid 10× its stake',
    b_10k: 'Big win', b_10kD: 'A single win of NT$10,000+',
    b_lotto: 'Lucky ticket', b_lottoD: 'A lottery or scratch card prize',
    b_100k: '100K club', b_100kD: 'NT$100,000 won in all',
    b_1m: 'Millionaire', b_1mD: 'NT$1,000,000 won in all'
  }
};
const PERIODS = { all: 0, d30: 30, d7: 7 };
const DAY = 86_400_000;
const TPE = 8 * 3_600_000;

export function mountStats(ctx) {
  const { state, el, fmtMoney, sportName, legIcon, leagueIcon } = ctx;
  const lang = () => (state.locale === 'en' ? 'en' : 'zh');
  const t = (key, vars = {}) => String(T[lang()][key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  const money = v => fmtMoney(v, { sign: false });
  const month = at => new Date(at + TPE).toISOString().slice(0, 7);
  const day = at => { const [, m, d] = new Date(at + TPE).toISOString().slice(0, 10).split('-'); return `${+m}/${+d}`; };
  const mult = x => `×${x.toFixed(x >= 10 ? 0 : 2)}`;

  // What a win is called on screen.
  const titleOf = w => (w.kind === 'lotto'
    ? (w.card ? CARDS[w.card]?.[lang() === 'en' ? 'en' : 'zh'] || t('scratch') : gameName(w.game, lang()))
    : w.labels.slice(0, 2).join('、') + (w.labels.length > 2 ? '…' : ''));
  const wins = since => winsOf(state.account, since).map(w => ({ ...w, title: titleOf(w) }));
  const longestRunNow = () => longestRun(state.account?.slips);
  const achievements = () => achievementsOf(state.account);

  // Winnings over time: weeks (all), 3-day steps (30 days) or days (7 days).
  function rhythm(list, period) {
    const n = period === 'd7' ? 7 : period === 'd30' ? 10 : 8;
    const step = period === 'd7' ? DAY : period === 'd30' ? 3 * DAY : 7 * DAY;
    const end = Date.now();
    const bars = Array.from({ length: n }, (_, i) => ({ from: end - (n - i) * step, to: end - (n - 1 - i) * step, v: 0 }));
    for (const w of list) {
      const b = bars.find(x => w.at >= x.from && w.at < x.to);
      if (b) b.v += w.amount;
    }
    const max = Math.max(1, ...bars.map(b => b.v));
    return el('div', { class: 'wins-rhythm', role: 'img', 'aria-label': t(period === 'd7' ? 'byDay' : 'byWeek') }, bars.map((b, i) => el('span', { class: `wr-bar${b.v ? ' on' : ''}${i === n - 1 ? ' now' : ''}`, style: `--h:${Math.max(4, Math.round((b.v / max) * 100))}%`, title: money(b.v) })));
  }

  function render(root) {
    const period = state.statsPeriod || 'all';
    const since = PERIODS[period] ? Date.now() - PERIODS[period] * DAY : 0;
    const list = wins(since);
    const total = list.reduce((s, w) => s + w.amount, 0);
    const biggest = [...list].sort((a, b) => b.amount - a.amount);
    const rerender = () => render(root);
    const section = (title, body, sub = '') => kitUI.section(title, body, { action: sub ? el('span', { class: 'pl-count', text: sub }) : null });
    const chips = el('div', { class: 'q-chips pl-chips', role: 'group' }, Object.keys(PERIODS).map(key => el('button', { class: 'q-chip', type: 'button', 'aria-pressed': String(period === key), text: t(key), onclick: () => ((state.statsPeriod = key), rerender()) })));
    // What's been won in the period, big, with its rhythm under it.
    const hero = el('section', { class: 'q-ambient st-total' }, [
      el('small', { class: 'st-label', text: t('total') }),
      el('strong', { class: 'st-big num stat-value', text: money(total) }),
      list.length ? el('span', { class: 'q-tags' }, [el('span', { class: 'q-tag green', text: t('winsNV', { n: list.length }) }), el('span', { class: 'q-tag', text: t('biggestV', { v: money(biggest[0].amount) }) })]) : el('span', { class: 'q-tags' }, [el('span', { class: 'q-tag', text: t('none') })]),
      rhythm(list, period)
    ]);

    // Achievements: the whole history, whatever the period. Unlocked first,
    // then the nearest ones to unlock.
    const ach = achievements();
    const unlocked = ach.filter(a => a.done).length;
    const badge = a =>
      el('div', { class: `q-rail-card st-badge${a.done ? ' done' : ''}`, title: t(`b_${a.key}D`) }, [
        el('span', { class: `q-tile${a.done ? '' : ' soft'}`, style: '--t:#d9a441', 'aria-hidden': 'true', text: a.done ? '★' : '☆' }),
        el('strong', { class: 'st-badge-name', text: t(`b_${a.key}`) }),
        el('small', { text: a.done && a.at ? day(a.at) : t(`b_${a.key}D`) }),
        a.done ? null : el('span', { class: 'st-progress', style: `--p:${Math.round(a.progress * 100)}%` })
      ]);
    const shown = [...ach].sort((x, y) => Number(y.done) - Number(x.done) || y.progress - x.progress);
    const badges = section(t('badges'), el('div', { class: 'q-rail small st-badges' }, shown.map(badge)), `${unlocked}/${ach.length}`);
    if (!list.length) return root.replaceChildren(chips, hero, badges);

    const thisMonth = wins(0).filter(w => month(w.at) === month(Date.now())).reduce((s, w) => s + w.amount, 0);
    const top = list.filter(w => w.kind === 'slip' && w.cost > 0).reduce((m, w) => Math.max(m, w.amount / w.cost), 0);
    const lotto = list.filter(w => w.kind === 'lotto').sort((a, b) => b.amount - a.amount)[0];
    const stat = (label, value) => el('div', { class: 'q-stat' }, [el('small', { text: label }), el('strong', { class: 'num stat-value', text: value })]);
    const stats = el('div', { class: 'q-stats st-stats', style: '--q-stats-n:2' }, [
      stat(t('month'), money(thisMonth)),
      stat(t('streak'), t('streakN', { n: longestRunNow() })),
      top > 1 ? stat(t('top'), mult(top)) : null,
      lotto ? stat(t('bigLotto'), money(lotto.amount)) : null
    ].filter(Boolean));

    // A moment's picture: the scratch card's face, the draw game's logo, or
    // the first pick's team logo (its sport's for a race or flag).
    const momentArt = w =>
      w.kind === 'lotto'
        ? w.card
          ? cardArt(w.card, w.title, CARDS[w.card]?.color, 'sc-thumb st-art', true)
          : gameLogo(w.game, w.title, GAMES[w.game]?.color, 'lt-mark-row st-art')
        : el('span', { class: 'st-logo', 'aria-hidden': 'true' }, [w.lead ? legIcon(w.lead, 'logo-md') : leagueIcon(w.sport)]);
    const moment = w =>
      el('div', { class: `q-ritem st-moment ${w.kind}` }, [
        momentArt(w),
        el('span', { class: 'q-ritem-text' }, [
          el('span', { class: 'q-ritem-title q-fit-wrap', text: w.title }),
          el('small', { text: [w.kind === 'lotto' ? t(w.card ? 'scratch' : 'lottery') : t('slipWin', { n: w.legs }), day(w.at)].join(' · ') })
        ]),
        el('span', { class: 'q-ritem-end' }, [el('span', { class: 'num', text: money(w.amount) }), w.cost > 0 && w.amount > w.cost ? el('small', { class: 'num', text: mult(w.amount / w.cost) }) : null])
      ]);

    const bySport = new Map();
    for (const w of list) if (w.kind === 'slip') bySport.set(w.sport, (bySport.get(w.sport) || 0) + w.amount);
    const sports = [...bySport.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const max = Math.max(1, ...sports.map(s => s[1]));

    root.replaceChildren(
      ...[
        chips,
        hero,
        stats,
        badges,
        section(t('moments'), el('div', { class: 'q-rowcard' }, biggest.slice(0, 5).map(moment))),
        sports.length
          ? section(t('sports'), el('div', { class: 'q-rowcard st-sports' }, sports.map(([sport, v]) =>
              el('div', { class: 'st-sport' }, [
                el('span', { class: 'st-logo sm', 'aria-hidden': 'true' }, [sport === 'mixed' ? kitGlyph(kitUI, 'ticket') : leagueIcon(sport, 'logo-xs')]),
                el('span', { class: 'st-sport-name', text: sport === 'mixed' ? t('mixed') : sportName(sport) }),
                el('span', { class: 'st-track' }, [el('i', { style: `--w:${((v / max) * 100).toFixed(1)}%` })]),
                el('strong', { class: 'num', text: money(v) })
              ])
            )))
          : null
      ].filter(Boolean)
    );
  }

  return { render };
}
