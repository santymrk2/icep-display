import { asc } from "drizzle-orm";
import { db } from "@/db";
import { devices } from "@/db/schema";
import { isOnline } from "@/lib/hub";
import { json } from "@/lib/http";
import { effectiveRotation } from "@/lib/orientation";
import { resolvePlayback } from "@/lib/playback";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(devices).orderBy(asc(devices.name));
  return json(
    await Promise.all(
      rows.map(async ({ connectionToken: _secret, ...d }) => {
        const play = await resolvePlayback(d.id);
        // La orientación efectiva de la pantalla tiene en cuenta el giro configurado.
        const swap = d.rotation === 90 || d.rotation === 270;
        const w = d.screenWidth, h = d.screenHeight;
        const screenOrientation = w && h ? ((swap ? w < h : w >= h) ? "landscape" : "portrait") : null;
        const wanted = play.items.length ? play.orientation : null;
        const autoRotated = effectiveRotation(d, wanted).auto;
        return {
          ...d,
          online: isOnline(d.id),
          screenOrientation,
          /** Qué se está mostrando ahora y con qué orientación fue diseñado. */
          content: { source: play.source, label: play.label, orientation: wanted, autoRotated },
        };
      }),
    ),
  );
}
