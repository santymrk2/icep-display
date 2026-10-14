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
    .leftJoin(mediaAssets, eq(presentationItems.mediaAssetId, mediaAssets.id))
    .where(eq(presentationItems.presentationId, id))
    .orderBy(asc(presentationItems.position));
  return json({
    ...presentation,
    /** Lista plana en orden. Un elemento con type "section" es un encabezado que agrupa los siguientes. */
    items: items.map(({ item, asset }) =>
      asset
        ? {
            type: "media" as const,
            mediaAssetId: asset.id,
            durationSeconds: item.durationSeconds,
            fit: item.fit,
            transition: item.transition,
            rotation: item.rotation,
            flipH: item.flipH,
            flipV: item.flipV,
            asset: { ...asset, url: publicUrl(asset.objectKey), thumbnailUrl: asset.thumbnailKey ? publicUrl(asset.thumbnailKey) : null },
          }
        : { type: "section" as const, name: item.sectionName ?? "Sección" },
    ),
  });
}

/** Reemplaza nombre, descripción y la lista completa de elementos (en orden). */
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = (await req.json()) as {
    name: string;
    description?: string | null;
    orientation?: string;
    transition?: string;
    items: ({ type?: "media"; mediaAssetId: string; durationSeconds: number | null; fit?: string; transition?: string | null; rotation?: number; flipH?: boolean; flipV?: boolean } | { type: "section"; name: string })[];
  };
  if (!body.name?.trim()) return error("Falta el nombre");
  if (body.orientation !== undefined && body.orientation !== "landscape" && body.orientation !== "portrait") return error("Orientación inválida");
  if (body.transition !== undefined && body.transition !== "cut" && body.transition !== "dissolve") return error("Transición inválida");
  if (!Array.isArray(body.items)) return error("Faltan los elementos");
  await db.transaction(async (tx) => {
    await tx
      .update(presentations)
      .set({
        name: body.name.trim(),
        description: body.description?.trim() || null,
        ...(body.orientation ? { orientation: body.orientation as "landscape" | "portrait" } : {}),
        ...(body.transition ? { transition: body.transition as "cut" | "dissolve" } : {}),
        updatedAt: new Date(),
      })
      .where(eq(presentations.id, id));
    await tx.delete(presentationItems).where(eq(presentationItems.presentationId, id));
    if (body.items.length) {
      await tx.insert(presentationItems).values(
        body.items.map((it, position) =>
          it.type === "section"
            ? { presentationId: id, mediaAssetId: null, sectionName: it.name?.trim() || "Sección", position, durationSeconds: null }
            : {
                presentationId: id,
                mediaAssetId: it.mediaAssetId,
                position,
                fit: it.fit === "cover" ? "cover" : "contain",
                transition: (it.transition === "cut" || it.transition === "dissolve" ? it.transition : null) as "cut" | "dissolve" | null,
                rotation: it.rotation === 90 || it.rotation === 180 || it.rotation === 270 ? it.rotation : 0,
                flipH: it.flipH === true,
                flipV: it.flipV === true,
                durationSeconds: it.durationSeconds && it.durationSeconds > 0 ? Math.round(it.durationSeconds) : null,
              },
        ),
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
