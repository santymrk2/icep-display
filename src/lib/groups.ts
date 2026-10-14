import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { deviceGroups } from "@/db/schema";

/** Valida el nombre de un grupo y que no exista otro con el mismo nombre (sin distinguir mayúsculas). */
export async function checkGroupName(raw: unknown, selfId?: string): Promise<{ error: string } | { name: string }> {
  if (typeof raw !== "string" || !raw.trim()) return { error: "Falta el nombre del grupo" };
  const name = raw.trim();
  const conds = [sql`lower(${deviceGroups.name}) = lower(${name})`];
  if (selfId) conds.push(ne(deviceGroups.id, selfId));
  const [dup] = await db
    .select({ id: deviceGroups.id })
    .from(deviceGroups)
    .where(and(...conds));
  if (dup) return { error: "Ya existe un grupo con ese nombre" };
  return { name };
}

export const groupExists = async (id: string) => {
  const [g] = await db.select({ id: deviceGroups.id }).from(deviceGroups).where(eq(deviceGroups.id, id));
  return !!g;
};
