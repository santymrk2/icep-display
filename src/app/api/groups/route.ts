import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { deviceGroups, devices } from "@/db/schema";
import { refreshAll } from "@/lib/hub";
import { error, json } from "@/lib/http";
import { checkGroupName } from "@/lib/groups";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select({
      id: deviceGroups.id,
      name: deviceGroups.name,
      deviceCount: sql<number>`count(${devices.id})::int`,
    })
    .from(deviceGroups)
    .leftJoin(devices, eq(devices.groupId, deviceGroups.id))
    .groupBy(deviceGroups.id)
    .orderBy(asc(deviceGroups.name));
  return json(rows);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { name?: unknown };
  const checked = await checkGroupName(body.name);
  if ("error" in checked) return error(checked.error);
  const [row] = await db.insert(deviceGroups).values({ name: checked.name }).returning({ id: deviceGroups.id, name: deviceGroups.name });
  await refreshAll();
  return json({ ...row, deviceCount: 0 }, 201);
}
