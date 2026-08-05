// Zeichnet die einzelnen Rundentypen. Jeder Renderer bekommt die vom Server
// gewürfelte Runde und ein leeres Element, baut sein DOM einmal auf und
// bekommt danach pro Bild `frame(t)` mit t = Millisekunden seit Rundenstart.
//
// Alles, was sich bewegt, wird aus t berechnet – nie aufsummiert. Sonst
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

// ---------------------------------------------------------------------------
// Wissensrunden – statisch, es gibt nichts zu animieren.
// ---------------------------------------------------------------------------

const renderers = {
  compare(round, root) {
    const p = round.payload;
    const box = el("div", "cmp");
    box.append(
      el("div", "cmp-side", p.left),
      el("div", "cmp-op", p.op),
      el("div", "cmp-side", p.right),
    );
    root.append(box, el("div", "cmp-legend", `„${p.op}" heißt: ${p.legend}`));
    return {};
  },

  math(round, root) {
    const p = round.payload;
    root.append(el("div", "bignum", `${p.expr} = ${p.shown}`));
    return {};
  },

  stroop(round, root) {
    const p = round.payload;
    const w = el("div", "stroop", p.word);
    w.style.color = p.hex;
    root.append(w);
    return {};
  },

  count(round, root) {
    const field = el("div", "field");
    for (const d of round.payload.dots) {
      const dot = el("div", "dot");
      dot.style.left = `${d.x}%`;
      dot.style.top = `${d.y}%`;
      field.append(dot);
    }
    root.append(field);
    return {};
  },

  same(round, root) {
    const p = round.payload;
    const wrap = el("div", "twin");
    for (const cells of [p.a, p.b]) {
      const g = grid(p.cols, "twin-grid");
      for (const c of cells) g.append(el("div", "cell", c));
      wrap.append(g);
    }
    root.append(wrap);
    return {};
  },

  word(round, root) {
    root.append(el("div", "bigword", round.payload.word));
    return {};
  },

  // -------------------------------------------------------------------------
  // Reaktionsrunden
  // -------------------------------------------------------------------------

  colorflash(round, root) {
    const p = round.payload;
    const surface = el("div", "flash-surface");
    const chip = el("div", "target-chip");
    chip.append(el("span", "target-chip-label", "gesucht"));
    const swatch = el("span", "swatch");
    swatch.style.background = p.targetHex;
    chip.append(swatch, el("span", "target-chip-name", p.targetName));
    root.append(surface, chip);

    let last = null;
    return {
      frame(t) {
        const s = stepAt(p.steps, t);
        const c = s ? s.c : "#141024";
        if (c !== last) {
          last = c;
          surface.style.background = c;
        }
      },
    };
  },

  smileys(round, root) {
    const p = round.payload;
    const g = grid(p.cols, "faces");
    const cells = p.faces.map((f) => {
      const c = el("div", "cell", f);
      g.append(c);
      return c;
    });
    root.append(g);

    let cursor = 0;
    let sadDone = false;
    return {
      frame(t) {
        while (cursor < p.flips.length && p.flips[cursor].t <= t) {
          const f = p.flips[cursor++];
          if (!(sadDone && f.i === p.sadIndex)) cells[f.i].textContent = f.f;
        }
        if (!sadDone && p.sadAt !== null && t >= p.sadAt) {
          sadDone = true;
          cells[p.sadIndex].textContent = p.sad;
          cells[p.sadIndex].classList.add("pop");
        }
      },
    };
  },

  symbol(round, root) {
    const p = round.payload;
    const chip = el("div", "target-chip");
    chip.append(el("span", "target-chip-label", "gesucht"));
    chip.append(el("span", "target-chip-sym", p.target));
    const now = el("div", "bigsym");
    root.append(chip, now);

    let last = null;
    return {
      frame(t) {
        const s = stepAt(p.steps, t);
        const v = s ? s.s : "";
        if (v !== last) {
          last = v;
          now.textContent = v;
          now.classList.remove("pop");
          void now.offsetWidth;
          now.classList.add("pop");
        }
      },
    };
  },

  redtriangle(round, root) {
    const p = round.payload;
    const field = el("div", "field geo");

    const tri = el("div", "redtri");
    tri.style.left = `${p.tri.x}%`;
    tri.style.top = `${p.tri.y}%`;
    tri.style.width = `${p.tri.size}%`;
    tri.style.height = `${p.tri.size}%`;
    field.append(tri);

    const movers = [];
    for (const s of [...p.decoys, p.cover]) {
      const b = el("div", `block block-${s.shape ?? "rect"}`);
      b.style.width = `${s.w}%`;
      b.style.height = `${s.h}%`;
      b.style.background = s.c;
      field.append(b);
      movers.push({ s, node: b });
    }
    root.append(field);

    return {
      frame(t) {
        const sec = t / 1000;
        for (const m of movers) {
          const pos = shapeAt(m.s, sec);
          m.node.style.transform =
            `translate(${pos.x}cqw, ${pos.y}cqh)`;
        }
      },
    };
  },

  traffic(round, root) {
    const p = round.payload;
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
      frame(t) {
        const s = stepAt(p.steps, t);
        const state = s ? s.s : "off";
        if (state === last) return;
        last = state;
        for (const [k, node] of Object.entries(lamps)) {
          node.classList.toggle("on", k === state);
        }
      },
    };
  },

  nback(round, root) {
    const p = round.payload;
    const now = el("div", "bigsym");
    root.append(now);
    let last = null;
    return {
      frame(t) {
        const s = stepAt(p.steps, t);
        const v = s ? s.s : "";
        if (v !== last) {
          last = v;
          now.textContent = v;
          now.classList.remove("pop");
          void now.offsetWidth;
          now.classList.add("pop");
        }
      },
    };
  },

  arrows(round, root) {
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
      frame(t) {
        // Alles dreht sich leicht, damit das Umklappen nicht die einzige
        // Bewegung im Bild ist.
        g.style.transform = `rotate(${Math.sin(t / 900) * p.spin}deg)`;
        if (!flipped && round.triggerAt !== null && t >= round.triggerAt) {
          flipped = true;
          cells[p.index].textContent = "▼";
          cells[p.index].classList.add("pop");
        }
      },
    };
  },

  category(round, root) {
    const p = round.payload;
    const chip = el("div", "target-chip");
    chip.append(el("span", "target-chip-label", "Kategorie"));
    chip.append(el("span", "target-chip-name", p.label));
    const now = el("div", "bigword");
    root.append(chip, now);

    let last = null;
    return {
      frame(t) {
        const s = stepAt(p.steps, t);
        const v = s ? s.w : "";
        if (v !== last) {
          last = v;
          now.textContent = v;
          now.classList.remove("pop");
          void now.offsetWidth;
          now.classList.add("pop");
        }
      },
    };
  },

  numbers(round, root) {
    const p = round.payload;
    const chip = el("div", "target-chip");
    chip.append(el("span", "target-chip-label", "gesucht"));
    chip.append(el("span", "target-chip-name", p.ruleText));
    const now = el("div", "bignum");
    root.append(chip, now);

    let last = null;
    return {
      frame(t) {
        const s = stepAt(p.steps, t);
        const v = s ? String(s.n) : "";
        if (v !== last) {
          last = v;
          now.textContent = v;
          now.classList.remove("pop");
          void now.offsetWidth;
          now.classList.add("pop");
        }
      },
    };
  },

  emojihunt(round, root) {
    const p = round.payload;
    const chip = el("div", "target-chip");
    chip.append(el("span", "target-chip-label", "gesucht"));
    chip.append(el("span", "target-chip-sym", p.target));
    const g = grid(p.cols, "hunt");
    const cells = [];
    for (let i = 0; i < p.frames[0].cells.length; i++) {
      const c = el("div", "cell");
      g.append(c);
      cells.push(c);
    }
    root.append(chip, g);

    let last = null;
    return {
      frame(t) {
        const f = stepAt(p.frames, t);
        if (!f || f === last) return;
        last = f;
        for (let i = 0; i < cells.length; i++) cells[i].textContent = f.cells[i];
      },
    };
  },

  timing(round, root) {
    const p = round.payload;
    const track = el("div", "track");
    const fill = el("div", "track-fill");
    const mark = el("div", "track-mark");
    mark.style.left = `${p.markPct * 100}%`;
    track.append(fill, mark);
    root.append(track);
    return {
      frame(t) {
        const pct = Math.min(1, t / round.duration) * 100;
        fill.style.width = `${pct}%`;
        mark.classList.toggle(
          "hot",
          round.triggerAt !== null && Math.abs(t - round.triggerAt) < 120,
        );
      },
    };
  },
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
