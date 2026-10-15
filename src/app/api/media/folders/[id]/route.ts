import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mediaAssets, mediaFolders } from "@/db/schema";
import { error, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

/** Renombra, cambia el color y/o mueve (parentId; null = raíz) una carpeta. */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { name?: string; color?: string; parentId?: string | null };
  const patch: { name?: string; color?: string; parentId?: string | null } = {};
  if (body.name !== undefined) {
    patch.name = body.name.trim();
    if (!patch.name) return error("El nombre de la carpeta no puede quedar vacío");
  }
  if (body.color !== undefined) {
    if (!/^#[0-9a-f]{6}$/i.test(body.color)) return error("Color inválido");
    patch.color = body.color;
  }
  if (body.parentId !== undefined) {
    if (body.parentId !== null) {
      // Se sube desde el destino hasta la raíz: si aparece esta carpeta, el destino es ella misma o una subcarpeta suya.
      const all = await db.select({ id: mediaFolders.id, parentId: mediaFolders.parentId }).from(mediaFolders);
      const parentOf = new Map(all.map((f) => [f.id, f.parentId]));
      if (!parentOf.has(body.parentId)) return error("Carpeta no encontrada");
      for (let cur: string | null | undefined = body.parentId; cur; cur = parentOf.get(cur)) {
        if (cur === id) return error("No se puede mover una carpeta dentro de sí misma ni de una subcarpeta suya");
      }
    }
    patch.parentId = body.parentId;
  }
  if (!Object.keys(patch).length) return error("Nada para actualizar");
  const [row] = await db.update(mediaFolders).set(patch).where(eq(mediaFolders.id, id)).returning();
  if (!row) return error("Carpeta no encontrada", 404);
  return json(row);
}

/** No se borra nada de adentro: los archivos y subcarpetas pasan a la carpeta que la contenía. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const deleted = await db.transaction(async (tx) => {
    const [folder] = await tx.select({ parentId: mediaFolders.parentId }).from(mediaFolders).where(eq(mediaFolders.id, id));
    if (!folder) return false;
    await tx.update(mediaFolders).set({ parentId: folder.parentId }).where(eq(mediaFolders.parentId, id));
    await tx.update(mediaAssets).set({ folderId: folder.parentId }).where(eq(mediaAssets.folderId, id));
    await tx.delete(mediaFolders).where(eq(mediaFolders.id, id));
    return true;
  });
  if (!deleted) return error("Carpeta no encontrada", 404);
  return json({ ok: true });
}
