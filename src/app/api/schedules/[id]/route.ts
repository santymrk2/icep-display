import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schedules } from "@/db/schema";
import { refreshAll } from "@/lib/hub";
import { error, json } from "@/lib/http";
import { checkSchedule, findConflict, isUuid, loadSchedules, saveSchedule, type ScheduleBody } from "@/lib/schedules";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return error("Bloque no encontrado", 404);
  const [current] = await loadSchedules(eq(schedules.id, id));
  if (!current) return error("Bloque no encontrado", 404);
  const checked = await checkSchedule((await req.json()) as ScheduleBody, current);
  if ("error" in checked) return error(checked.error);
  const conflict = await findConflict(checked.values, { id });
  if (conflict) return error(conflict, 409);
  await saveSchedule(checked.values, id);
  await refreshAll();
  return json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return error("Bloque no encontrado", 404);
  await db.delete(schedules).where(eq(schedules.id, id));
  await refreshAll();
  return json({ ok: true });
}
