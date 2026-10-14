import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { devices, tags } from "@/db/schema";
import { error, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { description?: string | null };
  const [row] = await db
    .update(tags)
    .set({ description: body.description?.trim() || null })
    .where(eq(tags.id, id))
    .returning();
  if (!row) return error("Etiqueta no encontrada", 404);
  return json(row);
}

/** Borra la etiqueta y la quita de todas las pantallas. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const [row] = await db.delete(tags).where(eq(tags.id, id)).returning();
  if (!row) return error("Etiqueta no encontrada", 404);
  await db.update(devices).set({ tags: sql`array_remove(${devices.tags}, ${row.name})` });
  return json({ ok: true });
}
