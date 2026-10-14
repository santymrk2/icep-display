import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mediaAssets } from "@/db/schema";
import { error, json } from "@/lib/http";
import { BUCKET, minio, publicUrl } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

const MAX_THUMB_BYTES = 2 * 1024 * 1024;

/**
 * Recibe la miniatura JPEG generada en el navegador (cuerpo crudo, content-type image/jpeg).
 * Se guarda en MinIO como thumbs/<assetId>.jpg y queda referenciada en thumbnailKey.
 */
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const mimeType = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (mimeType !== "image/jpeg") return error("La miniatura debe ser un JPEG", 415);

  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_THUMB_BYTES) return error("La miniatura supera los 2 MB", 413);

  const [existing] = await db.select({ id: mediaAssets.id }).from(mediaAssets).where(eq(mediaAssets.id, id));
  if (!existing) return error("Archivo no encontrado", 404);

  const body = Buffer.from(await req.arrayBuffer());
  if (body.length === 0) return error("La miniatura está vacía");
  if (body.length > MAX_THUMB_BYTES) return error("La miniatura supera los 2 MB", 413);

  const thumbnailKey = `thumbs/${id}.jpg`;
  await minio.putObject(BUCKET, thumbnailKey, body, body.length, { "Content-Type": "image/jpeg" });

  const [asset] = await db.update(mediaAssets).set({ thumbnailKey }).where(eq(mediaAssets.id, id)).returning();
  if (!asset) return error("Archivo no encontrado", 404);
  return json({ ok: true, thumbnailUrl: publicUrl(thumbnailKey) });
}
