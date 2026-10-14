import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mediaAssets } from "@/db/schema";
import { refreshAll } from "@/lib/hub";
import { error, json } from "@/lib/http";
import { BUCKET, minio } from "@/lib/storage";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [asset] = await db.delete(mediaAssets).where(eq(mediaAssets.id, id)).returning();
  if (!asset) return error("Archivo no encontrado", 404);
  await minio.removeObject(BUCKET, asset.objectKey);
  await refreshAll();
  return json({ ok: true });
}
