import { eq } from "drizzle-orm";
import { schedules } from "@/db/schema";
import { refreshAll } from "@/lib/hub";
import { error, json } from "@/lib/http";
import { checkSchedule, findConflict, loadSchedules, saveSchedule, type ScheduleBody } from "@/lib/schedules";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await loadSchedules();
  return json(rows.sort((a, b) => a.name.localeCompare(b.name)));
}

export async function POST(req: Request) {
  const checked = await checkSchedule((await req.json()) as ScheduleBody);
  if ("error" in checked) return error(checked.error);
  const conflict = await findConflict(checked.values);
  if (conflict) return error(conflict, 409);
  const id = await saveSchedule(checked.values);
  await refreshAll();
  const [row] = await loadSchedules(eq(schedules.id, id));
  return json(row, 201);
}
