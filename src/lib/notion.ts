import { and, asc, count, eq, gte, isNotNull, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { calendars, meetingTypes, schedules } from "@/db/schema";
import { refreshAll } from "./hub";
import { addDaysISO } from "./recurrence";
import { getSettings, zonedParts } from "./settings";

/**
 * Sincroniza las reuniones de una base de Notion con el calendario.
 * Por cada reunión (fecha + hora de inicio + tipo) crea o actualiza un evento único con la
 * presentación del tipo, desde `minutesBefore` antes hasta `minutesAfter` después del inicio.
 * Si la reunión se borra o se mueve fuera del rango, el evento se borra.
 */

const NOTION_VERSION = "2022-06-28";

export type SyncStatus = {
  configured: boolean;
  running: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  /** Reuniones leídas en la última sincronización. */
  meetings: number;
  /** Eventos creados o actualizados. */
  events: number;
  /** Reuniones que no se pudieron usar (sin hora, sin tipo, tipo sin presentación). */
  skipped: { title: string; date: string | null; reason: string }[];
  /** Propiedades de Notion usadas (para revisar que se detectaron bien). */
  properties: { date: string | null; type: string | null; title: string | null };
};

type State = { status: SyncStatus; running: Promise<SyncStatus> | null; timer: NodeJS.Timeout | null };
const g = globalThis as unknown as { __notion?: State };
const state: State =
  g.__notion ??
  (g.__notion = {
    status: { configured: false, running: false, lastSyncAt: null, lastError: null, meetings: 0, events: 0, skipped: [], properties: { date: null, type: null, title: null } },
    running: null,
    timer: null,
  });

/** Acepta el ID de la base o el link completo de Notion. */
function databaseId() {
  const raw = (process.env.NOTION_DATABASE_ID || process.env.DATABASE_ID)?.trim() ?? "";
  const m = /([0-9a-f]{32})|([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(raw.split("?")[0]);
  return m ? m[0].replace(/-/g, "") : null;
}

/** Acepta también los nombres que usa la página web de la iglesia (NOTION_API_KEY, DATABASE_ID). */
const token = () => (process.env.NOTION_TOKEN || process.env.NOTION_API_KEY)?.trim() ?? "";
export const notionConfigured = () => !!token() && !!databaseId();
/** Propiedades de la base de la iglesia (las que usa la página web); se pueden cambiar por variables de entorno. */
const DATE_PROPERTY = () => process.env.NOTION_DATE_PROPERTY?.trim() || "Fecha";
const TYPE_PROPERTY = () => process.env.NOTION_TYPE_PROPERTY?.trim() || "Tipo de Reunión";
const daysAhead = () => Math.min(Math.max(Number(process.env.NOTION_DAYS_AHEAD) || 60, 7), 365);
const syncMinutes = () => Math.min(Math.max(Number(process.env.NOTION_SYNC_MINUTES) || 10, 1), 24 * 60);

type NotionProp = { type: string; [k: string]: unknown };
type NotionPage = { id: string; archived?: boolean; in_trash?: boolean; properties: Record<string, NotionProp> };

async function notion<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token()}`,
      "notion-version": NOTION_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) {
    if (res.status === 401) throw new Error("Notion rechazó el token (NOTION_TOKEN)");
    if (res.status === 404) throw new Error("Notion no encuentra la base: compartila con la integración (Conexiones) y revisá NOTION_DATABASE_ID");
    throw new Error(`Notion respondió ${res.status}: ${data.message ?? "error"}`);
  }
  return data as T;
}

const plain = (v: unknown) => (Array.isArray(v) ? v.map((t: { plain_text?: string }) => t.plain_text ?? "").join("").trim() : "");

/** Elige las propiedades a usar: las de las variables de entorno o, si no, las primeras de cada tipo. */
function pickProps(page: NotionPage) {
  const entries = Object.entries(page.properties);
  const byName = (name: string) => (page.properties[name] ? name : null);
  const first = (...types: string[]) => entries.find(([, p]) => types.includes(p.type))?.[0] ?? null;
  const title = first("title");
  return {
    title,
    date: byName(DATE_PROPERTY()) ?? first("date"),
    // Sin propiedad de tipo, el tipo es el título de la reunión.
    type: byName(TYPE_PROPERTY()) ?? first("select", "status", "multi_select") ?? title,
  };
}

function propText(p: NotionProp | undefined): string {
  if (!p) return "";
  const v = p[p.type] as unknown;
  switch (p.type) {
    case "title":
    case "rich_text":
      return plain(v);
    case "select":
    case "status":
      return ((v as { name?: string } | null)?.name ?? "").trim();
    case "multi_select":
      return ((v as { name?: string }[])[0]?.name ?? "").trim();
    case "formula":
      return String((v as { string?: string } | null)?.string ?? "").trim();
    default:
      return "";
  }
}

/**
 * Fecha y hora de inicio "de pared" en la zona del sistema. Notion manda "2026-10-14T20:00:00.000-03:00"
 * (con desfase) o "2026-10-14" (sin hora: minutes = null, se usa la hora por defecto del tipo).
 */
function startOf(p: NotionProp | undefined, timeZone: string): { date: string; minutes: number | null } | null {
  const start = (p?.type === "date" ? (p.date as { start?: string } | null)?.start : null) ?? null;
  if (!start) return null;
  if (!start.includes("T")) return /^\d{4}-\d{2}-\d{2}$/.test(start) ? { date: start, minutes: null } : null;
  const hasOffset = /([+-]\d{2}:?\d{2}|Z)$/.test(start);
  if (!hasOffset) {
    // Sin desfase, Notion indica la hora tal cual en su time_zone; la tomamos como hora local.
    const [date, time] = start.split("T");
    const [h, m] = time.split(":").map(Number);
    return { date, minutes: h * 60 + m };
  }
  const z = zonedParts(new Date(start), timeZone);
  const [h, m] = z.time.split(":").map(Number);
  return { date: z.date, minutes: h * 60 + m };
}

const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fmt = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const dowBit = (date: string) => 1 << new Date(`${date}T12:00:00Z`).getUTCDay();

async function run(): Promise<SyncStatus> {
  const status: SyncStatus = { ...state.status, configured: notionConfigured(), running: true, skipped: [], meetings: 0, events: 0 };
  state.status = status;
  if (!status.configured) {
    state.status = { ...status, running: false, lastError: null };
    return state.status;
  }
  try {
    const { timezone } = await getSettings();
    const today = zonedParts(new Date(), timezone).date;
    const from = addDaysISO(today, -1);
    const until = addDaysISO(today, daysAhead());

    // Todas las páginas de la base en el rango. Se detecta la propiedad de fecha con la primera página.
    const pages: NotionPage[] = [];
    let cursor: string | undefined;
    // Se mira una página para confirmar la propiedad de fecha ("Fecha") o detectar otra.
    const probe = await notion<{ results: NotionPage[] }>(`/databases/${databaseId()}/query`, { page_size: 1 });
    const dateProp = probe.results[0] ? pickProps(probe.results[0]).date : null;
    if (probe.results[0] && !dateProp) throw new Error("La base de Notion no tiene una propiedad de fecha");
    if (dateProp) {
      do {
        const r = await notion<{ results: NotionPage[]; has_more: boolean; next_cursor: string | null }>(`/databases/${databaseId()}/query`, {
          page_size: 100,
          start_cursor: cursor,
          filter: { and: [{ property: dateProp, date: { on_or_after: from } }, { property: dateProp, date: { on_or_before: until } }] },
        });
        pages.push(...r.results.filter((p) => !p.archived && !p.in_trash));
        cursor = r.has_more && r.next_cursor ? r.next_cursor : undefined;
      } while (cursor);
    }

    const [firstCal] = await db.select({ id: calendars.id }).from(calendars).orderBy(asc(calendars.createdAt)).limit(1);
    const types = new Map((await db.select().from(meetingTypes)).map((t) => [t.name.toLowerCase(), t]));
    const seen: string[] = [];
    let changed = false;

    for (const page of pages) {
      const props = pickProps(page);
      status.properties = { date: dateProp, type: props.type, title: props.title };
      const title = propText(page.properties[props.title ?? ""]);
      const typeName = propText(page.properties[props.type ?? ""]);
      const start = startOf(page.properties[dateProp!], timezone);
      status.meetings++;
      const skip = (reason: string) => status.skipped.push({ title: title || typeName || "(sin título)", date: start?.date ?? null, reason });
      if (!start) {
        skip("No tiene fecha");
        continue;
      }
      if (!typeName) {
        skip("No tiene tipo de reunión");
        continue;
      }

      let type = types.get(typeName.toLowerCase());
      if (!type) {
        [type] = await db.insert(meetingTypes).values({ name: typeName }).onConflictDoNothing().returning();
        type ??= (await db.select().from(meetingTypes).where(eq(meetingTypes.name, typeName)))[0];
        types.set(typeName.toLowerCase(), type);
      }
      const calendarId = type.calendarId ?? firstCal?.id;
      if (!type.enabled) continue; // el evento que hubiera se borra abajo
      if (!type.presentationId) {
        skip(`El tipo "${type.name}" no tiene presentación`);
        continue;
      }
      if (!calendarId) {
        skip("No hay ningún calendario");
        continue;
      }

      // Sin hora en Notion se usa la hora habitual del tipo (como hace la página web).
      const startMin = start.minutes ?? (type.defaultStartTime ? toMinutes(type.defaultStartTime) : null);
      if (startMin === null) {
        skip(`No tiene hora y el tipo "${type.name}" no tiene hora habitual`);
        continue;
      }
      // Se recorta al mismo día: el calendario no tiene eventos que crucen la medianoche.
      const begin = Math.max(0, startMin - type.minutesBefore);
      const end = Math.min(23 * 60 + 59, startMin + type.minutesAfter);
      if (end <= begin) {
        skip("El horario queda vacío con los minutos configurados");
        continue;
      }
      const values = {
        // El tipo es lo que identifica la reunión (la web tampoco usa el título).
        name: type.name,
        presentationId: type.presentationId,
        calendarId,
        groupId: null,
        allDay: false,
        freq: "none" as const,
        interval: 1,
        endsMode: "never" as const,
        endsAfter: null,
        daysOfWeek: dowBit(start.date),
        startTime: `${fmt(begin)}:00`,
        endTime: `${fmt(end)}:00`,
        validFrom: start.date,
        validUntil: null,
        enabled: true,
        meetingTypeId: type.id,
      };
      seen.push(page.id);
      const [existing] = await db.select().from(schedules).where(eq(schedules.notionPageId, page.id));
      if (!existing) {
        await db.insert(schedules).values({ ...values, notionPageId: page.id });
        changed = true;
      } else if ((Object.keys(values) as (keyof typeof values)[]).some((k) => existing[k] !== values[k])) {
        await db.update(schedules).set(values).where(eq(schedules.id, existing.id));
        changed = true;
      }
      status.events++;
    }

    // Reuniones canceladas, movidas fuera del rango o de tipos sin configurar: se borran sus eventos.
    const stale = and(isNotNull(schedules.notionPageId), gte(schedules.validFrom, from), seen.length ? notInArray(schedules.notionPageId, seen) : undefined);
    const removed = await db.delete(schedules).where(stale).returning({ id: schedules.id });
    if (removed.length) changed = true;
    if (changed) await refreshAll();

    state.status = { ...status, running: false, lastSyncAt: new Date().toISOString(), lastError: null };
  } catch (err) {
    console.error("> Notion:", err);
    state.status = { ...status, running: false, lastSyncAt: new Date().toISOString(), lastError: (err as Error).message };
  }
  return state.status;
}

/** Corre una sincronización (si ya hay una en curso, espera esa). */
export function syncNotion(): Promise<SyncStatus> {
  state.running ??= run().finally(() => (state.running = null));
  return state.running;
}

export const notionStatus = (): SyncStatus => ({ ...state.status, configured: notionConfigured(), running: !!state.running });

/** Arranca la sincronización periódica (desde server.ts). */
export function startNotionSync() {
  if (!notionConfigured()) {
    console.log("> Notion: sin NOTION_TOKEN / NOTION_DATABASE_ID, no se sincronizan reuniones");
    return;
  }
  if (state.timer) clearInterval(state.timer);
  void syncNotion();
  state.timer = setInterval(() => void syncNotion(), syncMinutes() * 60_000);
  console.log(`> Notion: sincronizando reuniones cada ${syncMinutes()} min`);
}

/** Tipos de reunión con la cantidad de eventos generados, más el estado de la sincronización. */
export async function meetingTypesView() {
  const types = await db.select().from(meetingTypes).orderBy(asc(meetingTypes.name));
  const counts = await db
    .select({ id: schedules.meetingTypeId, n: count() })
    .from(schedules)
    .where(isNotNull(schedules.meetingTypeId))
    .groupBy(schedules.meetingTypeId);
  const byId = new Map(counts.map((c) => [c.id, c.n]));
  return { status: notionStatus(), types: types.map((t) => ({ ...t, eventCount: byId.get(t.id) ?? 0 })) };
}
