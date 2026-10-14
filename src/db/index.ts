import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const g = globalThis as unknown as { __pg?: ReturnType<typeof postgres> };

const client = g.__pg ?? postgres(process.env.DATABASE_URL ?? "postgres://carteleria:carteleria@localhost:5432/carteleria");
if (process.env.NODE_ENV !== "production") g.__pg = client;

export const db = drizzle(client, { schema });
export { schema };
