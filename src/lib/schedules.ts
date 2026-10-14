import { eq } from "drizzle-orm";
import { db } from "@/db";
import { devices, presentations } from "@/db/schema";

export type ScheduleValues = {
  name: string;
  presentationId: string;
  deviceId: string | null;
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
  const { name, presentationId, deviceId = null, daysOfWeek, startTime, endTime, enabled = true } = { ...base, ...body };

  if (typeof name !== "string" || !name.trim()) return { error: "Falta el nombre" };
  if (typeof presentationId !== "string" || !isUuid(presentationId)) return { error: "Elegí una presentación" };
  if (deviceId !== null && (typeof deviceId !== "string" || !isUuid(deviceId))) return { error: "Pantalla inválida" };
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

  return { values: { name: name.trim(), presentationId, deviceId, daysOfWeek, startTime, endTime, enabled } };
}
