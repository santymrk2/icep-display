import { eq } from "drizzle-orm";
import { db } from "@/db";
import { devices } from "@/db/schema";
import { disconnectDevice, refreshDevice } from "@/lib/hub";
import { error, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = (await req.json()) as {
    name?: string;
    location?: string | null;
    defaultPresentationId?: string | null;
  };
  const patch: Partial<typeof devices.$inferInsert> = {};
  if (body.name !== undefined) {
    if (!body.name.trim()) return error("El nombre no puede quedar vacío");
    patch.name = body.name.trim();
  }
  if (body.location !== undefined) patch.location = body.location?.trim() || null;
  if (body.defaultPresentationId !== undefined) patch.defaultPresentationId = body.defaultPresentationId;
  const [row] = await db.update(devices).set(patch).where(eq(devices.id, id)).returning({ id: devices.id });
  if (!row) return error("Pantalla no encontrada", 404);
  await refreshDevice(id);
  return json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  disconnectDevice(id);
  await db.delete(devices).where(eq(devices.id, id));
  return json({ ok: true });
}
