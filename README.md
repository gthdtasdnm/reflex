# Reflex Royale

Ein Partyspiel für 2–4 Leute im Browser. Ein Raum, ein Code, alle drücken auf
dasselbe: **schnell reagieren – aber nur, wenn es stimmt.**

Läuft auf Handy und Rechner, ohne Installation, ohne Build-Schritt.

---

## Lokal starten

```bash
deno task dev
```

Dann `http://localhost:8000/` öffnen. Für einen zweiten Spieler ein zweites
Fenster oder das Handy im selben WLAN auf `http://<deine-IP>:8000/` schicken.

Der Host eröffnet einen Raum und bekommt einen vierstelligen Code. Wer den Code
eingibt (oder den geteilten Link mit `#CODE` öffnet), landet in derselben Lobby.
Alleine geht auch – dann ist es ein Übungsmodus.

Anderer Port: `PORT=9000 deno task dev`

---

## Wie es gespielt wird

Die Spielfläche **ist** der Knopf: irgendwo hintippen, am Rechner Leertaste.

### Serien – die meisten Runden

Eine Runde ist eine **Folge von Aufgaben**, eine pro Zeitfenster, ohne Pause
dazwischen. Die wenigsten passen; gedrückt wird bei der, die zutrifft.

Zwei Regeln machen das Ganze aus:

- **Eine verpasste Chance ist nicht das Ende.** Reagiert niemand auf eine
  passende Aufgabe, läuft die Folge weiter und die nächste kommt. Die Runde
  ist erst vorbei, wenn jemand richtig gedrückt hat.
- **Daneben gedrückt kostet die Runde.** Wer auf eine Aufgabe drückt, die nicht
  passt, ist raus. Weil die meisten Aufgaben nicht passen, bestraft sich
  blindes Drauflosdrücken von selbst – eine eigene Fallenmechanik braucht es
  hier nicht.
- **Nur einer gewinnt.** Der erste richtige Druck beendet die Runde und sperrt
  die Eingabe bei allen anderen. Wer zu spät kommt, sieht, wer schneller war
  und mit welcher Zeit.

Der Zeitbalken oben gehört immer der Aufgabe, die gerade zu sehen ist: Aufgabe
erscheint, Balken läuft ab, nächste Aufgabe, Balken wieder voll. Ein Balken,
der über fünf nacheinander gezeigte Aufgaben hinwegläuft, gehört zu keiner
Entscheidung und hilft niemandem.

### Warten und Timing – der Rest

Vier Runden laufen durch, bis genau einmal etwas passiert. Hier gibt es keine
Frist pro Aufgabe, also auch keinen Balken – und hier ergibt die **Falle**
Sinn: manchmal passiert gar nichts, und wer dann stillhält, gewinnt die Runde.
Dazu kommt eine Timing-Runde, bei der ein Balken im Spielfeld selbst die
Aufgabe ist.

### Die 15 Rundentypen

**Serien mit Wissen**

- `compare` – Bevölkerung, Fläche, Tiergeschwindigkeit, Berg- und Bauwerkshöhe,
  historische Reihenfolge. Nur Paare mit deutlichem Abstand, damit es Wissen
  bleibt und kein Raten wird.
- `math` – Rechnungen, drücke bei der, die aufgeht.
- `stroop` – Farbwörter, drücke, wenn eins in seiner eigenen Farbe steht.
- `count` – Punktefelder, drücke, wenn es mehr als N sind.
- `same` – Musterpaare, drücke, wenn beide identisch sind.

**Serien mit Erkennen**

- `symbol` – Symbole, drücke beim gesuchten.
- `category` – Wörter, drücke bei einem aus der gesuchten Kategorie.
- `numbers` – Zahlen, drücke bei der, die zur Regel passt.
- `emojihunt` – Ein volles Raster pro Fenster, drücke, wenn das Gesuchte
  darin steckt.
- `colorflash` – Bildschirmfarben, drücke bei der gesuchten.

**Warten**

- `smileys` – Ein Raster grinsender Gesichter, eins wird traurig.
- `redtriangle` – Ein rotes Dreieck versteckt sich hinter wandernden Klötzen.
- `traffic` – Ampel. Gelb ist die Falle, nur Grün zählt.
- `arrows` – Ein Pfeil im drehenden Raster klappt um.

**Timing**

- `timing` – Den Balken genau auf der Markierung stoppen.

### Punkte

**Es gibt keine Minuspunkte.** Ein Fehler kostet die Runde und die Serie, mehr
nicht. Wer danebengreift, verliert dadurch schon gegen die anderen – zusätzlich
Punkte abzuziehen führte nur dazu, dass am Ende alle im Minus standen und
niemand die Runde gewonnen hatte.

- Treffer: 150–1000, je schneller desto mehr.
- Falle erkannt und stillgehalten: 550.
- **Rundensieg: +300.** Den gibt es in *jeder* Runde, und in aller Regel
  genau einmal: der erste richtige Druck entscheidet, danach ist die Eingabe
  bei allen anderen gesperrt. Sie sehen sofort, wer schneller war und mit
  welcher Zeit. Geteilt wird der Sieg nur, wenn niemand gedrückt hat und
  mehrere gemeinsam eine Falle erkannt haben – da gibt es keine Zeiten zu
  vergleichen. Lag ausnahmsweise niemand richtig, bekommt den Sieg
  abgeschwächt (+150), wer am nächsten dran war. Es gewinnt also immer
  jemand.
- **Blitz: +250** für eine Reaktion unter 250 Millisekunden.
- **Perfekt: +250** für ein Timing auf den Punkt.
- **Serie:** Jede richtige Runde steigert den Multiplikator – ×1,25, ×1,5, ×2,
  ×2,5, bis ×3. Ein einziger Fehler setzt ihn auf null. Der Multiplikator gilt
  für die eigene Leistung, nicht für den Rundensieg: sonst reißt der Vorsprung
  dessen, der einmal vorn liegt, nicht mehr ab.

Der Punktestand steht durchgehend unten in der Leiste. Zwischen den Runden
gibt es deshalb keine Tabelle, nur eine kurze Einblendung: eigener Zuwachs,
verdiente Boni, wer die Runde geholt hat.

### Räume

Beim Eröffnen entscheidet man zwischen **öffentlich** und **privat**. Öffentliche
Räume stehen bei allen anderen auf der Startseite in der Liste und man tritt
mit einem Tipp bei. Private tauchen nirgends auf – da kommt nur rein, wer den
vierstelligen Code oder den geteilten Link hat. Umstellen geht auch später
noch in der Lobby.

## Wie es gebaut ist

```
server.js          Deno: statische Dateien, WebSocket, Raum- und Spiellogik
rounds.js          würfelt die Runden aus (nur Server)
data.js            Länder, Tiere, Berge, Wörter … (nur Server)
public/index.html  alle vier Bildschirme
public/app.js      Verbindung, Lobby, Rundenschleife
public/render.js   die Renderer, Serien über ein gemeinsames Gerüst
public/motion.js   Bewegungsmathematik, von Server und Client geteilt
public/audio.js    Automatengeräusche aus Oszillatoren, keine Dateien
public/style.css
public/probe.html  Layoutprobe für Screenshots, siehe unten
```

Drei Entscheidungen, die den Rest erklären:

**Der Server würfelt, der Client zeichnet nur.** Eine Runde wird komplett
serverseitig erzeugt – inklusive des vollständigen Zeitplans, was wann
aufblinkt – und als fertige Beschreibung an alle geschickt. Kein Zufall im
Client heißt: alle sehen garantiert dasselbe.

**Reaktionszeiten werden lokal gemessen, nicht über die Uhr des Servers.**
Der Client misst zwischen „Auslöser erscheint" und „Spieler drückt", beides auf
seinem eigenen Gerät. Ein schlechter Ping verschiebt beide Zeitpunkte
gleichzeitig und fällt damit heraus. Der Uhrenabgleich sorgt nur dafür, dass
alle ungefähr gleichzeitig starten – seine Genauigkeit ist unkritisch.

**Alles Bewegte wird aus der Rundenzeit berechnet, nie aufsummiert.** Deshalb
die Dreiecksschwingung in `motion.js`: Server und Client rechnen zu jedem
Zeitpunkt exakt dieselbe Position aus, unabhängig von der Bildrate. Sonst
prüfte der Server eine andere Szene als der Spieler sieht.

**Der Balken darf nichts verraten.** Er zeigt nur das Fenster für die
aktuelle Aufgabe, nie die Gesamtdauer der Runde. Deshalb kann man an ihm auch
nicht ablesen, wie viele Aufgaben noch kommen oder wann gleich etwas passiert.

**Eine Stelle entscheidet, was ein Druck ausgelöst hat.** `evaluate()` im
Server wird sowohl für „ist die Runde jetzt entschieden?" als auch für die
spätere Wertung benutzt. Zwei getrennte Prüfungen wären genau die Sorte
Duplikat, die irgendwann auseinanderläuft – und dann widerspricht die
Rückmeldung auf dem Bildschirm dem Ergebnis.

### Ehrlich gesagt

Wer die Entwicklerkonsole aufmacht, kann den Rundenplan sehen, bevor er
abläuft – der Client bekommt ihn ja vorab, damit er ihn zeichnen kann. Das ist
für ein Partyspiel unter Freunden bewusst so gelassen. Ein wasserdichtes System
müsste die Szene serverseitig rendern oder streamen, und das wäre für den
Zweck völlig unverhältnismäßig. Gegen plumpes Dauerdrücken hilft, dass der
Server Reaktionen unter 80 ms als Fehlstart wertet.

### Layout prüfen

`public/probe.html` zeigt die Spielansichten mit Beispieldaten und
abgeschalteten Animationen – so trifft der Screenshot nicht Frame 0:

```bash
deno task dev &
firefox --headless --window-size=360,660 --screenshot "$PWD/out.png" \
  "http://127.0.0.1:8000/probe.html#emojihunt"
```

Ansichten: `home`, `lobby`, `final`, `prelude`, `flash`, `feedback`, `locked`
sowie die
Rundentypen `compare`, `same`, `stroop`, `symbol`, `category`, `numbers`,
`emojihunt`, `redtriangle`, `smileys`, `traffic`, `timing`.

---

## Auf einen Server

Das Spiel macht keine Annahmen über seinen Ort im Web: es läuft genauso unter
`example.org/` wie unter `example.org/irgendein/unterpfad/`. Dafür sorgen drei
Dinge, an denen man beim Umbauen nicht drehen sollte:

- **Alle Asset-Pfade sind relativ.** `href="style.css"`, nie `href="/style.css"` –
  ein führender Slash zeigt auf die Domainwurzel und liefert unter einem
  Unterpfad 404.
- **Die WebSocket-URL kommt aus `document.baseURI`**, nicht aus `location.host`
  plus festem Pfad. Sonst landet die Verbindung auf `/ws` statt
  `/<projekt>/ws`, die Lobby lädt und sonst funktioniert nichts.
- **Host und Port kommen aus der Umgebung** (`HOST`, `PORT`). In Produktion
  `HOST=127.0.0.1` setzen, damit der Dienst nur über den Reverse Proxy und
  nicht direkt am Port erreichbar ist.

Gebraucht wird:

| | |
|---|---|
| Runtime | Deno (getestet mit 2.9) |
| Abhängigkeiten | keine, kein Build-Schritt – `git pull` reicht als Deployment |
| Prozess | `deno run --allow-net --allow-read --allow-env --allow-sys server.js` |
| Proxy | muss **WebSocket-Upgrades durchreichen**, und die `/ws`-Regel muss vor der allgemeinen stehen |
| Schreibrechte | keine – es wird nichts gespeichert, alle Räume leben im Arbeitsspeicher |

Nach dem Aufsetzen zwei Dinge prüfen: ob `…/style.css` wirklich CSS liefert
und nicht HTML (sonst greift die Proxy-Regel nicht), und ob ein zweiter Spieler
in der Lobby erscheint (dann klappt der WebSocket-Upgrade). Für den WebSocket
gibt es keinen brauchbaren `curl`-Test.
