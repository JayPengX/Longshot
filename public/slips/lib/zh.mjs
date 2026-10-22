// Names in Chinese the way 台灣運彩's tickets print them: players by their
// surname as Taiwan's press writes it (莎卡洛娃, 艾拉尼/包莉妮), East Asian
// players in full (謝淑薇, 山口茜), clubs, cities and tours in Chinese.
// Known names from the list below; the rest Google's reading (the kit's
// translate, through the proxy, kept a month), asked once and kept on this
// phone. Until a name comes back it shows as it was.

import { F1_NAMES_ZH } from '../../kit/logos.mjs';
import { LEAGUES, isSetSport } from './feed.mjs';

// Players whose Chinese Taiwan's press settled on, by their name's words in
// any order (Kambi writes Asian names either way round).
const FULL_NAMES = {
  'Su-Wei Hsieh': '謝淑薇', 'Hao-Ching Chan': '詹皓晴', 'Latisha Chan': '詹詠然', 'Ya-Hsin Lee': '李亞軒', 'Fang-Hsien Wu': '吳芳嫺',
  'Hsiang-Ti Lin': '林湘緹', 'Tzu-Ying Tai': '戴資穎', 'Tien-Chen Chou': '周天成', 'Hsiang-Chieh Chiu': '邱相榤', 'Chi-Lin Wang': '王齊麟',
  'Yang Lee': '李洋', 'Tzu-Wei Wang': '王子維', 'Yun-Ju Lin': '林昀儒', 'Szu-Yu Chen': '陳思羽', 'I-Ching Cheng': '鄭怡靜',
  'Chun-Hsin Tseng': '曾俊欣', 'Tsung-Hua Yang': '楊宗樺', 'En-Shuo Liang': '梁恩碩', 'Chih-Yuan Chuang': '莊智淵',
  'Akane Yamaguchi': '山口茜', 'Naomi Osaka': '大坂直美', 'Kei Nishikori': '錦織圭', 'Qinwen Zheng': '鄭欽文', 'Yue Han': '韓悅',
  'An Se-Young': '安洗瑩', 'Viktor Axelsen': '安賽龍', 'Shi Yuqi': '石宇奇', 'Chen Yufei': '陳雨菲', 'Wang Zhiyi': '王祉怡',
  'Kodai Naraoka': '奈良岡功大', 'Kunlavut Vitidsarn': '昆拉武特', 'Kento Momota': '桃田賢斗', 'Yi-Lyu Wang': '王懿律',
  'Tang Qianhui': '湯千慧', 'Xu Yifan': '徐一璠', 'Shuai Zhang': '張帥', 'Xinyu Wang': '王欣瑜', 'Yafan Wang': '王雅繁',
  'Fan Zhendong': '樊振東', 'Wang Chuqin': '王楚欽', 'Sun Yingsha': '孫穎莎', 'Wang Manyu': '王曼昱', 'Tomokazu Harimoto': '張本智和',
  'Miwa Harimoto': '張本美和', 'Hina Hayata': '早田希娜', 'Hugo Calderano': '卡德拉諾', 'Truls Moregard': '莫雷加德', 'Moyuka Uchijima': '內島萌夏'
};
// Surnames (the rest of the tours), as 運彩 and Taiwan's press write them.
const SURNAME = {
  sinner: '辛納', alcaraz: '艾卡拉茲', djokovic: '喬科維奇', zverev: '茲維列夫', medvedev: '梅德維夫', fritz: '弗里茲', rune: '魯內', ruud: '魯德',
  tsitsipas: '西西帕斯', rublev: '盧布列夫', 'de minaur': '德米諾', minaur: '德米諾', draper: '德雷珀', paul: '保羅', shelton: '謝爾頓',
  musetti: '穆塞蒂', tiafoe: '堤亞弗', dimitrov: '迪米特羅夫', hurkacz: '赫卡茲', khachanov: '卡恰諾夫', mensik: '門西克', lehecka: '列赫茨卡',
  machac: '馬哈奇', fils: '菲爾斯', wawrinka: '瓦林卡', nadal: '納達爾', federer: '費德勒', murray: '莫瑞', monfils: '孟菲斯', cerundolo: '塞倫多洛',
  struff: '斯特魯夫', goffin: '戈芬', griekspoor: '格里克斯普爾', mannarino: '曼納里諾', darderi: '達德里', etcheverry: '埃切維里',
  basilashvili: '巴西拉什維利', bublik: '布布里克', humbert: '亨伯特', popyrin: '波皮林', 'auger-aliassime': '歐傑阿利亞辛', shapovalov: '夏波瓦洛夫',
  arnaldi: '阿納爾迪', cobolli: '科博利', fonseca: '方塞卡', navone: '納沃內', moutet: '穆泰', tabilo: '塔比洛', berrettini: '貝瑞提尼', kecmanovic: '凱奇馬諾維奇',
  sabalenka: '莎芭蓮卡', swiatek: '斯威雅蒂克', gauff: '高芙', rybakina: '莉巴金娜', pegula: '佩古拉', paolini: '包莉妮', andreeva: '安德列娃',
  keys: '凱斯', navarro: '納瓦羅', badosa: '巴朵莎', muchova: '穆霍娃', krejcikova: '克雷吉茲柯娃', ostapenko: '奧斯塔朋柯', svitolina: '斯維托麗娜',
  kasatkina: '卡薩金娜', alexandrova: '亞歷山卓娃', kostyuk: '科斯秋克', raducanu: '拉杜卡努', fernandez: '費南德茲', errani: '艾拉尼',
  zakharova: '莎卡洛娃', boulter: '鮑爾特', cirstea: '齊絲蒂', siniakova: '辛妮亞柯娃', linette: '林內特', bouzkova: '布茲柯娃', mertens: '梅頓斯',
  collins: '柯林斯', jabeur: '賈貝兒', vondrousova: '馮德魯索娃', kvitova: '柯維托娃', azarenka: '阿扎倫卡', 'haddad maia': '哈達德瑪雅',
  samsonova: '薩姆索諾娃', anisimova: '安妮西莫娃', bencic: '本西琪', tauson: '陶森', noskova: '諾斯柯娃', mboko: '姆博科', sakkari: '莎卡莉',
  potapova: '波塔波娃', kalinskaya: '卡琳絲卡婭', stearns: '史登斯', golubic: '戈盧比奇', sasnovich: '薩斯諾維奇', melichar: '梅利查爾',
  'melichar-martinez': '梅利查爾馬丁內茲'
};
// The tours' and events' words.
const WORDS = {
  atp: 'ATP', wta: 'WTA', 'atp doubles': 'ATP 雙打', 'wta doubles': 'WTA 雙打', 'men singles': '男單', 'women singles': '女單', 'men doubles': '男雙',
  'women doubles': '女雙', 'mixed doubles': '混雙', 'grand slam': '大滿貫', 'australian open': '澳網', 'french open': '法網', wimbledon: '溫網',
  'us open': '美網', 'davis cup': '台維斯盃', 'billie jean king cup': '比莉珍金盃', 'united cup': '聯合盃', olympics: '奧運',
  // Volleyball's countries and leagues, as 運彩 lists them.
  italy: '義大利', poland: '波蘭', japan: '日本', turkey: '土耳其', brazil: '巴西', 'south korea': '南韓', korea: '南韓', world: '國際',
  'serie a1': '甲級聯賽', superlega: '甲級聯賽', plusliga: '甲級聯賽', 'tauron liga': '甲級聯賽(女)', 'sv league': 'SV 聯賽',
  'sultanlar ligi': '甲級聯賽(女)', 'efeler ligi': '甲級聯賽', superliga: '超級聯賽', 'v-league': 'V 聯賽', 'v league': 'V 聯賽',
  'champions league': '歐洲冠軍聯賽', 'nations league': '國家聯賽', vnl: '國家聯賽', 'world championship': '世界錦標賽'
};

const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ł/g, 'l').replace(/\s+/g, ' ').trim();
const wordsKey = s => fold(s).split(/[\s.-]+/).filter(Boolean).sort().join(' ');
const FULL = Object.fromEntries(Object.entries(FULL_NAMES).map(([k, v]) => [wordsKey(k), v]));
export const hasZh = s => /[㐀-鿿]/.test(String(s || ''));
// An initial ("C.", "Xinyu.") rather than a given name: Kambi's doubles.
const initialled = name => /^\S+\.\s*\S/.test(name.trim());
const surnameOf = name => {
  const words = name.trim().split(/\s+/);
  // "Diaz Acosta" / "Haddad Maia" / "de Minaur": a two-word surname 運彩 keeps.
  const two = fold(words.slice(-2).join(' '));
  return SURNAME[two] ? words.slice(-2).join(' ') : words.at(-1);
};

// What Google is asked: the player's surname (or East Asian full name),
// with Mr./Ms. so it reads as a name, not a word.
const KEY = 'slip.zh.v2';
let kept = {};
try {
  kept = JSON.parse(globalThis.localStorage?.getItem(KEY) || '{}') || {};
} catch {}
const save = () => {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(kept));
  } catch {}
};

// One player (not a pair): their Chinese, or null until it's read.
function playerZh(name) {
  const n = name.replace(/\s*\.\s*/g, '. ').trim();
  const full = FULL[wordsKey(n.replace(/\./g, ''))];
  if (full) return full;
  const sur = surnameOf(n);
  if (SURNAME[fold(sur)]) return SURNAME[fold(sur)];
  return kept[`p:${fold(initialled(n) ? sur : n)}`] ?? null;
}
// What to ask Google for one player.
const playerAsk = name => {
  const n = name.replace(/\s*\.\s*/g, '. ').trim();
  return initialled(n) ? surnameOf(n) : n;
};

// Whether a game's sides are players (tennis, badminton, table tennis) rather than clubs.
export const playersOf = g => isSetSport(g?.league) && LEAGUES[g.league].sport !== 'volleyball';
// An F1 driver as Taiwan's broadcasts say them (羅素), by surname.
export function driverZh(name) {
  const words = String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/\s+/).filter(w => !/^(jr|sr)\.?$/i.test(w));
  const sur = words.at(-1) || '';
  const hit = Object.entries(F1_NAMES_ZH || {}).find(([k]) => k.toLowerCase() === sur.toLowerCase());
  return hit ? hit[1] : nameZh(name, 'p');
}

// A side's name in Chinese: a player or a pair (each partner's, by '/'),
// or a club, place or tour (`team`). Null while it isn't known.
// A women's club or league (Kambi's "(W)"): its name read without it (the
// league says 女排).
const WOMEN = /\s*\(W\)\s*$/i;
export function nameZh(en, kind = 'team') {
  if (!en || hasZh(en)) return en || null;
  if (kind !== 'p' && WOMEN.test(en)) {
    return nameZh(String(en).replace(WOMEN, ''), kind);
  }
  if (kind !== 'p') return WORDS[fold(en)] ?? kept[`t:${fold(en)}`] ?? null;
  const parts = String(en).split('/').map(p => playerZh(p));
  return parts.every(Boolean) ? parts.join('/') : null;
}

// A volleyball club the way Taiwan's press names it: by its town (Aluron CMC
// Warta Zawiercie as 扎維爾切), sponsors and marks left off; Turkey's and
// Japan's by the club.
const MARKS = /^(volley|volleyball|pallavolo|club|asd|ssd|spa|fvg|cda|cmc|luk|pge|azs|ks|sc|vc|vk|tsv|ssc|usc|doc|il|s\.?|[0-9]+)$/i;
const CLUBS = ['fenerbahce', 'vakifbank', 'eczacibasi', 'galatasaray', 'besiktas', 'halkbank', 'ziraat', 'arkas', 'nilufer', 'aydin', 'thy', 'suntory', 'panasonic', 'toray', 'jtekt', 'sagamihara', 'hisamitsu', 'nec', 'denso', 'toyota'];
export function clubTown(en) {
  const words = String(en).split(/\s+/).filter(Boolean);
  const club = words.find(w => CLUBS.includes(fold(w)));
  if (club) return club;
  const kept = words.filter(w => !MARKS.test(w) && !/^[A-Z]{2,4}$/.test(w));
  // (A two-word town: Busto Arsizio, San Giustino.)
  const i = kept.length - 1;
  return i > 0 && /^(busto|san|santa|porto|nowa|nowy)$/i.test(kept[i - 1]) ? `${kept[i - 1]} ${kept[i]}` : kept[i] || en;
}

// Reading the names this phone hasn't yet: a few to a question to Google
// (its answer split back, each checked), one by one when it won't split.
let ask = null;
export const useTranslator = fn => (ask = fn);
const clean = s =>
  String(s || '')
    .replace(/^(先生|女士|小姐|夫人|太太)/, '')
    .replace(/(先生|女士|小姐|夫人|太太)$/, '')
    .trim();
// Players all in Chinese; clubs may keep a short mark (CMC, VK) the way the
// press prints them.
const usable = (s, kind) => hasZh(s) && !(kind === 'p' ? /[A-Za-z]/ : /[A-Za-z]{4,}/).test(s);
// A player as Google gives them: the surname (after its last ·), the whole
// of an East Asian name (written as one).
const pick = (s, kind) => (kind === 'p' ? clean(s).split(/[·・‧]/).at(-1).trim() : clean(s));
async function readOne(q, kind, women) {
  for (const hon of kind === 'p' ? (women ? ['Ms. ', 'Mr. '] : ['Mr. ', 'Ms. ']) : ['']) {
    const got = pick(await ask(`${hon}${q}`, 'zh-TW', 'en').catch(() => ''), kind);
    if (usable(got, kind)) return got;
  }
  // A club Google keeps in English ("Aluron CMC Warta Zawiercie"): its
  // town, the way the press shortens it.
  const words = kind === 'p' ? [] : String(q).split(/\s+/);
  for (const n of words.length > 1 ? [2, 1] : []) {
    const got = clean(await ask(words.slice(-n).join(' '), 'zh-TW', 'en').catch(() => ''));
    if (usable(got, 'p')) return got;
  }
  return null;
}
async function readChunk(chunk) {
  const out = new Map();
  const kind = chunk[0].kind;
  const hon = kind === 'p' ? (chunk[0].women ? 'Ms. ' : 'Mr. ') : '';
  const got = String((await ask(chunk.map(x => `${hon}${x.q}`).join('; '), 'zh-TW', 'en').catch(() => '')) || '')
    .split(/[;；]/)
    .map(s => pick(s, kind))
    .filter(Boolean);
  if (got.length === chunk.length && got.every(x => usable(x, kind))) chunk.forEach((x, j) => out.set(x.key, got[j]));
  else await Promise.all(chunk.map(async x => out.set(x.key, await readOne(x.q, kind, x.women))));
  return out;
}

let busy = Promise.resolve();
const listeners = new Set();
export const onNames = fn => listeners.add(fn);
// The names kept and the page told, a beat after the last to come in.
let telling = 0;
const tell = () => {
  clearTimeout(telling);
  telling = setTimeout(() => {
    save();
    for (const fn of listeners) fn();
  }, 300);
};
// Make sure these games' names are read: their players, clubs and events.
// Resolves once they are (or `wait` ms on, the rest coming in behind: the
// page told through onNames).
export function warm(games, { wait = 2500 } = {}) {
  if (!ask) return Promise.resolve();
  const want = new Map();
  const add = (name, kind, women, q = name) => {
    if (!name || hasZh(name)) return;
    const key = `${kind}:${fold(name)}`;
    if (key in kept || want.has(key)) return;
    if (kind === 't' && WORDS[fold(name)]) return;
    want.set(key, { key, q, kind, women });
  };
  for (const g of games || []) {
    if (!g?.home || !g?.away) continue;
    const kind = playersOf(g) ? 'p' : 't';
    for (const s of [g.home, g.away]) {
      if (hasZh(s.zh)) continue;
      if (kind === 'p') for (const p of String(s.en).split('/')) !playerZh(p) && add(playerAsk(p), 'p', g.women);
      else {
        const en = String(s.en).replace(WOMEN, '');
        add(en, 't', false, g.league === 'volleyball' ? clubTown(en) : en);
      }
    }
    for (const w of g.event || []) add(String(w).replace(WOMEN, ''), 't');
    // A race's field: the drivers Taiwan has no name for yet.
    for (const d of g.field || []) if (!driverZh(d.name)) add(playerAsk(d.name), 'p');
  }
  if (!want.size) return Promise.resolve();
  const items = [...want.values()].sort((a, b) => a.kind.localeCompare(b.kind) || Number(Boolean(b.women)) - Number(Boolean(a.women)));
  // Same kind and honorific together, so one question asks alike names.
  const groups = [];
  for (const x of items) {
    const last = groups.at(-1);
    if (last && last[0].kind === x.kind && Boolean(last[0].women) === Boolean(x.women)) last.push(x);
    else groups.push([x]);
  }
  // Four questions at a time; the page told as each comes back.
  const chunks = groups.flatMap(grp => Array.from({ length: Math.ceil(grp.length / 6) }, (_, i) => grp.slice(i * 6, i * 6 + 6)));
  const job = (busy = busy.then(async () => {
    const todo = chunks.map(c => c.filter(x => !(x.key in kept))).filter(c => c.length);
    const lane = async () => {
      for (let c; (c = todo.shift()); ) {
        let any = false;
        for (const [k, v] of await readChunk(c)) if (v) (kept[k] = v), (any = true);
        if (any) tell();
      }
    };
    await Promise.all([lane(), lane(), lane(), lane()]);
  }));
  return Promise.race([job, new Promise(r => setTimeout(r, wait))]);
}

// Leagues the way Taiwan's press calls them (義甲女排, 波蘭男排): whole
// path first, word by word otherwise.
const EVENTS = {
  'italy serie a1 (w)': '義甲女排', 'italy superlega': '義甲男排', 'poland plusliga': '波蘭男排', 'poland tauron liga': '波蘭女排',
  'japan sv league': '日本 SV 男排', 'japan sv league (w)': '日本 SV 女排', 'turkey efeler ligi': '土耳其男排', 'turkey sultanlar ligi': '土耳其女排',
  'brazil superliga': '巴西男排', 'brazil superliga (w)': '巴西女排', 'germany bundesliga': '德國男排', 'germany bundesliga (w)': '德國女排',
  'south korea v-league': '韓國男排', 'south korea v-league (w)': '韓國女排', 'champions league': '歐冠男排', 'champions league (w)': '歐冠女排',
  'champions league qualification': '歐冠男排資格賽', 'champions league qualification (w)': '歐冠女排資格賽'
};
// An event (a tennis tour and its city, a badminton open and its draw) in
// the reader's words: ['WTA Doubles', 'Osaka'] as WTA 雙打 大阪.
export const eventZh = parts => EVENTS[fold((parts || []).join(' '))] ?? (parts || []).map(p => nameZh(p, 'team') ?? p).join(' ');
