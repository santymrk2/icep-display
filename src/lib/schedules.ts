import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { devices, presentations, schedules } from "@/db/schema";
import { groupExists } from "./groups";

export type ScheduleValues = {
  name: string;
  presentationId: string;
  deviceId: string | null;
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
  const { name, presentationId, deviceId = null, groupId = null, daysOfWeek, startTime, endTime, enabled = true } = { ...base, ...body };

  if (typeof name !== "string" || !name.trim()) return { error: "Falta el nombre" };
  if (typeof presentationId !== "string" || !isUuid(presentationId)) return { error: "Elegí una presentación" };
  if (deviceId !== null && (typeof deviceId !== "string" || !isUuid(deviceId))) return { error: "Pantalla inválida" };
  if (groupId !== null && (typeof groupId !== "string" || !isUuid(groupId))) return { error: "Grupo inválido" };
  if (deviceId !== null && groupId !== null) return { error: "Elegí una pantalla o un grupo, no ambos" };
  if (typeof daysOfWeek !== "number" || !Number.isInteger(daysOfWeek) || daysOfWeek < 1 || daysOfWeek > 127) {
    return { error: "Elegí al menos un día" };
  }
  if (typeof startTime !== "string" || !validTime(startTime)) return { error: "Hora de inicio inválida (HH:MM)" };
  if (typeof endTime !== "string" || !validTime(endTime)) return { error: "Hora de fin inválida (HH:MM)" };
  if (toSeconds(startTime) >= toSeconds(endTime)) return { error: "La hora de fin debe ser posterior a la de inicio" };
  if (typeof enabled !== "boolean") return { error: "Valor de activo inválido" };

  const [presentation] = await db.select({ id: presentations.id }).from(presentations).where(eq(presentations.id, presentationId));
  if (!presentation) return { error: "La presentación no existe" };
  if (deviceId) {
    const [device] = await db.select({ id: devices.id }).from(devices).where(eq(devices.id, deviceId));
    if (!device) return { error: "La pantalla no existe" };
  }
  if (groupId && !(await groupExists(groupId))) return { error: "El grupo no existe" };

  return { values: { name: name.trim(), presentationId, deviceId, groupId, daysOfWeek, startTime, endTime, enabled } };
}

const hhmm = (t: string) => t.slice(0, 5);

/**
 * Busca un bloque habilitado con el mismo destino (misma pantalla, mismo grupo, o ambos "todas")
 * que comparta algún día, se superponga en horario [inicio, fin) y cuyo rango de fechas se cruce.
 * Los bloques de destinos distintos no chocan: actúan como excepciones (prioridad por especificidad).
 * `self` es el bloque que se edita (PATCH): se ignora a sí mismo y usa sus fechas actuales.
 */
export async function findConflict(
  v: ScheduleValues,
  self?: { id: string; validFrom: string | null; validUntil: string | null },
): Promise<string | null> {
  if (!v.enabled) return null;
  const conds = [
    eq(schedules.enabled, true),
    v.deviceId ? eq(schedules.deviceId, v.deviceId) : isNull(schedules.deviceId),
    v.groupId ? eq(schedules.groupId, v.groupId) : isNull(schedules.groupId),
  ];
  if (self) conds.push(ne(schedules.id, self.id));
  const rows = await db.select().from(schedules).where(and(...conds));

  const mine = { from: self?.validFrom ?? null, until: self?.validUntil ?? null };
  const hit = rows.find(
    (s) =>
      (s.daysOfWeek & v.daysOfWeek) !== 0 &&
      toSeconds(s.startTime) < toSeconds(v.endTime) &&
      toSeconds(v.startTime) < toSeconds(s.endTime) &&
      (!s.validFrom || !mine.until || s.validFrom <= mine.until) &&
      (!mine.from || !s.validUntil || mine.from <= s.validUntil),
  );
  return hit ? `Se superpone con "${hit.name}" (${hhmm(hit.startTime)}–${hhmm(hit.endTime)})` : null;
}
