// Kleiner Synthesizer für die Automaten-Geräusche. Keine Dateien, kein
// Nachladen – alles aus Oszillatoren. Der AudioContext darf erst nach einer
// Nutzergeste starten, deshalb `unlock()` beim ersten Tippen.

let ctx = null;
let master = null;
let enabled = true;

export function unlock() {
  if (!ctx) {
    const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.28;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
}

export function setEnabled(v) {
  enabled = v;
  if (master) master.gain.value = v ? 0.28 : 0;
}

export const isEnabled = () => enabled;

function tone(freq, start, dur, type = "square", peak = 0.6) {
  if (!ctx || !enabled) return;
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function sweep(from, to, start, dur, type = "sawtooth", peak = 0.5) {
  if (!ctx || !enabled) return;
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(30, to), t0 + dur);
  gain.gain.setValueAtTime(peak, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const sfx = {
  tick: () => tone(880, 0, 0.05, "square", 0.25),
  go: () => { tone(660, 0, 0.09); tone(990, 0.09, 0.16); },
  reel: () => tone(220 + Math.random() * 120, 0, 0.035, "square", 0.18),
  reelStop: () => { tone(330, 0, 0.06); tone(494, 0.05, 0.1); },
  hit: () => { tone(784, 0, 0.07); tone(1175, 0.06, 0.12); },
  perfect: () => { tone(784, 0, 0.06); tone(1175, 0.05, 0.06); tone(1568, 0.1, 0.18); },
  wrong: () => sweep(320, 70, 0, 0.32, "sawtooth", 0.45),
  miss: () => tone(160, 0, 0.22, "triangle", 0.35),
  coin: () => { tone(1318, 0, 0.05); tone(1760, 0.05, 0.14); },
  jackpot: () => {
    const notes = [523, 659, 784, 1046, 1318, 1568];
    notes.forEach((f, i) => tone(f, i * 0.075, 0.22, "square", 0.5));
  },
  fanfare: () => {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.13, 0.4, "square", 0.5));
  },
};
