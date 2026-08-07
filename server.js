// LUCKY REFLEX – Deno-Server: statische Dateien + WebSocket + Spiellogik.
// Keine Abhängigkeiten, kein Build-Schritt. `deno task dev` oder direkt:
//   deno run --allow-net --allow-read --allow-env --allow-sys server.js

import { buildRoundPlan, itemIndexAt, makeRound } from "./rounds.js";

const PORT = Number(Deno.env.get("PORT") ?? 8000);
const HOST = Deno.env.get("HOST") ?? "0.0.0.0";

const PUBLIC = new URL("./public/", import.meta.url);

// ---------------------------------------------------------------------------
// Spielkonstanten
// ---------------------------------------------------------------------------

const MAX_PLAYERS = 4;

/**
 * Zwei verschiedene Dinge, die man leicht verwechselt:
 *
 * ROOM_IDLE_MS – so lange bleibt ein *Raum* offen, in dem gerade niemand sitzt.
 *   Das ist der Puffer fürs Link-Teilen: dafür muss man den Tab verlassen, und
 *   auf dem Handy stirbt dabei der Socket. Der Raum steht weiter, wer
 *   zurückkommt, tritt einfach wieder ein. In der Raumliste taucht er nicht
 *   auf, solange niemand drin sitzt – erreichbar ist er nur über Code und Link.
 *
 * SEAT_GRACE_MS – so lange bleibt ein *Platz* reserviert. Das braucht es nur
 *   während einer laufenden Partie, weil dort Punkte am Platz hängen. In der
 *   Lobby hängt daran nichts, also wird der Platz sofort frei – ein Sitz, auf
 *   dem sichtbar niemand sitzt, verwirrt nur.
 *
 * Gleiche Werte und gleiche Regel in allen vier Spielen.
 */
const ROOM_IDLE_MS = 5 * 60_000;
const SEAT_GRACE_MS = 60_000;

const PRELUDE_MS = 3400;   // Frage lesen, dann 3-2-1
const GRACE_MS = 900;      // Puffer für Netzlaufzeit nach Rundenende
const RESULT_MS = 2200;    // kurze Rückmeldung, kein Zwischenstand
const MIN_HUMAN_MS = 80;   // darunter war es geraten, nicht reagiert

// Punkte. Es gibt bewusst keine negativen Werte: ein Fehler kostet die
// Aufgabe, mehr nicht. Wer patzt, verliert dadurch schon gegen die anderen –
// zusätzlicher Abzug würde nur dazu führen, dass am Ende alle im Minus
// stehen und niemand die Runde gewonnen hat.
//
// Gewertet wird jede der fünf Aufgaben einzeln, deshalb sind die Beträge pro
// Aufgabe klein; der Rundensieg kommt obendrauf.
const P_ITEM_MIN = 100;    // Sockel für eine gewonnene Aufgabe
const P_ITEM_SPAN = 400;   // was über Geschwindigkeit dazukommt
const P_SPOTTED = 80;      // richtig erkannt, dass hier nichts zu drücken war
const P_PERFECT = 150;     // Timing auf den Punkt
const P_FLASH = 150;       // unter 250 ms reagiert
const FLASH_MS = 250;
const P_WIN = 400;         // Rundensieg
const P_CLOSEST = 150;     // niemand hat etwas geholt – der beste Versuch

// Serie: der eigentliche Nervenkitzel. Baut sich auf, reißt bei jedem Fehler.
const MULTS = [1, 1, 1.25, 1.5, 2, 2.5, 3];

// ---------------------------------------------------------------------------
// Räume
// ---------------------------------------------------------------------------

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const rooms = new Map();

// Sockets, die gerade auf der Startseite stehen und die Raumliste sehen wollen.
const browsing = new Set();

function newCode() {
  for (let i = 0; i < 500; i++) {
    let c = "";
    for (let k = 0; k < 4; k++) {
      c += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    if (!rooms.has(c)) return c;
  }
  return "R" + Date.now().toString(36).slice(-3).toUpperCase();
}

const token = () => crypto.randomUUID();

function cleanName(raw) {
  // Steuerzeichen raus, sonst zerlegt ein Zeilenumbruch im Namen das Layout.
  const s = String(raw ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return s.slice(0, 12) || "Spieler";
}

function createRoom(isPublic) {
  const room = {
    code: newCode(),
    isPublic: !!isPublic,
    phase: "lobby",
    hostId: null,
    players: new Map(),
    settings: { rounds: 10 },
    plan: [],
    roundNo: -1,
    current: null,
    timers: new Set(),
    idleTimer: null,     // läuft, solange niemand im Raum sitzt
    lastActivity: Date.now(),
  };
  rooms.set(room.code, room);
  return room;
}

/**
 * Ein Raum, in dem niemand mehr sitzt, wird nicht sofort abgeräumt – sonst wäre
 * er genau dann weg, wenn man gerade den Link verschickt. Nicht über later():
 * die Rundentimer werden bei jedem Übergang geleert, dieser darf das nicht
 * mitmachen.
 */
function scheduleIdleClose(room) {
  if (room.idleTimer) clearTimeout(room.idleTimer);
  room.idleTimer = setTimeout(() => {
    if (room.players.size === 0) destroyRoom(room);
  }, ROOM_IDLE_MS);
}

function cancelIdleClose(room) {
  if (room.idleTimer) { clearTimeout(room.idleTimer); room.idleTimer = null; }
}

function later(room, ms, fn) {
  const id = setTimeout(() => {
    room.timers.delete(id);
    try {
      fn();
    } catch (err) {
      console.error("Timer-Fehler in Raum", room.code, err);
    }
  }, ms);
  room.timers.add(id);
  return id;
}

function clearTimers(room) {
  for (const id of room.timers) clearTimeout(id);
  room.timers.clear();
}

function destroyRoom(room) {
  clearTimers(room);
  cancelIdleClose(room);
  for (const p of room.players.values()) {
    if (p.dropTimer) clearTimeout(p.dropTimer);
  }
  rooms.delete(room.code);
  pushRoomList();
}

/**
 * Der Host ist immer jemand, der auch da ist. Geht er raus oder ist seine
 * Verbindung weg, rückt der nächste Anwesende nach – sonst steht der Raum ohne
 * Host da und niemand kann die Runde starten.
 */
function ensureHost(room) {
  const current = room.players.get(room.hostId);
  if (current?.connected) return;
  const all = [...room.players.values()];
  const next = all.find((p) => p.connected) ?? all[0];
  room.hostId = next ? next.id : null;
}

// ---------------------------------------------------------------------------
// Senden
// ---------------------------------------------------------------------------

function send(player, msg) {
  const ws = player.ws;
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(msg));
    } catch { /* Verbindung stirbt gleich sowieso */ }
  }
}

function raw(ws, msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(msg));
    } catch { /* egal */ }
  }
}

function broadcast(room, msg) {
  for (const p of room.players.values()) send(p, msg);
}

function publicPlayers(room) {
  return [...room.players.values()].map((p) => ({
    id: p.id,
    name: p.name,
    score: p.score,
    streak: p.streak,
    ready: p.ready,
    connected: p.connected,
    host: p.id === room.hostId,
  }));
}

function roomState(room) {
  return {
    t: "room",
    code: room.code,
    isPublic: room.isPublic,
    phase: room.phase,
    hostId: room.hostId,
    settings: room.settings,
    players: publicPlayers(room),
    roundNo: room.roundNo,
    totalRounds: room.settings.rounds,
  };
}

function pushState(room) {
  broadcast(room, roomState(room));
  if (room.isPublic) pushRoomList();
}

// Offene Räume für die Startseite.
function roomList() {
  // Gezählt und gefiltert wird nach *verbundenen* Spielern. Sonst steht ein
  // Raum, dessen Leute alle weg sind, noch in der Liste, bis er weggeräumt
  // wird – und zeigt dabei „0/4".
  return [...rooms.values()]
    .map((r) => ({
      room: r,
      count: [...r.players.values()].filter((p) => p.connected).length,
    }))
    .filter(({ room, count }) =>
      room.isPublic && room.phase === "lobby" &&
      count > 0 && room.players.size < MAX_PLAYERS
    )
    .map(({ room, count }) => ({
      code: room.code,
      host: room.players.get(room.hostId)?.name ?? "?",
      count,
      max: MAX_PLAYERS,
      rounds: room.settings.rounds,
    }))
    .sort((a, b) => b.count - a.count);
}

function pushRoomList() {
  const msg = { t: "rooms", rooms: roomList() };
  for (const ws of browsing) raw(ws, msg);
}

// ---------------------------------------------------------------------------
// Spielablauf
// ---------------------------------------------------------------------------

function startGame(room) {
  clearTimers(room);
  room.phase = "playing";
  room.plan = buildRoundPlan(room.settings.rounds);
  room.roundNo = -1;
  for (const p of room.players.values()) {
    p.score = 0;
    p.streak = 0;
    p.bestStreak = 0;
    p.best = null;
    p.hits = 0;
    p.wins = 0;
    p.ready = false;
  }
  pushState(room);
  later(room, 700, () => nextRound(room));
}

// Was der Client von einer Runde zu sehen bekommt. Die fünf Aufgaben müssen
// mit, sonst kann er weder zeichnen noch sofort zurückmelden, ob der Druck
// saß.
function wireRound(round) {
  return {
    type: round.type,
    bar: round.bar,
    prompt: round.prompt,
    hint: round.hint,
    duration: round.duration,
    stepInterval: round.stepInterval,
    precision: !!round.precision,
    tolerance: round.tolerance ?? null,
    items: round.items,
    payload: round.payload,
  };
}

function nextRound(room) {
  room.roundNo++;
  if (room.roundNo >= room.plan.length) return finishGame(room);

  const round = makeRound(room.plan[room.roundNo]);
  const startAt = Date.now() + PRELUDE_MS;
  room.current = {
    round, startAt, scored: false,
    presses: new Map(), // Spieler -> Map(Aufgabenindex -> elapsed)
    itemWinner: [],     // Aufgabenindex -> Spieler, der sie geholt hat
  };

  broadcast(room, {
    t: "round",
    n: room.roundNo + 1,
    total: room.plan.length,
    startAt,
    serverNow: Date.now(),
    round: wireRound(round),
  });

  later(room, PRELUDE_MS + round.duration + GRACE_MS, () => scoreRound(room));
}

function clamp(x, lo, hi) {
  return Math.min(Math.max(x, lo), hi);
}

// Was hat dieser Druck in *dieser* Aufgabe ausgelöst? Eine Stelle für alle
// Rundenarten, damit „Aufgabe ist vergeben" und die spätere Wertung nicht
// auseinanderlaufen können.
//
// `rel` ist die Zeit seit Beginn des Fensters, `item.at` der Moment darin, ab
// dem Drücken richtig ist – bei Wissensaufgaben 0, bei einer Ampel der
// Umschaltmoment.
function evaluate(round, index, elapsed) {
  const item = round.items[index];
  const rel = elapsed - item.t;

  if (round.precision) {
    const err = Math.abs(rel - item.at);
    if (err <= round.tolerance) {
      return { outcome: err <= 70 ? "perfect" : "hit", reaction: rel - item.at, err };
    }
    return { outcome: "off", reaction: rel - item.at, err };
  }

  if (!item.hit) return { outcome: "wrong", reaction: null };
  // Unter 80 ms kann niemand gelesen haben, was da steht – das war
  // Dauerdrücken, das zufällig auf eine passende Aufgabe fiel.
  if (rel < item.at + MIN_HUMAN_MS) return { outcome: "early", reaction: null };
  return { outcome: "hit", reaction: rel - item.at };
}

const isGood = (o) => o === "hit" || o === "perfect";

function scoreRound(room) {
  const cur = room.current;
  if (!cur || cur.scored) return;
  cur.scored = true;
  clearTimers(room);

  const { round } = cur;
  const scale = round.scale ?? 1200;
  const players = [...room.players.values()];

  // Bei Präzisionsaufgaben wird nicht beim ersten richtigen Druck gesperrt –
  // dort gewinnt, wer der Markierung am nächsten kam, und das steht erst
  // fest, wenn alle dran waren.
  if (round.precision) {
    for (let i = 0; i < round.items.length; i++) {
      let best = null;
      for (const p of players) {
        const at = cur.presses.get(p.id)?.get(i);
        if (at === undefined) continue;
        const ev = evaluate(round, i, at);
        if (!isGood(ev.outcome)) continue;
        if (best === null || ev.err < best.err) best = { id: p.id, err: ev.err };
      }
      if (best) cur.itemWinner[i] = best.id;
    }
  }

  // Schritt 1: jede der fünf Aufgaben einzeln auswerten.
  const raws = new Map();
  for (const p of players) {
    const mine = cur.presses.get(p.id);
    let earned = 0;
    let itemsWon = 0;
    let flash = false;
    let perfect = false;
    let best = null;
    const outcomes = [];

    for (let i = 0; i < round.items.length; i++) {
      const item = round.items[i];
      const at = mine?.get(i);

      if (at === undefined) {
        // Nicht gedrückt. Bei einer Aufgabe, bei der nichts zu drücken war,
        // ist genau das die richtige Antwort.
        if (!item.hit && !round.precision) {
          earned += P_SPOTTED;
          outcomes.push("spotted");
        } else if (cur.itemWinner[i] && cur.itemWinner[i] !== p.id) {
          outcomes.push("locked");
        } else {
          outcomes.push("miss");
        }
        continue;
      }

      const ev = evaluate(round, i, at);
      outcomes.push(cur.itemWinner[i] === p.id ? ev.outcome : "locked");
      if (cur.itemWinner[i] !== p.id) continue;

      itemsWon++;
      let pts = round.precision
        ? P_ITEM_MIN + Math.round(P_ITEM_SPAN * (1 - ev.err / round.tolerance))
        : P_ITEM_MIN + Math.round(P_ITEM_SPAN * clamp(1 - ev.reaction / scale, 0, 1));
      if (ev.outcome === "perfect") { pts += P_PERFECT; perfect = true; }
      if (!round.precision && ev.reaction !== null && ev.reaction < FLASH_MS) {
        pts += P_FLASH;
        flash = true;
      }
      earned += pts;
      if (ev.reaction !== null && (best === null || ev.reaction < best)) {
        best = ev.reaction;
      }
    }

    raws.set(p.id, { earned, itemsWon, flash, perfect, best, outcomes });
  }

  // Schritt 2: Rundensieger ist, wer die meisten Aufgaben geholt hat. Bei
  // Gleichstand entscheiden die Punkte; sind auch die gleich, teilen sie
  // sich den Sieg. Hat niemand etwas geholt, geht er an den knappsten
  // Versuch – es gewinnt immer jemand.
  let winners = [];
  let winBonus = 0;
  const bestItems = Math.max(...players.map((p) => raws.get(p.id).itemsWon), 0);

  if (bestItems > 0) {
    winBonus = P_WIN;
    const top = players.filter((p) => raws.get(p.id).itemsWon === bestItems);
    const bestPts = Math.max(...top.map((p) => raws.get(p.id).earned));
    winners = top.filter((p) => raws.get(p.id).earned === bestPts);
  } else if (players.length) {
    winBonus = P_CLOSEST;
    // Wer am längsten durchgehalten hat, ohne danebenzugreifen.
    const score = (p) => raws.get(p.id).earned;
    const bestPts = Math.max(...players.map(score));
    if (bestPts > 0) winners = players.filter((p) => score(p) === bestPts);
  }
  const winnerIds = new Set(winners.map((p) => p.id));

  // Schritt 3: Punkte verteilen.
  const results = [];
  for (const p of players) {
    const r = raws.get(p.id);
    const streakIn = p.streak;
    const mult = MULTS[Math.min(streakIn, MULTS.length - 1)];
    const notes = [];
    if (r.flash) notes.push("BLITZ");
    if (r.perfect) notes.push("PERFEKT");

    // Die Serie multipliziert die Leistung, nicht den Rundensieg – sonst
    // reißt der Vorsprung dessen, der einmal vorn liegt, nicht mehr ab.
    const earned = Math.round(r.earned * mult);
    let bonus = 0;
    if (winnerIds.has(p.id)) {
      bonus = winBonus;
      notes.push(bestItems > 0 ? "RUNDENSIEG" : "am nächsten dran");
      p.wins++;
    }

    const delta = earned + bonus;
    p.score += delta;
    p.hits += r.itemsWon;
    if (r.best !== null && (p.best === null || r.best < p.best)) p.best = r.best;

    if (winnerIds.has(p.id)) {
      p.streak = streakIn + 1;
      p.bestStreak = Math.max(p.bestStreak, p.streak);
    } else {
      p.streak = 0;
    }

    results.push({
      id: p.id,
      name: p.name,
      itemsWon: r.itemsWon,
      totalItems: round.items.length,
      reaction: r.best,
      outcomes: r.outcomes,
      delta,
      mult,
      won: winnerIds.has(p.id),
      notes,
      score: p.score,
      streak: p.streak,
    });
  }

  broadcast(room, {
    t: "result",
    n: room.roundNo + 1,
    total: room.plan.length,
    truth: describeTruth(round),
    results,
  });

  later(room, RESULT_MS, () => nextRound(room));
}

function describeTruth(round) {
  if (round.precision) return `${round.items.length} Markierungen zu treffen`;
  const total = round.items.filter((i) => i.hit).length;
  return `${total} von ${round.items.length} Aufgaben passten`;
}

function finishGame(room) {
  clearTimers(room);
  room.phase = "final";
  room.current = null;
  const table = [...room.players.values()]
    .map((p) => ({
      id: p.id, name: p.name, score: p.score,
      best: p.best, hits: p.hits, wins: p.wins, bestStreak: p.bestStreak,
    }))
    .sort((a, b) => b.score - a.score);
  for (const p of room.players.values()) p.ready = false;
  broadcast(room, { t: "final", table });
  pushState(room);
}

function backToLobby(room) {
  clearTimers(room);
  room.phase = "lobby";
  room.current = null;
  room.roundNo = -1;
  for (const p of room.players.values()) {
    p.ready = false;
    p.score = 0;
    p.streak = 0;
  }
  pushState(room);
}

// ---------------------------------------------------------------------------
// Nachrichten
// ---------------------------------------------------------------------------

function attach(ws, room, player) {
  browsing.delete(ws);
  cancelIdleClose(room);
  if (player.dropTimer) { clearTimeout(player.dropTimer); player.dropTimer = null; }
  ws._room = room;
  ws._player = player;
  player.ws = ws;
  player.connected = true;
  ensureHost(room);
  send(player, {
    t: "joined",
    you: player.id,
    token: player.token,
    code: room.code,
  });
  send(player, roomState(room));
  if (room.phase === "playing" && room.current) {
    // Mitten in einer Runde eingestiegen: aktuelle Runde nachreichen.
    const cur = room.current;
    send(player, {
      t: "round",
      n: room.roundNo + 1,
      total: room.plan.length,
      startAt: cur.startAt,
      serverNow: Date.now(),
      round: wireRound(cur.round),
    });
  }
}

function makePlayer(name, ready) {
  return {
    id: token(), token: token(), name: cleanName(name),
    ws: null, dropTimer: null, score: 0, streak: 0, bestStreak: 0, best: null,
    hits: 0, wins: 0, ready, connected: true,
  };
}

function handle(ws, msg) {
  const room = ws._room;
  const player = ws._player;

  if (msg.t === "ping") {
    raw(ws, { t: "pong", c: msg.c, s: Date.now() });
    return;
  }

  // Startseite: Raumliste abonnieren.
  if (msg.t === "browse") {
    if (!ws._room) {
      browsing.add(ws);
      raw(ws, { t: "rooms", rooms: roomList() });
    }
    return;
  }

  if (msg.t === "create") {
    if (room) return;
    const r = createRoom(msg.isPublic);
    const p = makePlayer(msg.name, true);
    r.hostId = p.id;
    r.players.set(p.id, p);
    attach(ws, r, p);
    pushState(r);
    pushRoomList();
    return;
  }

  if (msg.t === "join") {
    if (room) return;
    const r = rooms.get(String(msg.code ?? "").toUpperCase().trim());
    if (!r) return raw(ws, { t: "error", msg: "Diesen Raum gibt es nicht" });

    // Wiedereinstieg mit bekanntem Token?
    if (msg.token) {
      const back = [...r.players.values()].find((p) => p.token === msg.token);
      if (back) {
        if (back.ws && back.ws !== ws && back.ws.readyState === WebSocket.OPEN) {
          try { back.ws.close(4001, "woanders geöffnet"); } catch { /* egal */ }
        }
        attach(ws, r, back);
        pushState(r);
        return;
      }
    }

    if (r.players.size >= MAX_PLAYERS) {
      return raw(ws, { t: "error", msg: "Der Raum ist voll (4 Spieler)" });
    }
    if (r.phase !== "lobby") {
      return raw(ws, { t: "error", msg: "Die Runde läuft schon" });
    }
    const p = makePlayer(msg.name, false);
    r.players.set(p.id, p);
    attach(ws, r, p);
    pushState(r);
    return;
  }

  if (!room || !player) return;
  room.lastActivity = Date.now();

  switch (msg.t) {
    case "name":
      player.name = cleanName(msg.name);
      pushState(room);
      break;

    case "ready":
      player.ready = !!msg.value;
      pushState(room);
      break;

    case "settings": {
      if (player.id !== room.hostId || room.phase !== "lobby") break;
      if ([6, 10, 14, 20].includes(msg.rounds)) room.settings.rounds = msg.rounds;
      if (typeof msg.isPublic === "boolean") room.isPublic = msg.isPublic;
      pushState(room);
      pushRoomList();
      break;
    }

    case "start": {
      if (player.id !== room.hostId || room.phase !== "lobby") break;
      const active = [...room.players.values()].filter((p) => p.connected);
      if (!active.every((p) => p.ready || p.id === room.hostId)) break;
      startGame(room);
      pushRoomList();
      break;
    }

    case "press": {
      const cur = room.current;
      if (!cur || cur.scored) break;
      const elapsed = Number(msg.elapsed);
      if (!Number.isFinite(elapsed) || elapsed < 0) break;
      if (elapsed > cur.round.duration + 250) break;
      if (Date.now() > cur.startAt + cur.round.duration + GRACE_MS) break;

      const i = itemIndexAt(cur.round, elapsed);
      if (i < 0) break;

      // Pro Aufgabe genau ein Versuch. Und ist sie schon vergeben, zählt
      // kein Druck mehr – der Client sperrt zwar selbst, aber ein Druck kann
      // unterwegs gewesen sein. Bei Präzisionsaufgaben wird nicht gesperrt:
      // dort dürfen alle dieselbe Markierung versuchen.
      const mine = cur.presses.get(player.id) ?? new Map();
      if (mine.has(i)) break;
      if (!cur.round.precision && cur.itemWinner[i]) break;

      mine.set(i, elapsed);
      cur.presses.set(player.id, mine);
      broadcast(room, { t: "pressed", id: player.id });

      const ev = evaluate(cur.round, i, elapsed);
      if (isGood(ev.outcome) && !cur.round.precision) {
        cur.itemWinner[i] = player.id;
        broadcast(room, {
          t: "lock",
          item: i,
          by: player.id,
          name: player.name,
          reaction: ev.reaction,
        });
      }
      break;
    }

    case "again":
      if (player.id !== room.hostId) break;
      if (room.phase !== "final") break;
      backToLobby(room);
      break;

    case "leave":
      dropPlayer(ws, { immediate: true });
      break;
  }
}

/**
 * Verbindung weg oder Knopf gedrückt. Der Unterschied ist wichtig: „Raum
 * verlassen" ist eine Entscheidung und wirkt sofort, ein Verbindungsabbruch
 * bekommt eine Karenzzeit – auch in der Lobby, denn wer den Raumlink
 * verschickt, ist dabei zwangsläufig kurz aus dem Tab raus.
 */
function dropPlayer(ws, { immediate = false } = {}) {
  const room = ws._room;
  const player = ws._player;
  browsing.delete(ws);
  if (!room || !player) return;
  ws._room = null;
  ws._player = null;

  player.connected = false;
  player.ws = null;
  player.ready = false;

  // In der Lobby wird der Platz sofort frei – dort hängt nichts daran, und ein
  // Sitz mit niemandem drauf verwirrt die anderen nur. Der Raum bleibt trotzdem
  // offen, wer zurückkommt, tritt einfach wieder ein.
  if (immediate || room.phase === "lobby") {
    releaseSeat(room, player.id);
    return;
  }

  // Während einer Partie hängen Punkte am Platz, also bleibt er reserviert.
  if (player.dropTimer) clearTimeout(player.dropTimer);
  // Nicht über later(): die Rundentimer werden bei jedem Übergang geleert,
  // dieser hier darf das nicht mitmachen.
  player.dropTimer = setTimeout(() => releaseSeat(room, player.id), SEAT_GRACE_MS);

  ensureHost(room);
  pushState(room);
  pushRoomList();
}

/** Platz endgültig freigeben – nach Ablauf der Karenzzeit oder auf Knopfdruck. */
function releaseSeat(room, id) {
  const player = room.players.get(id);
  if (!player) return;
  if (player.dropTimer) { clearTimeout(player.dropTimer); player.dropTimer = null; }
  room.players.delete(id);
  ensureHost(room);

  if (room.players.size === 0) {
    // Niemand mehr da: der Raum bleibt eine Weile offen, fängt aber von vorn
    // an. In der Raumliste steht er nicht – nur Code und Link führen hin.
    backToLobby(room);
    scheduleIdleClose(room);
    pushRoomList();
    return;
  }
  pushState(room);
  pushRoomList();
}

// ---------------------------------------------------------------------------
// HTTP + WebSocket
// ---------------------------------------------------------------------------

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

async function serveStatic(pathname) {
  let rel = decodeURIComponent(pathname).replace(/^\/+/, "");
  if (rel === "" || rel.endsWith("/")) rel += "index.html";
  // Kein Ausbruch aus public/.
  if (rel.split("/").some((seg) => seg === "..")) {
    return new Response("Nope", { status: 400 });
  }
  const url = new URL(rel, PUBLIC);
  if (!url.href.startsWith(PUBLIC.href)) {
    return new Response("Nope", { status: 400 });
  }
  try {
    const body = await Deno.readFile(url);
    const ext = rel.slice(rel.lastIndexOf("."));
    return new Response(body, {
      headers: {
        "content-type": MIME[ext] ?? "application/octet-stream",
        "cache-control": "no-cache",
      },
    });
  } catch {
    return new Response("Nicht gefunden", { status: 404 });
  }
}

Deno.serve({ port: PORT, hostname: HOST }, (req) => {
  const url = new URL(req.url);

  if (url.pathname === "/ws" || url.pathname.endsWith("/ws")) {
    if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket erwartet", { status: 400 });
    }
    const { socket, response } = Deno.upgradeWebSocket(req);
    socket.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg && typeof msg.t === "string") {
        try {
          handle(socket, msg);
        } catch (err) {
          console.error("Fehler beim Verarbeiten:", err);
        }
      }
    };
    socket.onclose = () => dropPlayer(socket);
    socket.onerror = () => dropPlayer(socket);
    return response;
  }

  return serveStatic(url.pathname);
});

// Verwaiste Räume aufräumen.
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    const anyone = [...room.players.values()].some((p) => p.connected);
    if (!anyone && now - room.lastActivity > 10 * 60_000) destroyRoom(room);
  }
}, 60_000);

console.log(`LUCKY REFLEX läuft auf http://${HOST}:${PORT}/`);
