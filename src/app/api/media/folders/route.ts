import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { mediaFolders } from "@/db/schema";
import { error, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(mediaFolders).orderBy(asc(mediaFolders.name));
  return json(rows);
}

/** Crea una carpeta en la raíz o, con parentId, dentro de otra carpeta. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { name?: string; color?: string; parentId?: string | null };
  const name = body.name?.trim() ?? "";
  if (!name) return error("El nombre de la carpeta no puede quedar vacío");
  const color = body.color && /^#[0-9a-f]{6}$/i.test(body.color) ? body.color : undefined;
  const parentId = body.parentId ?? null;
  if (parentId) {
    const [parent] = await db.select({ id: mediaFolders.id }).from(mediaFolders).where(eq(mediaFolders.id, parentId));
    if (!parent) return error("Carpeta no encontrada");
  }
  const [folder] = await db.insert(mediaFolders).values({ name, color, parentId }).returning();
  return json(folder, 201);
}
