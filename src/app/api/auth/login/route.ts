import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, sessionCookie, verifyPassword } from "@/lib/auth";
import { error } from "@/lib/http";

// Límite simple de intentos fallidos por IP (en memoria; alcanza para una LAN).
const failures = new Map<string, { count: number; until: number }>();
const MAX_FAILS = 8;
const WINDOW_MS = 10 * 60 * 1000;

export async function POST(req: Request) {
  const ip = req.headers.get("x-client-ip") || "local";
  const f = failures.get(ip);
  if (f && f.until > Date.now() && f.count >= MAX_FAILS) return error("Demasiados intentos. Probá en unos minutos.", 429);

  const body = (await req.json().catch(() => ({}))) as { username?: string; password?: string };
  const username = body.username?.trim() ?? "";
  const [user] = username ? await db.select().from(users).where(eq(users.username, username)) : [];
  // Siempre se calcula el hash aunque el usuario no exista, para no revelar cuáles existen por tiempo de respuesta.
  const ok = await verifyPassword(body.password ?? "", user?.passwordHash ?? "scrypt$00$00").catch(() => false);
  if (!user || !ok) {
    const cur = f && f.until > Date.now() ? f : { count: 0, until: Date.now() + WINDOW_MS };
    failures.set(ip, { count: cur.count + 1, until: cur.until });
    return error("Usuario o contraseña incorrectos", 401);
  }
  failures.delete(ip);
  const { token, expiresAt } = await createSession(user.id);
  const secure = req.headers.get("x-forwarded-proto") === "https";
  return new Response(JSON.stringify({ ok: true, role: user.role }), {
    status: 200,
    headers: { "content-type": "application/json", "set-cookie": sessionCookie(token, expiresAt, secure) },
  });
}
