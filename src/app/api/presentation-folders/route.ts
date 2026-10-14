import { asc } from "drizzle-orm";
import { db } from "@/db";
import { presentationFolders } from "@/db/schema";
import { error, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return json(await db.select().from(presentationFolders).orderBy(asc(presentationFolders.name)));
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const name = body.name?.trim() ?? "";
  if (!name) return error("El nombre de la carpeta no puede quedar vacío");
  const [row] = await db.insert(presentationFolders).values({ name }).returning();
  return json(row, 201);
}
