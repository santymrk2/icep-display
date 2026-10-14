"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, formatBytes, type DeviceDTO, type FolderDTO, type MediaDTO } from "@/lib/client";
import { IconFolder, IconMedia, IconPlus, IconSearch } from "@/components/Icons";

type Upload = { name: string; progress: number; error?: string };
type Flash = { error: boolean; text: string };
/** Menú de acciones de una fila. key = "a:<assetId>" o "f:<folderId>". */
type Menu = { key: string; view: "main" | "move"; top: number; right: number };

function uploadFile(file: File, onProgress: (p: number) => void) {
  return new Promise<MediaDTO>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", "/api/media/upload");
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name));
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

const typeLabel = (m: MediaDTO) => m.mimeType.split("/")[1] ?? m.kind;
const fmtDate = (iso: string) => new Date(iso).toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" });
const menuItem = "flex w-full items-center px-3 py-2 text-left hover:bg-raised disabled:opacity-40 disabled:hover:bg-transparent";

export default function MediaPage() {
  const [media, setMedia] = useState<MediaDTO[]>([]);
  const [folders, setFolders] = useState<FolderDTO[]>([]);
  const [devices, setDevices] = useState<DeviceDTO[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const [target, setTarget] = useState("");
  /** null = raíz ("Mi biblioteca"). */
  const [folderId, setFolderId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<Menu | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const load = useCallback(async () => {
    const [m, f] = await Promise.all([api<MediaDTO[]>("/api/media"), api<FolderDTO[]>("/api/media/folders")]);
    setMedia(m);
    setFolders(f);
  }, []);

  useEffect(() => {
    load().catch((err: Error) => setFlash({ error: true, text: err.message }));
    void api<DeviceDTO[]>("/api/devices").then(setDevices);
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

  async function handleFiles(files: FileList | File[]) {
    const list = [...files];
    if (list.length === 0) return;
    const dest = folderId; // la carpeta donde se soltó, aunque el usuario navegue después
    setUploads(list.map((f) => ({ name: f.name, progress: 0 })));
    // De a uno para no saturar la red con varios 4K en paralelo.
    for (const [i, f] of list.entries()) {
      const setItem = (patch: Partial<Upload>) => setUploads((u) => u.map((x, j) => (j === i ? { ...x, ...patch } : x)));
      try {
        const asset = await uploadFile(f, (p) => setItem({ progress: p }));
        if (dest) await api(`/api/media/${asset.id}`, { method: "PATCH", body: JSON.stringify({ folderId: dest }) });
        setItem({ progress: 1 });
      } catch (err) {
        setItem({ error: (err as Error).message });
      }
    }
    await load().catch(() => {});
  }

  // Arrastrar: se contan entradas/salidas para que el resaltado no parpadee al pasar por hijos.
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

  function createFolder() {
    const name = window.prompt("Nombre de la nueva carpeta")?.trim();
    if (!name) return;
    void run(async () => {
      await api("/api/media/folders", { method: "POST", body: JSON.stringify({ name }) });
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

  function deleteFolder(f: FolderDTO) {
    if (!confirm(`¿Borrar la carpeta "${f.name}"? Los archivos que contiene se mantienen en Mi biblioteca.`)) return;
    void run(async () => {
      await api(`/api/media/folders/${f.id}`, { method: "DELETE" });
      if (folderId === f.id) setFolderId(null);
      await load();
      return `Carpeta "${f.name}" borrada`;
    });
  }

  function moveAsset(m: MediaDTO, dest: string | null) {
    void run(async () => {
      await api(`/api/media/${m.id}`, { method: "PATCH", body: JSON.stringify({ folderId: dest }) });
      await load();
      const where = dest ? folders.find((f) => f.id === dest)?.name : "Mi biblioteca";
      return `"${m.originalName}" movido a ${where}`;
    });
  }

  function removeAsset(m: MediaDTO) {
    if (!confirm(`¿Borrar "${m.originalName}"?`)) return;
    void run(async () => {
      await api(`/api/media/${m.id}`, { method: "DELETE" });
      await load();
      return `"${m.originalName}" borrado`;
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
    setMenu({ key, view: "main", top: r.bottom + 4, right: window.innerWidth - r.right });
  }

  const q = query.trim().toLowerCase();
  const currentFolder = folders.find((f) => f.id === folderId) ?? null;
  const visibleFolders = folderId === null ? folders.filter((f) => !q || f.name.toLowerCase().includes(q)) : [];
  const visibleMedia = media.filter(
    (m) => (folderId === null ? m.folderId === null : m.folderId === folderId) && (!q || m.originalName.toLowerCase().includes(q)),
  );
  const menuAsset = menu?.key.startsWith("a:") ? media.find((m) => m.id === menu.key.slice(2)) : undefined;
  const menuFolder = menu?.key.startsWith("f:") ? folders.find((f) => f.id === menu.key.slice(2)) : undefined;

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <aside className="card h-fit shrink-0 p-3 md:w-56">
        <div className="px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Biblioteca</div>
        <button className="flex w-full items-center gap-2 rounded-lg bg-accent/15 px-3 py-2 text-left text-sm font-medium text-accent">
          <IconMedia className="h-4 w-4" />
          Mi biblioteca
        </button>
      </aside>

      <section
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className="relative min-w-0 flex-1 space-y-5"
      >
        {dragging && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-accent/10 text-sm font-medium text-accent backdrop-blur-[1px]">
            {currentFolder ? `Soltá para subir a "${currentFolder.name}"` : "Soltá los archivos para subirlos a Mi biblioteca"}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <h1 className="flex flex-1 items-center gap-2 text-2xl font-semibold">
            <IconMedia className="h-6 w-6 text-zinc-400" />
            Medios
          </h1>
          <button className="btn" onClick={createFolder}>
            <IconFolder className="h-4 w-4" />
            Nueva carpeta
          </button>
          <button className="btn-primary" onClick={() => fileInput.current?.click()}>
            <IconPlus />
            Agregar
          </button>
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
          <nav className="flex flex-wrap items-center gap-2 text-sm">
            <button className="text-accent hover:underline" onClick={() => setFolderId(null)}>
              ← Volver
            </button>
            <span className="text-zinc-600">|</span>
            <button className="text-zinc-400 hover:text-zinc-100" onClick={() => setFolderId(null)}>
              Mi biblioteca
            </button>
            <span className="text-zinc-600">/</span>
            <span className="font-medium">{currentFolder?.name ?? "Carpeta no encontrada"}</span>
          </nav>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-md flex-1">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input className="input w-full pl-9" placeholder="Buscar..." value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-zinc-400">
              Enviar a
              <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Todas las pantallas</option>
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn" onClick={endTakeovers}>
              Volver a la programación
            </button>
          </div>
        </div>

        {flash && <p className={`text-sm ${flash.error ? "text-red-400" : "text-emerald-400"}`}>{flash.text}</p>}

        {uploads.length > 0 && (
          <ul className="card divide-y divide-line text-sm">
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

        <div className="table-shell overflow-x-auto">
          <table className="min-w-[680px]">
            <thead>
              <tr>
                <th className="w-32">
                  <span className="sr-only">Vista previa</span>
                </th>
                <th>Nombre</th>
                <th>Tipo</th>
                <th>Peso</th>
                <th>Fecha de alta</th>
                <th className="w-12">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleFolders.map((f) => (
                <tr key={`f-${f.id}`} className="row-click" onClick={() => setFolderId(f.id)}>
                  <td>
                    <div className="flex aspect-video w-24 items-center justify-center rounded-md bg-raised text-amber-400">
                      <IconFolder className="h-6 w-6" />
                    </div>
                  </td>
                  <td className="font-medium">{f.name}</td>
                  <td className="text-zinc-400">Carpeta</td>
                  <td className="text-zinc-500">—</td>
                  <td className="whitespace-nowrap text-zinc-400">{fmtDate(f.createdAt)}</td>
                  <td className="text-right">
                    <button
                      aria-label={`Acciones de ${f.name}`}
                      className="rounded-md px-2 py-1 text-zinc-400 hover:bg-raised hover:text-zinc-100"
                      onClick={(e) => openMenu(e, `f:${f.id}`)}
                    >
                      ...
                    </button>
                  </td>
                </tr>
              ))}

              {visibleMedia.map((m) => (
                <tr key={m.id}>
                  <td>
                    <div className="aspect-video w-24 overflow-hidden rounded-md bg-black">
                      {m.kind === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <video src={`${m.url}#t=1`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
                      )}
                    </div>
                  </td>
                  <td className="max-w-xs truncate" title={m.originalName}>
                    {m.originalName}
                  </td>
                  <td className="text-zinc-400">{typeLabel(m)}</td>
                  <td className="whitespace-nowrap text-zinc-400">{formatBytes(m.sizeBytes)}</td>
                  <td className="whitespace-nowrap text-zinc-400">{fmtDate(m.uploadedAt)}</td>
                  <td className="text-right">
                    <button
                      aria-label={`Acciones de ${m.originalName}`}
                      className="rounded-md px-2 py-1 text-zinc-400 hover:bg-raised hover:text-zinc-100"
                      onClick={(e) => openMenu(e, `a:${m.id}`)}
                    >
                      ...
                    </button>
                  </td>
                </tr>
              ))}

              {visibleFolders.length === 0 && visibleMedia.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-zinc-500">
                    {q ? "Sin resultados" : folderId === null ? "Todavía no hay medios. Arrastrá archivos acá o usá Agregar." : "Esta carpeta está vacía."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {menu && (menuAsset || menuFolder) && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
          <div
            className="fixed z-50 w-56 overflow-hidden rounded-xl border border-line bg-panel py-1 text-sm shadow-2xl"
            style={{ top: menu.top, right: menu.right }}
          >
            {menuAsset && menu.view === "main" && (
              <>
                <button className={menuItem} onClick={() => (setMenu(null), takeover(menuAsset))}>
                  Poner al aire
                </button>
                <button className={menuItem} onClick={() => setMenu({ ...menu, view: "move" })}>
                  Mover a carpeta…
                </button>
                <div className="my-1 border-t border-line" />
                <button className={`${menuItem} text-red-400`} onClick={() => (setMenu(null), removeAsset(menuAsset))}>
                  Borrar
                </button>
              </>
            )}

            {menuAsset && menu.view === "move" && (
              <>
                <button className="px-3 py-2 text-left text-xs text-zinc-400 hover:text-zinc-100" onClick={() => setMenu({ ...menu, view: "main" })}>
                  ← Mover a…
                </button>
                <div className="my-1 border-t border-line" />
                <button className={menuItem} disabled={menuAsset.folderId === null} onClick={() => (setMenu(null), moveAsset(menuAsset, null))}>
                  Mi biblioteca
                </button>
                {folders.map((f) => (
                  <button
                    key={f.id}
                    className={menuItem}
                    disabled={menuAsset.folderId === f.id}
                    onClick={() => (setMenu(null), moveAsset(menuAsset, f.id))}
                  >
                    <span className="truncate">{f.name}</span>
                  </button>
                ))}
                {folders.length === 0 && <p className="px-3 py-2 text-xs text-zinc-500">Todavía no hay carpetas.</p>}
              </>
            )}

            {menuFolder && (
              <>
                <button className={menuItem} onClick={() => (setMenu(null), setFolderId(menuFolder.id))}>
                  Abrir
                </button>
                <button className={menuItem} onClick={() => (setMenu(null), renameFolder(menuFolder))}>
                  Renombrar
                </button>
                <div className="my-1 border-t border-line" />
                <button className={`${menuItem} text-red-400`} onClick={() => (setMenu(null), deleteFolder(menuFolder))}>
                  Borrar carpeta
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
