import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { db } from "@/db";
import { mediaAssets } from "@/db/schema";
import { error, json } from "@/lib/http";
import { BUCKET, minio, publicUrl } from "@/lib/storage";

/**
 * Subida en streaming: el navegador hace PUT con el archivo como cuerpo crudo,
 * así un video 4K no se carga entero en memoria.
 * Headers: content-type, content-length, x-file-name (URI-encoded), x-duration-seconds (opcional, solo video),
 * x-width / x-height (opcionales, píxeles).
 */
export async function PUT(req: Request) {
  const mimeType = req.headers.get("content-type") ?? "";
  const size = Number(req.headers.get("content-length"));
  const originalName = decodeURIComponent(req.headers.get("x-file-name") ?? "archivo");
  const kind = mimeType.startsWith("image/") ? "image" : mimeType.startsWith("video/") ? "video" : null;
  if (!kind) return error("Solo se aceptan imágenes y videos", 415);
  if (!req.body || !Number.isFinite(size) || size <= 0) return error("Archivo vacío");

  // Duración medida en el navegador (solo videos). Un valor inválido se ignora.
  const durationHeader = Number(req.headers.get("x-duration-seconds"));
  const durationSeconds = kind === "video" && Number.isInteger(durationHeader) && durationHeader > 0 ? durationHeader : null;

  const dim = (name: string) => {
    const n = Number(req.headers.get(name));
    return Number.isInteger(n) && n > 0 && n < 100000 ? n : null;
  };
  const width = dim("x-width");
  const height = dim("x-height");

  const ext = originalName.includes(".") ? originalName.slice(originalName.lastIndexOf(".")).toLowerCase() : "";
  const objectKey = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}${ext}`;

  await minio.putObject(
    BUCKET,
    objectKey,
    Readable.fromWeb(req.body as unknown as WebReadableStream),
    size,
    { "Content-Type": mimeType },
  );

  const [asset] = await db
    .insert(mediaAssets)
    .values({ originalName, objectKey, mimeType, kind, sizeBytes: size, durationSeconds, width, height })
    .returning();
  return json({ ...asset, url: publicUrl(asset.objectKey), thumbnailUrl: asset.thumbnailKey ? publicUrl(asset.thumbnailKey) : null }, 201);
}
