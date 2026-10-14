import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { calendars, devices, presentations, scheduleDevices, schedules } from "@/db/schema";
import { addDaysISO, occursOn } from "./recurrence";
import type { SQL } from "drizzle-orm";
import { groupExists } from "./groups";

export type ScheduleValues = {
  name: string;
  presentationId: string;
  calendarId: string;
  allDay: boolean;
  freq: "none" | "day" | "week" | "month" | "year";
  interval: number;
  endsMode: "never" | "on" | "after";
  endsAfter: number | null;
  /** Fecha de inicio (evento único) o primera fecha de la serie, "AAAA-MM-DD". */
  validFrom: string | null;
  /** Fecha de fin si endsMode = "on". */
  validUntil: string | null;
  /** Pantallas elegidas (varias a la vez). Vacío y sin grupo = todas. */
  deviceIds: string[];
  groupId: string | null;
  daysOfWeek: number;
  startTime: string;
  endTime: string;
  enabled: boolean;
};

export type ScheduleBody = Partial<ScheduleValues>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

export const isUuid = (s: string) => UUID.test(s);

function validTime(t: string) {
  const m = TIME.exec(t);
  return !!m && Number(m[1]) <= 23 && Number(m[2]) <= 59 && Number(m[3] ?? 0) <= 59;
}

function toSeconds(t: string) {
  const [h, m, s] = t.split(":");
  return Number(h) * 3600 + Number(m) * 60 + Number(s ?? 0);
}

/** Valida y normaliza un bloque. Con `base` (PATCH) se combina con los valores actuales. */
export async function checkSchedule(body: ScheduleBody, base?: ScheduleValues): Promise<{ error: string } | { values: ScheduleValues }> {
  const merged = { ...base, ...body };
  const { name, presentationId, deviceIds = [], groupId = null, daysOfWeek, enabled = true } = merged;
  const calendarId = merged.calendarId ?? (await db.select({ id: calendars.id }).from(calendars).orderBy(asc(calendars.createdAt)).limit(1))[0]?.id;
  const allDay = merged.allDay ?? false;
  const startTime = allDay ? "00:00" : merged.startTime;
  const endTime = allDay ? "23:59" : merged.endTime;
  const freq = merged.freq ?? "week";
  const interval = merged.interval ?? 1;
  const endsMode = merged.endsMode ?? "never";
  const endsAfter = merged.endsMode === "after" ? (merged.endsAfter ?? null) : null;
  const validFrom = merged.validFrom ?? null;
  const validUntil = endsMode === "on" ? (merged.validUntil ?? null) : null;
  const DATE = /^\d{4}-\d{2}-\d{2}$/;

  if (typeof name !== "string" || !name.trim()) return { error: "Falta el nombre" };
  if (typeof presentationId !== "string" || !isUuid(presentationId)) return { error: "Elegí una presentación" };
  if (!Array.isArray(deviceIds) || deviceIds.some((d) => typeof d !== "string" || !isUuid(d))) return { error: "Pantalla inválida" };
  if (groupId !== null && (typeof groupId !== "string" || !isUuid(groupId))) return { error: "Grupo inválido" };
  if (deviceIds.length > 0 && groupId !== null) return { error: "Elegí pantallas o un grupo, no ambos" };
  if (typeof calendarId !== "string" || !isUuid(calendarId)) return { error: "Elegí un calendario" };
  if (typeof allDay !== "boolean") return { error: "Valor de todo el día inválido" };
  if (!["none", "day", "week", "month", "year"].includes(freq)) return { error: "Repetición inválida" };
  if (!Number.isInteger(interval) || interval < 1 || interval > 99) return { error: "El intervalo debe estar entre 1 y 99" };
  if (!["never", "on", "after"].includes(endsMode)) return { error: "Fin de repetición inválido" };
  if (endsMode === "after" && (!Number.isInteger(endsAfter) || (endsAfter ?? 0) < 1 || (endsAfter ?? 0) > 999)) return { error: "Cantidad de repeticiones inválida" };
  if (freq === "none" && !validFrom) return { error: "Elegí la fecha del evento" };
  if (validFrom !== null && !DATE.test(validFrom)) return { error: "Fecha de inicio inválida" };
  if (endsMode === "on" && (!validUntil || !DATE.test(validUntil))) return { error: "Elegí la fecha de fin" };
  if (validFrom && validUntil && validUntil < validFrom) return { error: "La fecha de fin es anterior a la de inicio" };
  const effectiveDays = freq === "week" ? daysOfWeek : 127;
  if (typeof effectiveDays !== "number" || !Number.isInteger(effectiveDays) || effectiveDays < 1 || effectiveDays > 127) {
    return { error: "Elegí al menos un día" };
  }
  if (typeof startTime !== "string" || !validTime(startTime)) return { error: "Hora de inicio inválida (HH:MM)" };
  if (typeof endTime !== "string" || !validTime(endTime)) return { error: "Hora de fin inválida (HH:MM)" };
  if (toSeconds(startTime) >= toSeconds(endTime)) return { error: "La hora de fin debe ser posterior a la de inicio" };
  if (typeof enabled !== "boolean") return { error: "Valor de activo inválido" };

  const [calendar] = await db.select({ id: calendars.id }).from(calendars).where(eq(calendars.id, calendarId));
  if (!calendar) return { error: "El calendario no existe" };
  const [presentation] = await db.select({ id: presentations.id }).from(presentations).where(eq(presentations.id, presentationId));
  if (!presentation) return { error: "La presentación no existe" };
  const uniqueIds = [...new Set(deviceIds)];
  if (uniqueIds.length) {
    const found = await db.select({ id: devices.id }).from(devices).where(inArray(devices.id, uniqueIds));
    if (found.length !== uniqueIds.length) return { error: "Alguna pantalla no existe" };
  }
  if (groupId && !(await groupExists(groupId))) return { error: "El grupo no existe" };

  return { values: { name: name.trim(), presentationId, calendarId, allDay, freq, interval, endsMode, endsAfter, validFrom, validUntil, deviceIds: uniqueIds, groupId, daysOfWeek: effectiveDays, startTime, endTime, enabled } };
}

const hhmm = (t: string) => t.slice(0, 5);

/**
 * Busca un evento habilitado del mismo calendario y destino que se superponga en horario con
 * `v` en alguna fecha de los próximos ~6 meses (revisa las fechas reales de ambos, repeticiones incluidas).
 * Los eventos con destinos distintos no chocan: actúan como excepciones (prioridad por especificidad).
 * `self` es el evento que se edita (se ignora a sí mismo).
 */
export async function findConflict(v: ScheduleValues, self?: { id: string }): Promise<string | null> {
  if (!v.enabled) return null;
  const conds = [eq(schedules.enabled, true), eq(schedules.calendarId, v.calendarId), v.groupId ? eq(schedules.groupId, v.groupId) : isNull(schedules.groupId)];
  if (self) conds.push(ne(schedules.id, self.id));
  const rows = await loadSchedules(and(...conds));
  const sameTarget = (s: (typeof rows)[number]) => {
    if (v.groupId) return true; // ya filtrado por grupo
    if (v.deviceIds.length === 0) return s.deviceIds.length === 0; // "todas" contra "todas"
    return s.deviceIds.some((d) => v.deviceIds.includes(d)); // comparten alguna pantalla
  };
  const rec = (x: { freq: ScheduleValues["freq"]; interval: number; daysOfWeek: number; validFrom: string | null; endsMode: ScheduleValues["endsMode"]; validUntil: string | null; endsAfter: number | null }) => x;
  const today = new Date().toISOString().slice(0, 10);
  const candidates = rows.filter(
    (s) => sameTarget(s) && toSeconds(s.startTime) < toSeconds(v.endTime) && toSeconds(v.startTime) < toSeconds(s.endTime),
  );
  for (const s of candidates) {
    for (let i = -1; i < 183; i++) {
      const d = addDaysISO(today, i);
      if (occursOn(rec(v), d) && occursOn(rec(s), d)) {
        return `Se superpone con "${s.name}" (${hhmm(s.startTime)}–${hhmm(s.endTime)})`;
      }
    }
  }
  return null;
}

/** Bloques con la lista de pantallas a las que apuntan. */
export async function loadSchedules(where?: SQL) {
  const rows = await db.select().from(schedules).where(where);
  if (!rows.length) return [];
  const links = await db
    .select()
    .from(scheduleDevices)
    .where(inArray(scheduleDevices.scheduleId, rows.map((r) => r.id)));
  return rows.map((r) => ({ ...r, deviceIds: links.filter((l) => l.scheduleId === r.id).map((l) => l.deviceId) }));
}

/** Guarda un bloque y sus pantallas en una transacción (id = actualizar). */
export async function saveSchedule(v: ScheduleValues, id?: string) {
  const { deviceIds, ...row } = v;
  return db.transaction(async (tx) => {
    let scheduleId = id;
    if (id) {
      await tx.update(schedules).set(row).where(eq(schedules.id, id));
      await tx.delete(scheduleDevices).where(eq(scheduleDevices.scheduleId, id));
    } else {
      [{ id: scheduleId }] = await tx.insert(schedules).values(row).returning({ id: schedules.id });
    }
    if (deviceIds.length) await tx.insert(scheduleDevices).values(deviceIds.map((deviceId) => ({ scheduleId: scheduleId!, deviceId })));
    return scheduleId!;
  });
}
