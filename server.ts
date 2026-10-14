import { createServer, request as httpRequest } from "node:http";
import { parse } from "node:url";
import next from "next";
import { WebSocketServer, type WebSocket } from "ws";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { db } from "@/db";
import { devices } from "@/db/schema";
import { BUCKET, ensureBucket, minioHost, minioPort } from "@/lib/storage";
import { attachDevice, createPairingCode, refreshAll, refreshDevice, send } from "@/lib/hub";
import type { ClientMessage } from "@/lib/protocol";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
const app = next({ dev });
const handle = app.getRequestHandler();

async function runMigrations() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  await sql.end();
}

/** /files/* se sirve desde MinIO a través de este servidor (con soporte de Range para videos). */
function proxyToMinio(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) {
  const path = `/${BUCKET}${req.url!.slice("/files".length).split("?")[0]}`;
  const headers: Record<string, string> = {};
  for (const h of ["range", "if-none-match", "if-modified-since"]) {
    const v = req.headers[h];
    if (typeof v === "string") headers[h] = v;
  }
  const upstream = httpRequest({ host: minioHost, port: minioPort, path, method: req.method, headers }, (up) => {
    const out: Record<string, string | string[]> = {};
    for (const h of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
      const v = up.headers[h];
      if (v !== undefined) out[h] = v;
    }
    out["cache-control"] = "public, max-age=31536000, immutable";
    res.writeHead(up.statusCode ?? 502, out);
    up.pipe(res);
  });
  upstream.on("error", () => {
    res.writeHead(502).end();
  });
  upstream.end();
}

/**
 * Autenticación básica para el panel y la API (se hace acá y no en un middleware de Next,
 * porque el middleware copia el cuerpo de la request y rompe las subidas de archivos grandes).
 * El reproductor (/player, /ws, /files) queda abierto en la LAN.
 * Si ADMIN_PASSWORD no está definido, el panel queda sin contraseña (solo desarrollo).
 */
function isAuthorized(req: import("node:http").IncomingMessage) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return true;
  const path = req.url!.split("?")[0];
  const protectedPath = path === "/" || path.startsWith("/dashboard") || path.startsWith("/api/");
  if (!protectedPath) return true;
  const [scheme, encoded] = (req.headers.authorization ?? "").split(" ");
  if (scheme !== "Basic" || !encoded) return false;
  const [user, ...rest] = Buffer.from(encoded, "base64").toString().split(":");
  return user === (process.env.ADMIN_USER ?? "admin") && rest.join(":") === password;
}

function handleSocket(ws: WebSocket) {
  let alive = true;
  ws.on("pong", () => (alive = true));
  const ping = setInterval(() => {
    if (!alive) return ws.terminate();
    alive = false;
    ws.ping();
  }, 15_000);
  ws.on("close", () => clearInterval(ping));

  ws.once("message", async (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return ws.close();
    }
    if (msg.type !== "hello") return ws.close();

    if (msg.token) {
      const [device] = await db.select().from(devices).where(eq(devices.connectionToken, msg.token));
      if (device) {
        attachDevice(device.id, ws);
        await refreshDevice(device.id, true);
        return;
      }
      send(ws, { type: "unpaired" });
    }
    createPairingCode(ws);
  });
}

async function main() {
  await runMigrations();
  await ensureBucket();
  await app.prepare();

  const server = createServer((req, res) => {
    if (req.url?.startsWith("/files/") && (req.method === "GET" || req.method === "HEAD")) {
      return proxyToMinio(req, res);
    }
    if (!isAuthorized(req)) {
      res.writeHead(401, { "WWW-Authenticate": 'Basic realm="Carteleria"' }).end("Autenticación requerida");
      return;
    }
    handle(req, res, parse(req.url!, true));
  });

  const wss = new WebSocketServer({ noServer: true });
  wss.on("connection", handleSocket);
  const nextUpgrade = app.getUpgradeHandler();
  server.on("upgrade", (req, socket, head) => {
    if (req.url?.startsWith("/ws")) {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
    } else {
      // HMR de Next en desarrollo
      nextUpgrade(req, socket, head);
    }
  });

  // Reevalúa programación y takeovers con vencimiento (solo envía si algo cambió).
  setInterval(() => void refreshAll().catch(console.error), 30_000);

  server.listen(port, () => console.log(`> Cartelería lista en http://0.0.0.0:${port}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
