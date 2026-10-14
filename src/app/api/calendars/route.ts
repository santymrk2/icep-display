import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { calendars, devices, schedules } from "@/db/schema";
import { error, json } from "@/lib/http";

export const dynamic = "force-dynamic";

const HEX = /^#[0-9a-f]{6}$/i;

export async function GET() {
  const rows = await db.select().from(calendars).orderBy(asc(calendars.createdAt));
  const [devCounts, evCounts] = await Promise.all([
    db.select({ id: devices.calendarId, n: sql<number>`count(*)::int` }).from(devices).groupBy(devices.calendarId),
    db.select({ id: schedules.calendarId, n: sql<number>`count(*)::int` }).from(schedules).groupBy(schedules.calendarId),
  ]);
  return json(
    rows.map((c) => ({
      ...c,
      deviceCount: devCounts.find((d) => d.id === c.id)?.n ?? 0,
      eventCount: evCounts.find((d) => d.id === c.id)?.n ?? 0,
    })),
  );
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { name?: string; color?: string };
  const name = body.name?.trim() ?? "";
  if (!name) return error("Falta el nombre del calendario");
  if (body.color !== undefined && !HEX.test(body.color)) return error("Color inválido");
  const [dup] = await db.select({ id: calendars.id }).from(calendars).where(sql`lower(${calendars.name}) = lower(${name})`);
  if (dup) return error("Ya existe un calendario con ese nombre", 409);
  const [row] = await db.insert(calendars).values({ name, color: body.color }).returning();
  return json({ ...row, deviceCount: 0, eventCount: 0 }, 201);
}
