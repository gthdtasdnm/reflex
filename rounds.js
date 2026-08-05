// Rundengenerierung. Läuft ausschließlich auf dem Server: er würfelt eine
// Runde aus und schickt allen Clients dieselbe fertige Beschreibung. Dadurch
// braucht der Client keinen Zufall und alle sehen garantiert dasselbe.
//
// Jede Runde hat dieselbe Form:
//   type      welcher Renderer sie zeichnet
//   kind      "verdict" | "watch" | "precision"  – bestimmt die Wertung
//   bar       was der Zeitbalken oben anzeigt:
//               "round" – die Frist für die ganze Runde (Wissensrunden)
//               "step"  – die Frist für das gerade gezeigte Element
//               "none"  – gar nichts, es gibt keine sinnvolle Frist
//   duration  Gesamtlänge in ms
//   triggerAt ms ab Rundenstart, ab wann Drücken richtig ist.
//             null heißt: in dieser Runde ist Drücken *immer* falsch (Falle).
//   scale     ab welcher Reaktionszeit es nur noch die Mindestpunktzahl gibt
//   payload   alles, was der Renderer zum Zeichnen braucht
//
// Zum Zeitbalken: bei Schrittrunden zeigt er das Fenster für *ein* Element.
// Ein Element erscheint, der Balken läuft ab, das nächste kommt. Ein Balken,
// der über fünf Symbole hinweg durchläuft, gehört zu keiner Entscheidung und
// hilft niemandem.
//
// Weil bei Schrittrunden die Gesamtlänge nirgends angezeigt wird, darf sie
// vom Auslöser abhängen – die Runde endet ein Fenster nach dem Treffer. Bei
// Wissensrunden, wo der Balken die Gesamtfrist zeigt, ist die Länge dagegen
// fest: sonst könnte man daran ablesen, wann gleich etwas passiert.

import {
  ANIMALS, BUILDINGS, CATEGORIES, COLORS, COUNTRIES, EMOJIS, EVENTS,
  FAKE_WORDS, MOUNTAINS, REAL_WORDS, SCREEN_COLORS, SYMBOLS,
} from "./data.js";
import { coverage } from "./public/motion.js";

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

// Gerüst für alle Schrittrunden: gleichmäßige Fenster, in einem davon steht
// das Gesuchte. Danach ist die Runde vorbei – genau ein Fenster Reaktionszeit.
function stepFrame(count, interval, trapChance = 0.15) {
  const times = Array.from({ length: count }, (_, i) => i * interval);
  const trap = coin(trapChance);
  const idx = trap ? null : int(1, count - 2);
  return {
    times,
    idx,
    upTo: idx === null ? count : idx, // so viele Ablenkungsschritte
    triggerAt: idx === null ? null : times[idx],
    duration: idx === null ? count * interval : (idx + 1) * interval,
    interval,
  };
}

// ---------------------------------------------------------------------------
// Wissensrunden – die Aussage steht sofort da, triggerAt ist 0 oder null.
// Großzügige Fristen: Lesen, Nachdenken und Entscheiden muss reinpassen.
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

const verdict = (extra) => ({
  kind: "verdict",
  bar: "round",
  scale: 2800,
  ...extra,
});

function makeCompare() {
  const m = pick(COMPARE_MODES);
  const [a, b] = m.gap
    ? pickPairByGap(m.list, m.field, m.gap)
    : pickPair(m.list, m.field, m.ratio);

  // Bei Jahreszahlen gewinnt der kleinere Wert ("war früher").
  const lowerWins = m.field === "year";
  const bigger = a[m.field] > b[m.field] ? a : b;
  const smaller = bigger === a ? b : a;
  const winner = lowerWins ? smaller : bigger;
  const loser = winner === a ? b : a;

  const claimTrue = coin();
  const left = claimTrue ? winner : loser;
  const right = claimTrue ? loser : winner;

  return verdict({
    type: "compare",
    prompt: m.prompt,
    hint: "Drücke, wenn die Aussage stimmt",
    duration: 5200,
    triggerAt: claimTrue ? 0 : null,
    payload: { left: left.name, right: right.name, op: m.op, legend: m.legend },
  });
}

function makeMath() {
  const op = pick(["+", "−", "×", "×"]);
  let a, b, correct;
  if (op === "×") {
    a = int(3, 12); b = int(3, 12); correct = a * b;
  } else if (op === "+") {
    a = int(17, 89); b = int(14, 79); correct = a + b;
  } else {
    a = int(35, 99); b = int(12, a - 8); correct = a - b;
  }

  const claimTrue = coin();
  let shown = correct;
  if (!claimTrue) {
    const deltas = [1, 2, 3, 9, 10, 11, a, b].filter((d) => d > 0);
    for (let i = 0; i < 40; i++) {
      const d = pick(deltas) * (coin() ? 1 : -1);
      if (correct + d !== correct && correct + d > 0) { shown = correct + d; break; }
    }
    if (shown === correct) shown = correct + 1;
  }

  return verdict({
    type: "math",
    prompt: "Stimmt die Rechnung?",
    hint: "Drücke nur, wenn das Ergebnis richtig ist",
    duration: 5000,
    triggerAt: shown === correct ? 0 : null,
    payload: { expr: `${a} ${op} ${b}`, shown },
  });
}

function makeStroop() {
  const word = pick(COLORS);
  const match = coin();
  const color = match ? word : pick(COLORS.filter((c) => c.name !== word.name));
  return verdict({
    type: "stroop",
    prompt: "Wort und Farbe gleich?",
    hint: "Drücke nur, wenn das Wort in seiner eigenen Farbe steht",
    duration: 4200,
    scale: 1600,
    triggerAt: match ? 0 : null,
    payload: { word: word.name, hex: color.hex },
  });
}

function makeCount() {
  const n = int(5, 14);
  const threshold = Math.max(3, n + (coin() ? -1 : 1) * int(1, 2));
  const dots = [];
  for (let i = 0; i < n && dots.length < n; i++) {
    for (let tries = 0; tries < 80; tries++) {
      const p = { x: rnd(6, 88), y: rnd(6, 88) };
      if (dots.every((d) => Math.hypot(d.x - p.x, d.y - p.y) > 13)) {
        dots.push(p);
        break;
      }
    }
  }
  return verdict({
    type: "count",
    prompt: `Mehr als ${threshold} Punkte?`,
    hint: "Drücke, wenn es mehr sind",
    duration: 5500,
    triggerAt: dots.length > threshold ? 0 : null,
    payload: { dots, threshold },
  });
}

function makeSame() {
  const cols = 3;
  const cells = cols * 3;
  const pool = sample(SYMBOLS, 5);
  const a = Array.from({ length: cells }, () => pick(pool));
  const b = a.slice();
  const identical = coin();
  if (!identical) {
    const i = int(0, cells - 1);
    b[i] = pick(pool.filter((s) => s !== a[i]));
  }
  return verdict({
    type: "same",
    prompt: "Beide Muster gleich?",
    hint: "Drücke, wenn sie identisch sind",
    duration: 5800,
    triggerAt: identical ? 0 : null,
    payload: { a, b, cols },
  });
}

function makeWord() {
  const real = coin();
  return verdict({
    type: "word",
    prompt: "Gibt es dieses Wort?",
    hint: "Drücke nur bei einem echten deutschen Wort",
    duration: 4200,
    scale: 2000,
    triggerAt: real ? 0 : null,
    payload: { word: real ? pick(REAL_WORDS) : pick(FAKE_WORDS) },
  });
}

// ---------------------------------------------------------------------------
// Schrittrunden – ein Element pro Zeitfenster, der Balken gehört dem Fenster.
// ---------------------------------------------------------------------------

function makeColorFlash() {
  const f = stepFrame(6, 1300, 0.18);
  const target = pick(SCREEN_COLORS);
  const others = SCREEN_COLORS.filter((c) => c.name !== target.name);

  const steps = [];
  let prev = null;
  for (let i = 0; i < f.upTo; i++) {
    const c = pick(others.filter((o) => o.hex !== prev));
    prev = c.hex;
    steps.push({ t: f.times[i], c: c.hex });
  }
  if (f.idx !== null) steps.push({ t: f.times[f.idx], c: target.hex });

  return {
    type: "colorflash",
    kind: "watch",
    bar: "step",
    prompt: `Drücke bei ${target.name}`,
    hint: `Der Bildschirm wechselt die Farbe – drücke, sobald er ${target.name} wird`,
    duration: f.duration,
    stepInterval: f.interval,
    scale: f.interval,
    triggerAt: f.triggerAt,
    payload: { steps, targetName: target.name, targetHex: target.hex },
  };
}

function makeSymbol() {
  const f = stepFrame(6, 1300);
  const target = pick(SYMBOLS);
  const others = SYMBOLS.filter((s) => s !== target);

  const steps = [];
  for (let i = 0; i < f.upTo; i++) steps.push({ t: f.times[i], s: pick(others) });
  if (f.idx !== null) steps.push({ t: f.times[f.idx], s: target });

  return {
    type: "symbol",
    kind: "watch",
    bar: "step",
    prompt: "Ist das Symbol zu sehen?",
    hint: "Drücke, sobald genau dieses Symbol erscheint",
    duration: f.duration,
    stepInterval: f.interval,
    scale: f.interval,
    triggerAt: f.triggerAt,
    payload: { target, steps },
  };
}

function makeNback() {
  const f = stepFrame(6, 1500);
  const pool = sample(SYMBOLS, 5);

  const steps = [];
  for (let i = 0; i < f.upTo; i++) {
    const prev = steps.length ? steps[steps.length - 1].s : null;
    steps.push({ t: f.times[i], s: pick(pool.filter((s) => s !== prev)) });
  }
  if (f.idx !== null) {
    steps.push({ t: f.times[f.idx], s: steps[steps.length - 1].s });
  }

  return {
    type: "nback",
    kind: "watch",
    bar: "step",
    prompt: "Zweimal dasselbe?",
    hint: "Drücke, wenn ein Symbol direkt wiederholt wird",
    duration: f.duration,
    stepInterval: f.interval,
    scale: f.interval,
    triggerAt: f.triggerAt,
    payload: { steps },
  };
}

function makeCategory() {
  const f = stepFrame(5, 1700);
  const cat = pick(CATEGORIES);
  const others = CATEGORIES.filter((c) => c.label !== cat.label)
    .flatMap((c) => c.words);

  const steps = [];
  for (let i = 0; i < f.upTo; i++) steps.push({ t: f.times[i], w: pick(others) });
  if (f.idx !== null) steps.push({ t: f.times[f.idx], w: pick(cat.words) });

  return {
    type: "category",
    kind: "watch",
    bar: "step",
    prompt: `Kategorie: ${cat.label}`,
    hint: `Drücke, sobald ein Wort aus der Kategorie ${cat.label} erscheint`,
    duration: f.duration,
    stepInterval: f.interval,
    scale: f.interval,
    triggerAt: f.triggerAt,
    payload: { label: cat.label, steps },
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
  const f = stepFrame(6, 1400);
  const rule = pick(NUMBER_RULES);

  const steps = [];
  for (let i = 0; i < f.upTo; i++) steps.push({ t: f.times[i], n: rule.bad() });
  if (f.idx !== null) steps.push({ t: f.times[f.idx], n: rule.good() });

  return {
    type: "numbers",
    kind: "watch",
    bar: "step",
    prompt: `Zahl ${rule.text}?`,
    hint: `Drücke, sobald eine Zahl ${rule.text} erscheint`,
    duration: f.duration,
    stepInterval: f.interval,
    scale: f.interval,
    triggerAt: f.triggerAt,
    payload: { ruleText: rule.text, steps },
  };
}

function makeEmojiHunt() {
  // Ein ganzes Raster absuchen dauert länger als ein einzelnes Symbol lesen.
  const f = stepFrame(5, 1800);
  const cols = 5;
  const rows = 4;
  const target = pick(EMOJIS);
  const others = EMOJIS.filter((e) => e !== target);

  const grid = () => Array.from({ length: cols * rows }, () => pick(others));
  const frames = [];
  for (let i = 0; i < f.upTo; i++) frames.push({ t: f.times[i], cells: grid() });
  if (f.idx !== null) {
    const cells = grid();
    cells[int(0, cells.length - 1)] = target;
    frames.push({ t: f.times[f.idx], cells });
  }

  return {
    type: "emojihunt",
    kind: "watch",
    bar: "step",
    prompt: "Suche im Raster",
    hint: `Drücke, sobald ${target} auftaucht`,
    duration: f.duration,
    stepInterval: f.interval,
    scale: f.interval,
    triggerAt: f.triggerAt,
    payload: { target, cols, frames },
  };
}

// ---------------------------------------------------------------------------
// Warterunden – etwas läuft durchgehend, irgendwann passiert es. Hier gibt es
// keine Frist pro Element, also auch keinen Balken.
// ---------------------------------------------------------------------------

const watching = (extra) => ({
  kind: "watch",
  bar: "none",
  scale: 1200,
  ...extra,
});

function makeSmileys() {
  const duration = 6500;
  const cols = 5;
  const count = cols * 4;
  const happy = ["🙂", "😀", "😊", "😄"];
  const faces = Array.from({ length: count }, () => pick(happy));
  const trap = coin(0.15);
  const sadAt = trap ? null : Math.round(rnd(1500, duration - 1400));
  const sadIndex = int(0, count - 1);

  // Kosmetisches Gewusel, damit nicht einfach „die einzige Änderung" auffällt.
  const flips = [];
  for (let t = 240; t < duration; t += int(200, 300)) {
    const i = int(0, count - 1);
    if (sadAt !== null && t > sadAt && i === sadIndex) continue;
    flips.push({ t, i, f: pick(happy) });
  }

  return watching({
    type: "smileys",
    prompt: "Ist ein trauriger Smiley zu sehen?",
    hint: "Drücke, sobald einer traurig guckt",
    duration,
    triggerAt: sadAt,
    payload: { cols, faces, flips, sadIndex, sad: pick(["😢", "🙁", "😭", "😞"]), sadAt },
  });
}

function makeArrows() {
  const duration = 6500;
  const cols = 5;
  const count = cols * 4;
  const trap = coin(0.15);
  return watching({
    type: "arrows",
    prompt: "Zeigt ein Pfeil nach unten?",
    hint: "Drücke, sobald sich einer umdreht",
    duration,
    triggerAt: trap ? null : Math.round(rnd(1500, duration - 1400)),
    payload: { cols, count, index: int(0, count - 1), spin: rnd(6, 14) },
  });
}

// Ab wann gilt das Dreieck als aufgedeckt? Bewusst früh – sobald ein
// sichtbarer roter Zipfel herausschaut. Wer darauf reagiert, darf nicht als
// „zu früh" bestraft werden; gemessen wird ohnehin ab genau diesem Moment,
// also für alle gleich.
const TRI_REVEALED = 0.90;

function coverPath(tri, cand, duration) {
  if (coverage(tri, cand, 0) < 0.99) return { valid: false };
  let first = null;
  for (let t = 0; t <= duration; t += 20) {
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

function makeRedTriangle() {
  const duration = 5200;
  const trap = coin(0.15);
  const tri = { size: 17, x: rnd(20, 60), y: rnd(20, 60) };

  let cover = null;
  let revealAt = null;

  for (let attempt = 0; attempt < 800 && !cover; attempt++) {
    // Für die Falle ein großer, träger Klotz: er wackelt sichtbar, gibt das
    // Dreieck in der Rundenzeit aber nicht frei.
    const big = trap;
    const w = big ? rnd(46, 58) : rnd(26, 36);
    const h = big ? rnd(46, 58) : rnd(26, 36);
    const speed = big ? [1.5, 3.5] : [5, 20];
    const cand = {
      w, h,
      x: Math.min(Math.max(rnd(tri.x + tri.size - w + 2, tri.x - 2), 0), 100 - w),
      y: Math.min(Math.max(rnd(tri.y + tri.size - h + 2, tri.y - 2), 0), 100 - h),
      vx: rnd(speed[0], speed[1]) * (coin() ? 1 : -1),
      vy: rnd(speed[0], speed[1]) * (coin() ? 1 : -1),
      c: "#2b3350",
    };

    const path = coverPath(tri, cand, duration);
    if (!path.valid) continue;

    if (trap) {
      if (path.revealAt === null) { cover = cand; revealAt = null; }
    } else if (path.revealAt !== null &&
      path.revealAt >= 1400 && path.revealAt <= duration - 1300) {
      cover = cand;
      revealAt = path.revealAt;
    }
  }

  // Notausgang: waagerechte Fahrt, die das Dreieck garantiert freigibt.
  if (!cover) {
    const w = 32, h = 32;
    cover = {
      w, h,
      x: Math.min(Math.max(tri.x + tri.size - w + 2, 0), 100 - w),
      y: Math.min(Math.max(tri.y - 4, 0), 100 - h),
      vx: -12, vy: 0, c: "#2b3350",
    };
    revealAt = coverPath(tri, cover, duration).revealAt ?? 2500;
    revealAt = Math.min(Math.max(revealAt, 1400), duration - 1300);
  }

  // Ablenkung: Klötze, die das Dreieck zu keinem Zeitpunkt berühren.
  const decoyColors = ["#3a2f6b", "#1f4d5c", "#4a2b46", "#2f4a2b", "#5c4423"];
  const decoyShapes = ["rect", "circle", "tri"];
  const decoys = [];
  for (let i = 0; i < 5; i++) {
    for (let attempt = 0; attempt < 300; attempt++) {
      const w = rnd(14, 26);
      const cand = {
        w, h: rnd(14, 26),
        x: rnd(0, 100 - w), y: rnd(0, 70),
        vx: rnd(6, 24) * (coin() ? 1 : -1),
        vy: rnd(6, 24) * (coin() ? 1 : -1),
        c: decoyColors[i % decoyColors.length],
        shape: pick(decoyShapes),
      };
      cand.y = Math.min(cand.y, 100 - cand.h);
      let clean = true;
      for (let t = 0; t <= duration; t += 40) {
        if (coverage(tri, cand, t / 1000) > 0.03) { clean = false; break; }
      }
      if (clean) { decoys.push(cand); break; }
    }
  }

  return watching({
    type: "redtriangle",
    prompt: "Finde das rote Dreieck",
    hint: "Drücke, sobald es hinter den Klötzen hervorkommt",
    duration,
    triggerAt: revealAt,
    payload: { tri, cover, decoys },
  });
}

function makeTraffic() {
  const duration = 6000;
  const trap = coin(0.15);
  const steps = [{ t: 0, s: "red" }];
  let t = int(700, 1200);

  // Gelbe Zuckungen als Fehlstart-Falle.
  while (t < duration - 1400) {
    if (coin(0.45)) {
      steps.push({ t, s: "yellow" });
      steps.push({ t: t + int(160, 300), s: "red" });
    }
    t += int(500, 950);
  }

  let triggerAt = null;
  if (!trap) {
    const candidates = [];
    for (let g = 1500; g <= duration - 1300; g += 100) {
      if (steps.every((s) => Math.abs(s.t - g) > 220)) candidates.push(g);
    }
    triggerAt = candidates.length ? pick(candidates) : 2500;
    for (let i = steps.length - 1; i >= 0; i--) {
      if (steps[i].t >= triggerAt) steps.splice(i, 1);
    }
    steps.push({ t: triggerAt, s: "green" });
  }
  steps.sort((a, b) => a.t - b.t);

  return watching({
    type: "traffic",
    prompt: "Drücke bei GRÜN",
    hint: "Gelb ist eine Falle – nur Grün zählt",
    duration,
    triggerAt,
    payload: { steps },
  });
}

function makeTiming() {
  // Der Balken im Spielfeld ist hier die Aufgabe – der oben wäre doppelt.
  const duration = 4200;
  const markPct = rnd(0.42, 0.78);
  const tolerance = 450;
  return {
    type: "timing",
    kind: "precision",
    bar: "none",
    prompt: "Genau auf die Linie",
    hint: "Drücke exakt, wenn der Balken die Markierung erreicht",
    duration,
    scale: tolerance,
    tolerance,
    triggerAt: Math.round(duration * markPct),
    payload: { markPct },
  };
}

// ---------------------------------------------------------------------------

const GENERATORS = {
  compare: makeCompare,
  math: makeMath,
  stroop: makeStroop,
  count: makeCount,
  same: makeSame,
  word: makeWord,
  colorflash: makeColorFlash,
  smileys: makeSmileys,
  symbol: makeSymbol,
  redtriangle: makeRedTriangle,
  traffic: makeTraffic,
  nback: makeNback,
  arrows: makeArrows,
  category: makeCategory,
  numbers: makeNumbers,
  emojihunt: makeEmojiHunt,
  timing: makeTiming,
};

const KNOWLEDGE = ["compare", "math", "stroop", "count", "same", "word"];
const REACTION = [
  "colorflash", "smileys", "symbol", "redtriangle", "traffic",
  "nback", "arrows", "category", "numbers", "emojihunt", "timing",
];

export const ROUND_TYPES = Object.keys(GENERATORS);

export function makeRound(type) {
  return GENERATORS[type]();
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
