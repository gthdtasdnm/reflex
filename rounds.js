// Rundengenerierung. Läuft ausschließlich auf dem Server: er würfelt eine
// Runde aus und schickt allen Clients dieselbe fertige Beschreibung. Dadurch
// braucht der Client keinen Zufall und alle sehen garantiert dasselbe.
//
// Es gibt drei Sorten Runden:
//
//   kind: "series"     Eine Folge von Aufgaben, eine pro Zeitfenster. Manche
//                      sind Treffer, die meisten nicht. Gedrückt wird auf
//                      einen Treffer. Reagiert niemand, läuft die Folge
//                      weiter und die nächste Chance kommt – die Runde ist
//                      erst vorbei, wenn jemand richtig gedrückt hat.
//   kind: "watch"      Etwas läuft durch, irgendwann passiert es genau einmal.
//                      Manchmal auch gar nicht: dann gewinnt, wer stillhält.
//   kind: "precision"  Einen Moment auf den Punkt treffen.
//
// Gemeinsame Felder:
//   type      welcher Renderer sie zeichnet
//   bar       was der Zeitbalken oben anzeigt: "step" (Frist für die aktuelle
//             Aufgabe) oder "none" (es gibt keine sinnvolle Frist)
//   duration  Höchstdauer in ms – bei Serien nur der Fall, dass niemand drückt
//   scale     ab welcher Reaktionszeit es nur noch die Mindestpunktzahl gibt
//
// Serien tragen `items`, Warte- und Präzisionsrunden `triggerAt`.

import {
  ANIMALS, BUILDINGS, CATEGORIES, COLORS, COUNTRIES, EMOJIS, EVENTS,
  MOUNTAINS, SCREEN_COLORS, SYMBOLS,
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

// ---------------------------------------------------------------------------
// Serien
// ---------------------------------------------------------------------------

// Baut die Abfolge: gleichmäßige Fenster, darin verteilte Treffer. Der erste
// kommt früh, danach folgt alle zwei bis drei Aufgaben der nächste. So gibt es
// immer eine weitere Chance, falls niemand reagiert hat.
//
// Eine Falle wie bei den Warterunden braucht es hier nicht: die meisten
// Aufgaben sind keine Treffer, blindes Drücken bestraft sich von selbst.
function series(count, interval, makeItem) {
  const hits = new Set();
  for (let i = int(1, 2); i < count; i += int(2, 3)) hits.add(i);
  // Bei kurzen Folgen kann dabei nur ein einziger Treffer herauskommen – dann
  // wäre die Runde vorbei, ohne dass jemand eine zweite Gelegenheit hatte.
  if (hits.size < 2 && count >= 3) hits.add(count - 1);

  const items = [];
  for (let i = 0; i < count; i++) {
    const hit = hits.has(i);
    items.push({ t: i * interval, hit, ...makeItem(hit, items) });
  }
  return {
    kind: "series",
    bar: "step",
    items,
    stepInterval: interval,
    scale: interval,
    duration: count * interval,
  };
}

// --- Wissen ----------------------------------------------------------------

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
    hint: "Drücke, sobald eine Aussage stimmt",
    payload: { op: m.op, legend: m.legend },
    ...series(6, 2800, (hit) => {
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
    hint: "Drücke, sobald eine Rechnung aufgeht",
    payload: {},
    ...series(6, 2500, (hit) => {
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
    hint: "Drücke, sobald ein Wort in seiner eigenen Farbe steht",
    payload: {},
    ...series(8, 1600, (hit) => {
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
    hint: `Drücke, sobald mehr als ${threshold} Punkte zu sehen sind`,
    payload: { threshold },
    ...series(5, 2800, (hit) => ({
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
    hint: "Drücke, sobald die beiden Muster identisch sind",
    payload: { cols },
    ...series(5, 2800, (hit) => {
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

// --- Erkennen --------------------------------------------------------------

function makeSymbol() {
  const target = pick(SYMBOLS);
  const others = SYMBOLS.filter((s) => s !== target);
  return {
    type: "symbol",
    prompt: "Ist das Symbol zu sehen?",
    hint: "Drücke, sobald genau dieses Symbol erscheint",
    payload: { target },
    ...series(9, 1300, (hit) => ({ s: hit ? target : pick(others) })),
  };
}

function makeCategory() {
  const cat = pick(CATEGORIES);
  const others = CATEGORIES.filter((c) => c.label !== cat.label)
    .flatMap((c) => c.words);
  return {
    type: "category",
    prompt: `Kategorie: ${cat.label}`,
    hint: `Drücke, sobald ein Wort aus der Kategorie ${cat.label} erscheint`,
    payload: { label: cat.label },
    ...series(8, 1700, (hit) => ({ w: hit ? pick(cat.words) : pick(others) })),
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
    hint: `Drücke, sobald eine Zahl ${rule.text} erscheint`,
    payload: { ruleText: rule.text },
    ...series(9, 1500, (hit) => ({ n: hit ? rule.good() : rule.bad() })),
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
    hint: `Drücke, sobald ${target} auftaucht`,
    payload: { target, cols },
    ...series(7, 1900, (hit) => {
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
    hint: `Der Bildschirm wechselt die Farbe – drücke, sobald er ${target.name} wird`,
    payload: { targetName: target.name, targetHex: target.hex },
    ...series(8, 1300, (hit, sofar) => {
      if (hit) return { c: target.hex };
      const prev = sofar.length ? sofar[sofar.length - 1].c : null;
      return { c: pick(others.filter((o) => o.hex !== prev)).hex };
    }),
  };
}

// ---------------------------------------------------------------------------
// Warterunden – etwas läuft durchgehend, irgendwann passiert es genau einmal.
// Hier gibt es keine Frist pro Aufgabe, also auch keinen Balken. Und hier
// ergibt die Falle Sinn: Warten ist das ganze Spiel.
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

export function makeRound(type) {
  return GENERATORS[type]();
}

// Welche Aufgabe war zum Zeitpunkt `elapsed` zu sehen? Server und Client
// müssen hier zum selben Ergebnis kommen, sonst weicht die sofortige
// Rückmeldung von der Wertung ab.
export function itemAt(round, elapsed) {
  const i = Math.floor(elapsed / round.stepInterval);
  if (i < 0 || i >= round.items.length) return null;
  return round.items[i];
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
