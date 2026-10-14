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
};

export type PresentationDTO = {
  id: string;
  name: string;
  description: string | null;
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
  deviceId: string | null;
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
