/** Mensajes WebSocket entre servidor y reproductor. */

export type PlayItem = {
  id: string;
  url: string;
  kind: "image" | "video";
  /** Segundos; null en videos = duración natural. */
  durationSeconds: number | null;
  /** "contain" muestra entero; "cover" llena la pantalla recortando. */
  fit: "contain" | "cover";
  /** null = la transición de la presentación. */
  transition: "cut" | "dissolve" | null;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
};

/** Cómo se muestra el contenido en esta pantalla. */
export type PlayStyle = {
  orientation: "landscape" | "portrait";
  transition: "cut" | "dissolve";
  /** Giro en grados (0/90/180/270) configurado para la pantalla. */
  rotation: number;
  /** URL de la imagen de fondo por defecto (cuando no hay contenido), o null. */
  background: string | null;
};

export type PlaySource = "takeover" | "schedule" | "default" | "none";

export type ServerMessage =
  | { type: "pairing"; code: string; expiresAt: number }
  | { type: "paired"; token: string; deviceId: string; name: string }
  | ({ type: "play"; source: PlaySource; label: string | null; items: PlayItem[] } & PlayStyle)
  | { type: "unpaired" }
  | { type: "reload" };

export type ClientMessage =
  | { type: "hello"; token: string | null; width?: number; height?: number }
  | { type: "screen"; width: number; height: number };
