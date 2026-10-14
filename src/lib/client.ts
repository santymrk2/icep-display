"use client";

/** Helpers de fetch para el panel. */
export async function api<T>(url: string, init?: RequestInit & { body?: BodyInit | null }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body && typeof init.body === "string" ? { "content-type": "application/json", ...init.headers } : init?.headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Error ${res.status}`);
  return data as T;
}

export type MediaDTO = {
  id: string;
  originalName: string;
  url: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  kind: "image" | "video";
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  folderId: string | null;
  uploadedAt: string;
};

export type FolderDTO = {
  id: string;
  name: string;
  createdAt: string;
};

export type DeviceDTO = {
  id: string;
  name: string;
  location: string | null;
  online: boolean;
  defaultPresentationId: string | null;
  lastSeenAt: string | null;
  tags: string[];
  groupId: string | null;
  /** Resolución reportada por el reproductor (px CSS, sin aplicar el giro). */
  screenWidth: number | null;
  screenHeight: number | null;
  /** Giro configurado en grados: 0, 90, 180 o 270. */
  rotation: number;
  /** Orientación real de la pantalla (con el giro aplicado); null si no se conoce. */
  screenOrientation: Orientation | null;
  /** Lo que muestra ahora mismo. */
  content: { source: "takeover" | "schedule" | "default" | "none"; label: string | null; orientation: Orientation | null; autoRotated: boolean };
};

export type Orientation = "landscape" | "portrait";
export type Transition = "cut" | "dissolve";

export type TagDTO = {
  /** null = etiqueta que solo existe en pantallas, todavía no registrada. */
  id: string | null;
  name: string;
  description: string | null;
  createdAt: string | null;
  /** Nombres de las pantallas que la usan. */
  devices: string[];
};

export type SettingsDTO = {
  timezone: string;
  defaultBackgroundId: string | null;
  backgroundUrl: string | null;
  sharePreviewLinks: boolean;
};

export type PresentationDTO = {
  id: string;
  name: string;
  description: string | null;
  orientation: Orientation;
  transition: Transition;
  itemCount: number;
};

export type GroupDTO = {
  id: string;
  name: string;
  deviceCount: number;
};

export type ScheduleDTO = {
  id: string;
  name: string;
  presentationId: string;
  /** Pantallas elegidas; vacío sin grupo = todas. */
  deviceIds: string[];
  groupId: string | null;
  daysOfWeek: number;
  startTime: string;
  endTime: string;
  enabled: boolean;
};

export function formatBytes(n: number) {
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) (n /= 1024), i++;
  return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
}
