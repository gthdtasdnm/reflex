// Geteilt zwischen Server (Rundengenerierung) und Client (Darstellung).
// Beide müssen zu jedem Zeitpunkt exakt dieselbe Position ausrechnen, sonst
// prüft der Server eine andere Szene als der Spieler sieht.
//
// Deshalb geschlossene Form statt Schritt-für-Schritt-Integration: eine
// Dreiecksschwingung, die an den Rändern reflektiert. Kein Drift, kein dt.

export function reflect(p, lo, hi) {
  const span = hi - lo;
  if (span <= 0) return lo;
  const m = (((p - lo) % (2 * span)) + 2 * span) % (2 * span);
  return lo + (m <= span ? m : 2 * span - m);
}

// t in Sekunden. Feldkoordinaten sind 0..100 (Prozent der Bühne).
export function shapeAt(s, t) {
  return {
    x: reflect(s.x + s.vx * t, 0, 100 - s.w),
    y: reflect(s.y + s.vy * t, 0, 100 - s.h),
  };
}

export function overlapArea(ax, ay, aw, ah, bx, by, bw, bh) {
  const w = Math.min(ax + aw, bx + bw) - Math.max(ax, bx);
  const h = Math.min(ay + ah, by + bh) - Math.max(ay, by);
  return w > 0 && h > 0 ? w * h : 0;
}

// Wie viel vom Dreieck verdeckt ein Klotz gerade? 0..1
export function coverage(tri, s, t) {
  const p = shapeAt(s, t);
  return overlapArea(tri.x, tri.y, tri.size, tri.size, p.x, p.y, s.w, s.h) /
    (tri.size * tri.size);
}
