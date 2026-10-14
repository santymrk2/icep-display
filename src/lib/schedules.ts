import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { devices, presentations, scheduleDevices, schedules } from "@/db/schema";
import type { SQL } from "drizzle-orm";
import { groupExists } from "./groups";

export type ScheduleValues = {
  name: string;
  presentationId: string;
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
  const { name, presentationId, deviceIds = [], groupId = null, daysOfWeek, startTime, endTime, enabled = true } = { ...base, ...body };

  if (typeof name !== "string" || !name.trim()) return { error: "Falta el nombre" };
  if (typeof presentationId !== "string" || !isUuid(presentationId)) return { error: "Elegí una presentación" };
  if (!Array.isArray(deviceIds) || deviceIds.some((d) => typeof d !== "string" || !isUuid(d))) return { error: "Pantalla inválida" };
  if (groupId !== null && (typeof groupId !== "string" || !isUuid(groupId))) return { error: "Grupo inválido" };
  if (deviceIds.length > 0 && groupId !== null) return { error: "Elegí pantallas o un grupo, no ambos" };
  if (typeof daysOfWeek !== "number" || !Number.isInteger(daysOfWeek) || daysOfWeek < 1 || daysOfWeek > 127) {
    return { error: "Elegí al menos un día" };
  }
  if (typeof startTime !== "string" || !validTime(startTime)) return { error: "Hora de inicio inválida (HH:MM)" };
  if (typeof endTime !== "string" || !validTime(endTime)) return { error: "Hora de fin inválida (HH:MM)" };
  if (toSeconds(startTime) >= toSeconds(endTime)) return { error: "La hora de fin debe ser posterior a la de inicio" };
  if (typeof enabled !== "boolean") return { error: "Valor de activo inválido" };

  const [presentation] = await db.select({ id: presentations.id }).from(presentations).where(eq(presentations.id, presentationId));
  if (!presentation) return { error: "La presentación no existe" };
  const uniqueIds = [...new Set(deviceIds)];
  if (uniqueIds.length) {
    const found = await db.select({ id: devices.id }).from(devices).where(inArray(devices.id, uniqueIds));
    if (found.length !== uniqueIds.length) return { error: "Alguna pantalla no existe" };
  }
  if (groupId && !(await groupExists(groupId))) return { error: "El grupo no existe" };

  return { values: { name: name.trim(), presentationId, deviceIds: uniqueIds, groupId, daysOfWeek, startTime, endTime, enabled } };
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
  const conds = [eq(schedules.enabled, true), v.groupId ? eq(schedules.groupId, v.groupId) : isNull(schedules.groupId)];
  if (self) conds.push(ne(schedules.id, self.id));
  const rows = await loadSchedules(and(...conds));

  const mine = { from: self?.validFrom ?? null, until: self?.validUntil ?? null };
  const sameTarget = (s: (typeof rows)[number]) => {
    if (v.groupId) return true; // ya filtrado por grupo
    if (v.deviceIds.length === 0) return s.deviceIds.length === 0; // "todas" contra "todas"
    return s.deviceIds.some((d) => v.deviceIds.includes(d)); // comparten alguna pantalla
  };
  const hit = rows.find(
    (s) =>
      sameTarget(s) &&
      (s.daysOfWeek & v.daysOfWeek) !== 0 &&
      toSeconds(s.startTime) < toSeconds(v.endTime) &&
      toSeconds(v.startTime) < toSeconds(s.endTime) &&
      (!s.validFrom || !mine.until || s.validFrom <= mine.until) &&
      (!mine.from || !s.validUntil || mine.from <= s.validUntil),
  );
  return hit ? `Se superpone con "${hit.name}" (${hhmm(hit.startTime)}–${hhmm(hit.endTime)})` : null;
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
