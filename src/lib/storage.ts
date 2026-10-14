import { Client } from "minio";

export const BUCKET = process.env.MINIO_BUCKET ?? "carteleria";

export const minioHost = process.env.MINIO_ENDPOINT ?? "localhost";
export const minioPort = Number(process.env.MINIO_PORT ?? 9000);

const g = globalThis as unknown as { __minio?: Client };

export const minio =
  g.__minio ??
  (g.__minio = new Client({
    endPoint: minioHost,
    port: minioPort,
    useSSL: process.env.MINIO_USE_SSL === "true",
    accessKey: process.env.MINIO_ACCESS_KEY ?? "carteleria",
    secretKey: process.env.MINIO_SECRET_KEY ?? "carteleria-secret",
  }));

/**
 * Crea el bucket si no existe y habilita lectura anónima de objetos.
 * MinIO no se publica fuera de la red de Docker: los archivos salen por /files/* del servidor.
 */
export async function ensureBucket() {
  if (!(await minio.bucketExists(BUCKET))) await minio.makeBucket(BUCKET);
  await minio.setBucketPolicy(
    BUCKET,
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { AWS: ["*"] },
          Action: ["s3:GetObject"],
          Resource: [`arn:aws:s3:::${BUCKET}/*`],
        },
      ],
    }),
  );
}

/** URL relativa que usan el dashboard y los reproductores. */
export function publicUrl(objectKey: string) {
  return `/files/${objectKey.split("/").map(encodeURIComponent).join("/")}`;
}
