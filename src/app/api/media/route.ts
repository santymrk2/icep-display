import { desc } from "drizzle-orm";
import { db } from "@/db";
import { mediaAssets } from "@/db/schema";
import { json } from "@/lib/http";
import { publicUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(mediaAssets).orderBy(desc(mediaAssets.uploadedAt));
  return json(
    rows.map((a) => ({ ...a, url: publicUrl(a.objectKey), thumbnailUrl: a.thumbnailKey ? publicUrl(a.thumbnailKey) : null })),
  );
}
