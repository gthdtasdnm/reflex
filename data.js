// Wissensdaten für die Vergleichsrunden.
// Nur der Server liest diese Datei; die Clients bekommen fertige Texte.
// Werte sind gerundet – die Rundengeneratoren erzwingen einen Mindestabstand,
// damit knappe Paare gar nicht erst gezogen werden.

export const COUNTRIES = [
  { name: "Deutschland", pop: 84.7, area: 357588 },
  { name: "Frankreich", pop: 68.4, area: 551695 },
  { name: "Italien", pop: 58.9, area: 301340 },
  { name: "Spanien", pop: 48.4, area: 505990 },
  { name: "Polen", pop: 36.7, area: 312696 },
  { name: "Schweiz", pop: 8.9, area: 41285 },
  { name: "Österreich", pop: 9.2, area: 83879 },
  { name: "Niederlande", pop: 17.9, area: 41850 },
  { name: "Belgien", pop: 11.8, area: 30528 },
  { name: "Portugal", pop: 10.5, area: 92212 },
  { name: "Griechenland", pop: 10.4, area: 131957 },
  { name: "Schweden", pop: 10.6, area: 450295 },
  { name: "Norwegen", pop: 5.5, area: 385207 },
  { name: "Finnland", pop: 5.6, area: 338455 },
  { name: "Dänemark", pop: 5.9, area: 42952 },
  { name: "Irland", pop: 5.3, area: 70273 },
  { name: "Litauen", pop: 2.8, area: 65300 },
  { name: "Lettland", pop: 1.9, area: 64589 },
  { name: "Estland", pop: 1.4, area: 45227 },
  { name: "Tschechien", pop: 10.9, area: 78871 },
  { name: "Ungarn", pop: 9.6, area: 93028 },
  { name: "Rumänien", pop: 19.0, area: 238397 },
  { name: "Bulgarien", pop: 6.4, area: 110879 },
  { name: "Kroatien", pop: 3.9, area: 56594 },
  { name: "Serbien", pop: 6.6, area: 77474 },
  { name: "Island", pop: 0.39, area: 103000 },
  { name: "Türkei", pop: 85.3, area: 783562 },
  { name: "Ukraine", pop: 37.0, area: 603500 },
  { name: "Russland", pop: 144, area: 17098246 },
  { name: "USA", pop: 335, area: 9833520 },
  { name: "Kanada", pop: 40, area: 9984670 },
  { name: "Mexiko", pop: 129, area: 1964375 },
  { name: "Brasilien", pop: 216, area: 8515767 },
  { name: "Argentinien", pop: 46, area: 2780400 },
  { name: "Chile", pop: 19.6, area: 756102 },
  { name: "Peru", pop: 34, area: 1285216 },
  { name: "Kolumbien", pop: 52, area: 1141748 },
  { name: "China", pop: 1411, area: 9596961 },
  { name: "Indien", pop: 1428, area: 3287263 },
  { name: "Japan", pop: 124, area: 377975 },
  { name: "Südkorea", pop: 51.7, area: 100210 },
  { name: "Indonesien", pop: 277, area: 1904569 },
  { name: "Thailand", pop: 71.8, area: 513120 },
  { name: "Vietnam", pop: 98.9, area: 331212 },
  { name: "Philippinen", pop: 117, area: 300000 },
  { name: "Pakistan", pop: 240, area: 881913 },
  { name: "Bangladesch", pop: 173, area: 147570 },
  { name: "Iran", pop: 89, area: 1648195 },
  { name: "Saudi-Arabien", pop: 36.9, area: 2149690 },
  { name: "Israel", pop: 9.8, area: 22072 },
  { name: "Ägypten", pop: 112, area: 1002450 },
  { name: "Nigeria", pop: 223, area: 923768 },
  { name: "Südafrika", pop: 60, area: 1221037 },
  { name: "Kenia", pop: 55, area: 580367 },
  { name: "Äthiopien", pop: 126, area: 1104300 },
  { name: "Marokko", pop: 37, area: 446550 },
  { name: "Algerien", pop: 45, area: 2381741 },
  { name: "Australien", pop: 26.4, area: 7692024 },
  { name: "Neuseeland", pop: 5.2, area: 268021 },
  { name: "Kasachstan", pop: 19.6, area: 2724900 },
  { name: "Mongolei", pop: 3.4, area: 1564110 },
];

export const ANIMALS = [
  { name: "Gepard", speed: 110 },
  { name: "Segelfisch", speed: 110 },
  { name: "Gabelbock", speed: 88 },
  { name: "Löwe", speed: 80 },
  { name: "Gnu", speed: 80 },
  { name: "Hirsch", speed: 75 },
  { name: "Strauß", speed: 70 },
  { name: "Känguru", speed: 70 },
  { name: "Pferd", speed: 70 },
  { name: "Windhund", speed: 70 },
  { name: "Feldhase", speed: 70 },
  { name: "Zebra", speed: 65 },
  { name: "Elch", speed: 60 },
  { name: "Grizzlybär", speed: 56 },
  { name: "Giraffe", speed: 55 },
  { name: "Delfin", speed: 55 },
  { name: "Weißer Hai", speed: 50 },
  { name: "Nashorn", speed: 50 },
  { name: "Hauskatze", speed: 48 },
  { name: "Wildschwein", speed: 48 },
  { name: "Elefant", speed: 40 },
  { name: "Nilpferd", speed: 30 },
  { name: "Eichhörnchen", speed: 20 },
  { name: "Krokodil", speed: 17 },
  { name: "Pinguin", speed: 10 },
  { name: "Landschildkröte", speed: 1 },
  { name: "Faultier", speed: 0.24 },
  { name: "Schnecke", speed: 0.05 },
];

export const MOUNTAINS = [
  { name: "Mount Everest", height: 8849 },
  { name: "K2", height: 8611 },
  { name: "Aconcagua", height: 6961 },
  { name: "Denali", height: 6190 },
  { name: "Kilimandscharo", height: 5895 },
  { name: "Elbrus", height: 5642 },
  { name: "Mont Blanc", height: 4808 },
  { name: "Matterhorn", height: 4478 },
  { name: "Großglockner", height: 3798 },
  { name: "Fudschijama", height: 3776 },
  { name: "Ätna", height: 3357 },
  { name: "Zugspitze", height: 2962 },
  { name: "Olymp", height: 2917 },
  { name: "Feldberg", height: 1493 },
  { name: "Brocken", height: 1141 },
  { name: "Tafelberg", height: 1085 },
];

export const BUILDINGS = [
  { name: "Burj Khalifa", height: 828 },
  { name: "Tokyo Skytree", height: 634 },
  { name: "Shanghai Tower", height: 632 },
  { name: "Empire State Building", height: 381 },
  { name: "Fernsehturm Berlin", height: 368 },
  { name: "Eiffelturm", height: 330 },
  { name: "Golden Gate Bridge", height: 227 },
  { name: "Kölner Dom", height: 157 },
  { name: "Cheops-Pyramide", height: 139 },
  { name: "Big Ben", height: 96 },
  { name: "Freiheitsstatue", height: 93 },
  { name: "Schiefer Turm von Pisa", height: 56 },
];

export const EVENTS = [
  { name: "Erfindung des Buchdrucks", year: 1450 },
  { name: "Kolumbus erreicht Amerika", year: 1492 },
  { name: "Französische Revolution", year: 1789 },
  { name: "Untergang der Titanic", year: 1912 },
  { name: "Beginn des Ersten Weltkriegs", year: 1914 },
  { name: "Ende des Zweiten Weltkriegs", year: 1945 },
  { name: "Erstbesteigung des Everest", year: 1953 },
  { name: "Erste Mondlandung", year: 1969 },
  { name: "Reaktorunfall in Tschernobyl", year: 1986 },
  { name: "Fall der Berliner Mauer", year: 1989 },
  { name: "Deutsche Wiedervereinigung", year: 1990 },
  { name: "Gründung von Google", year: 1998 },
  { name: "Start von Facebook", year: 2004 },
  { name: "Vorstellung des ersten iPhones", year: 2007 },
];

// Für die Stroop-Runde: Wortname und tatsächlicher Farbwert.
export const COLORS = [
  { name: "ROT", hex: "#ff3b3b" },
  { name: "BLAU", hex: "#3b7bff" },
  { name: "GRÜN", hex: "#25d366" },
  { name: "GELB", hex: "#ffd400" },
  { name: "LILA", hex: "#b14bff" },
  { name: "ORANGE", hex: "#ff8c1a" },
  { name: "WEISS", hex: "#ffffff" },
  { name: "PINK", hex: "#ff5fc8" },
];

// Bildschirmfarben für die "Drücke wenn der Bildschirm X wird"-Runde.
export const SCREEN_COLORS = [
  { name: "LILA", hex: "#8e2de2" },
  { name: "WEISS", hex: "#f2f2f2" },
  { name: "ROT", hex: "#d32020" },
  { name: "GRÜN", hex: "#1f9d55" },
  { name: "BLAU", hex: "#1f5fd0" },
  { name: "GELB", hex: "#e6b800" },
  { name: "TÜRKIS", hex: "#12b5b0" },
  { name: "ORANGE", hex: "#e2691a" },
];

// Für die Kategorie-Runde: „Drücke, wenn ein TIER erscheint."
export const CATEGORIES = [
  { label: "TIER", words: ["Igel", "Otter", "Reh", "Wolf", "Dachs", "Möwe", "Luchs", "Biber", "Kranich", "Marder"] },
  { label: "FARBE", words: ["Türkis", "Beige", "Violett", "Ocker", "Purpur", "Grau", "Magenta", "Oliv"] },
  { label: "LAND", words: ["Peru", "Nepal", "Ghana", "Kuba", "Laos", "Malta", "Katar", "Bolivien"] },
  { label: "OBST", words: ["Birne", "Pflaume", "Mango", "Kirsche", "Melone", "Aprikose", "Feige", "Dattel"] },
  { label: "BERUF", words: ["Bäcker", "Notar", "Gärtner", "Pilot", "Schmied", "Anwalt", "Tischler", "Winzer"] },
  { label: "MÖBEL", words: ["Sessel", "Kommode", "Regal", "Hocker", "Vitrine", "Sofa", "Schrank", "Bank"] },
];

// Symbolvorrat für Such- und Merkrunden. Bewusst keine Flaggen: die werden
// unter Windows nicht als Bild gerendert.
export const SYMBOLS = [
  "★", "▲", "●", "■", "◆", "✚", "✿", "☂", "☾", "✈", "⚑", "♛", "♞", "☘", "✂", "⌘",
];

// Bewusst alte, überall vorhandene Emoji: neuere (🌶, 🫐 …) fehlen auf
// manchen Systemen und erscheinen dann als leeres Kästchen.
export const EMOJIS = [
  "🍒", "🍋", "🍇", "🔔", "💎", "🍀", "⭐", "🍉", "🍎", "🍍", "🔥", "⚡", "🎁", "👑",
];
