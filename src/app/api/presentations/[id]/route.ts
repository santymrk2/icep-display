import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { mediaAssets, presentationItems, presentations } from "@/db/schema";
import { refreshAll } from "@/lib/hub";
import { error, json } from "@/lib/http";
import { publicUrl } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const [presentation] = await db.select().from(presentations).where(eq(presentations.id, id));
  if (!presentation) return error("Presentación no encontrada", 404);
  const items = await db
    .select({ item: presentationItems, asset: mediaAssets })
    .from(presentationItems)
    .innerJoin(mediaAssets, eq(presentationItems.mediaAssetId, mediaAssets.id))
    .where(eq(presentationItems.presentationId, id))
    .orderBy(asc(presentationItems.position));
  return json({
    ...presentation,
    items: items.map(({ item, asset }) => ({
      mediaAssetId: asset.id,
      durationSeconds: item.durationSeconds,
      asset: { ...asset, url: publicUrl(asset.objectKey) },
    })),
  });
}

/** Reemplaza nombre, descripción y la lista completa de elementos (en orden). */
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = (await req.json()) as {
    name: string;
    description?: string | null;
    items: { mediaAssetId: string; durationSeconds: number | null }[];
  };
  if (!body.name?.trim()) return error("Falta el nombre");
  await db.transaction(async (tx) => {
    await tx
      .update(presentations)
      .set({ name: body.name.trim(), description: body.description?.trim() || null, updatedAt: new Date() })
      .where(eq(presentations.id, id));
    await tx.delete(presentationItems).where(eq(presentationItems.presentationId, id));
    if (body.items.length) {
      await tx.insert(presentationItems).values(
        body.items.map((it, position) => ({
          presentationId: id,
          mediaAssetId: it.mediaAssetId,
          position,
          durationSeconds: it.durationSeconds && it.durationSeconds > 0 ? Math.round(it.durationSeconds) : null,
        })),
      );
    }
  });
  await refreshAll();
  return json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await db.delete(presentations).where(eq(presentations.id, id));
  await refreshAll();
  return json({ ok: true });
}
