import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { presentationItems, presentations } from "@/db/schema";
import { error, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select({
      id: presentations.id,
      name: presentations.name,
      description: presentations.description,
      updatedAt: presentations.updatedAt,
      itemCount: sql<number>`count(${presentationItems.id})::int`,
    })
    .from(presentations)
    .leftJoin(presentationItems, eq(presentationItems.presentationId, presentations.id))
    .groupBy(presentations.id)
    .orderBy(desc(presentations.updatedAt));
  return json(rows);
}

export async function POST(req: Request) {
  const body = (await req.json()) as { name?: string; description?: string };
  if (!body.name?.trim()) return error("Falta el nombre");
  const [row] = await db
    .insert(presentations)
    .values({ name: body.name.trim(), description: body.description?.trim() || null })
    .returning();
  return json(row, 201);
}
