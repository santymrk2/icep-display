import { createServer, request as httpRequest, type IncomingMessage } from "node:http";
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
import { cookieValue, ensureAdmin, operatorMayCall, userFromToken } from "@/lib/auth";
import { attachDevice, createPairingCode, rememberScreen, refreshAll, refreshDevice, send } from "@/lib/hub";
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
function proxyToMinio(req: IncomingMessage, res: import("node:http").ServerResponse) {
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
 * Media Station X: en "Start Parameter" se escribe solo IP:PUERTO (MSX no deja escribir "/")
 * y la app pide http://IP:PUERTO/msx/start.json desde otro origen, así que necesita CORS.
 * El parámetro de inicio tiene que ser "menu:" o "content:", así que start.json apunta a
 * content.json, que abre el reproductor (/player) con la acción "link:" al arrancar y además
 * deja un botón para volver a abrirlo.
 */
function serveMsx(req: IncomingMessage, res: import("node:http").ServerResponse, path: string) {
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, HEAD, OPTIONS",
    "access-control-allow-headers": "*",
  };
  if (req.method === "OPTIONS") return void res.writeHead(204, cors).end();
  const proto = req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
  const base = `${proto}://${req.headers.host}`;
  const open = `link:${base}/player`;
  const data =
    path === "/msx/start.json"
      ? { name: "Cartelería", version: "1.0.0", parameter: `content:${base}/msx/content.json` }
      : {
          type: "pages",
          headline: "Cartelería",
          action: open,
          pages: [{ items: [{ type: "button", layout: "0,0,12,6", label: "Abrir cartelería", action: open }] }],
        };
  res.writeHead(200, { ...cors, "content-type": "application/json; charset=utf-8", "cache-control": "no-cache" });
  res.end(req.method === "HEAD" ? undefined : JSON.stringify(data));
}

/**
 * Autenticación del panel y la API (acá y no en un middleware de Next, porque el middleware
 * copia el cuerpo de la request y rompe las subidas de archivos grandes).
 * Públicos en la LAN: el reproductor (/player, /ws, /files), /login y los archivos estáticos de Next.
 */
const PUBLIC_PREFIXES = ["/player", "/files/", "/login", "/api/auth/login", "/_next/", "/favicon"];

type Access = { ok: true } | { ok: false; status: 401 | 403; redirect?: boolean };

async function authorize(req: IncomingMessage): Promise<Access> {
  const path = req.url!.split("?")[0];
  const method = req.method ?? "GET";
  const isApi = path.startsWith("/api/");
  if (PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p))) return { ok: true };

  // Defensa CSRF extra: las escrituras de la API tienen que venir del mismo sitio.
  if (isApi && method !== "GET" && method !== "HEAD") {
    const origin = req.headers.origin;
    if (origin) {
      try {
        if (new URL(origin).host !== req.headers.host) return { ok: false, status: 403 };
      } catch {
        return { ok: false, status: 403 };
      }
    }
  }

  const user = await userFromToken(cookieValue(req.headers.cookie));
  if (!user) return { ok: false, status: 401, redirect: !isApi };
  if (user.role === "operator" && isApi && !operatorMayCall(method, path)) return { ok: false, status: 403 };
  if (user.role === "operator" && path.startsWith("/dashboard/users")) return { ok: false, status: 403 };
  return { ok: true };
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

    rememberScreen(ws, msg.width, msg.height);
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
  // MinIO puede tardar unos segundos en aceptar conexiones después de arrancar.
  for (let attempt = 1; ; attempt++) {
    try {
      await ensureBucket();
      break;
    } catch (err) {
      if (attempt >= 30) throw err;
      console.log(`> Esperando a MinIO (${attempt}/30)…`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  await ensureAdmin();
  await app.prepare();

  const server = createServer((req, res) => {
    if (req.url?.startsWith("/files/") && (req.method === "GET" || req.method === "HEAD")) {
      return proxyToMinio(req, res);
    }
    const msxPath = req.url?.split("?")[0];
    if (msxPath === "/msx/start.json" || msxPath === "/msx/content.json") return serveMsx(req, res, msxPath);
    // IP del cliente para el límite de intentos de login. Se pisa el header para que no se pueda falsificar;
    // solo se confía en cf-connecting-ip / x-forwarded-for cuando la conexión viene del túnel local.
    const remote = req.socket.remoteAddress ?? "local";
    const viaTunnel = remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
    const forwarded = (req.headers["cf-connecting-ip"] as string | undefined) ?? (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0].trim();
    req.headers["x-client-ip"] = viaTunnel && forwarded ? forwarded : remote;
    authorize(req)
      .then((access) => {
        if (access.ok) return handle(req, res, parse(req.url!, true));
        if (access.redirect) return void res.writeHead(302, { Location: "/login" }).end();
        res.writeHead(access.status, { "content-type": "application/json" }).end(
          JSON.stringify({ error: access.status === 401 ? "No autenticado" : "No tenés permiso para esto" }),
        );
      })
      .catch((err) => {
        console.error(err);
        res.writeHead(500).end();
      });
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
