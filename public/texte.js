// Türkisch und Englisch für luckyreflex.
//
// Deutsch steht im HTML und – wo Text erst im Code entsteht – als drittes
// Argument bei `t()` bzw. als `text` in den Servermeldungen. Hier liegen nur
// die beiden anderen Fassungen darüber.
//
// Die Schlüssel sind beim Umstellen maschinell vergeben worden und tragen
// deshalb die ersten Wörter des deutschen Satzes im Namen – so findet man die
// Stelle im Markup wieder.
//
// Warteraum, Raumliste und Endstand stehen nicht hier, sondern in
// `schale-texte.js`: die sind in mehreren Spielen gleich und werden von
// `verteilen.mjs` mitgeführt.

import { SCHALE_WOERTER } from "./schale-texte.js";

const EIGEN = {
  tr: {
    "luckyreflex.schnelldrcke1": "Hızlı bas. Ama yalnızca doğruysa.",
    "luckyreflex.runden2": "Tur sayısı",
    "luckyreflex.spielstarten3": "Oyunu başlat",
    "luckyreflex.derhostkanne4": "Oda sahibi yeni bir tur başlatabilir.",
    "luckyreflex.drckenheitir5": "<strong>Basmak şu demek:</strong> oyun alanının herhangi bir yerine dokun – bilgisayarda boşluk tuşu.",
    "luckyreflex.fnfaufgabenp6": "<b>Turda beş görev,</b> hepsi aynı kategoriden, aralarında duraklama yok. İki ya da üçü uyar – diğerlerinde doğru cevap hiç dokunmamaktır.",
    "luckyreflex.jedeaufgabez7": "<b>Her görev ayrı sayılır.</b> Uyan bir görevde ilk basan onu alır; diğerleri için o görev kapanır ve kimin daha hızlı olduğunu görürler. Sonrakinde herkes yine oyundadır.",
    "luckyreflex.einfehlgriff8": "<b>Bir yanlış yalnızca o görevi götürür</b> – hiçbir zaman bütün turu. Görevlerin çoğu uymadığı için gözü kapalı basmak yine de işe yaramaz.",
    "luckyreflex.derbalkenobe9": "<b>Yukarıdaki çubuk</b> o an görünen görevin süresidir. Bekleme görevlerinde olay pencere içinde bir an olur – ya da hiç olmaz.",
    "luckyreflex.rundensieger10": "<b>Turu kazanan</b>, beş görevin en çoğunu alandır. Her turda mutlaka biri kazanır.",
    "luckyreflex.seriejedegew11": "<b>Seri:</b> kazanılan her tur çarpanı ×3'e kadar yükseltir. Kaybedilen bir tur onu sıfırlar.",
    "luckyreflex.blitzuntermi12": "<b>Şimşek:</b> 250 milisaniyenin altında ek puan var.",
    "lr.weg": "yok",
    "lr.startet": "başlatıyor",
    "lr.bereit": "✓ hazır",
    "lr.allein": "Denemek için tek başına oynanır – iki kişiyle daha keyifli.",
    "lr.warten": "Diğerleri bekleniyor …",
    "lr.dochNicht": "Yine de hazır değilim",
    "lr.nochNicht": "Henüz değil …",
    "lr.gewonnen": "TURU KAZANDIN",
    "lr.geteilt": "Tur paylaşıldı",
    "lr.rundeAn": "Tur {namen} kişisine",
    "lr.serie": "Seri ×{n}",
    "lr.urteil.hit": "İSABET",
    "lr.urteil.perfect": "MÜKEMMEL!",
    "lr.urteil.early": "ÇOK ERKEN",
    "lr.urteil.wrong": "YANLIŞ",
    "lr.urteil.off": "KAÇIRDIN",
  },

  en: {
    "luckyreflex.schnelldrcke1": "Tap fast. But only when it is right.",
    "luckyreflex.runden2": "Rounds",
    "luckyreflex.spielstarten3": "Start the game",
    "luckyreflex.derhostkanne4": "The host can start a new round.",
    "luckyreflex.drckenheitir5": "<strong>Tapping means:</strong> touch anywhere on the playing area – space bar on a computer.",
    "luckyreflex.fnfaufgabenp6": "<b>Five tasks per round,</b> all from the same category, with no pause between them. Two or three of them fit – for the others, holding still is the right answer.",
    "luckyreflex.jedeaufgabez7": "<b>Every task counts on its own.</b> Whoever taps first on a matching task takes it; for the others it is locked from then on and they see who was faster. On the next one everyone is back in.",
    "luckyreflex.einfehlgriff8": "<b>One wrong tap only costs that single task</b> – never the whole round. Since most tasks do not fit, tapping blindly still gets you nowhere.",
    "luckyreflex.derbalkenobe9": "<b>The bar at the top</b> is the time limit for the task currently showing. In the waiting tasks the event happens somewhere in the window – or not at all.",
    "luckyreflex.rundensieger10": "<b>The round goes to</b> whoever took the most of the five tasks. Somebody always wins.",
    "luckyreflex.seriejedegew11": "<b>Streak:</b> every round won raises the multiplier up to ×3. One lost round sets it back to zero.",
    "luckyreflex.blitzuntermi12": "<b>Lightning:</b> under 250 milliseconds there are extra points.",
    "lr.weg": "away",
    "lr.startet": "starts",
    "lr.bereit": "✓ ready",
    "lr.allein": "Playable alone to try it out – with two it is more fun.",
    "lr.warten": "Waiting for the others …",
    "lr.dochNicht": "Not ready after all",
    "lr.nochNicht": "Not yet …",
    "lr.gewonnen": "ROUND WON",
    "lr.geteilt": "Round shared",
    "lr.rundeAn": "Round to {namen}",
    "lr.serie": "Streak ×{n}",
    "lr.urteil.hit": "HIT",
    "lr.urteil.perfect": "PERFECT!",
    "lr.urteil.early": "TOO EARLY",
    "lr.urteil.wrong": "WRONG",
    "lr.urteil.off": "MISSED",
  },
};

export const WOERTER = {
  tr: { ...SCHALE_WOERTER.tr, ...EIGEN.tr },
  en: { ...SCHALE_WOERTER.en, ...EIGEN.en },
};
