// Client: Verbindung, Lobby, Rundenschleife, Rückmeldung.

import { createRenderer } from "./render.js";
import { isEnabled, setEnabled, sfx, unlock } from "./audio.js";

import { starteSprache, t, uebersetze } from "./sprache.js";
import { WOERTER } from "./texte.js";

// Vor allem, was zeichnet: der Warteraum soll gleich in der richtigen
// Sprache dastehen. Deutsch steht im HTML und in den Aufrufen hier.
starteSprache(WOERTER);

const $ = (id) => document.getElementById(id);

// Sitzplatz-Tierchen. Gleiche Liste und gleiche Ableitung in allen vier
// Spielen, damit dieselbe Person überall dasselbe Zeichen bekommt.
const AVATARS = ["🦊", "🐙", "🦅", "🐺", "🦁", "🐉"];
const avatarFor = (id) =>
  AVATARS[[...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATARS.length];

const state = {
  you: null,
  code: null,
  room: null,
  cur: null,        // laufende Runde
  offset: 0,        // Serverzeit − lokale Zeit
  bestRtt: Infinity,
  pendingIntent: null,
  visibility: "public",
};

// ---------------------------------------------------------------------------
// Verbindung
// ---------------------------------------------------------------------------

let sock = null;
let retryIn = 500;

// Die eigene Kennung. Gleiche Regel wie in `gemeinsam/schale.js`, hier von
// Hand – dieser Client hat die Schale nicht.
//
// Bis zum 17.08.2026 lag sie im `sessionStorage` und starb mit dem Tab. Auf
// dem Handy schließt Safari Tabs von sich aus; wer zurückkam, war für den
// Server ein neuer Spieler, während sein alter Platz mit dem Hostzeichen
// stehenblieb – und niemand mehr starten konnte. Das war Bugreport 4.
//
// Jetzt `localStorage` plus Herzschlag: der Tab, dem die Kennung gehört,
// frischt sie alle vier Sekunden auf und schreibt seine Tabkennung dazu.
//
//   gleiche Tabkennung        → das sind wir selbst (Neuladen)
//   fremd, Herzschlag frisch  → ein anderer Tab spielt gerade, Finger weg
//   fremd, Herzschlag alt     → niemand da, Kennung übernehmen
//
// Ohne den mittleren Fall zögen sich zwei Tabs abwechselnd den Platz weg.
// Nach zwei Stunden verfällt der Eintrag: dann gibt es den Raum längst nicht
// mehr, und niemand will morgen früh in die Runde von gestern geworfen werden.
const SITZ_KEY = "luckyreflex";
const HERZ_MS = 4000;
const HERZ_TOT = 12_000;
const SITZ_VERFALL = 2 * 60 * 60 * 1000;
const TAB = (() => {
  try {
    const t = sessionStorage.getItem("spiele_tab") ??
      (crypto.randomUUID?.() ?? String(Date.now()) + String(Math.random()).slice(2));
    sessionStorage.setItem("spiele_tab", t);
    return t;
  } catch {
    return "tab";
  }
})();
let herzUhr = null;

function session() {
  try {
    const s = JSON.parse(localStorage.getItem(SITZ_KEY) ?? "null");
    if (!s || !s.code || !s.token) return null;
    const alt = Date.now() - (s.herz ?? 0);
    if (alt > SITZ_VERFALL) { localStorage.removeItem(SITZ_KEY); return null; }
    if (s.tab !== TAB && alt < HERZ_TOT) return null;
    return s;
  } catch {
    return null;
  }
}

/** Token für genau diesen Raum – sonst nichts, damit kein fremder mitfährt. */
const tokenFuer = (code) => (session()?.code === code ? session().token : undefined);

function saveSession(data) {
  try {
    clearInterval(herzUhr);
    herzUhr = null;
    if (!data) { localStorage.removeItem(SITZ_KEY); return; }
    const schreibe = () => localStorage.setItem(
      SITZ_KEY,
      JSON.stringify({ ...data, tab: TAB, herz: Date.now() }),
    );
    schreibe();
    herzUhr = setInterval(schreibe, HERZ_MS);
  } catch { /* Privatmodus – dann eben ohne Wiedereinstieg */ }
}

function send(msg) {
  if (sock && sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify(msg));
}

function connect() {
  // Muss aus dem Basispfad kommen: das Spiel läuft in Produktion unter
  // /<projekt>/, ein festes "/ws" landet auf der Domainwurzel.
  const url = new URL("ws", document.baseURI);
  url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
  sock = new WebSocket(url);

  sock.onopen = () => {
    retryIn = 500;
    setStatus("");
    const s = session();
    if (state.pendingIntent) {
      send(state.pendingIntent);
      state.pendingIntent = null;
    } else if (s && s.code && s.token) {
      send({ t: "join", code: s.code, token: s.token, name: s.name });
    } else {
      send({ t: "browse" });
    }
    syncClock();
  };

  sock.onmessage = (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    onMessage(msg);
  };

  sock.onclose = () => {
    setStatus(t("c.weg", {}, "Verbindung weg – neuer Versuch …"));
    setTimeout(connect, retryIn);
    retryIn = Math.min(retryIn * 1.8, 8000);
  };
}

// Uhrenabgleich. Die Genauigkeit ist unkritisch: Reaktionszeiten werden
// lokal zwischen Auslöser und Druck gemessen, ein Versatz verschiebt beides
// gleichzeitig. Der Abgleich sorgt nur dafür, dass alle etwa gleichzeitig
// starten.
function syncClock() {
  send({ t: "ping", c: Date.now() });
  setTimeout(syncClock, 4000);
  state.bestRtt *= 1.08; // langsam vergessen, sonst klebt ein Ausreißer ewig
}

function onPong(msg) {
  const rtt = Date.now() - msg.c;
  if (rtt <= state.bestRtt) {
    state.bestRtt = rtt;
    state.offset = msg.s - (msg.c + rtt / 2);
  }
}

// ---------------------------------------------------------------------------
// Bildschirme
// ---------------------------------------------------------------------------

function show(name) {
  for (const s of document.querySelectorAll(".screen")) {
    s.classList.toggle("active", s.id === `screen-${name}`);
  }
  if (name === "home") send({ t: "browse" });
}

function setStatus(text) {
  $("status").textContent = text;
  $("status").classList.toggle("show", !!text);
}

function toast(text) {
  const t = $("toast");
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(toast._id);
  toast._id = setTimeout(() => t.classList.remove("show"), 2600);
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

// ---------------------------------------------------------------------------
// Nachrichten vom Server
// ---------------------------------------------------------------------------

function onMessage(msg) {
  switch (msg.t) {
    case "pong":
      onPong(msg);
      break;

    case "rooms":
      renderRooms(msg.rooms);
      break;

    case "joined":
      state.you = msg.you;
      state.code = msg.code;
      saveSession({ code: msg.code, token: msg.token, name: $("name").value.trim() });
      location.hash = msg.code;
      break;

    case "room":
      state.room = msg;
      renderRoom();
      break;

    case "round":
      startRound(msg);
      break;

    case "pressed":
      markPressed(msg.id);
      break;

    case "lock":
      onLock(msg);
      break;

    case "result":
      showResult(msg);
      break;

    case "final":
      showFinal(msg);
      break;

    case "error":
      toast(msg.msg);
      show("home");
      break;
  }
}

// ---------------------------------------------------------------------------
// Offene Räume
// ---------------------------------------------------------------------------

function renderRooms(list) {
  const box = $("roomList");
  $("roomsCount").textContent = list.length ? `(${list.length})` : "";
  if (!list.length) {
    box.innerHTML = `<p class="rooms-empty">${
      t("c.keinRaum", {}, "Gerade ist kein Raum offen. Eröffne einen – er erscheint dann bei den anderen in der Liste.")
    }</p>`;
    return;
  }
  box.innerHTML = list.map((r) => `
    <button class="roomrow" data-code="${escapeHtml(r.code)}">
      <span class="roomrow-name">${escapeHtml(r.host)}</span>
      <span class="roomrow-meta">${r.rounds} Runden</span>
      <span class="roomrow-count">${r.count}/${r.max}</span>
    </button>`).join("");

  for (const b of box.querySelectorAll(".roomrow")) {
    b.addEventListener("click", () => joinCode(b.dataset.code));
  }
}

// Gemeinsam mit den anderen drei Spielen: wer bei einem seinen Namen eintippt,
// findet ihn beim nächsten schon vor.
const NAME_KEY = "spiele_name";

function joinCode(code) {
  unlock();
  localStorage.setItem(NAME_KEY, $("name").value.trim());
  state.pendingIntent = { t: "join", code, token: tokenFuer(code), name: $("name").value.trim() };
  if (sock?.readyState === WebSocket.OPEN) {
    send(state.pendingIntent);
    state.pendingIntent = null;
  }
}

// ---------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------

function renderRoom() {
  const r = state.room;
  if (!r) return;

  if (r.phase === "lobby") {
    show("lobby");
    $("roomCode").textContent = r.code;
    $("lobbyCount").textContent = `${r.players.filter((p) => p.connected).length}/4`;
    $("roomVis").textContent = r.isPublic
      ? t("c.oeffentlich", {}, "Öffentlich – steht in der Liste")
      : t("c.privat", {}, "Privat – nur mit Code");

    const list = $("playerList");
    list.textContent = "";
    for (let i = 0; i < 4; i++) {
      const p = r.players[i];
      const card = document.createElement("div");
      card.className = "seat" + (p ? "" : " empty") +
        (p?.ready ? " ready" : "") + (p && !p.connected ? " off" : "");
      if (!p) {
        card.innerHTML =
          `<div class="av">🪑</div><div class="nm">${t("c.frei", {}, "frei")}</div>` +
        `<div class="st">${t("c.wartet", {}, "wartet")}</div>`;
      } else {
        card.innerHTML = `
          <div class="av">${avatarFor(p.id)}</div>
          <div class="nm">${escapeHtml(p.name)}${p.id === state.you ? t("c.du", {}, " (du)") : ""}</div>
          <div class="st">${
          !p.connected
            ? t("lr.weg", {}, "weg")
            : p.host
            ? t("lr.startet", {}, "startet")
            : p.ready
            ? t("lr.bereit", {}, "✓ bereit")
            : t("c.wartet", {}, "wartet")
        }</div>
          ${p.host ? `<div class="host">${t("c.host", {}, "HOST")}</div>` : ""}`;
      }
      list.append(card);
    }

    const isHost = r.hostId === state.you;
    const me = r.players.find((p) => p.id === state.you);
    $("hostControls").hidden = !isHost;
    $("guestControls").hidden = isHost;

    for (const b of document.querySelectorAll("[data-rounds]")) {
      b.classList.toggle("sel", Number(b.dataset.rounds) === r.settings.rounds);
    }
    for (const b of document.querySelectorAll("[data-lobbyvis]")) {
      b.classList.toggle("sel", (b.dataset.lobbyvis === "public") === r.isPublic);
    }

    // Wer gerade weg ist, zählt nicht mit – sonst blockiert er den Start.
    const here = r.players.filter((p) => p.connected);
    const others = here.filter((p) => p.id !== r.hostId);
    const allReady = others.every((p) => p.ready);
    $("startBtn").disabled = !allReady;
    $("startHint").textContent = here.length < 2
      ? t("lr.allein", {}, "Allein spielbar zum Ausprobieren – zu zweit macht es mehr her.")
      : allReady
      ? t("c.alleBereit", {}, "Alle bereit!")
      : t("lr.warten", {}, "Warten auf die anderen …");

    $("readyBtn").textContent = me?.ready
      ? t("lr.dochNicht", {}, "Doch nicht bereit")
      : t("schale.bereitKnopf", {}, "Bereit!");
    $("readyBtn").classList.toggle("on", !!me?.ready);
  } else if (r.phase === "playing") {
    show("game");
    renderScorebar();
  }
}

// ---------------------------------------------------------------------------
// Punkteleiste und Serie
// ---------------------------------------------------------------------------

function renderScorebar() {
  const r = state.room;
  if (!r) return;
  const bar = $("scorebar");
  const sorted = r.players.slice().sort((a, b) => b.score - a.score);
  bar.textContent = "";
  for (const p of sorted) {
    const chip = document.createElement("div");
    chip.className = "chip" + (p.id === state.you ? " me" : "") +
      (p.connected ? "" : " gone");
    chip.dataset.pid = p.id;
    const flame = p.streak >= 2 ? `<span class="chip-streak">🔥${p.streak}</span>` : "";
    chip.innerHTML = `
      <div class="chip-name">${escapeHtml(p.name)}${flame}</div>
      <div class="chip-score">${p.score.toLocaleString("de-DE")}</div>`;
    bar.append(chip);
  }
  renderCombo();
}

// Der Serienzähler oben ist die Belohnung, die sich über mehrere Runden
// aufbaut – und die man verlieren kann. Deshalb prominent.
function renderCombo() {
  const me = state.room?.players.find((p) => p.id === state.you);
  const streak = me?.streak ?? 0;
  const el = $("combo");
  if (streak < 2) {
    el.className = "tb-combo";
    el.textContent = "";
    return;
  }
  const mult = [1, 1, 1.25, 1.5, 2, 2.5, 3][Math.min(streak, 6)];
  el.className = "tb-combo show" + (streak >= 4 ? " hot" : "");
  el.innerHTML = `<span class="combo-x">×${mult}</span>
    <span class="combo-n">🔥 ${streak}er-Serie</span>`;
}

function markPressed(id) {
  const chip = document.querySelector(`.chip[data-pid="${CSS.escape(id)}"]`);
  if (!chip) return;
  chip.classList.remove("hit");
  void chip.offsetWidth;
  chip.classList.add("hit");
  if (id !== state.you) sfx.tick();
}

// ---------------------------------------------------------------------------
// Runde
// ---------------------------------------------------------------------------

let raf = 0;

// Ablauf des Vorlaufs, gemessen in ms *vor* dem Rundenstart.
const TICKS = [-1500, -1000, -500];

function startRound(msg) {
  cancelAnimationFrame(raf);
  show("game");

  const localStart = msg.startAt - state.offset;
  const startPerf = performance.now() + (localStart - Date.now());

  state.cur = {
    round: msg.round,
    startPerf,
    // Aufgaben, für die ich schon dran war oder die jemand anders geholt hat.
    done: new Set(),
    shownItem: -1,
    fbItem: -1,
    phase: "prelude",
    lastTick: 0,
  };

  $("roundNo").textContent = msg.n;
  $("roundTotal").textContent = msg.total;
  clearPressState();

  // Ausblenden statt entfernen: sonst wächst die Bühne zwischen den Runden
  // um die Balkenhöhe und alles springt.
  $("timerbar").classList.toggle("off", msg.round.bar === "none");
  $("timerFill").style.width = "100%";
  $("timerFill").classList.remove("low");

  const ov = $("overlay");
  ov.className = "overlay show prelude";
  ov.innerHTML = `
    <div class="prompt">${escapeHtml(msg.round.prompt)}</div>
    <div class="hint">${escapeHtml(msg.round.hint)}</div>
    <div class="countdown" id="countdown"></div>`;

  state.cur.renderer = null;
  raf = requestAnimationFrame(loop);
}

function loop() {
  const cur = state.cur;
  if (!cur) return;
  const t = performance.now() - cur.startPerf;

  if (cur.phase === "prelude") {
    const idx = TICKS.filter((x) => t >= x).length;
    if (idx > cur.lastTick) {
      cur.lastTick = idx;
      $("countdown").textContent = String(4 - idx);
      $("countdown").classList.remove("beat");
      void $("countdown").offsetWidth;
      $("countdown").classList.add("beat");
      sfx.tick();
    }
    if (t >= 0) {
      cur.phase = "live";
      $("overlay").className = "overlay";
      $("stage").classList.add("live");
      cur.renderer = createRenderer(cur.round, $("stageContent"));
      sfx.go();
    }
  }

  if (cur.phase === "live") {
    if (cur.renderer) cur.renderer.frame(t);
    updateBar(t);
    // Beim Sprung zur nächsten Aufgabe ist die Sicht wieder frei und alle
    // dürfen wieder drücken.
    const i = itemIndex(t);
    if (i >= 0 && i !== cur.shownItem) {
      cur.shownItem = i;
      // Nur aufräumen, wenn die Rückmeldung noch zur vorigen Aufgabe gehört.
      // Ein Druck kann zwischen zwei Bildern gefallen sein, also schon zur
      // neuen – die dürfte man sonst gar nicht zu sehen bekommen.
      if (cur.fbItem !== i) {
        $("feedback").classList.remove("show");
        $("pressTag").className = "press-tag";
        $("stage").classList.remove("pressed");
      }
    }
  }

  raf = requestAnimationFrame(loop);
}

// Der Balken zeigt immer genau die Frist, um die es gerade geht: bei einer
// Wissensrunde die ganze Runde, bei einer Schrittrunde das Fenster für das
// gerade gezeigte Element. Wo es keine Frist gibt, ist er ausgeblendet.
function updateBar(t) {
  const r = state.cur.round;
  if (r.bar === "none") return;

  let left;
  if (r.bar === "step" && r.stepInterval) {
    const into = t % r.stepInterval;
    left = 1 - into / r.stepInterval;
  } else {
    left = Math.max(0, 1 - t / r.duration);
  }
  $("timerFill").style.width = `${Math.max(0, left) * 100}%`;
  $("timerFill").classList.toggle("low", left < 0.3);
}

// ---------------------------------------------------------------------------
// Drücken
// ---------------------------------------------------------------------------

// Welche der fünf Aufgaben läuft gerade? Muss mit `itemIndexAt` im Server
// übereinstimmen, sonst widerspricht die sofortige Rückmeldung der Wertung.
function itemIndex(t) {
  const r = state.cur.round;
  const i = Math.floor(t / r.stepInterval);
  return i >= 0 && i < r.items.length ? i : -1;
}

function press() {
  unlock();
  const cur = state.cur;
  if (!cur) return;

  // Im Vorlauf und während der Rückmeldung passiert nichts. Ein Druck im
  // Vorlauf gilt bewusst nicht als Fehlstart: wer nach der letzten Runde noch
  // einmal aufs Display tippt, soll die nächste nicht schon verloren haben.
  if (cur.phase !== "live") {
    if (cur.phase === "prelude") nudge(t("lr.nochNicht", {}, "Noch nicht …"));
    return;
  }

  const elapsed = Math.max(0, Math.round(performance.now() - cur.startPerf));
  const i = itemIndex(elapsed);
  if (i < 0) return;
  // Pro Aufgabe ein Versuch – und nichts mehr, wenn sie schon vergeben ist.
  if (cur.done.has(i)) return;

  cur.done.add(i);
  cur.fbItem = i;
  send({ t: "press", elapsed });
  showFeedback(localVerdict(i, elapsed), i, elapsed);
}

function nudge(text) {
  const node = $("countdown");
  if (!node) return;
  node.dataset.nudge = text;
  node.classList.remove("nudge");
  void node.offsetWidth;
  node.classList.add("nudge");
}

// Muss zur Wertung im Server passen (dort `evaluate`), sonst widerspricht
// die sofortige Rückmeldung dem Ergebnis.
function localVerdict(i, t) {
  const r = state.cur.round;
  const item = r.items[i];
  const rel = t - item.t;
  if (r.precision) {
    const err = Math.abs(rel - item.at);
    if (err <= r.tolerance) return err <= 70 ? "perfect" : "hit";
    return "off";
  }
  if (!item.hit) return "wrong";
  return rel < item.at + 80 ? "early" : "hit";
}

const FEEDBACK = {
  // Der Text wird beim Anzeigen uebersetzt (lr.urteil.*) - hier steht der
  // deutsche Wortlaut, wie ueberall.
  hit: { text: "TREFFER", sound: "hit" },
  perfect: { text: "PERFEKT!", sound: "perfect" },
  early: { text: "ZU FRÜH", sound: "wrong" },
  wrong: { text: "DANEBEN", sound: "wrong" },
  off: { text: "VERFEHLT", sound: "wrong" },
};

function showFeedback(kind, i, elapsed) {
  const f = FEEDBACK[kind] ?? FEEDBACK.wrong;
  const node = $("feedback");
  node.className = `feedback show fb-${kind}`;
  // Die Marke der vorigen Aufgabe muss weg – sonst steht bei einem Druck
  // direkt am Fensterwechsel noch das alte Ergebnis daneben.
  $("pressTag").className = "press-tag";
  // Die Zeit nur bei einem Treffer zeigen. Bei „zu früh" wäre der Abstand
  // negativ und sagt nichts aus.
  const item = state.cur.round.items[i];
  const showMs = kind === "hit" || kind === "perfect";
  const ms = showMs
    ? `<small>${Math.max(0, Math.round(elapsed - item.t - item.at))} ms</small>`
    : "";
  node.innerHTML = `${t("lr.urteil." + kind, {}, f.text)}${ms}`;
  sfx[f.sound]?.();
  if (kind !== "hit" && kind !== "perfect") {
    $("game").classList.add("shake");
    setTimeout(() => $("game").classList.remove("shake"), 400);
  }
  fadeFeedback(kind === "hit" || kind === "perfect" ? "getroffen" : "daneben");
}

// Rückmeldung kurz zeigen, dann die Sicht wieder freigeben – die Runde läuft
// mit der nächsten Aufgabe weiter und die will man sehen.
function fadeFeedback(tagText) {
  const stage = $("stage");
  stage.classList.add("pressed");
  clearTimeout(fadeFeedback.id);
  fadeFeedback.id = setTimeout(() => {
    $("feedback").classList.remove("show");
    stage.classList.remove("pressed");
    const tag = $("pressTag");
    tag.textContent = tagText;
    tag.className = `press-tag show ${
      tagText === "getroffen" ? "good" : "bad"
    }`;
  }, 700);
}

// Jemand hat *diese* Aufgabe geholt. Ab hier nimmt der Client für sie keinen
// Druck mehr an und zeigt, wer schneller war. Die nächste Aufgabe ist wieder
// für alle offen.
function onLock(msg) {
  const cur = state.cur;
  if (!cur) return;
  cur.done.add(msg.item);
  if (msg.by === state.you) return; // der Gewinner sieht seine eigene Meldung
  cur.fbItem = msg.item;

  clearTimeout(fadeFeedback.id);
  const node = $("feedback");
  node.className = "feedback show fb-locked";
  $("pressTag").className = "press-tag";
  const ms = msg.reaction === null || msg.reaction === undefined
    ? ""
    : `<small>${Math.max(0, Math.round(msg.reaction))} ms</small>`;
  node.innerHTML = `${escapeHtml(msg.name)} war schneller${ms}`;
  sfx.miss();
  fadeFeedback("zu spät");
}

function clearPressState() {
  clearTimeout(fadeFeedback.id);
  $("stage").classList.remove("pressed", "spent");
  $("feedback").className = "feedback";
  $("feedback").textContent = "";
  $("pressTag").className = "press-tag";
  $("pressTag").textContent = "";
}

// ---------------------------------------------------------------------------
// Rückmeldung nach der Runde – bewusst keine Punktetabelle. Der Punktestand
// steht durchgehend unten in der Leiste; ein Zwischenstand nach jeder Runde
// bremst nur und bringt nichts Neues.
// ---------------------------------------------------------------------------

function showResult(msg) {
  const cur = state.cur;
  if (cur) cur.phase = "result";
  cancelAnimationFrame(raf);
  $("stage").classList.remove("live");
  clearPressState();
  $("timerbar").classList.add("off");

  if (state.room) {
    for (const r of msg.results) {
      const p = state.room.players.find((x) => x.id === r.id);
      if (p) {
        p.score = r.score;
        p.streak = r.streak;
      }
    }
    renderScorebar();
  }

  const me = msg.results.find((r) => r.id === state.you);
  const winners = msg.results.filter((r) => r.won);
  const iWon = winners.some((w) => w.id === state.you);
  const others = winners.filter((w) => w.id !== state.you);

  let winLine = "";
  if (iWon && winners.length === 1) winLine = t("lr.gewonnen", {}, "RUNDE GEWONNEN");
  else if (iWon) winLine = t("lr.geteilt", {}, "Runde geteilt");
  else if (others.length) {
    winLine = t(
      "lr.rundeAn",
      { namen: others.map((w) => escapeHtml(w.name)).join(" & ") },
      `Runde an ${others.map((w) => escapeHtml(w.name)).join(" & ")}`,
    );
  }

  const badges = (me?.notes ?? [])
    .filter((n) => n !== "RUNDENSIEG" && n !== "am nächsten dran")
    .map((n) => `<span class="fl-badge">${escapeHtml(n)}</span>`).join("");

  // Wie viele der fünf Aufgaben hat wer geholt? Das ist die eigentliche
  // Bilanz der Runde und ersetzt die frühere Punktetabelle.
  const bilanz = msg.results
    .map((r) =>
      `<span class="fl-tally${r.id === state.you ? " me" : ""}${
        r.won ? " won" : ""
      }"><b>${r.itemsWon}</b>/${r.totalItems} ${escapeHtml(r.name)}</span>`
    ).join("");

  const ov = $("overlay");
  ov.className = "overlay show flash";
  ov.innerHTML = `
    <div class="fl-delta ${me && me.delta > 0 ? "plus" : "zero"}">${
    me ? (me.delta > 0 ? "+" + me.delta.toLocaleString("de-DE") : "0") : ""
  }</div>
    <div class="fl-badges">${badges}${
    me && me.mult > 1
      ? `<span class="fl-badge mult">${t("lr.serie", { n: me.mult }, `Serie ×${me.mult}`)}</span>`
      : ""
  }</div>
    <div class="fl-win ${iWon ? "mine" : ""}">${winLine}</div>
    <div class="fl-tallies">${bilanz}</div>
    <div class="fl-truth">${escapeHtml(msg.truth)}</div>`;

  if (me && me.delta > 0) sfx.coin();
  if (iWon) sfx.perfect();
}

// ---------------------------------------------------------------------------
// Abschluss
// ---------------------------------------------------------------------------

function showFinal(msg) {
  cancelAnimationFrame(raf);
  state.cur = null;
  show("final");
  sfx.fanfare();

  const medals = ["🥇", "🥈", "🥉", "4️⃣"];
  $("podium").innerHTML = msg.table.map((p, i) => {
    const bits = [`${p.wins} Runden gewonnen`];
    if (p.bestStreak >= 2) bits.push(`${p.bestStreak}er-Serie`);
    if (p.best !== null && p.best !== undefined) {
      bits.push(`schnellste ${Math.round(p.best)} ms`);
    }
    return `
    <li class="pod pod-${i}${p.id === state.you ? " me" : ""}">
      <span class="pod-medal">${medals[i] ?? ""}</span>
      <span class="pod-name">${escapeHtml(p.name)}</span>
      <span class="pod-meta">${bits.join(" · ")}</span>
      <span class="pod-score">${p.score.toLocaleString("de-DE")}</span>
    </li>`;
  }).join("");

  const isHost = state.room && state.room.hostId === state.you;
  $("againBtn").hidden = !isHost;
  $("againHint").hidden = isHost;
}

// ---------------------------------------------------------------------------
// Eingaben
// ---------------------------------------------------------------------------

function wireInput() {
  const stage = $("stage");
  stage.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    press();
  });
  // Wischen darf nicht scrollen oder zoomen.
  stage.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });

  globalThis.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.code === "Space" || e.code === "Enter" || e.code === "NumpadEnter") {
      if (document.activeElement?.tagName === "INPUT") return;
      e.preventDefault();
      if ($("screen-game").classList.contains("active")) press();
    }
  });
}

function wireUi() {
  const nameInput = $("name");
  nameInput.value = session()?.name ?? localStorage.getItem(NAME_KEY) ?? "";
  const remember = () => localStorage.setItem(NAME_KEY, nameInput.value.trim());

  for (const b of document.querySelectorAll("[data-vis]")) {
    b.addEventListener("click", () => {
      state.visibility = b.dataset.vis;
      for (const o of document.querySelectorAll("[data-vis]")) {
        o.classList.toggle("sel", o === b);
      }
    });
  }

  $("createBtn").addEventListener("click", () => {
    unlock();
    remember();
    state.pendingIntent = {
      t: "create",
      name: nameInput.value.trim(),
      isPublic: state.visibility === "public",
    };
    if (sock?.readyState === WebSocket.OPEN) {
      send(state.pendingIntent);
      state.pendingIntent = null;
    }
  });

  $("joinBtn").addEventListener("click", () => {
    const code = $("codeInput").value.trim().toUpperCase();
    if (code.length < 3) return toast("Bitte den Raumcode eingeben");
    joinCode(code);
  });

  $("codeInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("joinBtn").click();
  });

  $("readyBtn").addEventListener("click", () => {
    unlock();
    const me = state.room?.players.find((p) => p.id === state.you);
    send({ t: "ready", value: !me?.ready });
  });

  $("startBtn").addEventListener("click", () => {
    unlock();
    send({ t: "start" });
  });

  for (const b of document.querySelectorAll("[data-rounds]")) {
    b.addEventListener("click", () => {
      send({ t: "settings", rounds: Number(b.dataset.rounds) });
    });
  }
  for (const b of document.querySelectorAll("[data-lobbyvis]")) {
    b.addEventListener("click", () => {
      send({ t: "settings", isPublic: b.dataset.lobbyvis === "public" });
    });
  }

  $("againBtn").addEventListener("click", () => send({ t: "again" }));

  function verlassen() {
    send({ t: "leave" });
    saveSession(null);
    state.room = null;
    location.hash = "";
    show("home");
  }
  // Zwei Stufen, aber nur wo es weh tut: im Warteraum kostet ein Fehlgriff
  // nichts, in der laufenden Runde die Punkte. Seit dem 08.09.2026 ist dieser
  // Knopf der einzige Weg, den Platz wirklich aufzugeben – alles andere
  // (weggewischt, gesperrt, Funkloch) hält der Server minutenlang frei. Der
  // Knopf schreibt sich dafür kurz um, statt einen Dialog aufzumachen:
  // `confirm()` blockiert auf dem Handy die ganze Seite, und die Verbindung
  // läuft derweil weiter.
  //
  // Den Ping braucht dieses Spiel nicht extra: `syncClock` schickt alle vier
  // Sekunden einen, und der stempelt `lastSeen` genauso.
  const BEDENK_MS = 4000;

  function knopfRaus(b) {
    if (!b) return;
    let scharf = null;
    const zurueck = () => {
      clearTimeout(scharf);
      scharf = null;
      if (b.dataset.wortlaut != null) b.textContent = b.dataset.wortlaut;
      b.classList.remove("fragt");
    };
    b.addEventListener("click", () => {
      const raum = state.room;
      if (!raum || raum.phase === "lobby") return verlassen();
      if (scharf) { zurueck(); return verlassen(); }
      b.dataset.wortlaut = b.textContent;
      b.textContent = t("schale.wirklichRaus", {}, "Wirklich raus?");
      b.classList.add("fragt");
      scharf = setTimeout(zurueck, BEDENK_MS);
    });
  }

  knopfRaus($("leaveBtn"));
  // Derselbe Weg hinaus von überall: Lobby, Spielbildschirm, Endstand.
  for (const b of document.querySelectorAll("[data-raus]")) knopfRaus(b);

  $("copyBtn").addEventListener("click", async () => {
    const link = location.href.split("#")[0] + "#" + state.code;
    try {
      await navigator.clipboard.writeText(link);
      toast(t("schale.kopiert", {}, "Link kopiert"));
    } catch {
      toast(link);
    }
  });

  $("soundBtn").addEventListener("click", () => {
    setEnabled(!isEnabled());
    $("soundBtn").textContent = isEnabled() ? "🔊" : "🔇";
  });

  $("helpBtn").addEventListener("click", () => {
    $("help").hidden = !$("help").hidden;
  });
  $("helpClose").addEventListener("click", () => {
    $("help").hidden = true;
  });

  // Geteilter Link: .../luckyreflex/#AB3K – der Link ist die ganze Interaktion. Wer
  // ihn öffnet, soll im Raum landen und ihn nicht erst in einer Liste suchen
  // müssen. Ist der Name schon bekannt, passiert das ohne einen Klick.
  const hash = location.hash.replace("#", "").toUpperCase();
  const sharedCode = hash.length >= 3 && hash.length <= 5 ? hash : null;
  if (sharedCode) {
    $("codeInput").value = sharedCode;
    const tag = document.querySelector("#screen-home .tag");
    if (tag) tag.textContent = `Du bist eingeladen – Raum ${sharedCode}.`;

    // Den Knopf austauschen statt umbeschriften: sonst bliebe der alte
    // Klick-Handler dran und würde zusätzlich einen neuen Raum aufmachen.
    const alt = $("createBtn");
    const btn = alt.cloneNode(true);
    btn.textContent = "Beitreten";
    alt.replaceWith(btn);
    btn.addEventListener("click", () => { remember(); joinCode(sharedCode); });

    // Name schon bekannt? Dann ohne Zwischenschritt hinein. Gesendet wird das
    // erst, wenn die Verbindung steht – dafür ist pendingIntent da.
    if (nameInput.value.trim()) joinCode(sharedCode);
  }

  // Platzhalter sofort zeichnen. Sonst klafft dort eine Lücke, solange die
  // Verbindung noch steht – und wer sie nie bekommt, sieht nur ein Loch.
  renderRooms([]);
}

wireUi();
wireInput();
connect();
show("home");
