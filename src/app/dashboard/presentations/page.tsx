"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import {
  api,
  type FolderDTO,
  type MediaDTO,
  type Orientation,
  type PresentationDTO,
  type PresentationFolderDTO,
  type Transition,
} from "@/lib/client";
import { toast } from "sonner";
import { IconClose, IconFolder, IconPlus, IconPresentations, IconSearch } from "@/components/Icons";
import { useDialogs } from "@/components/Dialogs";

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


/** Marco con la proporción de la presentación, dentro del escenario (que es un contenedor de tamaño). */
function frameStyle(o: Orientation): CSSProperties {
  return {
    containerType: "size",
    ...(o === "portrait"
      ? { height: "min(100cqh, calc(100cqw * 16 / 9))", aspectRatio: "9 / 16" }
      : { width: "min(100cqw, calc(100cqh * 16 / 9))", aspectRatio: "16 / 9" }),
  };
}

/** Marco dentro del drawer (altura fija de 16rem). */
function drawerFrameStyle(o: Orientation): CSSProperties {
  return {
    containerType: "size",
    ...(o === "portrait" ? { height: "100%", aspectRatio: "9 / 16" } : { width: "100%", aspectRatio: "16 / 9" }),
  };
}

const svgBase = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const Ic = ({ d, size = 16, className }: { d: ReactNode; size?: number; className?: string }) => (
  <svg {...svgBase} width={size} height={size} className={`shrink-0 ${className ?? ""}`} aria-hidden>
    {d}
  </svg>
);
const IconCheck = ({ size = 14 }: { size?: number }) => <Ic size={size} d={<path d="m5 12 5 5 9-10" />} />;
const IconArrowUp = () => <Ic d={<path d="m18 15-6-6-6 6" />} />;
const IconArrowDown = () => <Ic d={<path d="m6 9 6 6 6-6" />} />;
const IconChevronLeft = ({ size = 18 }: { size?: number }) => <Ic size={size} d={<path d="m15 18-6-6 6-6" />} />;
const IconChevronRight = ({ size = 18 }: { size?: number }) => <Ic size={size} d={<path d="m9 18 6-6-6-6" />} />;
const IconEye = () => (
  <Ic
    d={
      <>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    }
  />
);
const IconLink = () => <Ic d={<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />} />;
const IconMonitor = ({ size = 16 }: { size?: number }) => (
  <Ic size={size} d={<><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 21h8M12 16v5" /></>} />
);
const IconDots = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <circle cx="5" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="19" cy="12" r="1.8" />
  </svg>
);
const IconUpload = () => <Ic d={<path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />} />;
const IconFullscreen = () => <Ic d={<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />} />;
const IconPrev = () => <Ic size={20} d={<path d="M6 5v14M19 5l-9 7 9 7z" />} />;
const IconNext = () => <Ic size={20} d={<path d="M18 5v14M5 5l9 7-9 7z" />} />;
const IconTimer = () => <Ic d={<><rect x="3" y="6" width="14" height="12" rx="2" /><path d="m20 9 1.5 3L20 15M7 12h6" /></>} />;
const IconCut = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <rect x="3" y="4" width="8" height="16" rx="1.5" />
    <rect x="13" y="4" width="8" height="16" rx="1.5" />
  </svg>
);
const IconDissolve = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <rect x="3" y="4" width="8" height="16" rx="1.5" />
    <rect x="13" y="4" width="8" height="16" rx="1.5" opacity=".4" />
  </svg>
);
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
function IconOrientation({ o, size = 14 }: { o: Orientation; size?: number }) {
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

/** Botón con menú desplegable que se cierra al hacer clic fuera. */
function Pop({
  trigger,
  children,
  align = "left",
  width = "min-w-[11rem]",
}: {
  trigger: (o: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative" data-nodrag>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div className={`absolute z-50 mt-1 ${width} overflow-hidden rounded-lg border border-line bg-raised py-1 text-sm shadow-xl ${align === "right" ? "right-0" : "left-0"}`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function MenuItem({ onClick, children, checked, danger }: { onClick: () => void; children: ReactNode; checked?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-white/[0.06] ${danger ? "text-red-400" : ""}`}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2.5">{children}</span>
      {checked && <IconCheck />}
    </button>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-accent" : "bg-zinc-600"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

function OrientationSwitch({ value, onChange, chip = false }: { value: Orientation; onChange: (o: Orientation) => void; chip?: boolean }) {
  const opts: [Orientation, string][] = [
    ["landscape", "Horizontal"],
    ["portrait", "Vertical"],
  ];
  return (
    <div role="group" aria-label="Orientación" className={`inline-flex overflow-hidden rounded-lg border border-line ${chip ? "bg-panel" : "bg-panel p-0.5"}`}>
      {opts.map(([o, label]) => (
        <button
          key={o}
          type="button"
          aria-pressed={value === o}
          onClick={() => onChange(o)}
          className={`flex items-center gap-2 px-4 py-2 text-sm transition ${value === o ? "bg-raised text-zinc-100" : "text-zinc-500 hover:text-zinc-200"}`}
        >
          <IconOrientation o={o} size={16} />
          {label}
        </button>
      ))}
    </div>
  );
}

const MEDIA_DND = "application/x-icep-media";
const TH = "px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500";

export default function PresentationsPage() {
  const [list, setList] = useState<PresentationDTO[]>([]);
  const [pFolders, setPFolders] = useState<PresentationFolderDTO[]>([]);
  const [media, setMedia] = useState<MediaDTO[]>([]);
  const [mFolders, setMFolders] = useState<FolderDTO[]>([]);
  const [current, setCurrent] = useState<Detail | null>(null);
  const dialogs = useDialogs();
  const [listQuery, setListQuery] = useState("");
  const [listOpen, setListOpen] = useState(true);
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const [editFolder, setEditFolder] = useState<{ id: string | null; name: string } | null>(null);
  const [dragPres, setDragPres] = useState<string | null>(null);
  const [overFolder, setOverFolder] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [mediaQuery, setMediaQuery] = useState("");
  const [mSort, setMSort] = useState<"newest" | "oldest" | "name">("newest");
  const [mFolderId, setMFolderId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // preview es un índice sobre los medios (sin secciones).
  const [preview, setPreview] = useState<number | null>(null);
  const [fromPreview, setFromPreview] = useState<number | null>(null);
  const [detailUid, setDetailUid] = useState<number | null>(null);
  const [newPres, setNewPres] = useState<{ name: string; orientation: Orientation } | null>(null);

  // Arrastre de filas (punteros) y de medios desde el panel (HTML5).
  const [drag, setDrag] = useState<{ from: number } | null>(null);
  const [ghost, setGhost] = useState({ x: 0, y: 0 });
  const [ghostBox, setGhostBox] = useState({ offX: 0, offY: 0 });
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [outside, setOutside] = useState(false);
  const [extDrag, setExtDrag] = useState(false);
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const justDragged = useRef(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const previewRoot = useRef<HTMLDivElement>(null);

  const loadList = useCallback(async () => {
    setList(await api<PresentationDTO[]>("/api/presentations"));
    setPFolders(await api<PresentationFolderDTO[]>("/api/presentation-folders").catch(() => []));
  }, []);
  useEffect(() => {
    void loadList();
    void api<MediaDTO[]>("/api/media").then(setMedia);
    void api<FolderDTO[]>("/api/media/folders").then(setMFolders).catch(() => setMFolders([]));
  }, [loadList]);

  const layout = analyze(current?.items ?? []);
  const playItems = (current?.items ?? []).filter((it): it is MediaRow => it.type === "media");
  const playCount = playItems.length;
  const previewIdx = preview !== null && preview < playCount ? preview : null;
  const previewItem = previewIdx !== null ? playItems[previewIdx] : null;
  const dissolveIn = previewItem ? (previewItem.transition ?? current?.transition) === "dissolve" : false;
  const fromItem: MediaRow | undefined = dissolveIn && fromPreview !== null ? playItems[fromPreview] : undefined;

  const detail = playItems.find((x) => x.uid === detailUid) ?? null;
  const detailPos = detail ? playItems.indexOf(detail) : -1;

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

  // Esc cierra los paneles y el diálogo de nueva presentación.
  useEffect(() => {
    if (detailUid === null && !newPres && !addOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || preview !== null) return;
      if (newPres) setNewPres(null);
      else if (addOpen) setAddOpen(false);
      else setDetailUid(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailUid, newPres, addOpen, preview]);

  async function open(id: string) {
    setPicked([]);
    setPreview(null);
    setDetailUid(null);
    setRenaming(false);
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

  async function commitFolder() {
    if (!editFolder) return;
    const name = editFolder.name.trim();
    const { id } = editFolder;
    setEditFolder(null);
    if (!name) return;
    if (id === null) {
      const f = await api<PresentationFolderDTO>("/api/presentation-folders", { method: "POST", body: JSON.stringify({ name }) });
      setOpenFolders((s) => new Set(s).add(f.id));
    } else {
      await api(`/api/presentation-folders/${id}`, { method: "PATCH", body: JSON.stringify({ name }) });
    }
    await loadList();
  }

  async function deleteFolder(f: PresentationFolderDTO) {
    const ok = await dialogs.confirm({ title: "Borrar carpeta", message: `¿Borrar la carpeta "${f.name}"?`, danger: true, confirmLabel: "Borrar" });
    if (!ok) return;
    try {
      await api(`/api/presentation-folders/${f.id}`, { method: "DELETE" });
      toast.success(`Carpeta "${f.name}" borrada`);
    } catch (e) {
      toast.error((e as Error).message);
    }
    await loadList();
  }

  async function movePres(id: string, folderId: string | null) {
    setDragPres(null);
    setOverFolder(null);
    const p = list.find((x) => x.id === id);
    if (!p || p.folderId === folderId) return;
    await api(`/api/presentations/${id}`, { method: "PATCH", body: JSON.stringify({ folderId }) });
    if (folderId) setOpenFolders((s) => new Set(s).add(folderId));
    await loadList();
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

  function insertMedia(ids: string[], at: number | null) {
    const chosen = ids.map((id) => media.find((m) => m.id === id)).filter((m): m is MediaDTO => Boolean(m));
    if (chosen.length === 0) return;
    const rows = chosen.map(
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
    );
    setItems((items) => {
      const pos = at === null ? items.length : Math.max(0, Math.min(items.length, at));
      return [...items.slice(0, pos), ...rows, ...items.slice(pos)];
    });
  }

  function addPicked() {
    if (!current || picked.length === 0) return;
    insertMedia(picked, null);
    setPicked([]);
  }

  function addSection() {
    setItems((items) => [...items, { uid: nextUid(), type: "section", name: "Nueva sección", collapsed: false }]);
  }

  function togglePick(id: string) {
    setPicked((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    const list = Array.from(files);
    const id = toast.loading(list.length === 1 ? `Subiendo "${list[0].name}"…` : `Subiendo ${list.length} archivos…`);
    try {
      for (const file of list) {
        const res = await fetch("/api/media/upload", {
          method: "PUT",
          headers: { "content-type": file.type || "application/octet-stream", "x-file-name": encodeURIComponent(file.name) },
          body: file,
        });
        const data = (await res.json().catch(() => ({}))) as MediaDTO & { error?: string };
        if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
        setMedia((m) => [data, ...m]);
      }
      toast.success(list.length === 1 ? `"${list[0].name}" subido` : `${list.length} archivos subidos`, { id });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo subir el archivo", { id });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  /** Posición de inserción según la altura del puntero respecto de las filas visibles. */
  function calcInsert(y: number): number {
    const rows = Array.from(tbodyRef.current?.querySelectorAll<HTMLElement>("[data-row]") ?? []);
    if (rows.length === 0) return 0;
    for (const r of rows) {
      const b = r.getBoundingClientRect();
      if (y < b.top + b.height / 2) return Number(r.dataset.row);
    }
    return Number(rows[rows.length - 1].dataset.row) + 1;
  }

  function startRowDrag(i: number, e: RPointerEvent<HTMLTableRowElement>) {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest("button,input,select,a,[data-nodrag]")) return;
    if (e.pointerType === "touch" && !t.closest("[data-grip]")) return;
    const r = e.currentTarget.getBoundingClientRect();
    const st = { sx: e.clientX, sy: e.clientY, active: false, at: null as number | null, out: false };
    const move = (ev: PointerEvent) => {
      if (!st.active) {
        if (Math.hypot(ev.clientX - st.sx, ev.clientY - st.sy) < 5) return;
        st.active = true;
        document.body.style.userSelect = "none";
        setGhostBox({ offX: Math.min(40, st.sx - r.left), offY: st.sy - r.top });
        setDrag({ from: i });
      }
      setGhost({ x: ev.clientX, y: ev.clientY });
      const sr = shellRef.current?.getBoundingClientRect();
      const m = 16;
      st.out = !sr || ev.clientX < sr.left - m || ev.clientX > sr.right + m || ev.clientY < sr.top - m || ev.clientY > sr.bottom + m;
      st.at = st.out ? null : calcInsert(ev.clientY);
      setOutside(st.out);
      setDropAt(st.at);
    };
    const end = (cancel: boolean) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancelFn);
      document.body.style.userSelect = "";
      if (st.active) {
        justDragged.current = true;
        window.setTimeout(() => (justDragged.current = false), 0);
        if (!cancel && !st.out && st.at !== null) reorder(i, st.at);
      }
      setDrag(null);
      setDropAt(null);
      setOutside(false);
    };
    const up = () => end(false);
    const cancelFn = () => end(true);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancelFn);
  }

  // Arrastre HTML5 de medios del panel hacia la tabla.
  function onExtOver(e: DragEvent) {
    if (!e.dataTransfer.types.includes(MEDIA_DND)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setExtDrag(true);
    setDropAt(calcInsert(e.clientY));
  }
  function onExtLeave(e: DragEvent) {
    if (shellRef.current?.contains(e.relatedTarget as Node | null)) return;
    setExtDrag(false);
    setDropAt(null);
  }
  function onExtDrop(e: DragEvent) {
    const raw = e.dataTransfer.getData(MEDIA_DND);
    if (!raw) return;
    e.preventDefault();
    const at = calcInsert(e.clientY);
    try {
      const ids = JSON.parse(raw) as string[];
      insertMedia(ids, at);
      setPicked((p) => p.filter((x) => !ids.includes(x)));
    } catch {
      /* dato inválido */
    }
    setExtDrag(false);
    setDropAt(null);
  }

  const lastVisible = layout.hidden.lastIndexOf(false);
  const lineAt = drag
    ? dropAt !== null && !outside && dropAt !== drag.from && dropAt !== drag.from + 1
      ? dropAt
      : null
    : extDrag
      ? dropAt
      : null;

  function setDuration(uid: number, value: string) {
    patchMedia(uid, { durationSeconds: value ? Math.max(1, Number(value)) : null });
  }
  function renameSection(i: number, name: string) {
    updateAt(i, (x) => (x.type === "section" ? { ...x, name } : x));
  }
  function toggleSection(i: number) {
    updateAt(i, (x) => (x.type === "section" ? { ...x, collapsed: !x.collapsed } : x));
  }

  async function save() {
    if (!current) return;
    try {
      await saveCurrent(current);
    } catch (e) {
      toast.error((e as Error).message);
      return;
    }
    toast.success("Guardado", { description: "Las pantallas que la usan ya se actualizaron." });
    await loadList();
  }

  async function saveCurrent(current: Detail) {
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
  }

  async function remove() {
    if (!current) return;
    const ok = await dialogs.confirm({ title: "Borrar presentación", message: `¿Borrar "${current.name}"? No se puede deshacer.`, danger: true, confirmLabel: "Borrar" });
    if (!ok) return;
    try {
      await api(`/api/presentations/${current.id}`, { method: "DELETE" });
    } catch (e) {
      toast.error((e as Error).message);
      return;
    }
    toast.success(`"${current.name}" borrada`);
    setCurrent(null);
    setDetailUid(null);
    await loadList();
  }

  async function takeover() {
    if (!current) return;
    try {
      await api("/api/takeover", { method: "POST", body: JSON.stringify({ presentationId: current.id, deviceId: null }) });
      toast.success("En el aire en todas las pantallas");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Enlace copiado");
    } catch {
      toast.error("No se pudo copiar el enlace");
    }
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void previewRoot.current?.requestFullscreen?.().catch(() => undefined);
  }

  const q = listQuery.trim().toLowerCase();
  const mq = mediaQuery.trim().toLowerCase();
  const shownMedia = media
    .filter((m) => (mq ? m.originalName.toLowerCase().includes(mq) : m.folderId === mFolderId))
    .sort((a, b) =>
      mSort === "name" ? a.originalName.localeCompare(b.originalName) : mSort === "oldest" ? a.uploadedAt.localeCompare(b.uploadedAt) : b.uploadedAt.localeCompare(a.uploadedAt),
    );
  const shownFolders = mq ? [] : mFolders.filter((f) => f.parentId === mFolderId);
  const currentMFolder = mFolders.find((f) => f.id === mFolderId);
  const sideOpen = addOpen || (current !== null && detail !== null);

  function presRow(p: PresentationDTO, indent: boolean) {
    const sel = current?.id === p.id;
    return (
      <li key={p.id}>
        <button
          draggable
          onDragStart={(e) => {
            setDragPres(p.id);
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", p.id);
          }}
          onDragEnd={() => {
            setDragPres(null);
            setOverFolder(null);
          }}
          onClick={() => open(p.id)}
          className={`flex w-full items-center gap-3 border-y-2 py-3 pr-4 text-left text-sm hover:bg-white/[0.04] ${indent ? "pl-9" : "pl-4"} ${
            sel ? "border-accent bg-accent/10 font-semibold" : "border-transparent"
          } ${dragPres === p.id ? "opacity-40" : ""}`}
        >
          <IconMonitor />
          <span className="min-w-0 flex-1 truncate">{p.name}</span>
        </button>
      </li>
    );
  }

  const flatMatches = list.filter((p) => p.name.toLowerCase().includes(q));
  const rootPres = list.filter((p) => !p.folderId || !pFolders.some((f) => f.id === p.folderId));

  return (
    <>
      <div className="relative flex h-full min-h-0">
        {/* Columna izquierda: lista de presentaciones */}
        <div className={`relative shrink-0 border-r border-line bg-canvas transition-[width] ${listOpen ? "w-[280px]" : "w-0"}`}>
          <button
            type="button"
            onClick={() => setListOpen((o) => !o)}
            aria-label={listOpen ? "Ocultar lista" : "Mostrar lista"}
            className="absolute -right-4 top-1/2 z-20 flex h-9 w-8 -translate-y-1/2 items-center justify-center rounded-lg border border-line bg-panel text-zinc-300 hover:bg-raised"
          >
            {listOpen ? <IconChevronLeft size={14} /> : <IconChevronRight size={14} />}
          </button>
          {listOpen && (
            <aside className="flex h-full w-[280px] flex-col overflow-hidden">
              <div className="flex items-center gap-2 p-4">
                <div className="relative min-w-0 flex-1">
                  <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input className="input w-full pl-9" placeholder="Buscar..." value={listQuery} onChange={(e) => setListQuery(e.target.value)} />
                </div>
                <Pop
                  align="right"
                  width="w-56"
                  trigger={({ toggle }) => (
                    <button className="btn h-[38px] w-[38px] shrink-0 px-0" onClick={toggle} aria-label="Nuevo" title="Nuevo">
                      <IconPlus />
                    </button>
                  )}
                >
                  {(close) => (
                    <>
                      <MenuItem
                        onClick={() => {
                          close();
                          setNewPres({ name: "", orientation: "landscape" });
                        }}
                      >
                        <IconPresentations className="h-4 w-4 text-accent" />
                        Nueva presentación
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          close();
                          setListQuery("");
                          setEditFolder({ id: null, name: "" });
                        }}
                      >
                        <IconFolder className="h-4 w-4 text-accent" />
                        Nueva carpeta
                      </MenuItem>
                    </>
                  )}
                </Pop>
              </div>
              <ul
                className={`min-h-0 flex-1 overflow-y-auto ${overFolder === "root" ? "bg-accent/5" : ""}`}
                onDragOver={(e) => {
                  if (!dragPres) return;
                  e.preventDefault();
                  setOverFolder("root");
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragPres) void movePres(dragPres, null);
                }}
              >
                {q ? (
                  flatMatches.length === 0 ? (
                    <li className="p-4 text-sm text-zinc-500">Sin resultados.</li>
                  ) : (
                    flatMatches.map((p) => presRow(p, false))
                  )
                ) : (
                  <>
                    {editFolder?.id === null && (
                      <li className="flex items-center gap-3 px-4 py-2.5">
                        <IconFolder className="h-4 w-4 shrink-0 text-accent" />
                        <input
                          autoFocus
                          className="input min-w-0 flex-1 py-1"
                          placeholder="Nombre de la carpeta"
                          value={editFolder.name}
                          onChange={(e) => setEditFolder({ id: null, name: e.target.value })}
                          onBlur={() => void commitFolder()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void commitFolder();
                            if (e.key === "Escape") setEditFolder(null);
                          }}
                        />
                      </li>
                    )}
                    {pFolders.map((f) => {
                      const isOpen = openFolders.has(f.id);
                      const kids = list.filter((p) => p.folderId === f.id);
                      return (
                        <li key={f.id}>
                          <div
                            className={`group flex items-center border-y-2 border-transparent pr-2 hover:bg-white/[0.04] ${overFolder === f.id ? "!border-accent bg-accent/10" : ""}`}
                            onDragOver={(e) => {
                              if (!dragPres) return;
                              e.preventDefault();
                              e.stopPropagation();
                              setOverFolder(f.id);
                            }}
                            onDragLeave={() => setOverFolder((o) => (o === f.id ? null : o))}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (dragPres) void movePres(dragPres, f.id);
                            }}
                          >
                            {editFolder?.id === f.id ? (
                              <div className="flex flex-1 items-center gap-3 px-4 py-2.5">
                                <IconFolder className="h-4 w-4 shrink-0 text-accent" />
                                <input
                                  autoFocus
                                  className="input min-w-0 flex-1 py-1"
                                  value={editFolder.name}
                                  onChange={(e) => setEditFolder({ id: f.id, name: e.target.value })}
                                  onBlur={() => void commitFolder()}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") void commitFolder();
                                    if (e.key === "Escape") setEditFolder(null);
                                  }}
                                />
                              </div>
                            ) : (
                              <button
                                className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left text-sm"
                                aria-expanded={isOpen}
                                onClick={() =>
                                  setOpenFolders((s) => {
                                    const n = new Set(s);
                                    if (n.has(f.id)) n.delete(f.id);
                                    else n.add(f.id);
                                    return n;
                                  })
                                }
                              >
                                <IconFolder className="h-4 w-4 shrink-0 text-accent" />
                                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                                <span className={`text-zinc-500 transition-transform ${isOpen ? "rotate-90" : ""}`}>
                                  <IconChevronRight size={16} />
                                </span>
                              </button>
                            )}
                            <Pop
                              align="right"
                              width="w-44"
                              trigger={({ toggle }) => (
                                <button className="rounded p-1.5 text-zinc-500 hover:bg-raised hover:text-zinc-200" onClick={toggle} aria-label={`Opciones de ${f.name}`}>
                                  <IconDots />
                                </button>
                              )}
                            >
                              {(close) => (
                                <>
                                  <MenuItem
                                    onClick={() => {
                                      close();
                                      setEditFolder({ id: f.id, name: f.name });
                                    }}
                                  >
                                    Renombrar
                                  </MenuItem>
                                  <MenuItem
                                    danger
                                    onClick={() => {
                                      close();
                                      void deleteFolder(f);
                                    }}
                                  >
                                    Borrar carpeta
                                  </MenuItem>
                                </>
                              )}
                            </Pop>
                          </div>
                          {isOpen && (
                            <ul>
                              {kids.map((p) => presRow(p, true))}
                              {kids.length === 0 && <li className="py-2 pl-9 text-xs text-zinc-500">Carpeta vacía.</li>}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                    {rootPres.map((p) => presRow(p, false))}
                    {list.length === 0 && pFolders.length === 0 && <li className="p-4 text-sm text-zinc-500">Todavía no hay presentaciones.</li>}
                  </>
                )}
              </ul>
            </aside>
          )}
        </div>

        {/* Columna central: editor de la presentación */}
        <section className={`min-w-0 flex-1 overflow-auto ${sideOpen ? "lg:pr-[26rem]" : ""}`}>
          {current ? (
            <div className="px-7 pb-10 pt-5">
              <div className="flex flex-wrap items-center gap-3 border-b border-line pb-4">
                <IconPresentations className="h-5 w-5 shrink-0 text-zinc-300" />
                {renaming ? (
                  <input
                    autoFocus
                    className="input min-w-0 flex-1 text-lg font-semibold"
                    value={current.name}
                    onChange={(e) => patchCurrent({ name: e.target.value })}
                    onBlur={() => setRenaming(false)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === "Escape") && setRenaming(false)}
                    aria-label="Nombre de la presentación"
                  />
                ) : (
                  <button className="min-w-0 flex-1 truncate rounded px-1 text-left text-lg font-semibold hover:bg-white/[0.05]" onClick={() => setRenaming(true)} title="Clic para renombrar">
                    {current.name}
                  </button>
                )}
                <div className="flex items-center gap-2">
                  <div className="flex overflow-hidden rounded-lg border border-line bg-panel">
                    <button className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium hover:bg-raised disabled:opacity-40" onClick={() => setPreview(0)} disabled={playCount === 0}>
                      <IconEye />
                      Vista previa
                    </button>
                    <button className="border-l border-line px-3 hover:bg-raised" onClick={copyLink} aria-label="Copiar enlace" title="Copiar enlace">
                      <IconLink />
                    </button>
                  </div>
                  <button className="btn" onClick={save}>
                    Guardar
                  </button>
                  <Pop
                    align="right"
                    width="w-44"
                    trigger={({ toggle }) => (
                      <button className="btn px-2.5" onClick={toggle} aria-label="Más acciones">
                        <IconDots />
                      </button>
                    )}
                  >
                    {(close) => (
                      <>
                        <MenuItem
                          onClick={() => {
                            close();
                            void takeover();
                          }}
                        >
                          Al aire ahora
                        </MenuItem>
                        <MenuItem
                          danger
                          onClick={() => {
                            close();
                            void remove();
                          }}
                        >
                          Borrar
                        </MenuItem>
                      </>
                    )}
                  </Pop>
                  <button
                    className="btn-primary"
                    onClick={() => {
                      setDetailUid(null);
                      setAddOpen(true);
                    }}
                  >
                    <IconPlus />
                    Agregar medios
                  </button>
                </div>
              </div>

              {/* Barra de opciones de la presentación (se guardan con "Guardar") */}
              <div className="flex flex-wrap items-center gap-3 py-5 text-sm">
                <button type="button" disabled className="flex items-center gap-2 rounded-lg border border-line bg-panel px-4 py-2.5 text-zinc-300 opacity-90" title="Se configura por elemento">
                  <IconTimer />
                  Ninguno
                </button>
                <Pop
                  trigger={({ toggle }) => (
                    <button type="button" onClick={toggle} className="flex items-center gap-2 rounded-lg border border-line bg-panel px-4 py-2.5 hover:bg-raised" aria-label="Transición">
                      {current.transition === "dissolve" ? <IconDissolve /> : <IconCut />}
                      {current.transition === "dissolve" ? "Disolver" : "Corte"}
                    </button>
                  )}
                >
                  {(close) => (
                    <>
                      {(["cut", "dissolve"] as Transition[]).map((t) => (
                        <MenuItem
                          key={t}
                          checked={current.transition === t}
                          onClick={() => {
                            patchCurrent({ transition: t });
                            close();
                          }}
                        >
                          {t === "cut" ? <IconCut /> : <IconDissolve />}
                          {t === "cut" ? "Corte" : "Disolver"}
                        </MenuItem>
                      ))}
                    </>
                  )}
                </Pop>
                <OrientationSwitch chip value={current.orientation} onChange={(o) => patchCurrent({ orientation: o })} />
                <span className="mx-1 h-6 w-px bg-line" />
                <span className="flex items-center gap-2 text-xs font-medium text-zinc-300">
                  Etiquetas
                  <button type="button" disabled className="flex h-7 w-7 items-center justify-center rounded-full border border-line bg-panel" aria-label="Agregar etiqueta">
                    <IconPlus />
                  </button>
                </span>
              </div>

              <div className="flex justify-end pb-4">
                <button className="btn-outline !border-line !text-zinc-200 hover:!bg-white/[0.05]" onClick={addSection}>
                  <IconPlus />
                  Agregar sección
                </button>
              </div>

              <div ref={shellRef} className="overflow-hidden rounded-xl border border-line bg-panel" onDragOver={onExtOver} onDragLeave={onExtLeave} onDrop={onExtDrop}>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-bar/60">
                        <th className={`${TH} w-20`} />
                        <th className={`${TH} w-[70px] !px-0`} />
                        <th className={TH}>Nombre</th>
                        <th className={`${TH} w-32`}>Duración</th>
                        <th className={`${TH} w-28`}>Tipo</th>
                        <th className={`${TH} w-44`}>Comportamiento</th>
                        <th className={`${TH} w-28`} />
                      </tr>
                    </thead>
                    <tbody ref={tbodyRef}>
                      {current.items.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-sm text-zinc-500">
                            Usá “Agregar medios” o arrastrá archivos desde el panel.
                          </td>
                        </tr>
                      )}
                      {current.items.map((it, i) => {
                        if (layout.hidden[i]) return null;
                        const edge =
                          lineAt === i ? `inset 0 2px 0 0 ${ACCENT}` : lineAt === i + 1 && i === lastVisible ? `inset 0 -2px 0 0 ${ACCENT}` : undefined;
                        const cellStyle: CSSProperties | undefined = edge ? { boxShadow: edge } : undefined;
                        const dragged = drag?.from === i;
                        const rowCls = `border-t border-line select-none ${dragged ? (outside ? "bg-red-500/25" : "opacity-40") : ""}`;
                        const rowActions = (
                          <div className="flex justify-end gap-1 pr-3 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
                            <button className="rounded p-1.5 text-zinc-400 hover:bg-raised hover:text-zinc-100" onClick={() => move(i, -1)} aria-label="Subir" title="Subir">
                              <IconArrowUp />
                            </button>
                            <button className="rounded p-1.5 text-zinc-400 hover:bg-raised hover:text-zinc-100" onClick={() => move(i, 1)} aria-label="Bajar" title="Bajar">
                              <IconArrowDown />
                            </button>
                            <button
                              className="rounded p-1.5 text-zinc-400 hover:bg-raised hover:text-zinc-100"
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
                            <tr key={it.uid} data-row={i} onPointerDown={(e) => startRowDrag(i, e)} className={`group bg-raised/70 ${rowCls} cursor-grab`}>
                              <td colSpan={6} style={cellStyle} className="h-14 px-4">
                                <div className="flex items-center gap-3">
                                  <span data-grip className="touch-none text-zinc-500">
                                    <IconGrip />
                                  </span>
                                  <button
                                    className="rounded p-1 text-zinc-300 hover:bg-white/[0.08]"
                                    onClick={() => toggleSection(i)}
                                    aria-label={it.collapsed ? "Expandir sección" : "Contraer sección"}
                                    aria-expanded={!it.collapsed}
                                  >
                                    <span className={`inline-block transition-transform ${it.collapsed ? "-rotate-90" : ""}`}>
                                      <IconArrowDown />
                                    </span>
                                  </button>
                                  <input
                                    className="min-w-0 flex-1 rounded bg-transparent px-1 py-1 text-sm font-semibold outline-none focus:bg-canvas/60"
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

                        const a = it.asset;
                        const dur = it.durationSeconds ?? (a.kind === "video" ? a.durationSeconds : null);
                        return (
                          <tr
                            key={it.uid}
                            data-row={i}
                            onPointerDown={(e) => startRowDrag(i, e)}
                            onClick={(e) => {
                              if (justDragged.current) return;
                              if ((e.target as HTMLElement).closest("button,input,select,a,[data-nodrag]")) return;
                              setAddOpen(false);
                              setDetailUid(it.uid);
                            }}
                            className={`group cursor-pointer hover:bg-white/[0.03] ${detailUid === it.uid ? "bg-accent/10" : ""} ${rowCls}`}
                          >
                            <td style={cellStyle} className="h-[70px] pl-3 pr-4">
                              <div className="flex items-center justify-end gap-2 text-zinc-400">
                                <span data-grip className="touch-none text-zinc-600 opacity-0 group-hover:opacity-100">
                                  <IconGrip />
                                </span>
                                <span className="w-5 text-right tabular-nums">{layout.playPos[i] + 1}</span>
                              </div>
                            </td>
                            <td style={cellStyle} className="!px-0">
                              <div className="h-[46px] w-[70px] overflow-hidden rounded bg-black">
                                <Thumb m={a} fit="contain" />
                              </div>
                            </td>
                            <td style={cellStyle} className="max-w-0 px-4">
                              <span className="block truncate">{a.originalName}</span>
                            </td>
                            <td style={cellStyle} className="px-4 text-zinc-300">
                              {dur ? (a.kind === "video" && it.durationSeconds === null ? `${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, "0")}` : `${dur} s`) : "—"}
                            </td>
                            <td style={cellStyle} className="px-4 text-zinc-300">
                              {a.mimeType.split("/")[1] ?? a.kind}
                            </td>
                            <td style={cellStyle} className="px-4">
                              <div className="flex items-center gap-3 text-xs text-zinc-600">
                                <span className="flex items-center gap-1.5">
                                  <IconTimer />
                                  Ninguno
                                </span>
                                <span className="text-zinc-600">
                                  <IconCut />
                                </span>
                              </div>
                            </td>
                            <td style={cellStyle}>{rowActions}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-sm text-zinc-400">Elegí o creá una presentación.</div>
          )}
        </section>
      </div>

      {/* Fantasma del arrastre de una fila */}
      {drag && current && current.items[drag.from] && (
        <div
          className={`pointer-events-none fixed z-[70] flex max-w-sm items-center gap-3 rounded-lg border bg-panel px-2 py-2 text-sm shadow-2xl ${outside ? "border-red-500" : "border-line"}`}
          style={{ left: ghost.x - ghostBox.offX, top: ghost.y - ghostBox.offY }}
        >
          {current.items[drag.from].type === "media" && (
            <div className="h-[38px] w-[60px] shrink-0 overflow-hidden rounded bg-black">
              <Thumb m={(current.items[drag.from] as MediaRow).asset} fit="contain" />
            </div>
          )}
          <span className="truncate pr-2">
            {current.items[drag.from].type === "media" ? (current.items[drag.from] as MediaRow).asset.originalName : (current.items[drag.from] as SectionRow).name}
          </span>
        </div>
      )}

      {/* Panel derecho: agregar medios */}
      {current && addOpen && (
        <aside className="drawer flex !max-w-[26rem] flex-col !p-0" role="dialog" aria-label="Agregar medios">
          <div className="relative flex items-center justify-center gap-2 px-5 py-4">
            {currentMFolder && (
              <button className="absolute left-4 flex items-center gap-1 text-sm text-accent" onClick={() => setMFolderId(currentMFolder.parentId)}>
                <IconChevronLeft size={16} />
                Atrás
              </button>
            )}
            <span className="font-semibold">{currentMFolder ? currentMFolder.name : "Medios"}</span>
            <button className="absolute right-4 text-accent hover:opacity-80" onClick={() => setAddOpen(false)} aria-label="Cerrar">
              <IconClose />
            </button>
          </div>
          <div className="space-y-3 px-5 pb-4">
            <div className="relative">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input className="input w-full pl-9" placeholder="Buscar..." value={mediaQuery} onChange={(e) => setMediaQuery(e.target.value)} />
            </div>
            <select className="input w-full" value={mSort} onChange={(e) => setMSort(e.target.value as "newest" | "oldest" | "name")} aria-label="Ordenar">
              <option value="newest">Más nuevos primero</option>
              <option value="oldest">Más viejos primero</option>
              <option value="name">Nombre (A-Z)</option>
            </select>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto border-t border-line">
            {shownFolders.map((f) => (
              <button key={f.id} className="flex w-full items-center gap-4 border-b border-line px-5 py-3.5 text-left text-sm hover:bg-white/[0.04]" onClick={() => setMFolderId(f.id)}>
                <span className="flex h-9 w-[70px] items-center justify-center rounded-full bg-raised">
                  <IconFolder className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <IconChevronRight />
              </button>
            ))}
            {shownMedia.map((m) => {
              const on = picked.includes(m.id);
              return (
                <button
                  key={m.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "copy";
                    e.dataTransfer.setData(MEDIA_DND, JSON.stringify(on ? picked : [m.id]));
                  }}
                  onDragEnd={() => {
                    setExtDrag(false);
                    setDropAt(null);
                  }}
                  onClick={() => togglePick(m.id)}
                  aria-pressed={on}
                  title={m.originalName}
                  className={`flex w-full items-center gap-4 border-y px-5 py-2.5 text-left text-sm ${
                    on ? "border-accent bg-accent/15 text-zinc-400" : "border-transparent border-b-line hover:bg-white/[0.04]"
                  }`}
                >
                  <div className="relative h-[46px] w-[70px] shrink-0 overflow-hidden rounded bg-black">
                    <Thumb m={m} fit="contain" />
                    {on && (
                      <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-white">
                        <IconCheck size={10} />
                      </span>
                    )}
                  </div>
                  <span className="min-w-0 flex-1 truncate">{m.originalName}</span>
                </button>
              );
            })}
            {shownFolders.length === 0 && shownMedia.length === 0 && <p className="p-5 text-sm text-zinc-500">No hay medios.</p>}
          </div>
          <div className="space-y-3 border-t border-line p-5">
            <button className="btn-primary w-full" disabled={picked.length === 0} onClick={addPicked}>
              <IconPlus />
              Agregar a la presentación ({picked.length})
            </button>
            <div className="flex gap-2">
              <a href="/dashboard/media" className="btn flex-1 justify-center">
                Administrar medios
              </a>
              <input ref={fileInput} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => void uploadFiles(e.target.files)} />
              <button className="btn px-3" onClick={() => fileInput.current?.click()} disabled={uploading} aria-label="Subir archivos" title="Subir archivos">
                <IconUpload />
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* Panel derecho: detalle del medio */}
      {current && detail && !addOpen && (
        <aside className="drawer !max-w-[26rem] !p-5" role="dialog" aria-label="Detalle del elemento">
          <div className="relative mb-4 flex items-center justify-center gap-2">
            <span className="font-semibold">Medios</span>
            <button className="absolute right-0 text-accent hover:opacity-80" onClick={() => setDetailUid(null)} aria-label="Cerrar detalle">
              <IconClose />
            </button>
          </div>

          <div className="flex h-64 items-center justify-center overflow-hidden rounded-lg bg-black">
            <div className="relative overflow-hidden bg-black" style={drawerFrameStyle(current.orientation)}>
              <Layer key={detail.asset.url} m={detail.asset} fit={detail.fit} rotation={detail.rotation} flipH={detail.flipH} flipV={detail.flipV} />
            </div>
          </div>
          <div className="mt-4 flex justify-between">
            <button className="btn" onClick={() => stepDetail(-1)} disabled={detailPos <= 0}>
              <span aria-hidden>←</span> Anterior
            </button>
            <button className="btn" onClick={() => stepDetail(1)} disabled={detailPos >= playCount - 1}>
              Siguiente <span aria-hidden>→</span>
            </button>
          </div>

          <div className="mt-5 text-sm">
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Medio</div>
            <input className="input w-full py-3 text-accent" value={detail.asset.originalName} readOnly aria-label="Nombre del medio" />

            <div className="mt-5 space-y-4 border-t border-line pt-5">
              <div className="flex items-center justify-between gap-3">
                <span>{detail.asset.kind === "video" ? "Duración" : "Avance automático"}</span>
                <Pop
                  align="right"
                  width="w-56"
                  trigger={({ toggle }) => (
                    <button className="btn" onClick={toggle}>
                      <IconTimer />
                      {detail.durationSeconds ? `${detail.durationSeconds} s` : "Predeterminado"}
                    </button>
                  )}
                >
                  {(close) => (
                    <div className="space-y-2 p-3">
                      <label className="block space-y-1 text-xs text-zinc-400">
                        Segundos
                        <input
                          className="input w-full"
                          type="number"
                          min={1}
                          placeholder={detail.asset.kind === "video" ? (detail.asset.durationSeconds != null ? String(detail.asset.durationSeconds) : "auto") : "10"}
                          value={detail.durationSeconds ?? ""}
                          onChange={(e) => setDuration(detail.uid, e.target.value)}
                        />
                      </label>
                      <button
                        className="btn w-full"
                        onClick={() => {
                          setDuration(detail.uid, "");
                          close();
                        }}
                      >
                        Predeterminado
                      </button>
                    </div>
                  )}
                </Pop>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Transición</span>
                <Pop
                  align="right"
                  trigger={({ toggle }) => (
                    <button className="btn" onClick={toggle}>
                      {detail.transition === "dissolve" ? <IconDissolve /> : <IconCut />}
                      {detail.transition === "cut" ? "Corte" : detail.transition === "dissolve" ? "Disolver" : "Predeterminada"}
                    </button>
                  )}
                >
                  {(close) => (
                    <>
                      {([null, "cut", "dissolve"] as (Transition | null)[]).map((t) => (
                        <MenuItem
                          key={t ?? "default"}
                          checked={detail.transition === t}
                          onClick={() => {
                            patchMedia(detail.uid, { transition: t });
                            close();
                          }}
                        >
                          {t === "cut" ? "Corte" : t === "dissolve" ? "Disolver" : "Predeterminada"}
                        </MenuItem>
                      ))}
                    </>
                  )}
                </Pop>
              </div>
            </div>

            <div className="mt-5 space-y-4 border-t border-line pt-5">
              <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Display</div>
              <label className="flex items-center justify-between gap-3">
                <span>Escala</span>
                <select className="input w-44" value={detail.fit} onChange={(e) => patchMedia(detail.uid, { fit: e.target.value === "cover" ? "cover" : "contain" })}>
                  <option value="contain">Entero</option>
                  <option value="cover">Llenar</option>
                </select>
              </label>
              <label className="flex items-center justify-between gap-3">
                <span>Giro</span>
                <select className="input w-24" value={String(detail.rotation)} onChange={(e) => patchMedia(detail.uid, { rotation: normRotation(Number(e.target.value)) })}>
                  <option value="0">0°</option>
                  <option value="90">90°</option>
                  <option value="180">180°</option>
                  <option value="270">270°</option>
                </select>
              </label>
              <div className="flex items-center justify-between gap-3">
                <span>Espejo horizontal</span>
                <Toggle checked={detail.flipH} onChange={(v) => patchMedia(detail.uid, { flipH: v })} label="Espejo horizontal" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Espejo vertical</span>
                <Toggle checked={detail.flipV} onChange={(v) => patchMedia(detail.uid, { flipV: v })} label="Espejo vertical" />
              </div>
            </div>
          </div>
        </aside>
      )}

      {/* Vista previa a pantalla completa */}
      {current && previewItem && previewIdx !== null && (
        <div ref={previewRoot} className="fixed inset-0 z-50 flex flex-col bg-canvas" role="dialog" aria-modal="true" aria-label="Vista previa">
          <style>{ICEP_FADE_CSS}</style>
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-bar px-6">
            <span className="text-sm text-zinc-400">
              {previewIdx + 1} de {playCount} · {current.orientation === "portrait" ? "Vertical" : "Horizontal"}
              {current.transition === "dissolve" ? " · Disolver" : ""}
            </span>
            <button className="text-accent hover:opacity-80" onClick={() => setPreview(null)} aria-label="Cerrar vista previa">
              <IconClose />
            </button>
          </div>
          <div className="flex min-h-0 flex-1">
            <div className="flex min-w-0 flex-1 flex-col px-8 pb-4 pt-5">
              <div className="flex items-center gap-2 border-b border-line pb-3 font-semibold">
                <IconPresentations className="h-4 w-4 text-zinc-400" />
                <span className="truncate">{current.name}</span>
              </div>
              <div ref={stageRef} className="mt-5 min-h-0 flex-1 bg-black" style={{ containerType: "size" }}>
                <div className="flex h-full w-full items-center justify-center">
                  <div className="relative overflow-hidden bg-black" style={frameStyle(current.orientation)}>
                    {fromItem && (
                      <div className="absolute inset-0">
                        <Layer m={fromItem.asset} fit={fromItem.fit} rotation={fromItem.rotation} flipH={fromItem.flipH} flipV={fromItem.flipV} thumb />
                      </div>
                    )}
                    <div key={previewItem.asset.url} className={`absolute inset-0 ${dissolveIn ? "icep-fade" : ""}`}>
                      <Layer m={previewItem.asset} fit={previewItem.fit} rotation={previewItem.rotation} flipH={previewItem.flipH} flipV={previewItem.flipV} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="relative flex h-14 shrink-0 items-center justify-center gap-5">
                <button className="p-2 text-zinc-200 hover:text-white disabled:opacity-30" onClick={() => setPreview(Math.max(0, previewIdx - 1))} disabled={previewIdx === 0} aria-label="Anterior">
                  <IconPrev />
                </button>
                <button
                  className="p-2 text-zinc-200 hover:text-white disabled:opacity-30"
                  onClick={() => setPreview(Math.min(playCount - 1, previewIdx + 1))}
                  disabled={previewIdx >= playCount - 1}
                  aria-label="Siguiente"
                >
                  <IconNext />
                </button>
                <button className="absolute right-0 p-2 text-zinc-300 hover:text-white" onClick={toggleFullscreen} aria-label="Pantalla completa" title="Pantalla completa">
                  <IconFullscreen />
                </button>
              </div>
            </div>
            <div className="flex w-[22rem] shrink-0 flex-col border-l border-line bg-panel">
              <div className="flex items-center justify-center gap-2 px-4 py-4 text-sm font-semibold">
                <IconPresentations className="h-4 w-4 text-accent" />
                Orden
              </div>
              <ol className="min-h-0 flex-1 overflow-y-auto">
                {current.items.map((it, i) =>
                  it.type === "section" ? (
                    <li key={it.uid} className="border-t border-line bg-canvas px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                      {it.name}
                    </li>
                  ) : (
                    <li key={it.uid}>
                      <button
                        onClick={() => setPreview(layout.playPos[i])}
                        className={`flex w-full items-center gap-4 border-y px-5 py-2.5 text-left text-sm hover:bg-white/[0.03] ${
                          layout.playPos[i] === previewIdx ? "border-accent bg-accent/10" : "border-transparent border-b-line text-zinc-300"
                        }`}
                      >
                        <span className={`w-4 text-right text-xs tabular-nums ${layout.playPos[i] === previewIdx ? "text-accent" : "text-zinc-500"}`}>{layout.playPos[i] + 1}</span>
                        <div className="h-9 w-16 shrink-0 overflow-hidden rounded bg-black">
                          <Thumb m={it.asset} fit="contain" />
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
                <input className="input w-full" autoFocus value={newPres.name} onChange={(e) => setNewPres({ ...newPres, name: e.target.value })} placeholder="Ej.: Lobby principal" />
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
