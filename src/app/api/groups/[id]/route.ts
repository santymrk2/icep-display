import { eq, count } from "drizzle-orm";
import { db } from "@/db";
import { deviceGroups, schedules } from "@/db/schema";
import { refreshAll } from "@/lib/hub";
import { error, json } from "@/lib/http";
import { checkGroupName, groupExists } from "@/lib/groups";
import { isUuid } from "@/lib/schedules";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id) || !(await groupExists(id))) return error("Grupo no encontrado", 404);
  const body = (await req.json().catch(() => ({}))) as { name?: unknown };
  const checked = await checkGroupName(body.name, id);
  if ("error" in checked) return error(checked.error);
  await db.update(deviceGroups).set({ name: checked.name }).where(eq(deviceGroups.id, id));
  await refreshAll();
  return json({ ok: true });
}

/** Borra el grupo: sus pantallas quedan sin grupo (FK set null) y sus bloques se borran (cascade). */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id) || !(await groupExists(id))) return error("Grupo no encontrado", 404);
  const schedulesDeleted = await db.transaction(async (tx) => {
    const [{ n }] = await tx.select({ n: count() }).from(schedules).where(eq(schedules.groupId, id));
    await tx.delete(deviceGroups).where(eq(deviceGroups.id, id));
    return Number(n);
  });
  await refreshAll();
  return json({ ok: true, schedulesDeleted });
}
