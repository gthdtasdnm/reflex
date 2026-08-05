// Zeichnet die einzelnen Rundentypen. Jeder Renderer bekommt die vom Server
// gewürfelte Runde und ein leeres Element, baut sein DOM einmal auf und
// bekommt danach pro Bild `frame(t)` mit t = Millisekunden seit Rundenstart.
//
// Alles läuft über dasselbe Gerüst: eine Runde sind fünf Aufgaben, eine pro
// Zeitfenster. `itemRenderer` kümmert sich um das Umschalten; die Typen
// liefern nur zwei Dinge:
//
//   draw(item, index)   einmal beim Wechsel zur nächsten Aufgabe
//   frame(item, rel)    pro Bild, mit rel = Zeit seit Beginn des Fensters
//
// Statische Aufgaben brauchen nur `draw`, die Warteaufgaben beides.
//
// Alles, was sich bewegt, wird aus `rel` berechnet – nie aufsummiert. Sonst
// laufen zwei Geräte mit unterschiedlicher Bildrate auseinander.

import { shapeAt } from "./motion.js";

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// Letzter Schritt, dessen Zeitpunkt schon erreicht ist.
function stepAt(steps, t) {
  let found = null;
  for (const s of steps) {
    if (s.t <= t) found = s;
    else break;
  }
  return found;
}

function grid(cols, cls = "") {
  const g = el("div", `grid ${cls}`);
  g.style.setProperty("--cols", cols);
  return g;
}

function pop(node) {
  node.classList.remove("pop");
  void node.offsetWidth;
  node.classList.add("pop");
}

function itemRenderer(setup) {
  return (round, root) => {
    const api = setup(round, root);
    let shown = -1;
    return {
      frame(t) {
        const i = Math.min(
          Math.floor(t / round.stepInterval),
          round.items.length - 1,
        );
        if (i < 0) return;
        const item = round.items[i];
        if (i !== shown) {
          shown = i;
          api.draw?.(item, i);
        }
        api.frame?.(item, t - item.t, i);
      },
    };
  };
}

const renderers = {
  // --- Wissen: der Inhalt steht sofort im Fenster --------------------------

  compare: itemRenderer((round, root) => {
    const p = round.payload;
    const box = el("div", "cmp");
    const left = el("div", "cmp-side");
    const right = el("div", "cmp-side");
    box.append(left, el("div", "cmp-op", p.op), right);
    root.append(box, el("div", "cmp-legend", `„${p.op}" heißt: ${p.legend}`));
    return {
      draw(item) {
        left.textContent = item.left;
        right.textContent = item.right;
        pop(box);
      },
    };
  }),

  math: itemRenderer((_round, root) => {
    const node = el("div", "bignum");
    root.append(node);
    return {
      draw(item) {
        node.textContent = `${item.expr} = ${item.shown}`;
        pop(node);
      },
    };
  }),

  stroop: itemRenderer((_round, root) => {
    const node = el("div", "stroop");
    root.append(node);
    return {
      draw(item) {
        node.textContent = item.word;
        node.style.color = item.hex;
        pop(node);
      },
    };
  }),

  count: itemRenderer((_round, root) => {
    const field = el("div", "field");
    root.append(field);
    return {
      draw(item) {
        field.textContent = "";
        for (const d of item.dots) {
          const dot = el("div", "dot");
          dot.style.left = `${d.x}%`;
          dot.style.top = `${d.y}%`;
          field.append(dot);
        }
        pop(field);
      },
    };
  }),

  same: itemRenderer((round, root) => {
    const cols = round.payload.cols;
    const wrap = el("div", "twin");
    const grids = [grid(cols, "twin-grid"), grid(cols, "twin-grid")];
    wrap.append(...grids);
    root.append(wrap);
    return {
      draw(item) {
        for (const [g, cells] of [[grids[0], item.a], [grids[1], item.b]]) {
          g.textContent = "";
          for (const c of cells) g.append(el("div", "cell", c));
        }
        pop(wrap);
      },
    };
  }),

  // --- Erkennen -----------------------------------------------------------

  symbol: itemRenderer((round, root) => {
    const chip = el("div", "target-chip");
    chip.append(el("span", "target-chip-label", "gesucht"));
    chip.append(el("span", "target-chip-sym", round.payload.target));
    const now = el("div", "bigsym");
    root.append(chip, now);
    return {
      draw(item) {
        now.textContent = item.s;
        pop(now);
      },
    };
  }),

  category: itemRenderer((round, root) => {
    const chip = el("div", "target-chip");
    chip.append(el("span", "target-chip-label", "Kategorie"));
    chip.append(el("span", "target-chip-name", round.payload.label));
    const now = el("div", "bigword");
    root.append(chip, now);
    return {
      draw(item) {
        now.textContent = item.w;
        pop(now);
      },
    };
  }),

  numbers: itemRenderer((round, root) => {
    const chip = el("div", "target-chip");
    chip.append(el("span", "target-chip-label", "gesucht"));
    chip.append(el("span", "target-chip-name", round.payload.ruleText));
    const now = el("div", "bignum");
    root.append(chip, now);
    return {
      draw(item) {
        now.textContent = String(item.n);
        pop(now);
      },
    };
  }),

  emojihunt: itemRenderer((round, root) => {
    const p = round.payload;
    const chip = el("div", "target-chip");
    chip.append(el("span", "target-chip-label", "gesucht"));
    chip.append(el("span", "target-chip-sym", p.target));
    const g = grid(p.cols, "hunt");
    const cells = [];
    for (let i = 0; i < round.items[0].cells.length; i++) {
      const c = el("div", "cell");
      g.append(c);
      cells.push(c);
    }
    root.append(chip, g);
    return {
      draw(item) {
        for (let i = 0; i < cells.length; i++) cells[i].textContent = item.cells[i];
      },
    };
  }),

  colorflash: itemRenderer((round, root) => {
    const p = round.payload;
    const surface = el("div", "flash-surface");
    const chip = el("div", "target-chip");
    chip.append(el("span", "target-chip-label", "gesucht"));
    const swatch = el("span", "swatch");
    swatch.style.background = p.targetHex;
    chip.append(swatch, el("span", "target-chip-name", p.targetName));
    root.append(surface, chip);
    return {
      draw(item) {
        surface.style.background = item.c;
      },
    };
  }),

  // --- Warten: im Fenster passiert etwas erst nach einer Weile -------------

  traffic: itemRenderer((_round, root) => {
    const light = el("div", "light");
    const lamps = {
      red: el("div", "lamp lamp-red"),
      yellow: el("div", "lamp lamp-yellow"),
      green: el("div", "lamp lamp-green"),
    };
    light.append(lamps.red, lamps.yellow, lamps.green);
    root.append(light);

    let last = null;
    return {
      draw() {
        last = null;
      },
      frame(item, rel) {
        const s = stepAt(item.steps, rel);
        const state = s ? s.s : "off";
        if (state === last) return;
        last = state;
        for (const [k, node] of Object.entries(lamps)) {
          node.classList.toggle("on", k === state);
        }
      },
    };
  }),

  smileys: itemRenderer((round, root) => {
    const p = round.payload;
    const g = grid(p.cols, "faces");
    const cells = [];
    for (let i = 0; i < p.count; i++) {
      const c = el("div", "cell");
      g.append(c);
      cells.push(c);
    }
    root.append(g);

    let cursor = 0;
    let sadDone = false;
    return {
      draw(item) {
        cursor = 0;
        sadDone = false;
        for (let i = 0; i < cells.length; i++) {
          cells[i].textContent = item.faces[i];
          cells[i].classList.remove("pop");
        }
      },
      frame(item, rel) {
        while (cursor < item.flips.length && item.flips[cursor].t <= rel) {
          const f = item.flips[cursor++];
          if (!(sadDone && f.i === item.sadIndex)) cells[f.i].textContent = f.f;
        }
        if (item.hit && !sadDone && rel >= item.at) {
          sadDone = true;
          cells[item.sadIndex].textContent = p.sad;
          cells[item.sadIndex].classList.add("pop");
        }
      },
    };
  }),

  arrows: itemRenderer((round, root) => {
    const p = round.payload;
    const g = grid(p.cols, "arrows");
    const cells = [];
    for (let i = 0; i < p.count; i++) {
      const c = el("div", "cell", "▲");
      g.append(c);
      cells.push(c);
    }
    root.append(g);

    let flipped = false;
    return {
      draw() {
        flipped = false;
        for (const c of cells) {
          c.textContent = "▲";
          c.classList.remove("pop");
        }
      },
      frame(item, rel) {
        // Alles dreht sich leicht, damit das Umklappen nicht die einzige
        // Bewegung im Bild ist.
        g.style.transform = `rotate(${Math.sin(rel / 700) * item.spin}deg)`;
        if (item.hit && !flipped && rel >= item.at) {
          flipped = true;
          cells[item.index].textContent = "▼";
          cells[item.index].classList.add("pop");
        }
      },
    };
  }),

  redtriangle: itemRenderer((_round, root) => {
    const field = el("div", "field geo");
    root.append(field);
    let movers = [];

    return {
      draw(item) {
        field.textContent = "";
        const tri = el("div", "redtri");
        tri.style.left = `${item.tri.x}%`;
        tri.style.top = `${item.tri.y}%`;
        tri.style.width = `${item.tri.size}%`;
        tri.style.height = `${item.tri.size}%`;
        field.append(tri);

        movers = [];
        for (const s of [...item.decoys, item.cover]) {
          const b = el("div", `block block-${s.shape ?? "rect"}`);
          b.style.width = `${s.w}%`;
          b.style.height = `${s.h}%`;
          b.style.background = s.c;
          field.append(b);
          movers.push({ s, node: b });
        }
      },
      frame(_item, rel) {
        const sec = rel / 1000;
        for (const m of movers) {
          const pos = shapeAt(m.s, sec);
          m.node.style.transform = `translate(${pos.x}cqw, ${pos.y}cqh)`;
        }
      },
    };
  }),

  timing: itemRenderer((round, root) => {
    const track = el("div", "track");
    const fill = el("div", "track-fill");
    const mark = el("div", "track-mark");
    track.append(fill, mark);
    const counter = el("div", "track-count");
    root.append(track, counter);
    return {
      draw(item, i) {
        mark.style.left = `${item.markPct * 100}%`;
        counter.textContent = `${i + 1} / ${round.items.length}`;
      },
      frame(item, rel) {
        const pct = Math.min(1, Math.max(0, rel / round.stepInterval)) * 100;
        fill.style.width = `${pct}%`;
        mark.classList.toggle("hot", Math.abs(rel - item.at) < 110);
      },
    };
  }),
};

export function createRenderer(round, root) {
  root.textContent = "";
  root.className = `stage-content type-${round.type}`;
  // Die Frage bleibt während der ganzen Runde oben stehen. Absolut
  // positioniert, damit sie die Mittigkeit des Inhalts nicht verschiebt.
  root.append(el("div", "stage-prompt", round.prompt));
  const make = renderers[round.type];
  if (!make) {
    root.append(el("div", "bigword", "?"));
    return { frame() {} };
  }
  const inst = make(round, root);
  return { frame: inst.frame ?? (() => {}) };
}
