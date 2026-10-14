import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { devices } from "@/db/schema";
import { attachDevice, refreshDevice, send, takePendingSocket } from "@/lib/hub";
import { error, json } from "@/lib/http";

/** El admin ingresa el código que muestra la pantalla y le pone nombre. */
export async function POST(req: Request) {
  const body = (await req.json()) as { code?: string; name?: string; location?: string };
  const code = body.code?.trim() ?? "";
  const name = body.name?.trim() ?? "";
  if (!/^\d{4}$/.test(code)) return error("El código debe tener 4 dígitos");
  if (!name) return error("Falta el nombre de la pantalla");

  const ws = takePendingSocket(code);
  if (!ws) return error("Código inválido o vencido. Revisá el que muestra la pantalla.", 404);

  const token = randomBytes(24).toString("base64url");
  const [device] = await db
    .insert(devices)
    .values({ name, location: body.location?.trim() || null, connectionToken: token })
    .returning();

  send(ws, { type: "paired", token, deviceId: device.id, name: device.name });
  attachDevice(device.id, ws);
  await refreshDevice(device.id, true);
  return json({ id: device.id }, 201);
}
