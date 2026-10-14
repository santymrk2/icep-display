import { and, isNull } from "drizzle-orm";
import { db } from "@/db";
import { takeovers } from "@/db/schema";
import { refreshAll } from "@/lib/hub";
import { error, json } from "@/lib/http";

/** Envía un archivo o una presentación ya mismo a una pantalla o a todas. */
export async function POST(req: Request) {
  const body = (await req.json()) as {
    mediaAssetId?: string;
    presentationId?: string;
    deviceId?: string | null;
    minutes?: number | null;
  };
  if (!body.mediaAssetId === !body.presentationId) return error("Indicá un archivo o una presentación");
  const endsAt = body.minutes && body.minutes > 0 ? new Date(Date.now() + body.minutes * 60_000) : null;
  await db.insert(takeovers).values({
    mediaAssetId: body.mediaAssetId ?? null,
    presentationId: body.presentationId ?? null,
    deviceId: body.deviceId ?? null,
    endsAt,
  });
  await refreshAll();
  return json({ ok: true }, 201);
}

/** Termina todos los takeovers activos: las pantallas vuelven a su programación. */
export async function DELETE() {
  await db.update(takeovers).set({ endedAt: new Date() }).where(and(isNull(takeovers.endedAt)));
  await refreshAll();
  return json({ ok: true });
}
