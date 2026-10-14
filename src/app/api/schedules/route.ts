import { asc } from "drizzle-orm";
import { db } from "@/db";
import { schedules } from "@/db/schema";
import { refreshAll } from "@/lib/hub";
import { error, json } from "@/lib/http";
import { checkSchedule, findConflict, type ScheduleBody } from "@/lib/schedules";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(schedules).orderBy(asc(schedules.name));
  return json(rows);
}

export async function POST(req: Request) {
  const checked = await checkSchedule((await req.json()) as ScheduleBody);
  if ("error" in checked) return error(checked.error);
  const conflict = await findConflict(checked.values);
  if (conflict) return error(conflict, 409);
  const [row] = await db.insert(schedules).values(checked.values).returning();
  await refreshAll();
  return json(row, 201);
}
