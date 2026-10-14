import { asc } from "drizzle-orm";
import { db } from "@/db";
import { devices } from "@/db/schema";
import { isOnline } from "@/lib/hub";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(devices).orderBy(asc(devices.name));
  return json(
    rows.map(({ connectionToken: _secret, ...d }) => ({ ...d, online: isOnline(d.id) })),
  );
}
