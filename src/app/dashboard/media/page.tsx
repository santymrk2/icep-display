"use client";

import { useCallback, useEffect, useState } from "react";
import { api, formatBytes, type DeviceDTO, type MediaDTO } from "@/lib/client";

type Upload = { name: string; progress: number; error?: string };

function uploadFile(file: File, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", "/api/media/upload");
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name));
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(JSON.parse(xhr.responseText || "{}").error ?? `Error ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("Error de red"));
    xhr.send(file);
  });
}

export default function MediaPage() {
  const [media, setMedia] = useState<MediaDTO[]>([]);
  const [devices, setDevices] = useState<DeviceDTO[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const [target, setTarget] = useState("");

  const load = useCallback(async () => setMedia(await api<MediaDTO[]>("/api/media")), []);
  useEffect(() => {
    void load();
    void api<DeviceDTO[]>("/api/devices").then(setDevices);
  }, [load]);

  async function handleFiles(files: FileList | File[]) {
    const list = [...files];
    setUploads(list.map((f) => ({ name: f.name, progress: 0 })));
    // De a uno para no saturar la red con varios 4K en paralelo.
    for (const [i, f] of list.entries()) {
      try {
        await uploadFile(f, (p) => setUploads((u) => u.map((x, j) => (j === i ? { ...x, progress: p } : x))));
        setUploads((u) => u.map((x, j) => (j === i ? { ...x, progress: 1 } : x)));
      } catch (err) {
        setUploads((u) => u.map((x, j) => (j === i ? { ...x, error: (err as Error).message } : x)));
      }
    }
    await load();
  }

  async function remove(m: MediaDTO) {
    if (!confirm(`¿Borrar "${m.originalName}"?`)) return;
    await api(`/api/media/${m.id}`, { method: "DELETE" });
    await load();
  }

  async function takeover(m: MediaDTO) {
    await api("/api/takeover", { method: "POST", body: JSON.stringify({ mediaAssetId: m.id, deviceId: target || null }) });
  }

  async function endTakeovers() {
    await api("/api/takeover", { method: "DELETE" });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex-1 text-2xl font-semibold">Medios</h1>
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

      <label
        onDragOver={(e) => (e.preventDefault(), setDragging(true))}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFiles(e.dataTransfer.files);
        }}
        className={`card flex cursor-pointer flex-col items-center justify-center gap-2 border-dashed p-10 text-center text-sm ${dragging ? "border-indigo-500 bg-indigo-500/10" : ""}`}
      >
        <span>Arrastrá imágenes o videos acá, o hacé clic para elegir</span>
        <input type="file" multiple accept="image/*,video/*" className="hidden" onChange={(e) => e.target.files && handleFiles(e.target.files)} />
      </label>

      {uploads.length > 0 && (
        <ul className="space-y-1 text-sm">
          {uploads.map((u, i) => (
            <li key={i} className="flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate">{u.name}</span>
              {u.error ? <span className="text-red-400">{u.error}</span> : <span className="tabular-nums text-zinc-400">{Math.round(u.progress * 100)}%</span>}
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {media.map((m) => (
          <div key={m.id} className="card group overflow-hidden">
            <div className="aspect-video bg-black">
              {m.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.url} alt={m.originalName} loading="lazy" className="h-full w-full object-contain" />
              ) : (
                <video src={`${m.url}#t=1`} preload="metadata" muted className="h-full w-full object-contain" />
              )}
            </div>
            <div className="space-y-2 p-2">
              <div className="truncate text-sm" title={m.originalName}>
                {m.originalName}
              </div>
              <div className="text-xs text-zinc-500">
                {m.kind === "video" ? "Video" : "Imagen"} · {formatBytes(m.sizeBytes)}
              </div>
              <div className="flex gap-2">
                <button className="btn-primary flex-1 text-xs" onClick={() => takeover(m)}>
                  Al aire
                </button>
                <button className="btn-danger text-xs" onClick={() => remove(m)}>
                  Borrar
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
