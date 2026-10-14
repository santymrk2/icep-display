import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mediaAssets } from "@/db/schema";
import { refreshAll } from "@/lib/hub";
import { error, json } from "@/lib/http";
import { getSettings, isValidTimezone, updateSettings } from "@/lib/settings";
import { publicUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

async function view() {
  const s = await getSettings();
  let backgroundUrl: string | null = null;
  if (s.defaultBackgroundId) {
    const [a] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, s.defaultBackgroundId));
    if (a) backgroundUrl = publicUrl(a.thumbnailKey ?? a.objectKey);
  }
  return { ...s, backgroundUrl };
}

export async function GET() {
  return json(await view());
}

export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    timezone?: string;
    defaultBackgroundId?: string | null;
    sharePreviewLinks?: boolean;
  };
  if (body.timezone !== undefined && (typeof body.timezone !== "string" || !isValidTimezone(body.timezone)))
    return error("Zona horaria inválida");
  if (body.defaultBackgroundId) {
    const [a] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, body.defaultBackgroundId));
    if (!a || a.kind !== "image") return error("El fondo debe ser una imagen de la biblioteca");
  }
  if (body.sharePreviewLinks !== undefined && typeof body.sharePreviewLinks !== "boolean") return error("Valor inválido");
  await updateSettings(body);
  await refreshAll(true);
  return json(await view());
}
