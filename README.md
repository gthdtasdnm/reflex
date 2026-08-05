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

### Fünf Aufgaben pro Runde

Jede Runde besteht aus **genau fünf Aufgaben derselben Kategorie**, eine pro
Zeitfenster, ohne Pause dazwischen. Alle fünf werden gespielt – die Runde
endet nicht, wenn jemand eine davon holt. Beide Spieler bekommen also in
jeder Runde fünfmal dieselbe Art Frage.

Zwei oder drei der fünf passen; bei den übrigen ist Stillhalten die richtige
Antwort. Nie alle fünf, nie keine: sonst könnte man blind durchdrücken oder
hätte nichts zu gewinnen.

**Jede Aufgabe wird einzeln gewertet:**

- Bei einer, die passt, gewinnt sie, wer zuerst drückt. Ab diesem Moment ist
  sie für die anderen gesperrt – sie sehen sofort, wer schneller war und mit
  welcher Zeit. Mit der nächsten Aufgabe sind alle wieder dabei.
- Bei einer, die nicht passt, gewinnt jeder Punkte, der die Finger stillhält.
  Wer drückt, verliert diese eine Aufgabe – und nur diese.
- Ein Fehlgriff kostet also nie die ganze Runde. Die nächste Aufgabe kommt
  gleich.

Der Zeitbalken oben gehört immer der Aufgabe, die gerade zu sehen ist:
Aufgabe erscheint, Balken läuft ab, nächste Aufgabe, Balken wieder voll. Ein
Balken, der über mehrere Aufgaben hinwegläuft, gehört zu keiner Entscheidung
und hilft niemandem.

**Rundensieger** ist, wer die meisten der fünf Aufgaben geholt hat. Bei
Gleichstand entscheiden die Punkte. Die Bilanz steht nach jeder Runde kurz auf
dem Schirm: `3/5 Mo · 2/5 Aylin`.

Bei den Warteaufgaben – Ampel, rotes Dreieck, Smileys, Pfeile – passiert das
Ereignis nicht sofort, sondern irgendwann im Fenster. Oder gar nicht: dann ist
Stillhalten richtig. Bei der Timing-Runde wird nicht gesperrt, dort dürfen
alle dieselbe Markierung versuchen und es gewinnt, wer näher dran war.

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

**Es gibt keine Minuspunkte.** Ein Fehler kostet die Aufgabe, mehr nicht. Wer
danebengreift, verliert dadurch schon gegen die anderen – zusätzlich Punkte
abzuziehen führte nur dazu, dass am Ende alle im Minus standen und niemand
die Runde gewonnen hatte.

Pro Aufgabe:

- Aufgabe geholt: 100–500, je schneller desto mehr.
- Richtig stillgehalten, wo nichts zu drücken war: 80.
- **Blitz: +150** für eine Reaktion unter 250 Millisekunden.
- **Perfekt: +150** für ein Timing auf den Punkt.

Pro Runde:

- **Rundensieg: +400** für die meisten geholten Aufgaben. Den gibt es in
  *jeder* Runde: bei Gleichstand entscheiden die Punkte, und hat ausnahmsweise
  niemand etwas geholt, bekommt ihn abgeschwächt (+150), wer am besten
  durchkam. Es gewinnt also immer jemand.
- **Serie:** Jede gewonnene Runde steigert den Multiplikator – ×1,25, ×1,5,
  ×2, ×2,5, bis ×3. Eine verlorene Runde setzt ihn auf null. Der
  Multiplikator gilt für die eigene Leistung, nicht für den Rundensieg: sonst
  reißt der Vorsprung dessen, der einmal vorn liegt, nicht mehr ab.

Der Punktestand steht durchgehend unten in der Leiste. Zwischen den Runden
gibt es deshalb keine Tabelle, nur eine kurze Einblendung: eigener Zuwachs,
verdiente Boni und die Aufgabenbilanz.

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
aktuelle Aufgabe, nie die Gesamtdauer der Runde. Weil außerdem jede Runde
gleich viele Aufgaben hat, verrät auch die Rundenlänge nichts.

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
