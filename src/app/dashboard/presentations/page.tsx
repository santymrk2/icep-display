"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { api, type MediaDTO, type Orientation, type PresentationDTO, type Transition } from "@/lib/client";
import { IconClose, IconPlus, IconPresentations, IconSearch } from "@/components/Icons";

type Fit = "contain" | "cover";
type Rotation = 0 | 90 | 180 | 270;
type MediaRow = {
  uid: number;
  type: "media";
  mediaAssetId: string;
  durationSeconds: number | null;
  fit: Fit;
  /** null = usa la transición de la presentación. */
  transition: Transition | null;
  rotation: Rotation;
  flipH: boolean;
  flipV: boolean;
  asset: MediaDTO;
};
/** "collapsed" es solo de la interfaz: no se envía al servidor. */
type SectionRow = { uid: number; type: "section"; name: string; collapsed: boolean };
type Row = MediaRow | SectionRow;
type Detail = { id: string; name: string; description: string | null; orientation: Orientation; transition: Transition; items: Row[] };

type ApiItem =
  | {
      type: "media";
      mediaAssetId: string;
      durationSeconds: number | null;
      fit: string;
      transition?: string | null;
      rotation?: number;
      flipH?: boolean;
      flipV?: boolean;
      asset: MediaDTO;
    }
  | { type: "section"; name: string };
type ApiDetail = { id: string; name: string; description: string | null; orientation: string; transition: string; items: ApiItem[] };

const ACCENT = "#2492ff";
const ICEP_FADE_CSS =
  "@keyframes icep-fade{from{opacity:0}to{opacity:1}}.icep-fade{animation:icep-fade 700ms ease-in-out}@media (prefers-reduced-motion:reduce){.icep-fade{animation:none}}";

// Identificador local por fila (para claves de React); no se guarda.
let uidSeq = 0;
const nextUid = () => ++uidSeq;

function normRotation(r?: number): Rotation {
  return r === 90 || r === 180 || r === 270 ? r : 0;
}

function hydrate(d: ApiDetail): Detail {
  return {
    id: d.id,
    name: d.name,
    description: d.description,
    orientation: d.orientation === "portrait" ? "portrait" : "landscape",
    transition: d.transition === "dissolve" ? "dissolve" : "cut",
    items: d.items.map((it): Row =>
      it.type === "section"
        ? { uid: nextUid(), type: "section", name: it.name, collapsed: false }
        : {
            uid: nextUid(),
            type: "media",
            mediaAssetId: it.mediaAssetId,
            durationSeconds: it.durationSeconds,
            fit: it.fit === "cover" ? "cover" : "contain",
            transition: it.transition === "cut" || it.transition === "dissolve" ? it.transition : null,
            rotation: normRotation(it.rotation),
            flipH: !!it.flipH,
            flipV: !!it.flipV,
            asset: it.asset,
          },
    ),
  };
}

/**
 * Para cada fila: su número de reproducción (solo los medios cuentan, las secciones no),
 * si está oculta por una sección plegada, y cuántos medios tiene cada sección.
 */
function analyze(items: Row[]) {
  const playPos: number[] = [];
  const hidden: boolean[] = [];
  const groupSize: number[] = [];
  let k = 0;
  let collapsed = false;
  let sec = -1;
  items.forEach((it, i) => {
    if (it.type === "section") {
      collapsed = it.collapsed;
      sec = i;
      hidden.push(false);
      playPos.push(-1);
      groupSize[i] = 0;
    } else {
      hidden.push(collapsed);
      playPos.push(k++);
      if (sec >= 0) groupSize[sec]++;
    }
  });
  return { playPos, hidden, groupSize, count: k };
}

/** Marco con la proporción de la presentación, dentro del escenario de la vista previa (60vh). */
function frameStyle(o: Orientation): CSSProperties {
  return {
    containerType: "size",
    ...(o === "portrait" ? { height: "min(100%, 60vh)", aspectRatio: "9 / 16" } : { width: "min(100%, calc(60vh * 16 / 9))", aspectRatio: "16 / 9" }),
  };
}

/** Marco dentro del drawer (altura fija de 18rem). */
function drawerFrameStyle(o: Orientation): CSSProperties {
  return {
    containerType: "size",
    ...(o === "portrait" ? { height: "100%", aspectRatio: "9 / 16" } : { width: "100%", aspectRatio: "16 / 9" }),
  };
}

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
function IconOrientation({ o, size = 12 }: { o: Orientation; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden className="shrink-0">
      {o === "portrait" ? <rect x="5" y="2" width="14" height="20" rx="2" /> : <rect x="2" y="5" width="20" height="14" rx="2" />}
    </svg>
  );
}

function Thumb({ m, fit }: { m: MediaDTO; fit?: Fit }) {
  if (m.thumbnailUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={m.thumbnailUrl} alt="" loading="lazy" className={`h-full w-full ${fit === "contain" ? "object-contain" : "object-cover"}`} />;
  }
  const cls = `h-full w-full ${fit === "cover" ? "object-cover" : "object-contain"}`;
  return m.kind === "image" ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={m.url} alt="" loading="lazy" className={cls} />
  ) : (
    <video src={`${m.url}#t=1`} preload="metadata" muted className={cls} />
  );
}

function xform(r: Rotation, fh: boolean, fv: boolean) {
  return `rotate(${r}deg) scaleX(${fh ? -1 : 1}) scaleY(${fv ? -1 : 1})`;
}

/**
 * Un medio dentro de un marco con proporción fija. Aplica ajuste, giro y espejo.
 * En giros de 90/270 el medio se dibuja con las dimensiones invertidas (unidades de contenedor).
 */
function Layer({
  m,
  fit,
  rotation,
  flipH,
  flipV,
  controls = false,
  thumb = false,
}: {
  m: MediaDTO;
  fit: Fit;
  rotation: Rotation;
  flipH: boolean;
  flipV: boolean;
  controls?: boolean;
  thumb?: boolean;
}) {
  const quarter = rotation === 90 || rotation === 270;
  const style: CSSProperties = quarter
    ? {
        position: "absolute",
        left: "50%",
        top: "50%",
        width: "100cqh",
        height: "100cqw",
        transform: `translate(-50%, -50%) ${xform(rotation, flipH, flipV)}`,
      }
    : { position: "absolute", inset: 0, transform: xform(rotation, flipH, flipV) };
  const cls = `h-full w-full ${fit === "cover" ? "object-cover" : "object-contain"}`;
  return (
    <div style={style}>
      {thumb ? (
        <Thumb m={m} fit={fit} />
      ) : m.kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={m.url} alt="" className={cls} />
      ) : (
        <video src={m.url} controls={controls} className={cls} />
      )}
    </div>
  );
}

function OrientationSwitch({ value, onChange }: { value: Orientation; onChange: (o: Orientation) => void }) {
  const opts: [Orientation, string][] = [
    ["landscape", "Horizontal"],
    ["portrait", "Vertical"],
  ];
  return (
    <div role="group" aria-label="Orientación" className="inline-flex rounded-lg border border-line bg-panel p-0.5">
      {opts.map(([o, label]) => (
        <button
          key={o}
          type="button"
          aria-pressed={value === o}
          onClick={() => onChange(o)}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition ${
            value === o ? "bg-raised text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <IconOrientation o={o} size={14} />
          {label}
        </button>
      ))}
    </div>
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
  // preview es un índice sobre los medios (sin secciones).
  const [preview, setPreview] = useState<number | null>(null);
  // Medio anterior mientras dura el fundido cruzado.
  const [fromPreview, setFromPreview] = useState<number | null>(null);
  // Drawer de detalle: guarda el uid del medio seleccionado.
  const [detailUid, setDetailUid] = useState<number | null>(null);
  const [newPres, setNewPres] = useState<{ name: string; orientation: Orientation } | null>(null);
  // Arrastre: "armed" activa draggable solo al tomar el asa, para no interferir con los inputs.
  const [armed, setArmed] = useState<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);

  const loadList = useCallback(async () => setList(await api<PresentationDTO[]>("/api/presentations")), []);
  useEffect(() => {
    void loadList();
    void api<MediaDTO[]>("/api/media").then(setMedia);
  }, [loadList]);

  const layout = analyze(current?.items ?? []);
  const playItems = (current?.items ?? []).filter((it): it is MediaRow => it.type === "media");
  const playCount = playItems.length;
  const previewIdx = preview !== null && preview < playCount ? preview : null;
  const previewItem = previewIdx !== null ? playItems[previewIdx] : null;
  // Transición del medio que entra: la propia, o la de la presentación si es "Predeterminada".
  const dissolveIn = previewItem ? (previewItem.transition ?? current?.transition) === "dissolve" : false;
  const fromItem: MediaRow | undefined = dissolveIn && fromPreview !== null ? playItems[fromPreview] : undefined;

  const detail = playItems.find((x) => x.uid === detailUid) ?? null;
  const detailPos = detail ? playItems.indexOf(detail) : -1;

  // Teclado en la vista previa: Esc cierra, flechas navegan.
  useEffect(() => {
    if (preview === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreview(null);
      if (e.key === "ArrowRight") setPreview((i) => (i === null ? i : Math.min(playCount - 1, i + 1)));
      if (e.key === "ArrowLeft") setPreview((i) => (i === null ? i : Math.max(0, i - 1)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview, playCount]);

  // Recuerda el medio anterior para el fundido cruzado.
  const lastPreview = useRef<number | null>(null);
  useLayoutEffect(() => {
    const prev = lastPreview.current;
    lastPreview.current = previewIdx;
    if (previewIdx === null) setFromPreview(null);
    else if (prev !== null && prev !== previewIdx) setFromPreview(prev);
  }, [previewIdx]);

  useEffect(() => {
    if (fromPreview === null) return;
    const t = window.setTimeout(() => setFromPreview(null), 800);
    return () => window.clearTimeout(t);
  }, [fromPreview]);

  // Esc cierra el drawer de detalle y el diálogo de nueva presentación.
  useEffect(() => {
    if (detailUid === null && !newPres) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (preview !== null) return;
      if (newPres) setNewPres(null);
      else setDetailUid(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailUid, newPres, preview]);

  async function open(id: string) {
    setStatus(null);
    setPicked([]);
    setPreview(null);
    setDetailUid(null);
    setCurrent(hydrate(await api<ApiDetail>(`/api/presentations/${id}`)));
  }

  async function createPresentation() {
    if (!newPres) return;
    const name = newPres.name.trim();
    if (!name) return;
    const p = await api<{ id: string }>("/api/presentations", {
      method: "POST",
      body: JSON.stringify({ name, orientation: newPres.orientation }),
    });
    setNewPres(null);
    await loadList();
    await open(p.id);
  }

  function patchCurrent(p: Partial<Detail>) {
    setCurrent((c) => (c ? { ...c, ...p } : c));
  }

  function setItems(fn: (items: Row[]) => Row[]) {
    setCurrent((c) => (c ? { ...c, items: fn(c.items) } : c));
  }

  function updateAt(i: number, fn: (row: Row) => Row) {
    setItems((items) => items.map((x, j) => (j === i ? fn(x) : x)));
  }

  function patchMedia(uid: number, patch: Partial<MediaRow>) {
    setItems((items) => items.map((x) => (x.type === "media" && x.uid === uid ? { ...x, ...patch } : x)));
  }

  function stepDetail(delta: number) {
    const next = playItems[detailPos + delta];
    if (next) setDetailUid(next.uid);
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
    setItems((items) => [
      ...items,
      ...chosen.map(
        (m): Row => ({
          uid: nextUid(),
          type: "media",
          mediaAssetId: m.id,
          durationSeconds: null,
          fit: "contain",
          transition: null,
          rotation: 0,
          flipH: false,
          flipV: false,
          asset: m,
        }),
      ),
    ]);
    setPicked([]);
  }

  function addSection() {
    setItems((items) => [...items, { uid: nextUid(), type: "section", name: "Nueva sección", collapsed: false }]);
  }

  function togglePick(id: string) {
    setPicked((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function endDrag() {
    setDragFrom(null);
    setDropAt(null);
    setArmed(null);
  }

  function onRowDragOver(i: number, e: DragEvent<HTMLTableRowElement>) {
    if (dragFrom === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const r = e.currentTarget.getBoundingClientRect();
    const at = e.clientY > r.top + r.height / 2 ? i + 1 : i;
    if (at !== dropAt) setDropAt(at);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    if (dragFrom !== null && dropAt !== null) reorder(dragFrom, dropAt);
    endDrag();
  }

  function dragProps(i: number, extra = "") {
    return {
      draggable: armed === i,
      onDragStart: (e: DragEvent<HTMLTableRowElement>) => {
        setDragFrom(i);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(i));
      },
      onDragOver: (e: DragEvent<HTMLTableRowElement>) => onRowDragOver(i, e),
      onDrop,
      onDragEnd: endDrag,
      className: `row-click ${extra} ${dragFrom === i ? "opacity-40" : ""}`,
    };
  }

  // La línea azul solo se muestra si soltar ahí cambia el orden.
  const lineAt =
    dragFrom !== null && dropAt !== null && dropAt !== dragFrom && dropAt !== dragFrom + 1 ? dropAt : null;

  function setDuration(i: number, value: string) {
    updateAt(i, (x) => (x.type === "media" ? { ...x, durationSeconds: value ? Number(value) : null } : x));
  }

  function setFit(i: number, value: Fit) {
    updateAt(i, (x) => (x.type === "media" ? { ...x, fit: value } : x));
  }

  function renameSection(i: number, name: string) {
    updateAt(i, (x) => (x.type === "section" ? { ...x, name } : x));
  }

  function toggleSection(i: number) {
    updateAt(i, (x) => (x.type === "section" ? { ...x, collapsed: !x.collapsed } : x));
  }

  async function save() {
    if (!current) return;
    await api(`/api/presentations/${current.id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: current.name,
        description: current.description,
        orientation: current.orientation,
        transition: current.transition,
        items: current.items.map((it) =>
          it.type === "section"
            ? { type: "section", name: it.name }
            : {
                type: "media",
                mediaAssetId: it.mediaAssetId,
                durationSeconds: it.durationSeconds,
                fit: it.fit,
                transition: it.transition,
                rotation: it.rotation,
                flipH: it.flipH,
                flipV: it.flipV,
              },
        ),
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
  const dissolveAll = current?.transition === "dissolve";

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
              <button className="btn-primary px-3" onClick={() => setNewPres({ name: "", orientation: "landscape" })} aria-label="Nueva presentación">
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
                  <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                    <IconOrientation o={p.orientation} />
                    {p.orientation === "portrait" ? "Vertical" : "Horizontal"} · {p.itemCount} elementos
                  </span>
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
                  onChange={(e) => patchCurrent({ name: e.target.value })}
                  aria-label="Nombre de la presentación"
                />
                <div className="flex flex-wrap gap-2">
                  <button className="btn-primary" onClick={save}>
                    Guardar
                  </button>
                  <button className="btn" onClick={() => setPreview(0)} disabled={playCount === 0}>
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

              {/* Barra de opciones de la presentación (se guardan con "Guardar") */}
              <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 text-sm">
                <label className="flex items-center gap-2 text-zinc-400">
                  Transición
                  <select
                    className="input py-1.5"
                    value={current.transition}
                    onChange={(e) => patchCurrent({ transition: e.target.value === "dissolve" ? "dissolve" : "cut" })}
                    aria-label="Transición"
                  >
                    <option value="cut">Corte</option>
                    <option value="dissolve">Disolver</option>
                  </select>
                </label>
                <OrientationSwitch value={current.orientation} onChange={(o) => patchCurrent({ orientation: o })} />
                <button className="btn ml-auto" onClick={addSection}>
                  <IconPlus />
                  Agregar sección
                </button>
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
                          <th className="w-36">Ajuste</th>
                          <th className="w-24">Tipo</th>
                          <th className="w-32 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {current.items.length === 0 && (
                          <tr>
                            <td colSpan={7} className="py-10 text-center text-sm text-zinc-500">
                              Agregá medios desde el panel de la derecha.
                            </td>
                          </tr>
                        )}
                        {current.items.map((it, i) => {
                          if (layout.hidden[i]) return null;
                          const n = current.items.length;
                          const edge =
                            lineAt === i ? `inset 0 2px 0 0 ${ACCENT}` : lineAt === n && i === n - 1 ? `inset 0 -2px 0 0 ${ACCENT}` : undefined;
                          const cellStyle = edge ? { boxShadow: edge } : undefined;
                          const grip = (
                            <span
                              className="cursor-grab touch-none rounded p-1 hover:bg-raised hover:text-zinc-200 active:cursor-grabbing"
                              onMouseDown={() => setArmed(i)}
                              onMouseUp={() => setArmed(null)}
                              title="Arrastrar para reordenar"
                            >
                              <IconGrip />
                            </span>
                          );
                          const rowActions = (
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
                                aria-label={it.type === "section" ? "Quitar sección" : "Quitar"}
                                title={it.type === "section" ? "Quitar sección (sus elementos se conservan)" : "Quitar"}
                              >
                                <IconClose className="h-4 w-4" />
                              </button>
                            </div>
                          );

                          if (it.type === "section") {
                            return (
                              <tr key={it.uid} {...dragProps(i, "bg-raised/40")}>
                                <td style={cellStyle}>
                                  <div className="flex items-center gap-2 text-zinc-400">{grip}</div>
                                </td>
                                <td colSpan={5} style={cellStyle}>
                                  <div className="flex items-center gap-2">
                                    <button
                                      className="btn px-2 py-1"
                                      onClick={() => toggleSection(i)}
                                      aria-label={it.collapsed ? "Expandir sección" : "Contraer sección"}
                                      aria-expanded={!it.collapsed}
                                      title={it.collapsed ? "Expandir" : "Contraer"}
                                    >
                                      <span className={`inline-block transition-transform ${it.collapsed ? "-rotate-90" : ""}`}>
                                        <IconArrowDown />
                                      </span>
                                    </button>
                                    <input
                                      className="input min-w-0 flex-1 py-1.5 font-semibold"
                                      value={it.name}
                                      onChange={(e) => renameSection(i, e.target.value)}
                                      placeholder="Nombre de la sección"
                                      aria-label="Nombre de la sección"
                                    />
                                    <span className="shrink-0 text-xs text-zinc-500">{layout.groupSize[i]} elementos</span>
                                  </div>
                                </td>
                                <td style={cellStyle}>{rowActions}</td>
                              </tr>
                            );
                          }

                          return (
                            <tr
                              key={it.uid}
                              {...dragProps(i, detailUid === it.uid ? "bg-raised/60" : "")}
                              onClick={(e) => {
                                // Los controles de la fila conservan su propio comportamiento.
                                if ((e.target as HTMLElement).closest("button,input,select,label,.cursor-grab")) return;
                                setDetailUid(it.uid);
                              }}
                            >
                              <td style={cellStyle}>
                                <div className="flex items-center gap-2 text-zinc-400">
                                  {grip}
                                  <span className="tabular-nums text-zinc-300">{layout.playPos[i] + 1}</span>
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
                              <td style={cellStyle}>
                                <select
                                  className="input w-28 py-1.5"
                                  value={it.fit}
                                  onChange={(e) => setFit(i, e.target.value === "cover" ? "cover" : "contain")}
                                  aria-label="Ajuste"
                                >
                                  <option value="contain">Entero</option>
                                  <option value="cover">Llenar</option>
                                </select>
                              </td>
                              <td style={cellStyle} className="text-zinc-400">
                                {it.asset.kind === "image" ? "Imagen" : "Video"}
                              </td>
                              <td style={cellStyle}>{rowActions}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
                <p className="pt-3 text-xs text-zinc-500">
                  Arrastrá el asa (⋮⋮) para reordenar, o usá las flechas. Hacé clic en un medio para ver su detalle. Las secciones no cuentan en la numeración.
                </p>
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

      {/* Drawer de detalle del medio (estilo ProDisplay) */}
      {current && detail && (
        <aside className="drawer" role="dialog" aria-label="Detalle del elemento">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-zinc-500">
                Elemento {detailPos + 1} de {playCount}
              </div>
              <div className="truncate font-semibold">{detail.asset.originalName}</div>
            </div>
            <button className="btn px-2" onClick={() => setDetailUid(null)} aria-label="Cerrar detalle">
              <IconClose />
            </button>
          </div>

          <div className="flex h-72 items-center justify-center overflow-hidden rounded-lg bg-black">
            <div className="relative overflow-hidden bg-black" style={drawerFrameStyle(current.orientation)}>
              <Layer
                key={detail.asset.url}
                m={detail.asset}
                fit={detail.fit}
                rotation={detail.rotation}
                flipH={detail.flipH}
                flipV={detail.flipV}
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button className="btn flex-1" onClick={() => stepDetail(-1)} disabled={detailPos <= 0}>
              Anterior
            </button>
            <button className="btn flex-1" onClick={() => stepDetail(1)} disabled={detailPos >= playCount - 1}>
              Siguiente
            </button>
          </div>

          <div className="mt-5 space-y-4 text-sm">
            <label className="block space-y-1.5">
              <span className="text-zinc-400">Nombre</span>
              <input className="input w-full" value={detail.asset.originalName} readOnly />
            </label>

            <label className="block space-y-1.5">
              <span className="text-zinc-400">
                {detail.asset.kind === "video" ? "Duración del video (segundos)" : "Avance automático (segundos)"}
              </span>
              <input
                className="input w-full"
                type="number"
                min={1}
                placeholder={
                  detail.asset.kind === "video" ? (detail.asset.durationSeconds != null ? String(detail.asset.durationSeconds) : "auto") : "10"
                }
                value={detail.durationSeconds ?? ""}
                onChange={(e) => patchMedia(detail.uid, { durationSeconds: e.target.value ? Number(e.target.value) : null })}
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-zinc-400">Transición</span>
              <select
                className="input w-full"
                value={detail.transition ?? "default"}
                onChange={(e) =>
                  patchMedia(detail.uid, {
                    transition: e.target.value === "cut" ? "cut" : e.target.value === "dissolve" ? "dissolve" : null,
                  })
                }
              >
                <option value="default">Predeterminada</option>
                <option value="cut">Corte</option>
                <option value="dissolve">Disolver</option>
              </select>
            </label>

            <div className="space-y-4 border-t border-line pt-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Display</div>
              <label className="block space-y-1.5">
                <span className="text-zinc-400">Escala</span>
                <select
                  className="input w-full"
                  value={detail.fit}
                  onChange={(e) => patchMedia(detail.uid, { fit: e.target.value === "cover" ? "cover" : "contain" })}
                >
                  <option value="contain">Entero</option>
                  <option value="cover">Llenar</option>
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-zinc-400">Giro</span>
                <select
                  className="input w-full"
                  value={String(detail.rotation)}
                  onChange={(e) => patchMedia(detail.uid, { rotation: normRotation(Number(e.target.value)) })}
                >
                  <option value="0">0°</option>
                  <option value="90">90°</option>
                  <option value="180">180°</option>
                  <option value="270">270°</option>
                </select>
              </label>
              <label className="flex items-center justify-between gap-3">
                <span>Espejo horizontal</span>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#2492ff]"
                  checked={detail.flipH}
                  onChange={(e) => patchMedia(detail.uid, { flipH: e.target.checked })}
                />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span>Espejo vertical</span>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#2492ff]"
                  checked={detail.flipV}
                  onChange={(e) => patchMedia(detail.uid, { flipV: e.target.checked })}
                />
              </label>
            </div>
          </div>
        </aside>
      )}

      {/* Vista previa */}
      {current && previewItem && previewIdx !== null && (
        <div className="modal-backdrop" onClick={() => setPreview(null)}>
          <div className="modal max-w-5xl overflow-hidden" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <style>{ICEP_FADE_CSS}</style>
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <div className="min-w-0">
                <div className="truncate font-semibold">{current.name}</div>
                <div className="text-xs text-zinc-400">
                  {previewIdx + 1} de {playCount} · {current.orientation === "portrait" ? "Vertical" : "Horizontal"}
                  {dissolveAll ? " · Disolver" : ""}
                </div>
              </div>
              <button className="btn px-2" onClick={() => setPreview(null)} aria-label="Cerrar vista previa">
                <IconClose />
              </button>
            </div>
            <div className="grid lg:grid-cols-[minmax(0,1fr)_16rem]">
              <div className="relative flex h-[60vh] items-center justify-center overflow-hidden bg-black">
                <div className="relative overflow-hidden bg-black" style={frameStyle(current.orientation)}>
                  {fromItem && (
                    <div className="absolute inset-0">
                      <Layer
                        m={fromItem.asset}
                        fit={fromItem.fit}
                        rotation={fromItem.rotation}
                        flipH={fromItem.flipH}
                        flipV={fromItem.flipV}
                        thumb
                      />
                    </div>
                  )}
                  <div key={previewItem.asset.url} className={`absolute inset-0 ${dissolveIn ? "icep-fade" : ""}`}>
                    <Layer
                      m={previewItem.asset}
                      fit={previewItem.fit}
                      rotation={previewItem.rotation}
                      flipH={previewItem.flipH}
                      flipV={previewItem.flipV}
                      controls
                    />
                  </div>
                </div>
                <button
                  className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80 disabled:opacity-30"
                  onClick={() => setPreview(Math.max(0, previewIdx - 1))}
                  disabled={previewIdx === 0}
                  aria-label="Anterior"
                >
                  <IconChevronLeft />
                </button>
                <button
                  className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80 disabled:opacity-30"
                  onClick={() => setPreview(Math.min(playCount - 1, previewIdx + 1))}
                  disabled={previewIdx >= playCount - 1}
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
                  {current.items.map((it, i) =>
                    it.type === "section" ? (
                      <li
                        key={it.uid}
                        className="border-t border-line bg-canvas px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 first:border-t-0"
                      >
                        {it.name}
                      </li>
                    ) : (
                      <li key={it.uid}>
                        <button
                          onClick={() => setPreview(layout.playPos[i])}
                          className={`flex w-full items-center gap-3 border-l-2 px-4 py-2.5 text-left text-sm hover:bg-white/[0.03] ${
                            layout.playPos[i] === previewIdx ? "border-accent bg-raised" : "border-transparent"
                          }`}
                        >
                          <span className="w-4 text-right text-xs tabular-nums text-zinc-500">{layout.playPos[i] + 1}</span>
                          <div className="h-9 w-16 shrink-0 overflow-hidden rounded bg-black">
                            <Thumb m={it.asset} />
                          </div>
                          <span className="min-w-0 flex-1 truncate">{it.asset.originalName}</span>
                        </button>
                      </li>
                    ),
                  )}
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Nueva presentación: nombre y orientación */}
      {newPres && (
        <div className="modal-backdrop" onClick={() => setNewPres(null)}>
          <form
            className="modal max-w-md p-5"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              void createPresentation();
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-pres-title"
          >
            <h2 id="new-pres-title" className="text-lg font-semibold">
              Nueva presentación
            </h2>
            <div className="mt-4 space-y-4">
              <label className="block space-y-1.5 text-sm">
                <span className="text-zinc-400">Nombre</span>
                <input
                  className="input w-full"
                  autoFocus
                  value={newPres.name}
                  onChange={(e) => setNewPres({ ...newPres, name: e.target.value })}
                  placeholder="Ej.: Lobby principal"
                />
              </label>
              <div className="space-y-1.5 text-sm">
                <span className="text-zinc-400">Orientación</span>
                <div>
                  <OrientationSwitch value={newPres.orientation} onChange={(o) => setNewPres({ ...newPres, orientation: o })} />
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="btn" onClick={() => setNewPres(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn-primary" disabled={!newPres.name.trim()}>
                Crear
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
