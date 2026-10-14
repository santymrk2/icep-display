/** Mensajes WebSocket entre servidor y reproductor. */

export type PlayItem = {
  id: string;
  url: string;
  kind: "image" | "video";
  /** Segundos; null en videos = duración natural. */
  durationSeconds: number | null;
};

export type PlaySource = "takeover" | "schedule" | "default" | "none";

export type ServerMessage =
  | { type: "pairing"; code: string; expiresAt: number }
  | { type: "paired"; token: string; deviceId: string; name: string }
  | { type: "play"; source: PlaySource; label: string | null; items: PlayItem[] }
  | { type: "unpaired" }
  | { type: "reload" };

export type ClientMessage = { type: "hello"; token: string | null };
