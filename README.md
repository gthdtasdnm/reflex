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

Jede Runde ist eine von drei Sorten – daran hängt auch, was der Zeitbalken
oben anzeigt:

| Sorte | Was passiert | Balken |
|---|---|---|
| **Wissen** | Eine Aussage steht sofort da, drücken nur wenn sie stimmt | die Frist für die ganze Runde |
| **Schritt** | Ein Element nach dem anderen, drücken beim gesuchten | die Frist für das gerade gezeigte Element |
| **Warten** | Etwas läuft durch, irgendwann passiert es | keiner – es gibt keine Frist |
| **Timing** | Ein Balken läuft auf eine Markierung zu | keiner – der Balken im Feld ist die Aufgabe |

Der Balken gehört immer genau der Entscheidung, um die es gerade geht. Ein
Balken, der über fünf nacheinander gezeigte Symbole hinwegläuft, gehört zu
keiner davon; und wo ohnehin der Schnellste gewinnt, braucht es gar keinen.

Und weil sonst jeder einfach dauernd drücken würde: **manchmal passiert gar
nichts.** Wer die Falle erkennt und stillhält, gewinnt die Runde.

### Die 17 Rundentypen

**Wissen** — die Aussage steht sofort da

- `compare` – Bevölkerung, Fläche, Tiergeschwindigkeit, Berg- und Bauwerkshöhe,
  historische Reihenfolge. Nur Paare mit deutlichem Abstand, damit es Wissen
  bleibt und kein Raten wird.
- `math` – Stimmt die Rechnung?
- `stroop` – Steht das Farbwort in seiner eigenen Farbe?
- `count` – Mehr als N Punkte auf dem Feld?
- `same` – Sind beide Muster identisch?
- `word` – Echtes deutsches Wort oder erfunden?

**Schritt** — ein Element pro Zeitfenster

- `symbol` – Symbole nacheinander, eins davon ist das gesuchte.
- `category` – Wörter nacheinander, eins gehört zur gesuchten Kategorie.
- `numbers` – Zahlen nacheinander, eine passt zur Regel.
- `emojihunt` – Ein volles Raster pro Fenster, irgendwann steckt das Gesuchte drin.
- `colorflash` – Der Bildschirm wechselt die Farbe, drücke bei der gesuchten.
- `nback` – Drücken, wenn ein Symbol direkt wiederholt wird.

**Warten** — es läuft durch, bis es passiert

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
- **Rundensieg: +300.** Den gibt es in *jeder* Runde. Waren mehrere gleich
  schnell oder haben mehrere die Falle erkannt, teilen sie ihn sich. Lag
  ausnahmsweise niemand richtig, bekommt ihn abgeschwächt (+150), wer am
  nächsten dran war. Es gewinnt also immer jemand.
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
public/render.js   die 17 Renderer
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

**Der Balken darf nichts verraten.** Bei Wissensrunden zeigt er die
Gesamtfrist – deshalb ist die Rundenlänge dort fest, sonst könnte man an
seinem Stand ablesen, wann gleich etwas passiert. Bei Schrittrunden zeigt er
nur das Fenster für ein Element; die Gesamtlänge taucht nirgends auf und darf
folglich vom Auslöser abhängen: die Runde endet ein Fenster nach dem Treffer,
statt danach noch leer weiterzulaufen.

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

Ansichten: `home`, `lobby`, `final`, `prelude`, `flash`, `feedback` sowie die
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
