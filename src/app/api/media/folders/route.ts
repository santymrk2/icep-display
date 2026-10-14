import { asc } from "drizzle-orm";
import { db } from "@/db";
import { mediaFolders } from "@/db/schema";
import { error, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(mediaFolders).orderBy(asc(mediaFolders.name));
  return json(rows);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const name = body.name?.trim() ?? "";
  if (!name) return error("El nombre de la carpeta no puede quedar vacío");
  const [folder] = await db.insert(mediaFolders).values({ name }).returning();
  return json(folder, 201);
}
