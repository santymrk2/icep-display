import type { WebSocket } from "ws";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { devices } from "@/db/schema";
import { resolvePlayback } from "./playback";
import type { ServerMessage } from "./protocol";

/**
 * Estado en memoria de las conexiones de pantallas.
 * Vive en globalThis porque el servidor (server.ts) y los route handlers de Next
 * cargan este módulo por separado pero corren en el mismo proceso.
 */
type Hub = {
  devices: Map<string, Set<WebSocket>>;
  pending: Map<string, { ws: WebSocket; expiresAt: number }>;
  lastSent: WeakMap<WebSocket, string>;
};

const g = globalThis as unknown as { __hub?: Hub };
export const hub: Hub =
  g.__hub ?? (g.__hub = { devices: new Map(), pending: new Map(), lastSent: new WeakMap() });

const PAIRING_TTL_MS = 10 * 60 * 1000;

export function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

export function createPairingCode(ws: WebSocket) {
  for (const [code, p] of hub.pending) if (p.expiresAt < Date.now() || p.ws === ws) hub.pending.delete(code);
  let code: string;
  do code = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  while (hub.pending.has(code));
  const expiresAt = Date.now() + PAIRING_TTL_MS;
  hub.pending.set(code, { ws, expiresAt });
  send(ws, { type: "pairing", code, expiresAt });
}

export function takePendingSocket(code: string) {
  const p = hub.pending.get(code);
  if (!p || p.expiresAt < Date.now() || p.ws.readyState !== p.ws.OPEN) return null;
  hub.pending.delete(code);
  return p.ws;
}

export function attachDevice(deviceId: string, ws: WebSocket) {
  let set = hub.devices.get(deviceId);
  if (!set) hub.devices.set(deviceId, (set = new Set()));
  set.add(ws);
  ws.once("close", () => {
    set.delete(ws);
    if (set.size === 0) hub.devices.delete(deviceId);
    void db.update(devices).set({ lastSeenAt: new Date() }).where(eq(devices.id, deviceId));
  });
  void db.update(devices).set({ lastSeenAt: new Date() }).where(eq(devices.id, deviceId));
}

export function isOnline(deviceId: string) {
  return (hub.devices.get(deviceId)?.size ?? 0) > 0;
}

/** Recalcula y envía el contenido a una pantalla. Solo envía si cambió (salvo force). */
export async function refreshDevice(deviceId: string, force = false) {
  const sockets = hub.devices.get(deviceId);
  if (!sockets?.size) return;
  const msg = await resolvePlayback(deviceId);
  const json = JSON.stringify(msg);
  for (const ws of sockets) {
    if (!force && hub.lastSent.get(ws) === json) continue;
    hub.lastSent.set(ws, json);
    send(ws, msg);
  }
}

export async function refreshAll(force = false) {
  await Promise.all([...hub.devices.keys()].map((id) => refreshDevice(id, force)));
}

export function disconnectDevice(deviceId: string) {
  for (const ws of hub.devices.get(deviceId) ?? []) {
    send(ws, { type: "unpaired" });
    ws.close();
  }
}
