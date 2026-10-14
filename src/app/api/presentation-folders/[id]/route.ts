import { eq } from "drizzle-orm";
import { db } from "@/db";
import { presentationFolders } from "@/db/schema";
import { error, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const name = body.name?.trim() ?? "";
  if (!name) return error("El nombre de la carpeta no puede quedar vacío");
  const [row] = await db.update(presentationFolders).set({ name }).where(eq(presentationFolders.id, id)).returning();
  if (!row) return error("Carpeta no encontrada", 404);
  return json(row);
}

/** Las presentaciones de la carpeta no se borran: pasan a la raíz. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const [row] = await db.delete(presentationFolders).where(eq(presentationFolders.id, id)).returning({ id: presentationFolders.id });
  if (!row) return error("Carpeta no encontrada", 404);
  return json({ ok: true });
}
