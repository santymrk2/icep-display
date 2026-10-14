import { asc } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { error, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select({ id: users.id, username: users.username, role: users.role, createdAt: users.createdAt })
    .from(users)
    .orderBy(asc(users.username));
  return json(rows);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { username?: string; password?: string; role?: string };
  const username = body.username?.trim() ?? "";
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) return error("El usuario debe tener 3 a 32 letras, números, punto, guion o guion bajo");
  if ((body.password ?? "").length < 8) return error("La contraseña debe tener al menos 8 caracteres");
  if (body.role !== "admin" && body.role !== "operator") return error("Rol inválido");
  try {
    const [row] = await db
      .insert(users)
      .values({ username, passwordHash: await hashPassword(body.password!), role: body.role })
      .returning({ id: users.id, username: users.username, role: users.role });
    return json(row, 201);
  } catch {
    return error("Ya existe un usuario con ese nombre", 409);
  }
}
