"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, formatBytes, type DeviceDTO, type FolderDTO, type MediaDTO } from "@/lib/client";
import { IconClose, IconFolder, IconMedia, IconPlus, IconSearch } from "@/components/Icons";

type Upload = { name: string; progress: number; error?: string };
type Flash = { error: boolean; text: string };
/** Menú de acciones de una fila. key = "a:<assetId>" o "f:<folderId>". */
type Menu = { key: string; view: "main" | "move" | "color"; top: number; right: number };
/** Carpeta con su ruta completa ("Eventos / 2026") para los menús de mover. */
type FolderOption = { folder: FolderDTO; path: string };
/** Datos que se miden en el navegador antes de subir el archivo. */
type Probe = { duration: number | null; width: number | null; height: number | null; thumb: Blob | null };

function uploadFile(file: File, onProgress: (p: number) => void, probe: Probe) {
  return new Promise<MediaDTO>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", "/api/media/upload");
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name));
    if (probe.duration) xhr.setRequestHeader("x-duration-seconds", String(probe.duration));
    if (probe.width && probe.height) {
      xhr.setRequestHeader("x-width", String(probe.width));
      xhr.setRequestHeader("x-height", String(probe.height));
    }
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let data: Partial<MediaDTO> & { error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText || "{}");
      } catch {
        /* respuesta no JSON: se usa el código de estado */
      }
      if (xhr.status < 300) resolve(data as MediaDTO);
      else reject(new Error(data.error ?? `Error ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("Error de red"));
    xhr.send(file);
  });
}

/** Miniaturas generadas en el navegador: ancho máximo y calidad JPEG. */
const THUMB_MAX_WIDTH = 320;
const THUMB_QUALITY = 0.8;

/** Ancho/alto escalados para que el ancho no supere THUMB_MAX_WIDTH. */
function thumbSize(width: number, height: number) {
  const scale = Math.min(1, THUMB_MAX_WIDTH / width);
  return { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) };
}

function canvasToJpeg(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", THUMB_QUALITY));
}

/**
 * Píxeles y miniatura de una imagen. Si el navegador no puede decodificarla,
 * devuelve nulls: la subida sigue igual.
 */
async function readImage(file: File): Promise<Probe> {
  let width: number | null = null;
  let height: number | null = null;
  try {
    const bitmap = await createImageBitmap(file);
    width = bitmap.width;
    height = bitmap.height;
    const { w, h } = thumbSize(width, height);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { duration: null, width, height, thumb: null };
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return { duration: null, width, height, thumb: await canvasToJpeg(canvas) };
  } catch {
    return { duration: null, width, height, thumb: null };
  }
}

/**
 * Duración (segundos enteros), píxeles y miniatura de un video: el frame de ~1 s,
 * o del 10% si el video dura menos de 10 s. Si el navegador no puede
 * decodificarlo, devuelve lo que se haya podido obtener (o nulls).
 */
function readVideo(file: File): Promise<Probe> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let duration: number | null = null;
    let width: number | null = null;
    let height: number | null = null;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (thumb: Blob | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve({ duration, width, height, thumb });
    };

    timer = setTimeout(() => finish(null), 15000);
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.onerror = () => finish(null);
    video.onloadedmetadata = () => {
      width = video.videoWidth || null;
      height = video.videoHeight || null;
      const d = video.duration;
      if (!Number.isFinite(d) || d <= 0) return finish(null);
      duration = Math.round(d) > 0 ? Math.round(d) : null;
      if (!video.videoWidth || !video.videoHeight) return finish(null);
      video.currentTime = Math.min(1, d * 0.1);
    };
    video.onseeked = () => {
      try {
        const { w, h } = thumbSize(video.videoWidth, video.videoHeight);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")?.drawImage(video, 0, 0, w, h);
        void canvasToJpeg(canvas).then(finish, () => finish(null));
      } catch {
        finish(null);
      }
    };
    video.src = url;
  });
}

/** Sube la miniatura ya asociada al asset. Un fallo no interrumpe la subida. */
async function uploadThumb(assetId: string, thumb: Blob) {
  const res = await fetch(`/api/media/${assetId}/thumbnail`, {
    method: "PUT",
    headers: { "content-type": "image/jpeg" },
    body: thumb,
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
}

const typeLabel = (m: MediaDTO) => m.mimeType.split("/")[1] ?? m.kind;
const kindLabel = (m: MediaDTO) => (m.kind === "video" ? "Video" : "Imagen");
/** mm:ss para la duración de un video. */
const fmtDuration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const fmtDate = (iso: string) => new Date(iso).toLocaleString("es-AR", { dateStyle: "long", timeStyle: "short" });
const fmtResolution = (m: MediaDTO) => (m.width && m.height ? `${m.width}×${m.height}` : "—");
const menuItem = "flex w-full items-center px-4 py-2 text-left hover:bg-raised disabled:opacity-40 disabled:hover:bg-transparent";
const FOLDER_COLORS = ["#2492ff", "#ff9f43", "#2ec4b6", "#a78bfa", "#f472b6", "#ef4444", "#facc15", "#9ca3af"];
const MEDIA_DRAG = "application/x-media-ids";
const FOLDER_DRAG = "application/x-media-folder-id";

type SortKey = "name" | "type" | "date";

function SortTh({ label, k, sort, onSort, className }: { label: string; k: SortKey; sort: { key: SortKey; dir: 1 | -1 }; onSort: (k: SortKey) => void; className?: string }) {
  return (
    <th className={className}>
      <button className="inline-flex items-center gap-1.5 font-semibold hover:text-white" onClick={() => onSort(k)}>
        {label}
        <span className={sort.key === k ? "text-accent" : "text-zinc-500"}>{sort.key === k ? (sort.dir === 1 ? "↑" : "↓") : "↕"}</span>
      </button>
    </th>
  );
}

export default function MediaPage() {
  const router = useRouter();
  const [media, setMedia] = useState<MediaDTO[]>([]);
  const [folders, setFolders] = useState<FolderDTO[]>([]);
  const [devices, setDevices] = useState<DeviceDTO[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const [dropFolder, setDropFolder] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  /** null = raíz ("Mi biblioteca"). */
  const [folderId, setFolderId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | "image" | "video">("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "date", dir: -1 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMove, setBulkMove] = useState(false);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  /** Carpeta que se está arrastrando: durante dragover el navegador no deja leer los datos del arrastre. */
  const dragFolder = useRef<string | null>(null);

  const load = useCallback(async () => {
    const [m, f] = await Promise.all([api<MediaDTO[]>("/api/media"), api<FolderDTO[]>("/api/media/folders")]);
    setMedia(m);
    setFolders(f);
  }, []);

  useEffect(() => {
    load().catch((err: Error) => setFlash({ error: true, text: err.message }));
    void api<DeviceDTO[]>("/api/devices").then(setDevices).catch(() => {});
  }, [load]);

  /** Ejecuta una acción mostrando el resultado o el error en el aviso superior. */
  async function run(fn: () => Promise<string | void>) {
    setFlash(null);
    try {
      const ok = await fn();
      if (ok) setFlash({ error: false, text: ok });
    } catch (err) {
      setFlash({ error: true, text: (err as Error).message });
    }
  }

  function openFolder(id: string | null) {
    setFolderId(id);
    setSelected(new Set());
    setMenu(null);
    setBulkMove(false);
  }

  async function handleFiles(files: FileList | File[]) {
    const list = [...files];
    if (list.length === 0) return;
    const dest = folderId; // la carpeta donde se soltó, aunque el usuario navegue después
    setUploads(list.map((f) => ({ name: f.name, progress: 0 })));
    // De a uno para no saturar la red con varios 4K en paralelo.
    for (const [i, f] of list.entries()) {
      const setItem = (patch: Partial<Upload>) => setUploads((u) => u.map((x, j) => (j === i ? { ...x, ...patch } : x)));
      try {
        // Si la medición falla, se sube igual sin miniatura, duración ni píxeles.
        const probe = f.type.startsWith("video/") ? await readVideo(f) : await readImage(f);
        const asset = await uploadFile(f, (p) => setItem({ progress: p }), probe);
        if (probe.thumb) await uploadThumb(asset.id, probe.thumb).catch(() => {});
        if (dest) await api(`/api/media/${asset.id}`, { method: "PATCH", body: JSON.stringify({ folderId: dest }) });
        setItem({ progress: 1 });
      } catch (err) {
        setItem({ error: (err as Error).message });
      }
    }
    await load().catch(() => {});
  }

  // Arrastrar archivos del sistema: se cuentan entradas/salidas para que el resaltado no parpadee.
  const isFileDrag = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
  function onDragEnter(e: React.DragEvent) {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth.current++;
    setDragging(true);
  }
  function onDragOver(e: React.DragEvent) {
    if (isFileDrag(e)) e.preventDefault();
  }
  function onDragLeave(e: React.DragEvent) {
    if (!isFileDrag(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }
  function onDrop(e: React.DragEvent) {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    void handleFiles(e.dataTransfer.files);
  }

  /** Arrastrar filas de medios o una carpeta hacia una carpeta (o hacia "Mi biblioteca"). */
  const isRowDrag = (e: React.DragEvent) => {
    const types = Array.from(e.dataTransfer.types);
    return types.includes(MEDIA_DRAG) || types.includes(FOLDER_DRAG);
  };
  /** Una carpeta no puede caer en sí misma, en una subcarpeta suya ni donde ya está. */
  const canDropFolder = (id: string, dest: string | null) =>
    dest === null ? byId.get(id)?.parentId !== null : !isInside(dest, id) && byId.get(id)?.parentId !== dest;
  function dropOnFolder(e: React.DragEvent, dest: string | null) {
    if (!isRowDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setDropFolder(null);
    const folder = e.dataTransfer.getData(FOLDER_DRAG);
    if (folder) {
      dragFolder.current = null;
      const f = byId.get(folder);
      if (f && canDropFolder(f.id, dest)) moveFolder(f, dest);
      return;
    }
    const ids = (e.dataTransfer.getData(MEDIA_DRAG) || "").split(",").filter(Boolean);
    moveAssets(media.filter((m) => ids.includes(m.id)), dest);
  }
  const folderDropProps = (dest: string | null) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!isRowDrag(e)) return;
      if (dragFolder.current && !canDropFolder(dragFolder.current, dest)) return;
      e.preventDefault();
      e.stopPropagation();
      setDropFolder(dest ?? "root");
    },
    onDragLeave: () => setDropFolder(null),
    onDrop: (e: React.DragEvent) => dropOnFolder(e, dest),
  });

  function createFolder() {
    const name = window.prompt("Nombre de la nueva carpeta")?.trim();
    if (!name) return;
    void run(async () => {
      await api("/api/media/folders", { method: "POST", body: JSON.stringify({ name, parentId: folderId }) });
      await load();
      return `Carpeta "${name}" creada`;
    });
  }

  function renameFolder(f: FolderDTO) {
    const name = window.prompt("Nuevo nombre de la carpeta", f.name)?.trim();
    if (!name || name === f.name) return;
    void run(async () => {
      await api(`/api/media/folders/${f.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
      await load();
    });
  }

  function recolorFolder(f: FolderDTO, color: string) {
    void run(async () => {
      await api(`/api/media/folders/${f.id}`, { method: "PATCH", body: JSON.stringify({ color }) });
      await load();
    });
  }

  function renameAsset(m: MediaDTO) {
    const name = window.prompt("Nuevo nombre", m.originalName)?.trim();
    if (!name || name === m.originalName) return;
    void run(async () => {
      await api(`/api/media/${m.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
      await load();
    });
  }

  function moveFolder(f: FolderDTO, dest: string | null) {
    void run(async () => {
      await api(`/api/media/folders/${f.id}`, { method: "PATCH", body: JSON.stringify({ parentId: dest }) });
      await load();
      return `Carpeta "${f.name}" movida a ${folderName(dest)}`;
    });
  }

  function deleteFolder(f: FolderDTO) {
    if (!confirm(`¿Eliminar la carpeta "${f.name}"? Los archivos y subcarpetas que contiene pasan a ${folderName(f.parentId)}.`)) return;
    void run(async () => {
      await api(`/api/media/folders/${f.id}`, { method: "DELETE" });
      if (folderId === f.id) setFolderId(f.parentId);
      await load();
      return `Carpeta "${f.name}" eliminada`;
    });
  }

  function moveAssets(list: MediaDTO[], dest: string | null) {
    const items = list.filter((m) => m.folderId !== dest);
    if (items.length === 0) return;
    void run(async () => {
      await Promise.all(items.map((m) => api(`/api/media/${m.id}`, { method: "PATCH", body: JSON.stringify({ folderId: dest }) })));
      setSelected(new Set());
      await load();
      const where = folderName(dest);
      return items.length === 1 ? `"${items[0].originalName}" movido a ${where}` : `${items.length} archivos movidos a ${where}`;
    });
  }

  function removeAssets(list: MediaDTO[]) {
    if (list.length === 0) return;
    if (!confirm(list.length === 1 ? `¿Eliminar "${list[0].originalName}"?` : `¿Eliminar ${list.length} archivos?`)) return;
    void run(async () => {
      await Promise.all(list.map((m) => api(`/api/media/${m.id}`, { method: "DELETE" })));
      setSelected(new Set());
      await load();
      return list.length === 1 ? `"${list[0].originalName}" eliminado` : `${list.length} archivos eliminados`;
    });
  }

  /** Crea una presentación con este medio como única diapositiva y abre la lista de presentaciones. */
  function addToNewPresentation(m: MediaDTO) {
    void run(async () => {
      const orientation = (m.height ?? 0) > (m.width ?? 0) ? "portrait" : "landscape";
      const created = await api<{ id: string }>("/api/presentations", {
        method: "POST",
        body: JSON.stringify({ name: m.originalName, orientation }),
      });
      await api(`/api/presentations/${created.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: m.originalName,
          description: null,
          orientation,
          transition: "cut",
          items: [{ type: "media", mediaAssetId: m.id, durationSeconds: null, fit: "contain" }],
        }),
      });
      router.push("/dashboard/presentations");
    });
  }

  function takeover(m: MediaDTO) {
    const device = devices.find((d) => d.id === target);
    void run(async () => {
      await api("/api/takeover", { method: "POST", body: JSON.stringify({ mediaAssetId: m.id, deviceId: target || null }) });
      return `"${m.originalName}" al aire en ${device ? device.name : "todas las pantallas"}`;
    });
  }

  function endTakeovers() {
    void run(async () => {
      await api("/api/takeover", { method: "DELETE" });
      return "Volviste a la programación";
    });
  }

  function openMenu(e: React.MouseEvent<HTMLButtonElement>, key: string) {
    e.stopPropagation();
    if (menu?.key === key) return setMenu(null);
    const r = e.currentTarget.getBoundingClientRect();
    const top = r.bottom + 4 + 280 > window.innerHeight ? Math.max(8, r.top - 284) : r.bottom + 4;
    setMenu({ key, view: "main", top, right: window.innerWidth - r.right });
  }

  function onSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: 1 }));
  }

  const q = query.trim().toLowerCase();
  const byId = new Map(folders.map((f) => [f.id, f]));
  const currentFolder = (folderId && byId.get(folderId)) || null;
  /** Carpetas desde la raíz hasta `id` inclusive (el `seen` corta un ciclo si la base quedara inconsistente). */
  function ancestry(id: string | null) {
    const chain: FolderDTO[] = [];
    const seen = new Set<string>();
    for (let f = id ? byId.get(id) : undefined; f && !seen.has(f.id); f = f.parentId ? byId.get(f.parentId) : undefined) {
      seen.add(f.id);
      chain.unshift(f);
    }
    return chain;
  }
  /** true si `id` es `ancestor` o está dentro de él, a cualquier profundidad. */
  const isInside = (id: string, ancestor: string) => ancestry(id).some((f) => f.id === ancestor);
  const folderName = (id: string | null) => (id ? byId.get(id)?.name ?? "la carpeta" : "Mi biblioteca");
  const cmpText = (a: string, b: string) => a.localeCompare(b, "es", { sensitivity: "base", numeric: true });
  const folderOptions: FolderOption[] = folders
    .map((folder) => ({ folder, path: ancestry(folder.id).map((f) => f.name).join(" / ") }))
    .sort((a, b) => cmpText(a.path, b.path));
  const breadcrumb = ancestry(folderId);
  const visibleFolders = folders.filter((f) => f.parentId === folderId && (!q || f.name.toLowerCase().includes(q))).sort((a, b) =>
    sort.key === "date" ? sort.dir * (+new Date(a.createdAt) - +new Date(b.createdAt)) : sort.key === "name" ? sort.dir * cmpText(a.name, b.name) : cmpText(a.name, b.name),
  );
  const visibleMedia = media
    .filter(
      (m) =>
        (folderId === null ? m.folderId === null : m.folderId === folderId) &&
        (!q || m.originalName.toLowerCase().includes(q)) &&
        (!typeFilter || m.kind === typeFilter),
    )
    .sort((a, b) =>
      sort.key === "date"
        ? sort.dir * (+new Date(a.uploadedAt) - +new Date(b.uploadedAt))
        : sort.key === "type"
          ? sort.dir * cmpText(typeLabel(a), typeLabel(b)) || cmpText(a.originalName, b.originalName)
          : sort.dir * cmpText(a.originalName, b.originalName),
    );
  const menuAsset = menu?.key.startsWith("a:") ? media.find((m) => m.id === menu.key.slice(2)) : undefined;
  const menuFolder = menu?.key.startsWith("f:") ? folders.find((f) => f.id === menu.key.slice(2)) : undefined;
  const inspected = inspectId ? media.find((m) => m.id === inspectId) ?? null : null;
  const selectedAssets = visibleMedia.filter((m) => selected.has(m.id));

  function toggleSel(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  return (
    <div className="flex h-full min-h-0" onClick={() => (setFiltersOpen(false), setAddOpen(false))}>
      <aside className="hidden w-[260px] shrink-0 border-r border-line bg-canvas md:block">
        <h2 className="border-b border-line px-6 py-5 text-lg font-semibold">Bibliotecas de contenido</h2>
        <button
          onClick={() => openFolder(null)}
          {...folderDropProps(null)}
          className={`flex w-full items-center gap-3 border-y px-6 py-3 text-left text-sm ${
            dropFolder === "root" ? "border-accent bg-accent/25" : "border-accent/60 bg-accent/10"
          }`}
        >
          <IconMedia className="h-5 w-5 text-zinc-300" />
          Mi biblioteca
        </button>
      </aside>

      <div
        className="relative flex min-w-0 flex-1 flex-col overflow-auto px-6 pb-10 pt-5 md:px-10"
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div className="flex items-center gap-3 border-b border-line pb-4">
          <h1 className="flex flex-1 items-center gap-2.5 text-lg font-semibold">
            <IconMedia className="h-6 w-6 text-zinc-300" />
            Medios
          </h1>
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button className="btn-primary" onClick={() => setAddOpen((o) => !o)}>
              <IconPlus />
              Agregar
            </button>
            {addOpen && (
              <div className="absolute right-0 top-full z-40 mt-1 w-48 overflow-hidden rounded-xl border border-line bg-panel py-1 text-sm shadow-2xl">
                <button className={menuItem} onClick={() => (setAddOpen(false), fileInput.current?.click())}>
                  Subir archivos
                </button>
                <button className={menuItem} onClick={() => (setAddOpen(false), createFolder())}>
                  Nueva carpeta
                </button>
              </div>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => {
              const files = e.target.files ? [...e.target.files] : [];
              e.target.value = "";
              void handleFiles(files);
            }}
          />
        </div>

        {folderId !== null && (
          <nav className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <button
              className={`rounded px-1 text-accent hover:underline ${dropFolder === "root" ? "bg-accent/25" : ""}`}
              onClick={() => openFolder(null)}
              {...folderDropProps(null)}
            >
              ← Mi biblioteca
            </button>
            {breadcrumb.map((f) => (
              <span key={f.id} className="flex items-center gap-2">
                <span className="text-zinc-600">/</span>
                {f.id === folderId ? (
                  <span className="font-medium">{f.name}</span>
                ) : (
                  <button
                    className={`rounded px-1 text-accent hover:underline ${dropFolder === f.id ? "bg-accent/25" : ""}`}
                    onClick={() => openFolder(f.id)}
                    {...folderDropProps(f.id)}
                  >
                    {f.name}
                  </button>
                )}
              </span>
            ))}
            {!currentFolder && <span className="font-medium">Carpeta no encontrada</span>}
          </nav>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-sm flex-1">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input className="input h-11 w-full pl-9" placeholder="Buscar..." value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button className={`btn h-11 border border-line bg-panel ${typeFilter || target ? "border-accent" : ""}`} onClick={() => setFiltersOpen((o) => !o)}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
                <circle cx="16" cy="7" r="2" />
                <circle cx="8" cy="17" r="2" />
              </svg>
              Filtros
            </button>
            {filtersOpen && (
              <div className="absolute left-0 top-full z-40 mt-1 w-72 space-y-4 rounded-xl border border-line bg-panel p-4 text-sm shadow-2xl">
                <label className="block space-y-1.5">
                  <span className="text-zinc-400">Tipo</span>
                  <select className="input w-full" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as "" | "image" | "video")}>
                    <option value="">Todos</option>
                    <option value="image">Imagen</option>
                    <option value="video">Video</option>
                  </select>
                </label>
                <label className="block space-y-1.5">
                  <span className="text-zinc-400">Poner al aire en</span>
                  <select className="input w-full" value={target} onChange={(e) => setTarget(e.target.value)}>
                    <option value="">Todas las pantallas</option>
                    {devices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="btn w-full" onClick={() => (setFiltersOpen(false), endTakeovers())}>
                  Volver a la programación
                </button>
              </div>
            )}
          </div>
        </div>

        {flash && <p className={`mt-4 text-sm ${flash.error ? "text-red-400" : "text-emerald-400"}`}>{flash.text}</p>}

        {uploads.length > 0 && (
          <ul className="card mt-4 divide-y divide-line text-sm">
            {uploads.map((u, i) => (
              <li key={i} className="space-y-1.5 px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate">{u.name}</span>
                  {u.error ? (
                    <span className="text-red-400">{u.error}</span>
                  ) : (
                    <span className="tabular-nums text-zinc-400">{Math.round(u.progress * 100)}%</span>
                  )}
                </div>
                {!u.error && (
                  <div className="h-1 overflow-hidden rounded-full bg-raised">
                    <div className="h-full bg-accent transition-[width]" style={{ width: `${u.progress * 100}%` }} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {selectedAssets.length > 0 && (
          <div className="relative mt-5 flex items-center gap-3 rounded-xl border border-accent/50 bg-accent/10 px-4 py-2 text-sm" onClick={(e) => e.stopPropagation()}>
            <span className="flex-1 font-medium">
              {selectedAssets.length} {selectedAssets.length === 1 ? "seleccionado" : "seleccionados"}
            </span>
            <div className="relative">
              <button className="btn" onClick={() => setBulkMove((o) => !o)}>
                Mover a carpeta
              </button>
              {bulkMove && (
                <div className="absolute right-0 top-full z-40 mt-1 max-h-64 w-56 overflow-auto rounded-xl border border-line bg-panel py-1 shadow-2xl">
                  {folderId !== null && (
                    <button className={menuItem} onClick={() => (setBulkMove(false), moveAssets(selectedAssets, null))}>
                      Mi biblioteca
                    </button>
                  )}
                  {folderOptions
                    .filter(({ folder }) => folder.id !== folderId)
                    .map(({ folder, path }) => (
                      <button key={folder.id} className={menuItem} title={path} onClick={() => (setBulkMove(false), moveAssets(selectedAssets, folder.id))}>
                        <span className="truncate">{path}</span>
                      </button>
                    ))}
                  {folders.length === 0 && folderId === null && <p className="px-4 py-2 text-xs text-zinc-500">Todavía no hay carpetas.</p>}
                </div>
              )}
            </div>
            <button className="btn bg-red-700/80 hover:bg-red-600" onClick={() => removeAssets(selectedAssets)}>
              Eliminar
            </button>
            <button aria-label="Limpiar selección" className="rounded-lg p-1 text-zinc-400 hover:text-zinc-100" onClick={() => setSelected(new Set())}>
              <IconClose />
            </button>
          </div>
        )}

        <div className="relative mt-5 min-h-[320px]">
          {dragging && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-accent/10 text-sm font-medium text-accent">
              {currentFolder ? `Soltá los archivos para subirlos a "${currentFolder.name}"` : "Soltá los archivos para subirlos"}
            </div>
          )}
          <div className="table-shell overflow-x-auto">
            <table className="min-w-[680px]">
              <thead>
                <tr>
                  <th className="w-[140px]">
                    <span className="sr-only">Vista previa</span>
                  </th>
                  <SortTh label="Nombre" k="name" sort={sort} onSort={onSort} />
                  <SortTh label="Tipo" k="type" sort={sort} onSort={onSort} />
                  <SortTh label="Fecha de alta" k="date" sort={sort} onSort={onSort} />
                  <th className="w-12">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleFolders.map((f) => (
                  <tr
                    key={`f-${f.id}`}
                    draggable
                    onDragStart={(e) => {
                      dragFolder.current = f.id;
                      e.dataTransfer.setData(FOLDER_DRAG, f.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => {
                      dragFolder.current = null;
                      setDropFolder(null);
                    }}
                    className={`row-click ${menu?.key === `f:${f.id}` ? "bg-white/[0.05]" : ""} ${dropFolder === f.id ? "!bg-accent/20 outline outline-2 -outline-offset-2 outline-accent" : ""}`}
                    onClick={() => openFolder(f.id)}
                    {...folderDropProps(f.id)}
                  >
                    <td className="py-2">
                      <div className="ml-6 flex h-[46px] w-[84px] items-center justify-center rounded-full border border-line bg-canvas" style={{ color: f.color }}>
                        <IconFolder className="h-6 w-6" />
                      </div>
                    </td>
                    <td className="font-medium">{f.name}</td>
                    <td className="text-zinc-400" />
                    <td className="whitespace-nowrap text-zinc-300">{fmtDate(f.createdAt)}</td>
                    <td className="text-right">
                      <button
                        aria-label={`Acciones de ${f.name}`}
                        className="rounded-md px-2 py-1 text-zinc-300 hover:bg-raised hover:text-zinc-100"
                        onClick={(e) => openMenu(e, `f:${f.id}`)}
                      >
                        •••
                      </button>
                    </td>
                  </tr>
                ))}

                {visibleMedia.map((m) => {
                  const isSel = selected.has(m.id);
                  const active = isSel || menu?.key === `a:${m.id}`;
                  return (
                    <tr
                      key={m.id}
                      draggable
                      onDragStart={(e) => {
                        const ids = isSel ? selectedAssets.map((x) => x.id) : [m.id];
                        e.dataTransfer.setData(MEDIA_DRAG, ids.join(","));
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => setDropFolder(null)}
                      onClick={() => setSelected(new Set([m.id]))}
                      className={`group row-click ${active ? "!bg-accent/10 outline outline-1 -outline-offset-1 outline-accent/60" : ""}`}
                    >
                      <td className="py-2">
                        <div className="flex items-center gap-3 pl-3">
                          <input
                            type="checkbox"
                            checked={isSel}
                            aria-label={`Seleccionar ${m.originalName}`}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => toggleSel(m.id)}
                            className={`h-5 w-5 shrink-0 accent-[#2492ff] ${isSel ? "" : "opacity-0 group-hover:opacity-100"}`}
                          />
                          <div className="h-[46px] w-[70px] shrink-0 overflow-hidden rounded bg-black">
                            {m.thumbnailUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={m.thumbnailUrl} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
                            ) : m.kind === "image" ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={m.url} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
                            ) : (
                              <video src={`${m.url}#t=1`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="max-w-xs truncate" title={m.originalName}>
                        {m.originalName}
                      </td>
                      <td className="text-zinc-300">{typeLabel(m)}</td>
                      <td className="whitespace-nowrap text-zinc-300">{fmtDate(m.uploadedAt)}</td>
                      <td className="text-right">
                        <button
                          aria-label={`Acciones de ${m.originalName}`}
                          className="rounded-md px-2 py-1 text-zinc-300 hover:bg-raised hover:text-zinc-100"
                          onClick={(e) => openMenu(e, `a:${m.id}`)}
                        >
                          •••
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {visibleFolders.length === 0 && visibleMedia.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-zinc-500">
                      {q || typeFilter
                        ? "Sin resultados"
                        : folderId === null
                          ? "Todavía no hay medios. Arrastrá archivos acá o usá Agregar."
                          : "Esta carpeta está vacía. Arrastrá archivos acá para subirlos."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {menu && (menuAsset || menuFolder) && (
        <>
          <div className="fixed inset-0 z-40" onClick={(e) => (e.stopPropagation(), setMenu(null))} />
          <div
            className="fixed z-50 w-64 overflow-hidden rounded-xl border border-line bg-panel py-1 text-sm shadow-2xl"
            style={{ top: menu.top, right: menu.right }}
          >
            {menuAsset && menu.view === "main" && (
              <>
                <button className={menuItem} onClick={() => (setMenu(null), setInspectId(menuAsset.id))}>
                  Inspeccionar
                </button>
                <button className={menuItem} onClick={() => (setMenu(null), addToNewPresentation(menuAsset))}>
                  Agregar a nueva presentación
                </button>
                <button className={menuItem} onClick={() => (setMenu(null), takeover(menuAsset))}>
                  Poner al aire
                </button>
                <button className={menuItem} onClick={() => setMenu({ ...menu, view: "move" })}>
                  Mover a carpeta…
                </button>
                <button className={menuItem} onClick={() => (setMenu(null), renameAsset(menuAsset))}>
                  Renombrar
                </button>
                <button className={`${menuItem} text-red-400`} onClick={() => (setMenu(null), removeAssets([menuAsset]))}>
                  Eliminar
                </button>
              </>
            )}

            {menuAsset && menu.view === "move" && (
              <>
                <button className="px-4 py-2 text-left text-xs text-zinc-400 hover:text-zinc-100" onClick={() => setMenu({ ...menu, view: "main" })}>
                  ← Mover a…
                </button>
                <div className="my-1 border-t border-line" />
                <div className="max-h-64 overflow-auto">
                  <button className={menuItem} disabled={menuAsset.folderId === null} onClick={() => (setMenu(null), moveAssets([menuAsset], null))}>
                    Mi biblioteca
                  </button>
                  {folderOptions.map(({ folder, path }) => (
                    <button key={folder.id} className={menuItem} title={path} disabled={menuAsset.folderId === folder.id} onClick={() => (setMenu(null), moveAssets([menuAsset], folder.id))}>
                      <span className="truncate">{path}</span>
                    </button>
                  ))}
                  {folders.length === 0 && <p className="px-4 py-2 text-xs text-zinc-500">Todavía no hay carpetas.</p>}
                </div>
              </>
            )}

            {menuFolder && menu.view === "main" && (
              <>
                <button className={menuItem} onClick={() => openFolder(menuFolder.id)}>
                  Abrir
                </button>
                <button className={menuItem} onClick={() => setMenu({ ...menu, view: "move" })}>
                  Mover a carpeta…
                </button>
                <button className={menuItem} onClick={() => setMenu({ ...menu, view: "color" })}>
                  Cambiar color…
                </button>
                <button className={menuItem} onClick={() => (setMenu(null), renameFolder(menuFolder))}>
                  Renombrar
                </button>
                <button className={`${menuItem} text-red-400`} onClick={() => (setMenu(null), deleteFolder(menuFolder))}>
                  Eliminar
                </button>
              </>
            )}

            {menuFolder && menu.view === "move" && (
              <>
                <button className="px-4 py-2 text-left text-xs text-zinc-400 hover:text-zinc-100" onClick={() => setMenu({ ...menu, view: "main" })}>
                  ← Mover a…
                </button>
                <div className="my-1 border-t border-line" />
                <div className="max-h-64 overflow-auto">
                  <button className={menuItem} disabled={!canDropFolder(menuFolder.id, null)} onClick={() => (setMenu(null), moveFolder(menuFolder, null))}>
                    Mi biblioteca
                  </button>
                  {folderOptions
                    .filter(({ folder }) => !isInside(folder.id, menuFolder.id))
                    .map(({ folder, path }) => (
                      <button
                        key={folder.id}
                        className={menuItem}
                        title={path}
                        disabled={!canDropFolder(menuFolder.id, folder.id)}
                        onClick={() => (setMenu(null), moveFolder(menuFolder, folder.id))}
                      >
                        <span className="truncate">{path}</span>
                      </button>
                    ))}
                </div>
              </>
            )}

            {menuFolder && menu.view === "color" && (
              <>
                <button className="px-4 py-2 text-left text-xs text-zinc-400 hover:text-zinc-100" onClick={() => setMenu({ ...menu, view: "main" })}>
                  ← Color de la carpeta
                </button>
                <div className="flex flex-wrap gap-2 px-4 py-3">
                  {FOLDER_COLORS.map((c) => (
                    <button
                      key={c}
                      aria-label={c}
                      onClick={() => (setMenu(null), recolorFolder(menuFolder, c))}
                      className={`h-7 w-7 rounded-full border-2 ${menuFolder.color.toLowerCase() === c ? "border-white" : "border-transparent"}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {inspected && <InspectDrawer key={inspected.id} media={inspected} onClose={() => setInspectId(null)} />}
    </div>
  );
}

/** Panel lateral con la vista previa y los datos técnicos de un medio. */
function InspectDrawer({ media: m, onClose }: { media: MediaDTO; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rows: [string, string][] = [
    ["Tipo", kindLabel(m)],
    ["Duración", m.kind === "video" && m.durationSeconds != null ? fmtDuration(m.durationSeconds) : "—"],
    ["Formato", (m.mimeType.split("/")[1] ?? m.mimeType).toUpperCase()],
    ["Tamaño", formatBytes(m.sizeBytes)],
    ["Resolución", fmtResolution(m)],
    ["FPS", "—"],
  ];

  return (
    <aside className="drawer space-y-4" role="dialog" aria-label={`Inspector de ${m.originalName}`}>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10">
          <IconSearch className="h-5 w-5 text-accent" />
        </span>
        <h2 className="flex-1 text-lg font-semibold">Inspector</h2>
        <button onClick={onClose} aria-label="Cerrar" className="rounded-lg p-1 text-accent hover:bg-raised">
          <IconClose />
        </button>
      </div>

      <div className="overflow-hidden rounded-xl bg-black">
        {m.kind === "video" ? (
          <video src={m.url} controls playsInline preload="metadata" className="max-h-72 w-full object-contain" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.url} alt={m.originalName} className="max-h-72 w-full object-contain" />
        )}
      </div>

      <div className="space-y-4 rounded-xl bg-raised/60 p-4">
        <h3 className="font-semibold">Medios</h3>
        <a href={m.url} target="_blank" rel="noreferrer" className="block break-all rounded-lg bg-raised px-4 py-3 text-sm text-accent hover:underline">
          {m.originalName}
        </a>
        <dl className="space-y-3 border-t border-line pt-4 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-start justify-between gap-4">
              <dt className="text-zinc-200">{label}</dt>
              <dd className="break-all text-right tabular-nums text-zinc-300">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </aside>
  );
}
