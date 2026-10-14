import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mediaAssets, settings } from "@/db/schema";
import { publicUrl } from "./storage";

export type AppSettings = {
  /** Zona horaria IANA que usan los calendarios. */
  timezone: string;
  /** Imagen que se muestra cuando no hay contenido (hueco en la programación). */
  defaultBackgroundId: string | null;
  sharePreviewLinks: boolean;
};

const DEFAULTS: AppSettings = {
  timezone: process.env.TZ || "America/Argentina/Buenos_Aires",
  defaultBackgroundId: null,
  sharePreviewLinks: true,
};

let cache: { at: number; value: AppSettings } | null = null;

export function isValidTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function getSettings(): Promise<AppSettings> {
  if (cache && Date.now() - cache.at < 5000) return cache.value;
  const rows = await db.select().from(settings);
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const tz = map.get("timezone");
  const value: AppSettings = {
    timezone: tz && isValidTimezone(tz) ? tz : DEFAULTS.timezone,
    defaultBackgroundId: map.get("defaultBackgroundId") || null,
    sharePreviewLinks: map.has("sharePreviewLinks") ? map.get("sharePreviewLinks") === "true" : DEFAULTS.sharePreviewLinks,
  };
  cache = { at: Date.now(), value };
  return value;
}

export async function updateSettings(patch: Partial<AppSettings>) {
  const entries: [string, string][] = [];
  if (patch.timezone !== undefined) entries.push(["timezone", patch.timezone]);
  if (patch.defaultBackgroundId !== undefined) entries.push(["defaultBackgroundId", patch.defaultBackgroundId ?? ""]);
  if (patch.sharePreviewLinks !== undefined) entries.push(["sharePreviewLinks", String(patch.sharePreviewLinks)]);
  for (const [key, value] of entries) {
    await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
  }
  cache = null;
}

export async function backgroundUrl(settingsValue?: AppSettings): Promise<string | null> {
  const s = settingsValue ?? (await getSettings());
  if (!s.defaultBackgroundId) return null;
  const [a] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, s.defaultBackgroundId));
  return a && a.kind === "image" ? publicUrl(a.objectKey) : null;
}

/** Fecha y hora "de pared" en una zona horaria: día de la semana, HH:MM:SS y AAAA-MM-DD. */
export function zonedParts(d: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return {
    day: dow,
    time: `${get("hour")}:${get("minute")}:${get("second")}`,
    date: `${get("year")}-${get("month")}-${get("day")}`,
  };
}
