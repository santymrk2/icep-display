import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mediaAssets, mediaFolders } from "@/db/schema";
import { refreshAll } from "@/lib/hub";
import { error, json } from "@/lib/http";
import { BUCKET, minio, publicUrl } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

/** Renombra (name) y/o mueve (folderId; null = raíz) un archivo. */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { name?: string; folderId?: string | null; width?: number; height?: number };
  const patch: Partial<typeof mediaAssets.$inferInsert> = {};

  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) return error("El nombre no puede quedar vacío");
    patch.originalName = name;
  }
  if (body.folderId !== undefined) {
    if (body.folderId !== null) {
      const [folder] = await db
        .select({ id: mediaFolders.id })
        .from(mediaFolders)
        .where(eq(mediaFolders.id, body.folderId));
      if (!folder) return error("Carpeta no encontrada");
    }
    patch.folderId = body.folderId;
  }
  for (const k of ["width", "height"] as const) {
    const v = (body as Record<string, unknown>)[k];
    if (v === undefined) continue;
    if (typeof v !== "number" || !Number.isInteger(v) || v <= 0 || v > 100000) return error("Resolución inválida");
    patch[k] = v;
  }
  if (Object.keys(patch).length === 0) return error("Nada para actualizar");

  const [asset] = await db.update(mediaAssets).set(patch).where(eq(mediaAssets.id, id)).returning();
  if (!asset) return error("Archivo no encontrado", 404);
  return json({ ...asset, url: publicUrl(asset.objectKey), thumbnailUrl: asset.thumbnailKey ? publicUrl(asset.thumbnailKey) : null });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const [asset] = await db.delete(mediaAssets).where(eq(mediaAssets.id, id)).returning();
  if (!asset) return error("Archivo no encontrado", 404);
  await minio.removeObject(BUCKET, asset.objectKey);
  if (asset.thumbnailKey) await minio.removeObject(BUCKET, asset.thumbnailKey).catch(() => {});
  await refreshAll();
  return json({ ok: true });
}
