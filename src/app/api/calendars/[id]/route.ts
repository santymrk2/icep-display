import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { calendars } from "@/db/schema";
import { refreshAll } from "@/lib/hub";
import { error, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };
const HEX = /^#[0-9a-f]{6}$/i;

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { name?: string; color?: string };
  const patch: { name?: string; color?: string } = {};
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) return error("Falta el nombre del calendario");
    const [dup] = await db
      .select({ id: calendars.id })
      .from(calendars)
      .where(and(sql`lower(${calendars.name}) = lower(${name})`, ne(calendars.id, id)));
    if (dup) return error("Ya existe un calendario con ese nombre", 409);
    patch.name = name;
  }
  if (body.color !== undefined) {
    if (!HEX.test(body.color)) return error("Color inválido");
    patch.color = body.color;
  }
  if (!Object.keys(patch).length) return error("Nada para actualizar");
  const [row] = await db.update(calendars).set(patch).where(eq(calendars.id, id)).returning();
  if (!row) return error("Calendario no encontrado", 404);
  return json(row);
}

/** Borra el calendario y sus eventos; las pantallas suscriptas quedan sin calendario. No se puede borrar el último. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(calendars);
  if (n <= 1) return error("Tiene que quedar al menos un calendario");
  const [row] = await db.delete(calendars).where(eq(calendars.id, id)).returning({ id: calendars.id });
  if (!row) return error("Calendario no encontrado", 404);
  await refreshAll();
  return json({ ok: true });
}
