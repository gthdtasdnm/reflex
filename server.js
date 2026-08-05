// REFLEX ROYALE – Deno-Server: statische Dateien + WebSocket + Spiellogik.
// Keine Abhängigkeiten, kein Build-Schritt. `deno task dev` oder direkt:
//   deno run --allow-net --allow-read --allow-env --allow-sys server.js

import { buildRoundPlan, itemAt, makeRound } from "./rounds.js";

const PORT = Number(Deno.env.get("PORT") ?? 8000);
const HOST = Deno.env.get("HOST") ?? "0.0.0.0";

const PUBLIC = new URL("./public/", import.meta.url);

// ---------------------------------------------------------------------------
// Spielkonstanten
// ---------------------------------------------------------------------------

const MAX_PLAYERS = 4;
const PRELUDE_MS = 4000;   // Frage lesen, dann 3-2-1
const GRACE_MS = 900;      // Puffer für Netzlaufzeit nach Rundenende
const RESULT_MS = 2400;    // kurze Rückmeldung, kein Zwischenstand
const MIN_HUMAN_MS = 80;   // darunter war es geraten, nicht reagiert

// Punkte. Es gibt bewusst keine negativen Werte: ein Fehler kostet die Runde
// und die Serie, mehr nicht. Wer patzt, verliert dadurch schon gegen die
// anderen – zusätzlicher Abzug würde nur dazu führen, dass am Ende alle im
// Minus stehen und niemand die Runde gewonnen hat.
const P_MIN = 150;         // Sockel für eine richtige Reaktion
const P_SPAN = 850;        // was über Geschwindigkeit dazukommt
const P_HELD = 550;        // Falle erkannt und stillgehalten
const P_PERFECT = 250;     // Timing auf den Punkt
const P_FLASH = 250;       // unter 250 ms reagiert
const FLASH_MS = 250;
const P_WIN = 300;         // Rundensieg
const P_CLOSEST = 150;     // niemand richtig – der beste Fehlversuch

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
    lastActivity: Date.now(),
  };
  rooms.set(room.code, room);
  return room;
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
  rooms.delete(room.code);
  pushRoomList();
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

// Was der Client von einer Runde zu sehen bekommt. `items` bzw. `triggerAt`
// müssen mit, sonst kann er weder zeichnen noch sofort zurückmelden, ob der
// Druck saß.
function wireRound(round) {
  return {
    type: round.type,
    kind: round.kind,
    bar: round.bar,
    prompt: round.prompt,
    hint: round.hint,
    duration: round.duration,
    stepInterval: round.stepInterval ?? null,
    tolerance: round.tolerance ?? null,
    triggerAt: round.triggerAt ?? null,
    items: round.items ?? null,
    payload: round.payload,
  };
}

function nextRound(room) {
  room.roundNo++;
  if (room.roundNo >= room.plan.length) return finishGame(room);

  const round = makeRound(room.plan[room.roundNo]);
  const startAt = Date.now() + PRELUDE_MS;
  room.current = { round, startAt, presses: new Map(), scored: false };

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

function maybeEndEarly(room) {
  const cur = room.current;
  if (!cur || cur.scored) return;
  const active = [...room.players.values()].filter((p) => p.connected);
  if (!active.length) return;
  if (active.every((p) => cur.presses.has(p.id))) {
    later(room, 350, () => scoreRound(room));
  }
}

function clamp(x, lo, hi) {
  return Math.min(Math.max(x, lo), hi);
}

// Was hat dieser Druck ausgelöst? Eine Stelle für alle drei Rundenarten,
// damit „die Runde ist entschieden" und die spätere Wertung nicht
// auseinanderlaufen können.
//
// `nearness`: nur wichtig, wenn niemand richtig lag – dann gewinnt die Runde,
// wer am wenigsten danebengriff. Später gedrückt heißt näher dran.
function evaluate(round, elapsed) {
  if (round.kind === "series") {
    const item = itemAt(round, elapsed);
    if (!item) return { outcome: "wrong", reaction: null, nearness: elapsed };
    const reaction = elapsed - item.t;
    if (!item.hit) return { outcome: "wrong", reaction: null, nearness: elapsed };
    // Unter 80 ms nach dem Wechsel kann niemand gelesen haben, was da steht –
    // das war Dauerdrücken, das zufällig auf einen Treffer fiel.
    if (reaction < MIN_HUMAN_MS) {
      return { outcome: "early", reaction: null, nearness: elapsed };
    }
    return { outcome: "hit", reaction, nearness: elapsed };
  }

  if (round.kind === "precision") {
    const err = Math.abs(elapsed - round.triggerAt);
    const reaction = elapsed - round.triggerAt;
    if (err <= round.tolerance) {
      return {
        outcome: err <= 70 ? "perfect" : "hit",
        reaction,
        nearness: -err,
        err,
      };
    }
    return { outcome: "off", reaction, nearness: -err };
  }

  // watch
  if (round.triggerAt === null) {
    return { outcome: "wrong", reaction: null, nearness: elapsed };
  }
  if (elapsed < round.triggerAt + MIN_HUMAN_MS) {
    return { outcome: "early", reaction: null, nearness: elapsed };
  }
  return {
    outcome: "hit",
    reaction: elapsed - round.triggerAt,
    nearness: elapsed,
  };
}

const isGood = (o) => o === "hit" || o === "perfect" || o === "held";

function scoreRound(room) {
  const cur = room.current;
  if (!cur || cur.scored) return;
  cur.scored = true;
  clearTimers(room);

  const { round } = cur;
  const scale = round.scale ?? 1200;
  const players = [...room.players.values()];

  // Schritt 1: rohes Ergebnis pro Spieler. Fehler geben schlicht null Punkte.
  const raws = new Map();
  for (const p of players) {
    const press = cur.presses.get(p.id);

    if (!press) {
      // Nicht gedrückt. Bei einer Warterunde ohne Auslöser war genau das
      // richtig; sonst hat man die Gelegenheit verpasst.
      const held = round.kind === "watch" && round.triggerAt === null;
      raws.set(p.id, {
        outcome: held ? "held" : "miss",
        reaction: null,
        base: held ? P_HELD : 0,
        nearness: -Infinity,
        at: Infinity,
      });
      continue;
    }

    const ev = evaluate(round, press.elapsed);
    let base = 0;
    if (ev.outcome === "hit" || ev.outcome === "perfect") {
      base = round.kind === "precision"
        ? P_MIN + Math.round(P_SPAN * (1 - ev.err / round.tolerance))
        : P_MIN + Math.round(P_SPAN * clamp(1 - ev.reaction / scale, 0, 1));
      if (ev.outcome === "perfect") base += P_PERFECT;
    }
    raws.set(p.id, { ...ev, base, at: press.elapsed });
  }

  // Schritt 2: die Runde hat immer einen Sieger. Gibt es Richtige, gewinnt
  // wer zuerst richtig gedrückt hat (bei einer erkannten Falle alle
  // gemeinsam, dort gibt es keine Zeit zu vergleichen). Lag niemand richtig,
  // gewinnt der knappste Fehlversuch – sonst könnten alle zugleich verlieren.
  const goodOnes = players.filter((p) => isGood(raws.get(p.id).outcome));
  let winners = [];
  let winBonus = 0;

  if (goodOnes.length) {
    winBonus = P_WIN;
    const timed = goodOnes.filter((p) => raws.get(p.id).at !== Infinity);
    if (timed.length) {
      // Absolute Zeit, nicht Reaktionszeit: wer eine Aufgabe früher erkennt,
      // war besser als jemand, der bei der nächsten schneller zuckt.
      const best = Math.min(...timed.map((p) => raws.get(p.id).at));
      winners = timed.filter((p) => raws.get(p.id).at === best);
    } else {
      winners = goodOnes; // alle haben die Falle erkannt
    }
  } else if (players.length) {
    winBonus = P_CLOSEST;
    const best = Math.max(...players.map((p) => raws.get(p.id).nearness));
    if (best > -Infinity) {
      winners = players.filter((p) => raws.get(p.id).nearness === best);
    }
  }
  const winnerIds = new Set(winners.map((p) => p.id));

  // Schritt 3: Punkte verteilen.
  const results = [];
  for (const p of players) {
    const r = raws.get(p.id);
    const streakIn = p.streak;
    const mult = MULTS[Math.min(streakIn, MULTS.length - 1)];
    const notes = [];

    let flash = 0;
    if (r.outcome === "hit" && r.reaction !== null && r.reaction < FLASH_MS) {
      flash = P_FLASH;
      notes.push("BLITZ");
    }
    if (r.outcome === "perfect") notes.push("PERFEKT");

    // Die Serie multipliziert die Leistung, nicht den Rundensieg – sonst
    // reißt der Vorsprung dessen, der einmal vorn liegt, nicht mehr ab.
    const earned = Math.round((r.base + flash) * mult);

    let bonus = 0;
    if (winnerIds.has(p.id)) {
      bonus = winBonus;
      notes.push(goodOnes.length ? "RUNDENSIEG" : "am nächsten dran");
      p.wins++;
    }

    const delta = earned + bonus;
    p.score += delta;

    if (isGood(r.outcome)) {
      p.streak = streakIn + 1;
      p.bestStreak = Math.max(p.bestStreak, p.streak);
      p.hits++;
      if (r.reaction !== null && (p.best === null || r.reaction < p.best)) {
        p.best = r.reaction;
      }
    } else {
      p.streak = 0;
    }

    results.push({
      id: p.id,
      name: p.name,
      outcome: r.outcome,
      reaction: r.reaction,
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
    anyCorrect: goodOnes.length > 0,
    results,
  });

  later(room, RESULT_MS, () => nextRound(room));
}

function describeTruth(round) {
  if (round.kind === "precision") return "Die Markierung war der richtige Moment";
  if (round.kind === "series") {
    const total = round.items.filter((i) => i.hit).length;
    return `${total} von ${round.items.length} Aufgaben passten`;
  }
  return round.triggerAt === null
    ? "Es ist nie passiert – nicht drücken war richtig"
    : "Ab dem Moment war Drücken richtig";
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
  ws._room = room;
  ws._player = player;
  player.ws = ws;
  player.connected = true;
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
    ws: null, score: 0, streak: 0, bestStreak: 0, best: null,
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
      if (cur.presses.has(player.id)) break;
      const elapsed = Number(msg.elapsed);
      if (!Number.isFinite(elapsed) || elapsed < 0) break;
      // Zu spät eingetrudelt zählt nicht mehr.
      if (elapsed > cur.round.duration + 250) break;
      if (Date.now() > cur.startAt + cur.round.duration + GRACE_MS) break;
      cur.presses.set(player.id, { elapsed });
      broadcast(room, { t: "pressed", id: player.id });

      // Sobald jemand richtig gedrückt hat, ist die Runde entschieden. Vorher
      // läuft sie weiter – bei einer Serie kommt die nächste Gelegenheit,
      // wenn alle die letzte haben durchgehen lassen.
      if (!cur.closing && isGood(evaluate(cur.round, elapsed).outcome)) {
        cur.closing = true;
        // Kurzer Nachlauf, damit ein fast gleichzeitiger Druck des anderen
        // noch ankommt und mitgewertet wird.
        later(room, 400, () => scoreRound(room));
        break;
      }
      maybeEndEarly(room);
      break;
    }

    case "again":
      if (player.id !== room.hostId) break;
      if (room.phase !== "final") break;
      backToLobby(room);
      break;

    case "leave":
      dropPlayer(ws);
      break;
  }
}

function dropPlayer(ws) {
  const room = ws._room;
  const player = ws._player;
  browsing.delete(ws);
  if (!room || !player) return;
  ws._room = null;
  ws._player = null;

  if (room.phase === "lobby") {
    room.players.delete(player.id);
  } else {
    player.connected = false;
    player.ws = null;
  }

  if (room.hostId === player.id) {
    const next = [...room.players.values()].find((p) => p.connected) ??
      [...room.players.values()][0];
    room.hostId = next ? next.id : null;
  }

  if (room.players.size === 0 || ![...room.players.values()].some((p) => p.connected)) {
    later(room, 90_000, () => {
      if (![...room.players.values()].some((p) => p.connected)) destroyRoom(room);
    });
  }
  pushState(room);
  pushRoomList();
  if (room.phase === "playing") maybeEndEarly(room);
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

console.log(`REFLEX ROYALE läuft auf http://${HOST}:${PORT}/`);
