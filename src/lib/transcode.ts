import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mediaAssets } from "@/db/schema";
import { refreshAll } from "./hub";
import { BUCKET, minio, minioHost, minioPort } from "./storage";

/**
 * Conversión de videos para que los reproduzca cualquier TV.
 * Los decodificadores de hardware de los televisores (Tizen, webOS, Titan OS, Android TV) suelen
 * aceptar solo H.264 hasta Level 4.1 y 1920×1080 (o 1080×1920). Chrome reproduce casi cualquier
 * cosa, por eso un video que se ve en el navegador puede quedar en negro en el TV.
 *
 * Al subir un video se analiza con ffprobe:
 * - Ya compatible: se re-empaqueta sin recodificar (rápido) para poner el índice al principio.
 * - Si no: se convierte a MP4 H.264 Main 4.1, máx. 1920×1080 en su orientación, máx. 30 fps, AAC estéreo.
 * Al terminar se reemplaza el archivo en MinIO y se actualizan las pantallas.
 */

const MAX_LONG = 1920;
const MAX_SHORT = 1080;
const MAX_FPS = 30;

type Probe = {
  streams: {
    codec_type: string;
    codec_name?: string;
    profile?: string;
    level?: number;
    pix_fmt?: string;
    width?: number;
    height?: number;
    avg_frame_rate?: string;
    tags?: { rotate?: string };
    side_data_list?: { rotation?: number }[];
  }[];
  format: { format_name?: string };
};

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err = (err + d).slice(-4000)));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} terminó con código ${code}: ${err.trim()}`))));
  });
}

/** MinIO no se publica fuera de Docker, pero la app lo lee directo (el bucket es de lectura anónima). */
const objectUrl = (key: string) => `http://${minioHost}:${minioPort}/${BUCKET}/${key.split("/").map(encodeURIComponent).join("/")}`;

function fps(rate?: string) {
  const [n, d] = (rate ?? "0/1").split("/").map(Number);
  return d ? n / d : 0;
}

/** Decide cómo procesar el video y con qué tamaño final (ya girado según los metadatos). */
export function plan(probe: Probe) {
  const v = probe.streams.find((s) => s.codec_type === "video");
  const a = probe.streams.find((s) => s.codec_type === "audio");
  if (!v?.width || !v.height) return null;
  const rotation = Math.abs(Number(v.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? v.tags?.rotate ?? 0)) % 180;
  const [w, h] = rotation === 90 ? [v.height, v.width] : [v.width, v.height];
  const rate = fps(v.avg_frame_rate);
  const fits = Math.max(w, h) <= MAX_LONG && Math.min(w, h) <= MAX_SHORT;
  const compatible =
    /mp4/.test(probe.format.format_name ?? "") &&
    v.codec_name === "h264" &&
    /^(Constrained Baseline|Baseline|Main|High)$/.test(v.profile ?? "") &&
    (v.level ?? 99) <= 41 &&
    v.pix_fmt === "yuv420p" &&
    fits &&
    rate <= MAX_FPS + 0.5 &&
    rotation === 0 &&
    (!a || a.codec_name === "aac");
  if (compatible) return { copy: true as const, width: w, height: h };
  const scale = Math.min(1, MAX_LONG / Math.max(w, h), MAX_SHORT / Math.min(w, h));
  const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
  return { copy: false as const, width: even(w), height: even(h), limitFps: rate > MAX_FPS + 0.5 };
}

async function processAsset(id: string) {
  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id));
  if (!asset || asset.kind !== "video") return;
  const input = objectUrl(asset.objectKey);
  const out = join(tmpdir(), `carteleria-${randomUUID()}.mp4`);
  let newKey: string | null = null;
  try {
    const probe = JSON.parse(await run("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", input])) as Probe;
    const p = plan(probe);
    if (!p) throw new Error("no se encontró una pista de video");

    const common = ["-map", "0:v:0", "-map", "0:a:0?", "-sn", "-dn", "-map_metadata", "-1", "-movflags", "+faststart"];
    const args = p.copy
      ? ["-c", "copy"]
      : [
          "-vf", `scale=${p.width}:${p.height}${p.limitFps ? `,fps=${MAX_FPS}` : ""},format=yuv420p`,
          "-c:v", "libx264", "-preset", "veryfast", "-profile:v", "main", "-level:v", "4.1",
          "-crf", "21", "-maxrate", "8M", "-bufsize", "16M",
          "-c:a", "aac", "-b:a", "160k", "-ac", "2", "-ar", "48000",
        ];
    console.log(`> Video ${asset.originalName}: ${p.copy ? "ya compatible, se re-empaqueta" : `se convierte a ${p.width}×${p.height}`}`);
    await run("ffmpeg", ["-v", "error", "-y", "-i", input, ...common, ...args, out]);

    newKey = asset.objectKey.replace(/(\.[^./]*)?$/, "") + "-tv.mp4";
    await minio.fPutObject(BUCKET, newKey, out, { "Content-Type": "video/mp4" });
    const { size } = await stat(out);
    const [updated] = await db
      .update(mediaAssets)
      .set({ objectKey: newKey, mimeType: "video/mp4", sizeBytes: size, width: p.width, height: p.height, processing: false })
      .where(eq(mediaAssets.id, id))
      .returning();
    if (!updated) {
      // Se borró mientras se convertía.
      await minio.removeObject(BUCKET, newKey).catch(() => {});
      return;
    }
    await minio.removeObject(BUCKET, asset.objectKey).catch(() => {});
    console.log(`> Video ${asset.originalName}: listo`);
  } catch (err) {
    // Si falla se deja el original tal cual; puede que igual se reproduzca.
    console.error(`> No se pudo convertir el video ${asset.originalName}:`, (err as Error).message);
    if (newKey) await minio.removeObject(BUCKET, newKey).catch(() => {});
    await db.update(mediaAssets).set({ processing: false }).where(eq(mediaAssets.id, id));
  } finally {
    await unlink(out).catch(() => {});
  }
  await refreshAll();
}

// Un video por vez para no saturar el servidor.
const g = globalThis as unknown as { __transcodeQueue?: Promise<void> };

export function enqueueTranscode(id: string) {
  g.__transcodeQueue = (g.__transcodeQueue ?? Promise.resolve()).then(() => processAsset(id)).catch(console.error);
}

/** Al arrancar retoma los videos que quedaron a medio convertir (por ejemplo, si se reinició el servidor). */
export async function resumeTranscodes() {
  const pending = await db.select({ id: mediaAssets.id }).from(mediaAssets).where(eq(mediaAssets.processing, true));
  for (const { id } of pending) enqueueTranscode(id);
}
