import { db } from "@/db";
import { meetingTypes } from "@/db/schema";
import { error, json } from "@/lib/http";
import { meetingTypesView as view } from "@/lib/notion";

export const dynamic = "force-dynamic";

export async function GET() {
  return json(await view());
}

/** Agrega un tipo a mano (los que aparecen en Notion se agregan solos). */
export async function POST(req: Request) {
  const { name } = (await req.json().catch(() => ({}))) as { name?: unknown };
  if (typeof name !== "string" || !name.trim()) return error("Falta el nombre");
  const [row] = await db.insert(meetingTypes).values({ name: name.trim() }).onConflictDoNothing().returning();
  if (!row) return error("Ya existe un tipo con ese nombre", 409);
  return json(row, 201);
}
