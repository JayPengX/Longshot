// 紀錄 › 戰績: the whole record, win or lose. The net (what came back less
// what went in) with its ups and downs over time, how many won and lost, the
// runs both ways, the biggest swings both ways, each sport's net. Nothing is
// picked to look good: every decided bet and ticket in the period counts.
// A period filter on top.
import { gameName, GAMES } from './lib/lottery.mjs';
import { gameLogo, cardArt, kitGlyph } from './icons.js';
import { CARDS } from './lib/scratch.mjs';
import { playsOf, recordOf } from './lib/stats.mjs';
import { monthKey } from './lib/history.mjs';
import * as kitUI from './kit/ui.mjs';

const T = {
  zh: {
    all: '全部', d30: '30 天', d7: '7 天',
    net: '淨損益', none: '還沒有結算的投注', byWeek: '每週損益', byDay: '每日損益',
    wonLost: '中 {w} · 沒中 {l}', spentV: '投入 {v}', backV: '回收 {v}',
    month: '本月損益', hit: '中獎率', runWon: '最長連中', runLost: '最長連輸', runN: '{n} 張',
    swings: '最大輸贏', sports: '各項損益',
    slipN: '{n} 場', lottery: '電腦彩券', scratch: '刮刮樂', mixed: '混合串關'
  },
  en: {
    all: 'All', d30: '30 days', d7: '7 days',
    net: 'Net', none: 'Nothing settled yet', byWeek: 'Net by week', byDay: 'Net by day',
    wonLost: '{w} won · {l} lost', spentV: 'In {v}', backV: 'Back {v}',
    month: 'Net this month', hit: 'Hit rate', runWon: 'Longest win run', runLost: 'Longest losing run', runN: '{n} slips',
    swings: 'Biggest swings', sports: 'Net by sport',
    slipN: '{n} picks', lottery: 'Lottery', scratch: 'Scratch cards', mixed: 'Mixed parlays'
  }
};
const PERIODS = { all: 0, d30: 30, d7: 7 };
const DAY = 86_400_000;
const TPE = 8 * 3_600_000;
const tone = v => (v > 0 ? 'up' : v < 0 ? 'down' : '');

export function mountStats(ctx) {
  const { state, el, fmtMoney, sportName, legIcon, leagueIcon } = ctx;
  const lang = () => (state.locale === 'en' ? 'en' : 'zh');
  const t = (key, vars = {}) => String(T[lang()][key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  const money = v => fmtMoney(v, { sign: false });
  const signed = v => fmtMoney(v, { sign: true });
  const day = at => { const [, m, d] = new Date(at + TPE).toISOString().slice(0, 10).split('-'); return `${+m}/${+d}`; };

  // What a play is called on screen.
  const titleOf = p => (p.kind === 'lotto'
    ? (p.card ? CARDS[p.card]?.[lang() === 'en' ? 'en' : 'zh'] || t('scratch') : gameName(p.game, lang()))
    : p.labels.slice(0, 2).join('、') + (p.labels.length > 2 ? '…' : ''));
  const plays = since => playsOf(state.account, since).map(p => ({ ...p, title: titleOf(p) }));

  // The net over time, up or down from the middle line: weeks (all), 3-day
  // steps (30 days) or days (7 days).
  function rhythm(list, period) {
    const n = period === 'd7' ? 7 : period === 'd30' ? 10 : 8;
    const step = period === 'd7' ? DAY : period === 'd30' ? 3 * DAY : 7 * DAY;
    const end = Date.now();
    const bars = Array.from({ length: n }, (_, i) => ({ from: end - (n - i) * step, to: end - (n - 1 - i) * step, v: 0 }));
    for (const p of list) {
      const b = bars.find(x => p.at >= x.from && p.at < x.to);
      if (b) b.v += p.net;
    }
    const max = Math.max(1, ...bars.map(b => Math.abs(b.v)));
    return el('div', { class: 'st-rhythm', role: 'img', 'aria-label': t(period === 'd7' ? 'byDay' : 'byWeek') }, bars.map((b, i) =>
      el('span', { class: `sr-bar ${tone(b.v)}${i === n - 1 ? ' now' : ''}`.trim(), title: signed(b.v) }, [el('i', { style: `--h:${b.v ? Math.max(8, Math.round((Math.abs(b.v) / max) * 100)) : 0}%` })])
    ));
  }

  function render(root) {
    const period = state.statsPeriod || 'all';
    const since = PERIODS[period] ? Date.now() - PERIODS[period] * DAY : 0;
    const list = plays(since);
    const r = recordOf(list);
    const rerender = () => render(root);
    const section = (title, body, sub = '') => kitUI.section(title, body, { action: sub ? el('span', { class: 'pl-count', text: sub }) : null });
    const chips = el('div', { class: 'q-chips pl-chips', role: 'group' }, Object.keys(PERIODS).map(key => el('button', { class: 'q-chip', type: 'button', 'aria-pressed': String(period === key), text: t(key), onclick: () => ((state.statsPeriod = key), rerender()) })));
    // The net in the period, big, with its ups and downs under it.
    const hero = el('section', { class: `q-ambient st-total ${tone(r.net)}`.trim() }, [
      el('small', { class: 'st-label', text: t('net') }),
      el('strong', { class: `st-big num stat-value ${tone(r.net)}`.trim(), text: r.n ? signed(r.net) : '—' }),
      r.n
        ? el('span', { class: 'q-tags' }, [el('span', { class: 'q-tag', text: t('wonLost', { w: r.won, l: r.lost }) }), el('span', { class: 'q-tag', text: t('spentV', { v: money(r.spent) }) }), el('span', { class: 'q-tag', text: t('backV', { v: money(r.back) }) })])
        : el('span', { class: 'q-tags' }, [el('span', { class: 'q-tag', text: t('none') })]),
      r.n ? rhythm(list, period) : null
    ]);
    if (!r.n) return root.replaceChildren(chips, hero);

    const thisMonth = recordOf(plays(0).filter(p => monthKey(p.at) === monthKey(Date.now()))).net;
    const stat = (label, value, cls = '') => el('div', { class: 'q-stat' }, [el('small', { text: label }), el('strong', { class: `num stat-value ${cls}`.trim(), text: value })]);
    const stats = el('div', { class: 'q-stats st-stats', style: '--q-stats-n:2' }, [
      stat(t('month'), signed(thisMonth), tone(thisMonth)),
      stat(t('hit'), r.hit == null ? '—' : `${Math.round(r.hit * 100)}%`),
      stat(t('runWon'), t('runN', { n: r.runs.won })),
      stat(t('runLost'), t('runN', { n: r.runs.lost }))
    ]);

    // A play's picture: the scratch card's face, the draw game's logo, or
    // the first pick's team logo (its sport's for a race or flag).
    const art = p =>
      p.kind === 'lotto'
        ? p.card
          ? cardArt(p.card, p.title, CARDS[p.card]?.color, 'sc-thumb st-art', true)
          : gameLogo(p.game, p.title, GAMES[p.game]?.color, 'lt-mark-row st-art')
        : el('span', { class: 'st-logo', 'aria-hidden': 'true' }, [p.lead ? legIcon(p.lead, 'logo-md') : leagueIcon(p.sport)]);
    const row = p =>
      el('div', { class: `q-ritem st-moment ${p.kind}` }, [
        art(p),
        el('span', { class: 'q-ritem-text' }, [
          el('span', { class: 'q-ritem-title q-fit-wrap', text: p.title }),
          el('small', { text: [p.kind === 'lotto' ? t(p.card ? 'scratch' : 'lottery') : t('slipN', { n: p.legs }), day(p.at)].join(' · ') })
        ]),
        el('span', { class: 'q-ritem-end' }, [el('span', { class: `num ${tone(p.net)}`.trim(), text: signed(p.net) })])
      ]);
    // The three biggest wins and the three biggest losses, biggest swing first.
    const swings = [...list.filter(p => p.net > 0).sort((a, b) => b.net - a.net).slice(0, 3), ...list.filter(p => p.net < 0).sort((a, b) => a.net - b.net).slice(0, 3)].sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

    const sports = r.bySport.slice(0, 6);
    const max = Math.max(1, ...sports.map(s => Math.abs(s.net)));
    const sportIcon = key => (key === 'mixed' || key === 'lottery' || key === 'scratch' ? kitGlyph(kitUI, 'ticket') : leagueIcon(key, 'logo-xs'));
    const sportLabel = key => (key === 'mixed' || key === 'lottery' || key === 'scratch' ? t(key) : sportName(key));

    root.replaceChildren(
      ...[
        chips,
        hero,
        stats,
        swings.length ? section(t('swings'), el('div', { class: 'q-rowcard' }, swings.map(row))) : null,
        section(t('sports'), el('div', { class: 'q-rowcard st-sports' }, sports.map(g =>
          el('div', { class: 'st-sport' }, [
            el('span', { class: 'st-logo sm', 'aria-hidden': 'true' }, [sportIcon(g.key)]),
            el('span', { class: 'st-sport-name', text: sportLabel(g.key) }),
            el('span', { class: `st-track ${tone(g.net)}`.trim() }, [el('i', { style: `--w:${((Math.abs(g.net) / max) * 50).toFixed(1)}%` })]),
            el('strong', { class: `num ${tone(g.net)}`.trim(), text: signed(g.net) })
          ])
        )))
      ].filter(Boolean)
    );
  }

  return { render };
}
