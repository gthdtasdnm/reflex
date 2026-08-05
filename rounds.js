// Rundengenerierung. Läuft ausschließlich auf dem Server: er würfelt eine
// Runde aus und schickt allen Clients dieselbe fertige Beschreibung. Dadurch
// braucht der Client keinen Zufall und alle sehen garantiert dasselbe.
//
// Eine Runde besteht immer aus genau fünf Aufgaben derselben Kategorie, eine
// pro Zeitfenster. Alle fünf werden gespielt – die Runde endet nicht, wenn
// jemand eine davon holt. Jede Aufgabe wird einzeln gewertet.
//
// Aufbau einer Runde:
//   type          welcher Renderer sie zeichnet
//   prompt/hint   Frage und Erklärung, gelten für alle fünf Aufgaben
//   stepInterval  Länge eines Fensters in ms
//   duration      5 × stepInterval
//   scale         ab welcher Reaktionszeit es nur noch den Sockel gibt
//   precision     true = auf den Punkt treffen statt so früh wie möglich
//   tolerance     nur bei precision
//   payload       rundenweite Daten (Suchsymbol, Kategorie, Schwelle …)
//   items         die fünf Aufgaben
//
// Eine Aufgabe:
//   t     Beginn ihres Fensters, relativ zum Rundenstart
//   hit   gibt es hier etwas zu drücken?
//   at    ab wann *innerhalb* des Fensters. Bei Wissensaufgaben 0 – die
//         Aussage steht sofort da. Bei Warteaufgaben der Moment, in dem die
//         Ampel grün wird, der Smiley kippt, das Dreieck herauskommt.
//   …     was der Renderer sonst noch braucht

import {
  ANIMALS, BUILDINGS, CATEGORIES, COLORS, COUNTRIES, EMOJIS, EVENTS,
  MOUNTAINS, SCREEN_COLORS, SYMBOLS,
} from "./data.js";
import { coverage } from "./public/motion.js";

const ITEMS = 5;

const rnd = (a, b) => a + Math.random() * (b - a);
const int = (a, b) => Math.floor(rnd(a, b + 1));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const coin = (p = 0.5) => Math.random() < p;

function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = int(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const sample = (list, n) => shuffle(list).slice(0, n);

// Zwei Einträge, die weit genug auseinanderliegen – knappe Paare wären
// wegen der gerundeten Daten Glückssache statt Wissen.
function pickPair(list, field, minRatio) {
  for (let i = 0; i < 300; i++) {
    const [a, b] = sample(list, 2);
    const hi = Math.max(a[field], b[field]);
    const lo = Math.min(a[field], b[field]);
    if (lo > 0 && hi / lo >= minRatio) return [a, b];
  }
  return sample(list, 2);
}

function pickPairByGap(list, field, minGap) {
  for (let i = 0; i < 300; i++) {
    const [a, b] = sample(list, 2);
    if (Math.abs(a[field] - b[field]) >= minGap) return [a, b];
  }
  return sample(list, 2);
}

// Zwei oder drei der fünf Aufgaben sind Treffer. Nie alle: sonst könnte man
// blind auf jede drücken. Nie keine: sonst gäbe es in der Runde nichts zu
// gewinnen.
function hitPlan(all = false) {
  if (all) return new Set([0, 1, 2, 3, 4]);
  return new Set(shuffle([0, 1, 2, 3, 4]).slice(0, coin() ? 2 : 3));
}

function build(interval, makeItem, opts = {}) {
  const hits = hitPlan(opts.allHits);
  const items = [];
  for (let i = 0; i < ITEMS; i++) {
    const hit = hits.has(i);
    items.push({ t: i * interval, hit, at: 0, ...makeItem(hit, i, items) });
  }
  const { allHits: _ignored, ...rest } = opts;
  return {
    bar: opts.precision ? "none" : "step",
    items,
    stepInterval: interval,
    duration: ITEMS * interval,
    scale: opts.scale ?? interval,
    ...rest,
  };
}

// ---------------------------------------------------------------------------
// Wissen – die Aussage steht sofort im Fenster, `at` bleibt 0
// ---------------------------------------------------------------------------

const COMPARE_MODES = [
  {
    list: COUNTRIES, field: "pop", ratio: 1.3,
    prompt: "Passt die Bevölkerung?", legend: "hat mehr Einwohner", op: ">",
  },
  {
    list: COUNTRIES, field: "area", ratio: 1.35,
    prompt: "Passt die Fläche?", legend: "hat mehr Fläche", op: ">",
  },
  {
    list: ANIMALS, field: "speed", ratio: 1.35,
    prompt: "Wer ist schneller?", legend: "ist schneller", op: ">",
  },
  {
    list: MOUNTAINS, field: "height", ratio: 1.25,
    prompt: "Passt die Höhe?", legend: "ist höher", op: ">",
  },
  {
    list: BUILDINGS, field: "height", ratio: 1.3,
    prompt: "Was ist höher?", legend: "ist höher", op: ">",
  },
  {
    list: EVENTS, field: "year", gap: 9,
    prompt: "Passt die Reihenfolge?", legend: "war früher", op: "vor",
  },
];

function makeCompare() {
  const m = pick(COMPARE_MODES);
  const lowerWins = m.field === "year"; // „war früher" – der kleinere gewinnt

  return {
    type: "compare",
    prompt: m.prompt,
    hint: "Drücke bei jeder Aussage, die stimmt",
    payload: { op: m.op, legend: m.legend },
    ...build(2400, (hit) => {
      const [a, b] = m.gap
        ? pickPairByGap(m.list, m.field, m.gap)
        : pickPair(m.list, m.field, m.ratio);
      const bigger = a[m.field] > b[m.field] ? a : b;
      const smaller = bigger === a ? b : a;
      const winner = lowerWins ? smaller : bigger;
      const loser = winner === a ? b : a;
      return hit
        ? { left: winner.name, right: loser.name }
        : { left: loser.name, right: winner.name };
    }),
  };
}

function makeMath() {
  return {
    type: "math",
    prompt: "Stimmt die Rechnung?",
    hint: "Drücke bei jeder Rechnung, die aufgeht",
    payload: {},
    ...build(2200, (hit) => {
      const op = pick(["+", "−", "×", "×"]);
      let a, b, correct;
      if (op === "×") {
        a = int(3, 12); b = int(3, 12); correct = a * b;
      } else if (op === "+") {
        a = int(17, 89); b = int(14, 79); correct = a + b;
      } else {
        a = int(35, 99); b = int(12, a - 8); correct = a - b;
      }
      if (hit) return { expr: `${a} ${op} ${b}`, shown: correct };

      // Danebenliegen, aber plausibel: typische Rechenfehler statt Zufall.
      const deltas = [1, 2, 3, 9, 10, 11, a, b].filter((d) => d > 0);
      let shown = correct;
      for (let i = 0; i < 40 && shown === correct; i++) {
        const d = pick(deltas) * (coin() ? 1 : -1);
        if (correct + d > 0 && d !== 0) shown = correct + d;
      }
      if (shown === correct) shown = correct + 1;
      return { expr: `${a} ${op} ${b}`, shown };
    }),
  };
}

function makeStroop() {
  return {
    type: "stroop",
    prompt: "Wort und Farbe gleich?",
    hint: "Drücke bei jedem Wort, das in seiner eigenen Farbe steht",
    payload: {},
    ...build(1500, (hit) => {
      const word = pick(COLORS);
      const color = hit ? word : pick(COLORS.filter((c) => c.name !== word.name));
      return { word: word.name, hex: color.hex };
    }),
  };
}

function makeCount() {
  const threshold = int(5, 10);
  const dotsFor = (n) => {
    const dots = [];
    for (let i = 0; i < n; i++) {
      for (let tries = 0; tries < 80; tries++) {
        const p = { x: rnd(6, 88), y: rnd(6, 88) };
        if (dots.every((d) => Math.hypot(d.x - p.x, d.y - p.y) > 13)) {
          dots.push(p);
          break;
        }
      }
    }
    return dots;
  };

  return {
    type: "count",
    prompt: `Mehr als ${threshold} Punkte?`,
    hint: `Drücke jedes Mal, wenn es mehr als ${threshold} Punkte sind`,
    payload: { threshold },
    ...build(2600, (hit) => ({
      dots: dotsFor(hit ? threshold + int(1, 3) : Math.max(2, threshold - int(1, 3))),
    })),
  };
}

function makeSame() {
  const cols = 3;
  const cells = cols * 3;
  return {
    type: "same",
    prompt: "Beide Muster gleich?",
    hint: "Drücke jedes Mal, wenn die beiden Muster identisch sind",
    payload: { cols },
    ...build(2600, (hit) => {
      const pool = sample(SYMBOLS, 5);
      const a = Array.from({ length: cells }, () => pick(pool));
      const b = a.slice();
      if (!hit) {
        const i = int(0, cells - 1);
        b[i] = pick(pool.filter((s) => s !== a[i]));
      }
      return { a, b };
    }),
  };
}

// ---------------------------------------------------------------------------
// Erkennen – auch hier steht der Inhalt sofort im Fenster
// ---------------------------------------------------------------------------

function makeSymbol() {
  const target = pick(SYMBOLS);
  const others = SYMBOLS.filter((s) => s !== target);
  return {
    type: "symbol",
    prompt: "Ist das Symbol zu sehen?",
    hint: "Drücke jedes Mal, wenn genau dieses Symbol erscheint",
    payload: { target },
    ...build(1250, (hit) => ({ s: hit ? target : pick(others) })),
  };
}

function makeCategory() {
  const cat = pick(CATEGORIES);
  const others = CATEGORIES.filter((c) => c.label !== cat.label)
    .flatMap((c) => c.words);
  return {
    type: "category",
    prompt: `Kategorie: ${cat.label}`,
    hint: `Drücke bei jedem Wort aus der Kategorie ${cat.label}`,
    payload: { label: cat.label },
    ...build(1600, (hit) => ({ w: hit ? pick(cat.words) : pick(others) })),
  };
}

const NUMBER_RULES = [
  { text: "größer als 50", bad: () => int(1, 50), good: () => int(51, 99) },
  {
    text: "durch 5 teilbar",
    bad: () => { let n; do { n = int(11, 99); } while (n % 5 === 0); return n; },
    good: () => int(3, 19) * 5,
  },
  {
    text: "eine Doppelzahl",
    bad: () => { let n; do { n = int(12, 98); } while (n % 11 === 0); return n; },
    good: () => 11 * int(1, 9),
  },
];

function makeNumbers() {
  const rule = pick(NUMBER_RULES);
  return {
    type: "numbers",
    prompt: `Zahl ${rule.text}?`,
    hint: `Drücke bei jeder Zahl ${rule.text}`,
    payload: { ruleText: rule.text },
    ...build(1400, (hit) => ({ n: hit ? rule.good() : rule.bad() })),
  };
}

function makeEmojiHunt() {
  const cols = 5;
  const rows = 4;
  const target = pick(EMOJIS);
  const others = EMOJIS.filter((e) => e !== target);
  return {
    type: "emojihunt",
    prompt: "Suche im Raster",
    hint: `Drücke jedes Mal, wenn ${target} im Raster steckt`,
    payload: { target, cols },
    ...build(1800, (hit) => {
      const cells = Array.from({ length: cols * rows }, () => pick(others));
      if (hit) cells[int(0, cells.length - 1)] = target;
      return { cells };
    }),
  };
}

function makeColorFlash() {
  const target = pick(SCREEN_COLORS);
  const others = SCREEN_COLORS.filter((c) => c.name !== target.name);
  return {
    type: "colorflash",
    prompt: `Drücke bei ${target.name}`,
    hint: `Der Bildschirm wechselt die Farbe – drücke bei jedem ${target.name}`,
    payload: { targetName: target.name, targetHex: target.hex },
    ...build(1250, (hit, _i, sofar) => {
      if (hit) return { c: target.hex };
      const prev = sofar.length ? sofar[sofar.length - 1].c : null;
      return { c: pick(others.filter((o) => o.hex !== prev)).hex };
    }),
  };
}

// ---------------------------------------------------------------------------
// Warten – im Fenster passiert etwas erst nach einer Weile, oder gar nicht.
// Hier trägt die Aufgabe ein `at`.
// ---------------------------------------------------------------------------

function makeTraffic() {
  const interval = 2400;
  return {
    type: "traffic",
    prompt: "Drücke bei GRÜN",
    hint: "Fünf Ampeln – gelb ist eine Falle, nur grün zählt",
    payload: {},
    scale: 1000,
    ...build(interval, (hit) => {
      const steps = [{ t: 0, s: "red" }];
      const at = hit ? int(750, interval - 800) : null;
      let t = int(350, 650);
      while (t < (at ?? interval - 250) - 320) {
        if (coin(0.45)) {
          steps.push({ t, s: "yellow" });
          steps.push({ t: t + int(140, 260), s: "red" });
        }
        t += int(400, 700);
      }
      if (at !== null) steps.push({ t: at, s: "green" });
      steps.sort((a, b) => a.t - b.t);
      return { at: at ?? 0, steps };
    }),
  };
}

function makeSmileys() {
  const interval = 2400;
  const cols = 5;
  const count = cols * 4;
  const happy = ["🙂", "😀", "😊", "😄"];
  return {
    type: "smileys",
    prompt: "Ist ein trauriger Smiley zu sehen?",
    hint: "Fünf Raster – drücke jedes Mal, sobald einer traurig guckt",
    payload: { cols, count, sad: "🙁" },
    scale: 1100,
    ...build(interval, (hit) => {
      const at = hit ? int(700, interval - 750) : null;
      const sadIndex = int(0, count - 1);
      const faces = Array.from({ length: count }, () => pick(happy));
      // Kosmetisches Gewusel, damit nicht einfach „die einzige Änderung"
      // auffällt.
      const flips = [];
      for (let t = 220; t < interval; t += int(200, 300)) {
        const i = int(0, count - 1);
        if (at !== null && t > at && i === sadIndex) continue;
        flips.push({ t, i, f: pick(happy) });
      }
      return { at: at ?? 0, faces, flips, sadIndex };
    }),
  };
}

function makeArrows() {
  const interval = 2200;
  const cols = 5;
  const count = cols * 4;
  return {
    type: "arrows",
    prompt: "Zeigt ein Pfeil nach unten?",
    hint: "Fünf Raster – drücke jedes Mal, sobald sich einer umdreht",
    payload: { cols, count },
    scale: 1000,
    ...build(interval, (hit) => ({
      at: hit ? int(650, interval - 700) : 0,
      index: int(0, count - 1),
      spin: rnd(6, 14),
    })),
  };
}

// Ab wann gilt das Dreieck als aufgedeckt? Bewusst früh – sobald ein
// sichtbarer roter Zipfel herausschaut. Wer darauf reagiert, darf nicht als
// „zu früh" bestraft werden; gemessen wird ohnehin ab genau diesem Moment,
// also für alle gleich.
const TRI_REVEALED = 0.90;

function coverPath(tri, cand, window) {
  if (coverage(tri, cand, 0) < 0.99) return { valid: false };
  let first = null;
  for (let t = 0; t <= window; t += 20) {
    const cov = coverage(tri, cand, t / 1000);
    if (first === null) {
      if (cov < TRI_REVEALED) first = t;
    } else if (cov >= TRI_REVEALED) {
      // Einmal sichtbar und dann wieder verschwunden wäre unfair.
      return { valid: false };
    }
  }
  return { valid: true, revealAt: first };
}

function triangleScene(hit, window) {
  const tri = { size: 17, x: rnd(20, 60), y: rnd(20, 60) };
  let cover = null;
  let at = null;

  for (let attempt = 0; attempt < 700 && !cover; attempt++) {
    // Soll nichts aufgedeckt werden, deckt ein großer träger Klotz zu: er
    // wackelt sichtbar, gibt das Dreieck im Fenster aber nicht frei.
    const w = hit ? rnd(26, 36) : rnd(46, 58);
    const h = hit ? rnd(26, 36) : rnd(46, 58);
    const speed = hit ? [14, 34] : [1.5, 3.5];
    const cand = {
      w, h,
      x: Math.min(Math.max(rnd(tri.x + tri.size - w + 2, tri.x - 2), 0), 100 - w),
      y: Math.min(Math.max(rnd(tri.y + tri.size - h + 2, tri.y - 2), 0), 100 - h),
      vx: rnd(speed[0], speed[1]) * (coin() ? 1 : -1),
      vy: rnd(speed[0], speed[1]) * (coin() ? 1 : -1),
      c: "#2b3350",
    };
    const path = coverPath(tri, cand, window);
    if (!path.valid) continue;

    if (hit) {
      if (path.revealAt !== null &&
        path.revealAt >= 600 && path.revealAt <= window - 750) {
        cover = cand;
        at = path.revealAt;
      }
    } else if (path.revealAt === null) {
      cover = cand;
    }
  }

  // Notausgang: waagerechte Fahrt, die das Dreieck garantiert freigibt.
  if (!cover) {
    const w = 30, h = 30;
    cover = {
      w, h,
      x: Math.min(Math.max(tri.x + tri.size - w + 2, 0), 100 - w),
      y: Math.min(Math.max(tri.y - 4, 0), 100 - h),
      vx: hit ? -24 : -1.5, vy: 0, c: "#2b3350",
    };
    at = coverPath(tri, cover, window).revealAt;
    if (hit) at = Math.min(Math.max(at ?? 900, 600), window - 750);
  }

  // Ablenkung: Klötze, die das Dreieck zu keinem Zeitpunkt berühren.
  const decoyColors = ["#3a2f6b", "#1f4d5c", "#4a2b46", "#2f4a2b"];
  const decoyShapes = ["rect", "circle", "tri"];
  const decoys = [];
  for (let i = 0; i < 4; i++) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const w = rnd(14, 26);
      const cand = {
        w, h: rnd(14, 26),
        x: rnd(0, 100 - w), y: rnd(0, 70),
        vx: rnd(8, 26) * (coin() ? 1 : -1),
        vy: rnd(8, 26) * (coin() ? 1 : -1),
        c: decoyColors[i % decoyColors.length],
        shape: pick(decoyShapes),
      };
      cand.y = Math.min(cand.y, 100 - cand.h);
      let clean = true;
      for (let t = 0; t <= window; t += 50) {
        if (coverage(tri, cand, t / 1000) > 0.03) { clean = false; break; }
      }
      if (clean) { decoys.push(cand); break; }
    }
  }

  return { at: hit ? at : 0, tri, cover, decoys };
}

function makeRedTriangle() {
  const interval = 2600;
  return {
    type: "redtriangle",
    prompt: "Finde das rote Dreieck",
    hint: "Fünfmal – drücke jedes Mal, sobald es hinter den Klötzen hervorkommt",
    payload: {},
    scale: 1100,
    ...build(interval, (hit) => triangleScene(hit, interval)),
  };
}

function makeTiming() {
  // Hier ist jede der fünf Aufgaben zu treffen; der Balken im Spielfeld ist
  // die Aufgabe, ein zweiter oben wäre doppelt gemoppelt.
  const interval = 2300;
  const tolerance = 380;
  return {
    type: "timing",
    prompt: "Genau auf die Linie",
    hint: "Fünfmal – drücke jedes Mal genau dann, wenn der Balken die Markierung erreicht",
    payload: {},
    precision: true,
    tolerance,
    scale: tolerance,
    ...build(interval, () => {
      const markPct = rnd(0.4, 0.75);
      return { at: Math.round(interval * markPct), markPct };
    }, { allHits: true, precision: true, tolerance, scale: tolerance }),
  };
}

// ---------------------------------------------------------------------------

const GENERATORS = {
  compare: makeCompare,
  math: makeMath,
  stroop: makeStroop,
  count: makeCount,
  same: makeSame,
  symbol: makeSymbol,
  category: makeCategory,
  numbers: makeNumbers,
  emojihunt: makeEmojiHunt,
  colorflash: makeColorFlash,
  smileys: makeSmileys,
  arrows: makeArrows,
  redtriangle: makeRedTriangle,
  traffic: makeTraffic,
  timing: makeTiming,
};

const KNOWLEDGE = ["compare", "math", "stroop", "count", "same"];
const REACTION = [
  "symbol", "category", "numbers", "emojihunt", "colorflash",
  "smileys", "arrows", "redtriangle", "traffic", "timing",
];

export const ROUND_TYPES = Object.keys(GENERATORS);
export const ITEMS_PER_ROUND = ITEMS;

export function makeRound(type) {
  return GENERATORS[type]();
}

// In welchem Fenster liegt dieser Zeitpunkt? Server und Client müssen hier
// zum selben Ergebnis kommen, sonst weicht die sofortige Rückmeldung von der
// Wertung ab.
export function itemIndexAt(round, elapsed) {
  const i = Math.floor(elapsed / round.stepInterval);
  return i >= 0 && i < round.items.length ? i : -1;
}

// Eine Reihenfolge ohne direkte Wiederholung und mit garantierter Mischung
// aus Wissen und Reaktion – etwa ein Drittel Wissen.
export function buildRoundPlan(count) {
  const wanted = Math.max(1, Math.round(count / 3));
  const plan = [];
  let knowledgeBag = shuffle(KNOWLEDGE);
  let reactionBag = shuffle(REACTION);

  const slots = shuffle(
    Array.from({ length: count }, (_, i) => (i < wanted ? "k" : "r")),
  );

  for (const slot of slots) {
    let bag = slot === "k" ? knowledgeBag : reactionBag;
    if (!bag.length) {
      bag = shuffle(slot === "k" ? KNOWLEDGE : REACTION);
      if (slot === "k") knowledgeBag = bag;
      else reactionBag = bag;
    }
    let i = 0;
    if (bag[0] === plan[plan.length - 1] && bag.length > 1) i = 1;
    plan.push(bag.splice(i, 1)[0]);
  }
  return plan;
}
