import { eq } from "drizzle-orm";
import { db } from "@/db";
import { calendars, meetingTypes, presentations } from "@/db/schema";
import { refreshAll } from "@/lib/hub";
import { error, json } from "@/lib/http";
import { syncNotion } from "@/lib/notion";
import { isUuid } from "@/lib/schedules";

type Ctx = { params: Promise<{ id: string }> };

const minutes = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 24 * 60;

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return error("Tipo no encontrado", 404);
  const body = (await req.json().catch(() => ({}))) as {
    presentationId?: string | null;
    calendarId?: string | null;
    defaultStartTime?: string | null;
    minutesBefore?: number;
    minutesAfter?: number;
    enabled?: boolean;
  };
  const patch: Partial<typeof meetingTypes.$inferInsert> = {};
  if (body.presentationId !== undefined) {
    if (body.presentationId !== null) {
      if (typeof body.presentationId !== "string" || !isUuid(body.presentationId)) return error("Presentación inválida");
      const [p] = await db.select({ id: presentations.id }).from(presentations).where(eq(presentations.id, body.presentationId));
      if (!p) return error("La presentación no existe");
    }
    patch.presentationId = body.presentationId;
  }
  if (body.calendarId !== undefined) {
    if (body.calendarId !== null) {
      if (typeof body.calendarId !== "string" || !isUuid(body.calendarId)) return error("Calendario inválido");
      const [c] = await db.select({ id: calendars.id }).from(calendars).where(eq(calendars.id, body.calendarId));
      if (!c) return error("El calendario no existe");
    }
    patch.calendarId = body.calendarId;
  }
  if (body.defaultStartTime !== undefined) {
    if (body.defaultStartTime !== null && (typeof body.defaultStartTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.defaultStartTime)))
      return error("Hora habitual inválida (HH:MM)");
    patch.defaultStartTime = body.defaultStartTime;
  }
  if (body.minutesBefore !== undefined) {
    if (!minutes(body.minutesBefore)) return error("Los minutos antes deben estar entre 0 y 1440");
    patch.minutesBefore = body.minutesBefore;
  }
  if (body.minutesAfter !== undefined) {
    if (!minutes(body.minutesAfter) || body.minutesAfter < 1) return error("Los minutos después deben estar entre 1 y 1440");
    patch.minutesAfter = body.minutesAfter;
  }
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") return error("Valor de activo inválido");
    patch.enabled = body.enabled;
  }
  const [row] = await db.update(meetingTypes).set(patch).where(eq(meetingTypes.id, id)).returning();
  if (!row) return error("Tipo no encontrado", 404);
  // Aplica los cambios a los eventos que ya existen.
  await syncNotion();
  return json(row);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return error("Tipo no encontrado", 404);
  // Sus eventos se borran en cascada; si el tipo sigue en Notion, vuelve a aparecer sin configurar.
  await db.delete(meetingTypes).where(eq(meetingTypes.id, id));
  await refreshAll();
  return json({ ok: true });
}
