import { and, asc, desc, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { devices, mediaAssets, presentationItems, presentations, schedules, takeovers } from "@/db/schema";
import { publicUrl } from "./storage";
import type { PlayItem, ServerMessage } from "./protocol";

const DEFAULT_IMAGE_SECONDS = 10;

async function presentationPlayItems(presentationId: string): Promise<PlayItem[]> {
  const rows = await db
    .select({ item: presentationItems, asset: mediaAssets })
    .from(presentationItems)
    .innerJoin(mediaAssets, eq(presentationItems.mediaAssetId, mediaAssets.id))
    .where(eq(presentationItems.presentationId, presentationId))
    .orderBy(asc(presentationItems.position));
  return rows.map(({ item, asset }) => ({
    id: item.id,
    url: publicUrl(asset.objectKey),
    kind: asset.kind,
    durationSeconds: item.durationSeconds ?? (asset.kind === "image" ? DEFAULT_IMAGE_SECONDS : null),
  }));
}

async function presentationName(id: string) {
  const [p] = await db.select({ name: presentations.name }).from(presentations).where(eq(presentations.id, id));
  return p?.name ?? null;
}

function hhmm(d: Date) {
  return d.toTimeString().slice(0, 8);
}

function isoDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Decide qué tiene que mostrar una pantalla ahora mismo.
 * Prioridad: takeover activo > programación vigente > presentación por defecto.
 * La hora local del servidor (variable TZ) define las franjas.
 */
export async function resolvePlayback(deviceId: string, now = new Date()): Promise<Extract<ServerMessage, { type: "play" }>> {
  const [device] = await db.select().from(devices).where(eq(devices.id, deviceId));
  if (!device) return { type: "play", source: "none", label: null, items: [] };

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
      return {
        type: "play",
        source: "takeover",
        label: asset.originalName,
        items: [{ id: asset.id, url: publicUrl(asset.objectKey), kind: asset.kind, durationSeconds: null }],
      };
    }
  }
  if (takeover?.presentationId) {
    return {
      type: "play",
      source: "takeover",
      label: await presentationName(takeover.presentationId),
      items: await presentationPlayItems(takeover.presentationId),
    };
  }

  const candidates = await db
    .select()
    .from(schedules)
    .where(
      and(
        eq(schedules.enabled, true),
        or(
          eq(schedules.deviceId, deviceId),
          device.groupId ? eq(schedules.groupId, device.groupId) : undefined,
          and(isNull(schedules.deviceId), isNull(schedules.groupId)),
        ),
      ),
    )
    .orderBy(desc(schedules.priority));

  const time = hhmm(now);
  const today = isoDate(now);
  const dayBit = 1 << now.getDay();
  const active = candidates.find(
    (s) =>
      (s.daysOfWeek & dayBit) !== 0 &&
      s.startTime <= time &&
      time < s.endTime &&
      (!s.validFrom || s.validFrom <= today) &&
      (!s.validUntil || today <= s.validUntil),
  );
  if (active) {
    return {
      type: "play",
      source: "schedule",
      label: active.name,
      items: await presentationPlayItems(active.presentationId),
    };
  }

  if (device.defaultPresentationId) {
    return {
      type: "play",
      source: "default",
      label: await presentationName(device.defaultPresentationId),
      items: await presentationPlayItems(device.defaultPresentationId),
    };
  }
  return { type: "play", source: "none", label: null, items: [] };
}
