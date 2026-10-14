import { eq } from "drizzle-orm";
import { db } from "@/db";
import { deviceGroups, devices } from "@/db/schema";
import { disconnectDevice, refreshDevice } from "@/lib/hub";
import { error, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 24;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Recorta, descarta vacíos, pasa a minúsculas y elimina duplicados (sin distinguir mayúsculas). */
function normalizeTags(input: unknown[]): string[] | string {
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") return "Las etiquetas deben ser texto";
    const tag = raw.trim().toLowerCase();
    if (!tag) continue;
    if (tag.length > MAX_TAG_LENGTH) return `Cada etiqueta puede tener hasta ${MAX_TAG_LENGTH} caracteres`;
    if (!out.includes(tag)) out.push(tag);
  }
  if (out.length > MAX_TAGS) return `Una pantalla puede tener hasta ${MAX_TAGS} etiquetas`;
  return out;
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = (await req.json()) as {
    name?: string;
    location?: string | null;
    defaultPresentationId?: string | null;
    tags?: unknown;
    groupId?: string | null;
    rotation?: number;
  };
  const patch: Partial<typeof devices.$inferInsert> = {};
  if (body.name !== undefined) {
    if (!body.name.trim()) return error("El nombre no puede quedar vacío");
    patch.name = body.name.trim();
  }
  if (body.location !== undefined) patch.location = body.location?.trim() || null;
  if (body.defaultPresentationId !== undefined) patch.defaultPresentationId = body.defaultPresentationId;
  if (body.rotation !== undefined) {
    if (![0, 90, 180, 270].includes(body.rotation)) return error("El giro debe ser 0, 90, 180 o 270");
    patch.rotation = body.rotation;
  }
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags)) return error("Las etiquetas deben ser una lista");
    const tags = normalizeTags(body.tags);
    if (typeof tags === "string") return error(tags);
    patch.tags = tags;
  }
  if (body.groupId !== undefined) {
    if (body.groupId === null) {
      patch.groupId = null;
    } else {
      if (typeof body.groupId !== "string" || !UUID_RE.test(body.groupId)) return error("Grupo inválido");
      const [group] = await db
        .select({ id: deviceGroups.id })
        .from(deviceGroups)
        .where(eq(deviceGroups.id, body.groupId));
      if (!group) return error("El grupo no existe");
      patch.groupId = group.id;
    }
  }
  const [row] = await db.update(devices).set(patch).where(eq(devices.id, id)).returning({ id: devices.id });
  if (!row) return error("Pantalla no encontrada", 404);
  await refreshDevice(id);
  return json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  disconnectDevice(id);
  await db.delete(devices).where(eq(devices.id, id));
  return json({ ok: true });
}
