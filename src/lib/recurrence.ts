/**
 * Repeticiones de eventos (sin dependencias). Las fechas son "AAAA-MM-DD" en la zona horaria
 * configurada; se trabaja en UTC para que sumar días no dependa del huso del servidor.
 */
export type Recurrence = {
  freq: "none" | "day" | "week" | "month" | "year";
  interval: number;
  /** Bitmask de días (bit 0 = domingo), para freq "week". */
  daysOfWeek: number;
  /** Primera fecha (inicio del evento). null = sin límite inferior (datos viejos). */
  validFrom: string | null;
  endsMode: "never" | "on" | "after";
  /** Última fecha, si endsMode = "on". */
  validUntil: string | null;
  endsAfter: number | null;
};

const MS_DAY = 86_400_000;
const parse = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
};
const dayDiff = (a: string, b: string) => Math.round((parse(b) - parse(a)) / MS_DAY);
const dow = (d: string) => new Date(parse(d)).getUTCDay();
export const addDaysISO = (d: string, n: number) => new Date(parse(d) + n * MS_DAY).toISOString().slice(0, 10);

/** Antes de 1970-01-04 (domingo) no hay datos: sirve de ancla para eventos viejos sin fecha de inicio. */
const ANCHOR = "1970-01-04";

/** ¿El evento "base" (sin contar el límite de repeticiones) cae en esta fecha? */
function matches(r: Recurrence, date: string): boolean {
  const start = r.validFrom ?? ANCHOR;
  if (date < start) return false;
  if (r.endsMode === "on" && r.validUntil && date > r.validUntil) return false;
  const n = Math.max(1, r.interval || 1);
  switch (r.freq) {
    case "none":
      return date === start;
    case "day":
      return dayDiff(start, date) % n === 0;
    case "week": {
      if ((r.daysOfWeek & (1 << dow(date))) === 0) return false;
      // Semanas completas entre el domingo de la semana de inicio y el de la fecha.
      const weeks = Math.floor((dayDiff(start, date) + dow(start)) / 7);
      return weeks % n === 0;
    }
    case "month": {
      const [sy, sm, sd] = start.split("-").map(Number);
      const [y, m, d] = date.split("-").map(Number);
      return d === sd && ((y - sy) * 12 + (m - sm)) % n === 0;
    }
    case "year": {
      const [sy, sm, sd] = start.split("-").map(Number);
      const [y, m, d] = date.split("-").map(Number);
      return m === sm && d === sd && (y - sy) % n === 0;
    }
  }
}

/** ¿El evento ocurre en esa fecha? Respeta "termina tras N repeticiones". */
export function occursOn(r: Recurrence, date: string): boolean {
  if (!matches(r, date)) return false;
  if (r.endsMode !== "after" || !r.endsAfter || r.freq === "none") return true;
  // Cuenta ocurrencias desde el inicio hasta la fecha (tope de 10 años para no colgarse).
  const start = r.validFrom ?? ANCHOR;
  let count = 0;
  for (let d = start, i = 0; d <= date && i < 3660; d = addDaysISO(d, 1), i++) {
    if (matches(r, d)) {
      count++;
      if (d === date) return count <= r.endsAfter;
      if (count >= r.endsAfter) return false;
    }
  }
  return false;
}
