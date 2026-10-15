import { and, asc, desc, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { devices, mediaAssets, presentationItems, presentations, schedules, takeovers } from "@/db/schema";
import { effectiveRotation } from "./orientation";
import { loadSchedules } from "./schedules";
import { occursOn } from "./recurrence";
import { publicUrl } from "./storage";
import { backgroundUrl, getSettings, zonedParts } from "./settings";
import type { PlayItem, PlaySource, ServerMessage } from "./protocol";

const DEFAULT_IMAGE_SECONDS = 10;

type Style = { orientation: "landscape" | "portrait"; transition: "cut" | "dissolve" };
const DEFAULT_STYLE: Style = { orientation: "landscape", transition: "cut" };

async function presentationPlayItems(presentationId: string): Promise<{ items: PlayItem[]; style: Style }> {
  const [p] = await db
    .select({ orientation: presentations.orientation, transition: presentations.transition, defaultDurationSeconds: presentations.defaultDurationSeconds })
    .from(presentations)
    .where(eq(presentations.id, presentationId));
  const rows = await db
    .select({ item: presentationItems, asset: mediaAssets })
    .from(presentationItems)
    .innerJoin(mediaAssets, eq(presentationItems.mediaAssetId, mediaAssets.id))
    .where(eq(presentationItems.presentationId, presentationId))
    .orderBy(asc(presentationItems.position));
  const imageSeconds = p?.defaultDurationSeconds ?? DEFAULT_IMAGE_SECONDS;
  const items = rows.map(({ item, asset }) => ({
    id: item.id,
    url: publicUrl(asset.objectKey),
    kind: asset.kind,
    durationSeconds: item.durationSeconds ?? (asset.kind === "image" ? imageSeconds : null),
    fit: item.fit === "cover" ? ("cover" as const) : ("contain" as const),
    transition: item.transition,
    rotation: item.rotation,
    flipH: item.flipH,
    flipV: item.flipV,
  }));
  return { items, style: p ? { orientation: p.orientation, transition: p.transition } : DEFAULT_STYLE };
}

async function presentationName(id: string) {
  const [p] = await db.select({ name: presentations.name }).from(presentations).where(eq(presentations.id, id));
  return p?.name ?? null;
}

/**
 * Decide qué tiene que mostrar una pantalla ahora mismo.
 * Prioridad: takeover activo > programación vigente > presentación por defecto.
 * La hora local del servidor (variable TZ) define las franjas.
 */
export async function resolvePlayback(deviceId: string, now = new Date()): Promise<Extract<ServerMessage, { type: "play" }>> {
  const [device] = await db
    .select({ rotation: devices.rotation, screenWidth: devices.screenWidth, screenHeight: devices.screenHeight })
    .from(devices)
    .where(eq(devices.id, deviceId));
  const cfg = await getSettings();
  const base = await resolveContent(deviceId, now, cfg.timezone);
  return {
    type: "play",
    source: base.source,
    label: base.label,
    items: base.items,
    orientation: base.style.orientation,
    transition: base.style.transition,
    rotation: device ? effectiveRotation(device, base.items.length ? base.style.orientation : null).rotation : 0,
    background: await backgroundUrl(cfg),
  };
}

type Content = { source: PlaySource; label: string | null; items: PlayItem[]; style: Style };

async function resolveContent(deviceId: string, now: Date, timeZone: string): Promise<Content> {
  const [device] = await db.select().from(devices).where(eq(devices.id, deviceId));
  if (!device) return { source: "none", label: null, items: [], style: DEFAULT_STYLE };

  const [takeover] = await db
    .select()
    .from(takeovers)
    .where(
      and(
        isNull(takeovers.endedAt),
        or(isNull(takeovers.endsAt), gt(takeovers.endsAt, now)),
        or(isNull(takeovers.deviceId), eq(takeovers.deviceId, deviceId)),
      ),
    )
    .orderBy(desc(takeovers.startedAt))
    .limit(1);

  if (takeover?.mediaAssetId) {
    const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, takeover.mediaAssetId));
    if (asset) {
      const portrait = asset.width && asset.height && asset.height > asset.width;
      return {
        source: "takeover",
        label: asset.originalName,
        items: [{ id: asset.id, url: publicUrl(asset.objectKey), kind: asset.kind, durationSeconds: null, fit: "contain", transition: null, rotation: 0, flipH: false, flipV: false }],
        style: { orientation: portrait ? "portrait" : "landscape", transition: "cut" },
      };
    }
  }
  if (takeover?.presentationId) {
    const r = await presentationPlayItems(takeover.presentationId);
    return { source: "takeover", label: await presentationName(takeover.presentationId), items: r.items, style: r.style };
  }

  // Sin calendario suscripto no hay contenido programado (queda la presentación por defecto).
  const all = device.calendarId
    ? await loadSchedules(and(eq(schedules.enabled, true), eq(schedules.calendarId, device.calendarId)))
    : [];
  const candidates = all
    .filter(
      (s) =>
        s.deviceIds.includes(deviceId) ||
        (s.groupId !== null && s.groupId === device.groupId) ||
        (s.groupId === null && s.deviceIds.length === 0),
    )
    .sort((x, y) => y.priority - x.priority);
  // Especificidad primero (pantalla > grupo > todas); dentro de cada nivel manda la prioridad (sort es estable).
  const specificity = (s: (typeof candidates)[number]) => (s.deviceIds.length ? 0 : s.groupId ? 1 : 2);
  candidates.sort((a, b) => specificity(a) - specificity(b));

  const zoned = zonedParts(now, timeZone);
  const time = zoned.time;
  const today = zoned.date;
  const active = candidates.find(
    (s) => (s.allDay || (s.startTime <= time && time < s.endTime)) && occursOn(s, today),
  );
  if (active) {
    const r = await presentationPlayItems(active.presentationId);
    return { source: "schedule", label: active.name, items: r.items, style: r.style };
  }

  if (device.defaultPresentationId) {
    const r = await presentationPlayItems(device.defaultPresentationId);
    return { source: "default", label: await presentationName(device.defaultPresentationId), items: r.items, style: r.style };
  }
  return { source: "none", label: null, items: [], style: DEFAULT_STYLE };
}
