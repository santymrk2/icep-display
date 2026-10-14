import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users, type User } from "@/db/schema";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const SESSION_COOKIE = "carteleria_session";
const SESSION_DAYS = 30;

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, saltHex, keyHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  await db.insert(sessions).values({ tokenHash: sha256(token), userId, expiresAt });
  void db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  return { token, expiresAt };
}

export async function destroySession(token: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
}

export function cookieValue(cookieHeader: string | null | undefined, name = SESSION_COOKIE) {
  for (const part of (cookieHeader ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export async function userFromToken(token: string | null): Promise<User | null> {
  if (!token) return null;
  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())));
  return row?.user ?? null;
}

export function sessionCookie(token: string, expiresAt: Date, secure: boolean) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}${secure ? "; Secure" : ""}`;
}

export function clearedCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/** Crea el primer administrador si no hay usuarios. Devuelve la contraseña si la generó. */
export async function ensureAdmin() {
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length) return;
  const username = process.env.ADMIN_USER || "admin";
  const fromEnv = process.env.ADMIN_PASSWORD;
  const password = fromEnv || randomBytes(9).toString("base64url");
  await db.insert(users).values({ username, passwordHash: await hashPassword(password), role: "admin" });
  if (fromEnv) {
    console.log(`> Usuario administrador "${username}" creado con ADMIN_PASSWORD.`);
  } else {
    console.log("\n========================================================");
    console.log(` Primer inicio: usuario "${username}", contraseña "${password}"`);
    console.log(" Guardala y cambiala desde Usuarios. No se vuelve a mostrar.");
    console.log("========================================================\n");
  }
}

/** Qué puede hacer un operador: ver todo y hacer tomas de control. Todo lo demás es de administrador. */
export function operatorMayCall(method: string, path: string) {
  if (method === "GET" || method === "HEAD") return !path.startsWith("/api/users");
  return path === "/api/takeover" || path === "/api/auth/logout";
}
