import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mediaFolders } from "@/db/schema";
import { error, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const name = body.name?.trim() ?? "";
  if (!name) return error("El nombre de la carpeta no puede quedar vacío");
  const [row] = await db.update(mediaFolders).set({ name }).where(eq(mediaFolders.id, id)).returning();
  if (!row) return error("Carpeta no encontrada", 404);
  return json(row);
}

/** Los archivos de la carpeta no se borran: su folderId queda en null por la FK. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const [row] = await db.delete(mediaFolders).where(eq(mediaFolders.id, id)).returning({ id: mediaFolders.id });
  if (!row) return error("Carpeta no encontrada", 404);
  return json({ ok: true });
}
