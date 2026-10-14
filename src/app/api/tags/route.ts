import { asc } from "drizzle-orm";
import { db } from "@/db";
import { devices, tags } from "@/db/schema";
import { error, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Etiquetas del panel + cuántas pantallas usan cada una (incluye las que solo existen en pantallas). */
export async function GET() {
  const [rows, devs] = await Promise.all([
    db.select().from(tags).orderBy(asc(tags.name)),
    db.select({ id: devices.id, name: devices.name, tags: devices.tags }).from(devices),
  ]);
  const used = new Map<string, string[]>();
  for (const d of devs) for (const t of d.tags) used.set(t, [...(used.get(t) ?? []), d.name]);
  const known = new Set(rows.map((r) => r.name));
  const list = rows.map((r) => ({ ...r, devices: used.get(r.name) ?? [] }));
  for (const [name, names] of used)
    if (!known.has(name)) list.push({ id: null as unknown as string, name, description: null, createdAt: null as unknown as Date, devices: names });
  return json(list);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { name?: string; description?: string };
  const name = body.name?.trim().toLowerCase() ?? "";
  if (!name) return error("Falta el nombre");
  if (name.length > 24) return error("La etiqueta puede tener hasta 24 caracteres");
  const [row] = await db
    .insert(tags)
    .values({ name, description: body.description?.trim() || null })
    .onConflictDoNothing()
    .returning();
  if (!row) return error("Esa etiqueta ya existe", 409);
  return json(row, 201);
}
