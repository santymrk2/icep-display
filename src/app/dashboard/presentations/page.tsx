"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type MediaDTO, type PresentationDTO } from "@/lib/client";
import { IconClose, IconPlus, IconPresentations, IconSearch } from "@/components/Icons";

type Item = { mediaAssetId: string; durationSeconds: number | null; asset: MediaDTO };
type Detail = { id: string; name: string; description: string | null; items: Item[] };

const ACCENT = "#2492ff";

// Iconos locales de esta página (no están en Icons.tsx).
const svgBase = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const GRIP_POINTS: [number, number][] = [
  [9, 6],
  [15, 6],
  [9, 12],
  [15, 12],
  [9, 18],
  [15, 18],
];
function IconGrip() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      {GRIP_POINTS.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={1.8} />
      ))}
    </svg>
  );
}
const IconCheck = () => (
  <svg {...svgBase} width={12} height={12} strokeWidth={2.4}>
    <path d="m5 12 5 5 9-10" />
  </svg>
);
const IconArrowUp = () => (
  <svg {...svgBase}>
    <path d="m18 15-6-6-6 6" />
  </svg>
);
const IconArrowDown = () => (
  <svg {...svgBase}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);
const IconChevronLeft = () => (
  <svg {...svgBase} width={18} height={18}>
    <path d="m15 18-6-6 6-6" />
  </svg>
);
const IconChevronRight = () => (
  <svg {...svgBase} width={18} height={18}>
    <path d="m9 18 6-6-6-6" />
  </svg>
);
const IconEye = () => (
  <svg {...svgBase} width={16} height={16}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

function Thumb({ m }: { m: MediaDTO }) {
  if (m.thumbnailUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={m.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-cover" />;
  }
  return m.kind === "image" ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={m.url} alt="" loading="lazy" className="h-full w-full object-contain" />
  ) : (
    <video src={`${m.url}#t=1`} preload="metadata" muted className="h-full w-full object-contain" />
  );
}

export default function PresentationsPage() {
  const [list, setList] = useState<PresentationDTO[]>([]);
  const [media, setMedia] = useState<MediaDTO[]>([]);
  const [current, setCurrent] = useState<Detail | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [listQuery, setListQuery] = useState("");
  const [mediaQuery, setMediaQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [preview, setPreview] = useState<number | null>(null);
  // Arrastre: "armed" activa draggable solo al tomar el asa, para no interferir con los inputs.
  const [armed, setArmed] = useState<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);

  const loadList = useCallback(async () => setList(await api<PresentationDTO[]>("/api/presentations")), []);
  useEffect(() => {
    void loadList();
    void api<MediaDTO[]>("/api/media").then(setMedia);
  }, [loadList]);

  const itemCount = current?.items.length ?? 0;
  const previewIdx = preview !== null && preview < itemCount ? preview : null;

  // Teclado en la vista previa: Esc cierra, flechas navegan.
  useEffect(() => {
    if (preview === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreview(null);
      if (e.key === "ArrowRight") setPreview((i) => (i === null ? i : Math.min(itemCount - 1, i + 1)));
      if (e.key === "ArrowLeft") setPreview((i) => (i === null ? i : Math.max(0, i - 1)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview, itemCount]);

  async function open(id: string) {
    setStatus(null);
    setPicked([]);
    setPreview(null);
    setCurrent(await api<Detail>(`/api/presentations/${id}`));
  }

  async function create() {
    const name = prompt("Nombre de la nueva presentación")?.trim();
    if (!name) return;
    const p = await api<{ id: string }>("/api/presentations", { method: "POST", body: JSON.stringify({ name }) });
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

  // insertAt es una posición de inserción (0..n) respecto a la lista original.
  function reorder(from: number, insertAt: number) {
    setItems((items) => {
      const to = insertAt > from ? insertAt - 1 : insertAt;
      if (from === to || from < 0 || from >= items.length) return items;
      const next = [...items];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function addPicked() {
    if (!current || picked.length === 0) return;
    const chosen = picked.map((id) => media.find((m) => m.id === id)).filter((m): m is MediaDTO => Boolean(m));
    setItems((items) => [...items, ...chosen.map((m) => ({ mediaAssetId: m.id, durationSeconds: null, asset: m }))]);
    setPicked([]);
  }

  function togglePick(id: string) {
    setPicked((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function endDrag() {
    setDragFrom(null);
    setDropAt(null);
    setArmed(null);
  }

  function onRowDragOver(i: number, e: React.DragEvent<HTMLTableRowElement>) {
    if (dragFrom === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const r = e.currentTarget.getBoundingClientRect();
    const at = e.clientY > r.top + r.height / 2 ? i + 1 : i;
    if (at !== dropAt) setDropAt(at);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    if (dragFrom !== null && dropAt !== null) reorder(dragFrom, dropAt);
    endDrag();
  }

  // La línea azul solo se muestra si soltar ahí cambia el orden.
  const lineAt =
    dragFrom !== null && dropAt !== null && dropAt !== dragFrom && dropAt !== dragFrom + 1 ? dropAt : null;

  function setDuration(i: number, value: string) {
    setItems((items) => items.map((x, j) => (j === i ? { ...x, durationSeconds: value ? Number(value) : null } : x)));
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

  const q = listQuery.trim().toLowerCase();
  const visibleList = list.filter((p) => p.name.toLowerCase().includes(q));
  const mq = mediaQuery.trim().toLowerCase();
  const visibleMedia = media.filter((m) => m.originalName.toLowerCase().includes(mq));
  const previewItem = current && previewIdx !== null ? current.items[previewIdx] : null;

  return (
    <>
      <div className="grid min-h-[70vh] overflow-hidden rounded-xl border border-line bg-canvas lg:grid-cols-[16rem_minmax(0,1fr)_20rem]">
        {/* Columna izquierda: lista de presentaciones */}
        <aside className="flex min-h-0 flex-col bg-panel lg:border-r lg:border-line">
          <div className="space-y-3 p-4">
            <h1 className="text-lg font-semibold">Presentaciones</h1>
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input className="input w-full pl-9" placeholder="Buscar..." value={listQuery} onChange={(e) => setListQuery(e.target.value)} />
              </div>
              <button className="btn-primary px-3" onClick={create} aria-label="Nueva presentación">
                <IconPlus />
                Nueva
              </button>
            </div>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto border-t border-line">
            {visibleList.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => open(p.id)}
                  className={`flex w-full flex-col gap-0.5 border-l-2 px-4 py-3 text-left text-sm hover:bg-white/[0.03] ${
                    current?.id === p.id ? "border-accent bg-raised" : "border-transparent"
                  }`}
                >
                  <span className="truncate font-medium">{p.name}</span>
                  <span className="text-xs text-zinc-500">{p.itemCount} elementos</span>
                </button>
              </li>
            ))}
            {visibleList.length === 0 && <li className="p-4 text-sm text-zinc-500">Sin resultados.</li>}
          </ul>
        </aside>

        {/* Columna central: editor de la presentación */}
        <section className="flex min-w-0 flex-col">
          {current ? (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-line p-4">
                <IconPresentations className="h-5 w-5 shrink-0 text-zinc-400" />
                <input
                  className="input min-w-0 flex-1 border-transparent bg-transparent px-1 text-lg font-semibold focus:border-line"
                  value={current.name}
                  onChange={(e) => setCurrent({ ...current, name: e.target.value })}
                  aria-label="Nombre de la presentación"
                />
                <div className="flex flex-wrap gap-2">
                  <button className="btn-primary" onClick={save}>
                    Guardar
                  </button>
                  <button className="btn" onClick={() => setPreview(0)} disabled={itemCount === 0}>
                    <IconEye />
                    Vista previa
                  </button>
                  <button className="btn" onClick={takeover}>
                    Al aire ahora
                  </button>
                  <button className="btn-danger" onClick={remove}>
                    Borrar
                  </button>
                </div>
              </div>
              {status && <p className="px-4 pt-3 text-sm text-zinc-400">{status}</p>}

              <div className="p-4">
                <div className="table-shell">
                  <div className="overflow-x-auto">
                    <table>
                      <thead>
                        <tr>
                          <th className="w-20">#</th>
                          <th className="w-28">Miniatura</th>
                          <th>Nombre</th>
                          <th className="w-36">Duración</th>
                          <th className="w-24">Tipo</th>
                          <th className="w-32 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {current.items.length === 0 && (
                          <tr>
                            <td colSpan={6} className="py-10 text-center text-sm text-zinc-500">
                              Agregá medios desde el panel de la derecha.
                            </td>
                          </tr>
                        )}
                        {current.items.map((it, i) => {
                          const n = current.items.length;
                          const edge =
                            lineAt === i ? `inset 0 2px 0 0 ${ACCENT}` : lineAt === n && i === n - 1 ? `inset 0 -2px 0 0 ${ACCENT}` : undefined;
                          const cellStyle = edge ? { boxShadow: edge } : undefined;
                          return (
                            <tr
                              key={`${it.mediaAssetId}-${i}`}
                              draggable={armed === i}
                              onDragStart={(e) => {
                                setDragFrom(i);
                                e.dataTransfer.effectAllowed = "move";
                                e.dataTransfer.setData("text/plain", String(i));
                              }}
                              onDragOver={(e) => onRowDragOver(i, e)}
                              onDrop={onDrop}
                              onDragEnd={endDrag}
                              className={`row-click ${dragFrom === i ? "opacity-40" : ""}`}
                            >
                              <td style={cellStyle}>
                                <div className="flex items-center gap-2 text-zinc-400">
                                  <span
                                    className="cursor-grab touch-none rounded p-1 hover:bg-raised hover:text-zinc-200 active:cursor-grabbing"
                                    onMouseDown={() => setArmed(i)}
                                    onMouseUp={() => setArmed(null)}
                                    title="Arrastrar para reordenar"
                                  >
                                    <IconGrip />
                                  </span>
                                  <span className="tabular-nums text-zinc-300">{i + 1}</span>
                                </div>
                              </td>
                              <td style={cellStyle}>
                                <div className="h-12 w-20 overflow-hidden rounded bg-black">
                                  <Thumb m={it.asset} />
                                </div>
                              </td>
                              <td style={cellStyle} className="w-full max-w-0">
                                <span className="block truncate">{it.asset.originalName}</span>
                              </td>
                              <td style={cellStyle}>
                                <label className="flex items-center gap-2 text-xs text-zinc-400">
                                  <input
                                    className="input w-20 py-1.5"
                                    type="number"
                                    min={1}
                                    placeholder={
                                      it.asset.kind === "video"
                                        ? it.asset.durationSeconds != null
                                          ? String(it.asset.durationSeconds)
                                          : "auto"
                                        : "10"
                                    }
                                    value={it.durationSeconds ?? ""}
                                    onChange={(e) => setDuration(i, e.target.value)}
                                    aria-label="Duración en segundos"
                                  />
                                  seg
                                </label>
                              </td>
                              <td style={cellStyle} className="text-zinc-400">
                                {it.asset.kind === "image" ? "Imagen" : "Video"}
                              </td>
                              <td style={cellStyle}>
                                <div className="flex justify-end gap-1">
                                  <button className="btn px-2 py-1.5" onClick={() => move(i, -1)} aria-label="Subir" title="Subir">
                                    <IconArrowUp />
                                  </button>
                                  <button className="btn px-2 py-1.5" onClick={() => move(i, 1)} aria-label="Bajar" title="Bajar">
                                    <IconArrowDown />
                                  </button>
                                  <button
                                    className="btn px-2 py-1.5"
                                    onClick={() => setItems((items) => items.filter((_, j) => j !== i))}
                                    aria-label="Quitar"
                                    title="Quitar"
                                  >
                                    <IconClose className="h-4 w-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
                <p className="pt-3 text-xs text-zinc-500">Arrastrá el asa (⋮⋮) para reordenar, o usá las flechas.</p>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-zinc-400">Elegí o creá una presentación.</div>
          )}
        </section>

        {/* Columna derecha: selector de medios */}
        <aside className="flex min-h-0 flex-col border-t border-line bg-panel lg:border-l lg:border-t-0">
          <div className="space-y-3 border-b border-line p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Medios</h2>
              <span className="text-xs text-zinc-500">{media.length} archivos</span>
            </div>
            <div className="relative">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input className="input w-full pl-9" placeholder="Buscar medios..." value={mediaQuery} onChange={(e) => setMediaQuery(e.target.value)} />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="grid grid-cols-2 gap-2">
              {visibleMedia.map((m) => {
                const on = picked.includes(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => togglePick(m.id)}
                    title={m.originalName}
                    aria-pressed={on}
                    className={`overflow-hidden rounded-lg border text-left transition ${
                      on ? "border-accent ring-1 ring-accent" : "border-line hover:border-zinc-500"
                    }`}
                  >
                    <div className="relative aspect-video bg-black">
                      <Thumb m={m} />
                      {on && (
                        <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white">
                          <IconCheck />
                        </span>
                      )}
                    </div>
                    <div className="truncate px-2 py-1.5 text-xs">{m.originalName}</div>
                  </button>
                );
              })}
            </div>
            {visibleMedia.length === 0 && <p className="p-2 text-sm text-zinc-500">No hay medios.</p>}
          </div>
          <div className="border-t border-line p-4">
            <button className="btn-primary w-full" disabled={!current || picked.length === 0} onClick={addPicked}>
              Agregar a la presentación ({picked.length})
            </button>
          </div>
        </aside>
      </div>

      {/* Vista previa */}
      {current && previewItem && previewIdx !== null && (
        <div className="modal-backdrop" onClick={() => setPreview(null)}>
          <div className="modal max-w-5xl overflow-hidden" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <div className="min-w-0">
                <div className="truncate font-semibold">{current.name}</div>
                <div className="text-xs text-zinc-400">
                  {previewIdx + 1} de {itemCount}
                </div>
              </div>
              <button className="btn px-2" onClick={() => setPreview(null)} aria-label="Cerrar vista previa">
                <IconClose />
              </button>
            </div>
            <div className="grid lg:grid-cols-[minmax(0,1fr)_16rem]">
              <div className="relative h-[60vh] bg-black">
                {previewItem.asset.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={previewItem.asset.url} src={previewItem.asset.url} alt="" className="h-full w-full object-contain" />
                ) : (
                  <video key={previewItem.asset.url} src={previewItem.asset.url} controls className="h-full w-full object-contain" />
                )}
                <button
                  className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80 disabled:opacity-30"
                  onClick={() => setPreview(Math.max(0, previewIdx - 1))}
                  disabled={previewIdx === 0}
                  aria-label="Anterior"
                >
                  <IconChevronLeft />
                </button>
                <button
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80 disabled:opacity-30"
                  onClick={() => setPreview(Math.min(itemCount - 1, previewIdx + 1))}
                  disabled={previewIdx >= itemCount - 1}
                  aria-label="Siguiente"
                >
                  <IconChevronRight />
                </button>
              </div>
              <div className="flex max-h-[60vh] flex-col border-t border-line bg-panel lg:border-l lg:border-t-0">
                <div className="flex items-center gap-2 border-b border-line px-4 py-3 text-sm font-semibold">
                  <IconPresentations className="h-4 w-4 text-zinc-400" />
                  Orden
                </div>
                <ol className="min-h-0 flex-1 overflow-y-auto">
                  {current.items.map((it, i) => (
                    <li key={`${it.mediaAssetId}-${i}`}>
                      <button
                        onClick={() => setPreview(i)}
                        className={`flex w-full items-center gap-3 border-l-2 px-4 py-2.5 text-left text-sm hover:bg-white/[0.03] ${
                          i === previewIdx ? "border-accent bg-raised" : "border-transparent"
                        }`}
                      >
                        <span className="w-4 text-right text-xs tabular-nums text-zinc-500">{i + 1}</span>
                        <div className="h-9 w-16 shrink-0 overflow-hidden rounded bg-black">
                          <Thumb m={it.asset} />
                        </div>
                        <span className="min-w-0 flex-1 truncate">{it.asset.originalName}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
