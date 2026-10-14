import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { cookieValue, hashPassword, userFromToken } from "@/lib/auth";
import { error, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function otherAdmins(excludeId: string) {
  const rows = await db.select({ id: users.id }).from(users).where(and(eq(users.role, "admin"), ne(users.id, excludeId)));
  return rows.length;
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!UUID.test(id)) return error("Usuario no encontrado", 404);
  const body = (await req.json().catch(() => ({}))) as { password?: string; role?: string };
  const patch: Partial<typeof users.$inferInsert> = {};
  if (body.password !== undefined) {
    if (body.password.length < 8) return error("La contraseña debe tener al menos 8 caracteres");
    patch.passwordHash = await hashPassword(body.password);
  }
  if (body.role !== undefined) {
    if (body.role !== "admin" && body.role !== "operator") return error("Rol inválido");
    if (body.role === "operator" && (await otherAdmins(id)) === 0) return error("Tiene que quedar al menos un administrador", 409);
    patch.role = body.role;
  }
  if (!Object.keys(patch).length) return error("Nada para cambiar");
  const [row] = await db.update(users).set(patch).where(eq(users.id, id)).returning({ id: users.id });
  if (!row) return error("Usuario no encontrado", 404);
  // Cambiar la contraseña cierra las sesiones abiertas de ese usuario.
  if (patch.passwordHash) {
    const me = await userFromToken(cookieValue(req.headers.get("cookie")));
    if (me?.id !== id) await db.delete(sessions).where(eq(sessions.userId, id));
  }
  return json({ ok: true });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!UUID.test(id)) return error("Usuario no encontrado", 404);
  const me = await userFromToken(cookieValue(req.headers.get("cookie")));
  if (me?.id === id) return error("No podés borrar tu propio usuario", 409);
  const [target] = await db.select().from(users).where(eq(users.id, id));
  if (!target) return error("Usuario no encontrado", 404);
  if (target.role === "admin" && (await otherAdmins(id)) === 0) return error("Tiene que quedar al menos un administrador", 409);
  await db.delete(users).where(eq(users.id, id));
  return json({ ok: true });
}
