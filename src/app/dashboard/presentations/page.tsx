"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type MediaDTO, type PresentationDTO } from "@/lib/client";

type Item = { mediaAssetId: string; durationSeconds: number | null; asset: MediaDTO };
type Detail = { id: string; name: string; description: string | null; items: Item[] };

export default function PresentationsPage() {
  const [list, setList] = useState<PresentationDTO[]>([]);
  const [media, setMedia] = useState<MediaDTO[]>([]);
  const [current, setCurrent] = useState<Detail | null>(null);
  const [newName, setNewName] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const loadList = useCallback(async () => setList(await api<PresentationDTO[]>("/api/presentations")), []);
  useEffect(() => {
    void loadList();
    void api<MediaDTO[]>("/api/media").then(setMedia);
  }, [loadList]);

  async function open(id: string) {
    setStatus(null);
    setCurrent(await api<Detail>(`/api/presentations/${id}`));
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const p = await api<{ id: string }>("/api/presentations", { method: "POST", body: JSON.stringify({ name: newName }) });
    setNewName("");
    await loadList();
    await open(p.id);
  }

  function setItems(fn: (items: Item[]) => Item[]) {
    setCurrent((c) => (c ? { ...c, items: fn(c.items) } : c));
  }

  function move(i: number, delta: number) {
    setItems((items) => {
      const j = i + delta;
      if (j < 0 || j >= items.length) return items;
      const next = [...items];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function save() {
    if (!current) return;
    await api(`/api/presentations/${current.id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: current.name,
        description: current.description,
        items: current.items.map(({ mediaAssetId, durationSeconds }) => ({ mediaAssetId, durationSeconds })),
      }),
    });
    setStatus("Guardado. Las pantallas que la usan ya se actualizaron.");
    await loadList();
  }

  async function remove() {
    if (!current || !confirm(`¿Borrar "${current.name}"?`)) return;
    await api(`/api/presentations/${current.id}`, { method: "DELETE" });
    setCurrent(null);
    await loadList();
  }

  async function takeover() {
    if (!current) return;
    await api("/api/takeover", { method: "POST", body: JSON.stringify({ presentationId: current.id, deviceId: null }) });
    setStatus("En el aire en todas las pantallas.");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Presentaciones</h1>
        <form onSubmit={create} className="flex gap-2">
          <input className="input flex-1" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nueva presentación" />
          <button className="btn-primary" disabled={!newName.trim()}>
            Crear
          </button>
        </form>
        <ul className="card divide-y divide-zinc-800">
          {list.map((p) => (
            <li key={p.id}>
              <button onClick={() => open(p.id)} className={`w-full p-3 text-left text-sm hover:bg-zinc-800 ${current?.id === p.id ? "bg-zinc-800" : ""}`}>
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-zinc-500">{p.itemCount} elementos</div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {current ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <input className="input flex-1 text-lg" value={current.name} onChange={(e) => setCurrent({ ...current, name: e.target.value })} />
            <button className="btn-primary" onClick={save}>
              Guardar
            </button>
            <button className="btn" onClick={takeover}>
              Al aire ahora
            </button>
            <button className="btn-danger" onClick={remove}>
              Borrar
            </button>
          </div>
          {status && <p className="text-sm text-zinc-400">{status}</p>}

          <ol className="card divide-y divide-zinc-800">
            {current.items.length === 0 && <li className="p-4 text-sm text-zinc-400">Agregá medios desde la lista de abajo.</li>}
            {current.items.map((it, i) => (
              <li key={`${it.mediaAssetId}-${i}`} className="flex items-center gap-3 p-2">
                <span className="w-6 text-right text-xs text-zinc-500">{i + 1}</span>
                <div className="h-12 w-20 shrink-0 bg-black">
                  {it.asset.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.asset.url} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <video src={`${it.asset.url}#t=1`} preload="metadata" muted className="h-full w-full object-contain" />
                  )}
                </div>
                <span className="min-w-0 flex-1 truncate text-sm">{it.asset.originalName}</span>
                <label className="flex items-center gap-1 text-xs text-zinc-400">
                  <input
                    className="input w-20"
                    type="number"
                    min={1}
                    placeholder={it.asset.kind === "video" ? "auto" : "10"}
                    value={it.durationSeconds ?? ""}
                    onChange={(e) => setItems((items) => items.map((x, j) => (j === i ? { ...x, durationSeconds: e.target.value ? Number(e.target.value) : null } : x)))}
                  />
                  seg
                </label>
                <button className="btn px-2" onClick={() => move(i, -1)} aria-label="Subir">
                  ↑
                </button>
                <button className="btn px-2" onClick={() => move(i, 1)} aria-label="Bajar">
                  ↓
                </button>
                <button className="btn px-2" onClick={() => setItems((items) => items.filter((_, j) => j !== i))} aria-label="Quitar">
                  ✕
                </button>
              </li>
            ))}
          </ol>

          <h2 className="pt-4 text-sm font-medium text-zinc-400">Agregar medios</h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6">
            {media.map((m) => (
              <button
                key={m.id}
                onClick={() => setItems((items) => [...items, { mediaAssetId: m.id, durationSeconds: null, asset: m }])}
                className="card overflow-hidden text-left hover:border-indigo-500"
                title={m.originalName}
              >
                <div className="aspect-video bg-black">
                  {m.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.url} alt="" loading="lazy" className="h-full w-full object-contain" />
                  ) : (
                    <video src={`${m.url}#t=1`} preload="metadata" muted className="h-full w-full object-contain" />
                  )}
                </div>
                <div className="truncate p-1 text-xs">{m.originalName}</div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="self-center text-sm text-zinc-400">Elegí o creá una presentación.</p>
      )}
    </div>
  );
}
