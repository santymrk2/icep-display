"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type CalendarDTO, type DeviceDTO, type GroupDTO, type Orientation, type PresentationDTO } from "@/lib/client";
import { toast } from "sonner";
import { IconClose, IconDevices, IconPlus, IconSearch } from "@/components/Icons";
import { useDialogs } from "@/components/Dialogs";

const CODE_LENGTH = 4;
const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 24;
/** Valor del select de grupo para "pantallas sin grupo". */
const NO_GROUP = "none";
/** Valor del filtro de calendario para "pantallas sin calendario". */
const NO_CALENDAR = "none";
/** Giros posibles del TV, en grados. */
const ROTATIONS = [0, 90, 180, 270] as const;
/** Estilo de cada tarjeta plegable dentro de los paneles laterales. */
const CARD = "overflow-hidden rounded-xl border border-line bg-canvas";

type OnlineFilter = "online" | "offline";
type ContentFilter = "active" | "inactive";
type SortKey = "name" | "location";

const ORIENTATION_LABEL: Record<Orientation, string> = { landscape: "Horizontal", portrait: "Vertical" };
const SOURCE_LABEL: Record<DeviceDTO["content"]["source"], string> = {
  takeover: "Puesto al aire",
  schedule: "Programación",
  default: "Presentación por defecto",
  none: "Nada",
};

/** Alterna un valor dentro de una lista de filtros (lista vacía = sin filtro). */
function toggleIn<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<DeviceDTO[]>([]);
  const [presentations, setPresentations] = useState<PresentationDTO[]>([]);
  const [groups, setGroups] = useState<GroupDTO[]>([]);
  const [calendars, setCalendars] = useState<CalendarDTO[]>([]);
  const [query, setQuery] = useState("");
  const [onlineFilter, setOnlineFilter] = useState<OnlineFilter[]>([]);
  const [contentFilter, setContentFilter] = useState<ContentFilter[]>([]);
  const [calendarFilter, setCalendarFilter] = useState<string[]>([]);
  const [orientationFilter, setOrientationFilter] = useState<Orientation[]>([]);
  const [groupFilter, setGroupFilter] = useState("");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [list, groupList, calendarList] = await Promise.all([
      api<DeviceDTO[]>("/api/devices"),
      api<GroupDTO[]>("/api/groups").catch(() => null),
      api<CalendarDTO[]>("/api/calendars").catch(() => null),
    ]);
    setDevices(list);
    if (groupList) setGroups(groupList);
    if (calendarList) setCalendars(calendarList);
  }, []);

  useEffect(() => {
    void load();
    void api<PresentationDTO[]>("/api/presentations").then(setPresentations);
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  // Cerrar el panel de filtros con Escape.
  useEffect(() => {
    if (!filtersOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFiltersOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [filtersOpen]);

  const allTags = useMemo(
    () => [...new Set(devices.flatMap((d) => d.tags))].sort((a, b) => a.localeCompare(b, "es")),
    [devices],
  );
  const calendarName = useMemo(() => new Map(calendars.map((c) => [c.id, c.name])), [calendars]);

  const q = query.trim().toLowerCase();
  // Dentro de un grupo de checkboxes, nada tildado = sin filtro (igual que todos tildados).
  const activeFilters =
    onlineFilter.length +
    contentFilter.length +
    calendarFilter.length +
    orientationFilter.length +
    (groupFilter ? 1 : 0) +
    tagFilter.length;
  const filtersActive = activeFilters > 0;
  const visible = devices.filter((d) => {
    if (onlineFilter.length > 0 && !onlineFilter.includes(d.online ? "online" : "offline")) return false;
    if (contentFilter.length > 0 && !contentFilter.includes(d.content.source === "none" ? "inactive" : "active")) return false;
    if (calendarFilter.length > 0 && !calendarFilter.includes(d.calendarId ?? NO_CALENDAR)) return false;
    if (orientationFilter.length > 0 && (!d.screenOrientation || !orientationFilter.includes(d.screenOrientation))) return false;
    if (groupFilter === NO_GROUP && d.groupId) return false;
    if (groupFilter && groupFilter !== NO_GROUP && d.groupId !== groupFilter) return false;
    if (!tagFilter.every((t) => d.tags.includes(t))) return false;
    if (!q) return true;
    return (
      d.name.toLowerCase().includes(q) ||
      (d.location ?? "").toLowerCase().includes(q) ||
      d.tags.some((t) => t.includes(q))
    );
  });
  const rows = [...visible].sort((a, b) => {
    const va = sort.key === "name" ? a.name : (a.location ?? "");
    const vb = sort.key === "name" ? b.name : (b.location ?? "");
    const cmp = va.localeCompare(vb, "es", { sensitivity: "base" });
    return sort.dir === "asc" ? cmp : -cmp;
  });
  const onlineCount = devices.reduce((n, d) => n + (d.online ? 1 : 0), 0);
  const selected = devices.find((d) => d.id === selectedId) ?? null;
  const closePairing = useCallback(() => setPairing(false), []);
  const deviceWord = devices.length === 1 ? "pantalla" : "pantallas";

  function clearFilters() {
    setOnlineFilter([]);
    setContentFilter([]);
    setCalendarFilter([]);
    setOrientationFilter([]);
    setGroupFilter("");
    setTagFilter([]);
  }

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  return (
    <div className="page space-y-6">
      <h1 className="sr-only">Pantallas</h1>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="w-full max-w-md space-y-3">
          <div className="relative">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              className="input w-full pl-9"
              placeholder="Buscar por nombre, ubicación o etiqueta..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <button type="button" className="btn" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(true)}>
              <IconSliders />
              Filtros
              {filtersActive && (
                <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold leading-5 text-white">{activeFilters}</span>
              )}
            </button>
            {filtersActive && (
              <button type="button" className="text-sm text-accent underline-offset-4 hover:underline" onClick={clearFilters}>
                Limpiar
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button className="btn-primary" onClick={() => setPairing(true)}>
            <IconPlus />
            Vincular pantalla
          </button>
          <span className="pill pill-warn">
            {onlineCount} en línea / {devices.length}
          </span>
        </div>
      </div>

      <div className="table-shell overflow-x-auto">
        <table className="min-w-[960px]">
          <thead>
            <tr>
              <th>
                <button type="button" className="inline-flex items-center gap-1.5 hover:text-accent" onClick={() => toggleSort("name")}>
                  Nombre
                  <span aria-hidden className="text-zinc-400">
                    {sort.key === "name" ? (sort.dir === "asc" ? "↑" : "↓") : ""}
                  </span>
                </button>
              </th>
              <th>Estado</th>
              <th>Resolución</th>
              <th>Calendario suscripto</th>
              <th>Etiquetas</th>
              <th>
                <button type="button" className="inline-flex items-center gap-1.5 hover:text-accent" onClick={() => toggleSort("location")}>
                  Ubicación
                  <span aria-hidden className="text-zinc-400">
                    {sort.key === "location" ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}
                  </span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-zinc-500">
                  {devices.length === 0
                    ? "No hay pantallas todavía"
                    : filtersActive || q
                      ? "Ninguna pantalla coincide con la búsqueda o los filtros"
                      : "Ninguna pantalla coincide con la búsqueda"}
                </td>
              </tr>
            )}
            {rows.map((d) => (
              <tr key={d.id} className="row-click" onClick={() => setSelectedId(d.id)}>
                <td>
                  <button className="font-medium underline underline-offset-4 hover:text-accent">{d.name}</button>
                </td>
                <td>
                  <StatusCell device={d} />
                </td>
                <td>
                  <ResolutionCell device={d} />
                </td>
                <td className="text-zinc-300">
                  {d.calendarId ? (
                    (calendarName.get(d.calendarId) ?? "—")
                  ) : (
                    <span className="text-zinc-500">Sin calendario</span>
                  )}
                </td>
                <td>
                  {d.tags.length === 0 ? (
                    <span className="text-xs italic text-zinc-500">Agregar etiquetas</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {d.tags.map((t) => (
                        <span key={t} className="pill px-2.5 py-0.5 text-[11px]">
                          <IconTag />
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="text-zinc-300">{d.location ?? <span className="text-zinc-500">Sin ubicación</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtersActive && (
        <p className="text-xs text-zinc-500">
          Mostrando {rows.length} de {devices.length} {deviceWord}
        </p>
      )}

      {filtersOpen && (
        <FiltersDrawer
          allTags={allTags}
          calendars={calendars}
          groups={groups}
          onlineFilter={onlineFilter}
          contentFilter={contentFilter}
          calendarFilter={calendarFilter}
          orientationFilter={orientationFilter}
          groupFilter={groupFilter}
          tagFilter={tagFilter}
          activeCount={activeFilters}
          onToggleOnline={(v) => setOnlineFilter((prev) => toggleIn(prev, v))}
          onToggleContent={(v) => setContentFilter((prev) => toggleIn(prev, v))}
          onToggleCalendar={(id) => setCalendarFilter((prev) => toggleIn(prev, id))}
          onToggleOrientation={(v) => setOrientationFilter((prev) => toggleIn(prev, v))}
          onGroupChange={setGroupFilter}
          onToggleTag={(t) => setTagFilter((prev) => toggleIn(prev, t))}
          onClear={clearFilters}
          onClose={() => setFiltersOpen(false)}
        />
      )}

      {pairing && (
        <PairModal
          onClose={closePairing}
          onPaired={async () => {
            setPairing(false);
            toast.success("Pantalla vinculada");
            await load();
          }}
        />
      )}

      {selected && (
        <DeviceDrawer
          key={selected.id}
          device={selected}
          presentations={presentations}
          groups={groups}
          calendars={calendars}
          onClose={() => setSelectedId(null)}
          reload={load}
        />
      )}
    </div>
  );
}

/** Estado: en línea con lo que se reproduce, sin contenido programado, o sin conexión. */
function StatusCell({ device: d }: { device: DeviceDTO }) {
  if (!d.online) {
    return (
      <span className="pill">
        <span className="dot" />
        Sin conexión
      </span>
    );
  }
  if (d.content.source === "none") {
    return (
      <span className="pill">
        <IconBroadcast className="h-3.5 w-3.5 text-emerald-400" />
        Sin contenido programado
      </span>
    );
  }
  return (
    <div className="flex min-w-0 max-w-[260px] items-center gap-2">
      <span className="pill pill-ok shrink-0">
        <span className="dot dot-ok" />
        En línea
      </span>
      <span className="truncate text-xs text-zinc-400" title={d.content.label ?? undefined}>
        {d.content.label ?? "Sin nombre"}
      </span>
    </div>
  );
}

/** Resolución detectada, orientación y aviso si el contenido pide la otra orientación. */
function ResolutionCell({ device: d }: { device: DeviceDTO }) {
  const res = d.screenWidth && d.screenHeight ? `${d.screenWidth}×${d.screenHeight}` : "—";
  const wanted = d.content.orientation;
  const mismatch = !d.content.autoRotated && wanted !== null && d.screenOrientation !== null && wanted !== d.screenOrientation;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="whitespace-nowrap tabular-nums text-zinc-300">{res}</span>
      {d.screenOrientation ? (
        <span className="pill">{ORIENTATION_LABEL[d.screenOrientation]}</span>
      ) : (
        <span className="text-zinc-500">—</span>
      )}
      {d.content.autoRotated && wanted && (
        <span className="pill" title={`La presentación es ${ORIENTATION_LABEL[wanted].toLowerCase()} y esta pantalla es física ${d.screenWidth! >= d.screenHeight! ? "horizontal" : "vertical"}: la imagen se gira 90° automáticamente.`}>
          Girada automáticamente
        </span>
      )}
      {mismatch && wanted && (
        <span
          className="pill pill-warn"
          title={`La presentación está pensada para pantalla ${ORIENTATION_LABEL[wanted].toLowerCase()}, pero esta pantalla está en ${ORIENTATION_LABEL[d.screenOrientation!].toLowerCase()}. Se verá con bordes o recortada.`}
        >
          Orientación distinta
        </span>
      )}
    </div>
  );
}

function FiltersDrawer({
  allTags,
  calendars,
  groups,
  onlineFilter,
  contentFilter,
  calendarFilter,
  orientationFilter,
  groupFilter,
  tagFilter,
  activeCount,
  onToggleOnline,
  onToggleContent,
  onToggleCalendar,
  onToggleOrientation,
  onGroupChange,
  onToggleTag,
  onClear,
  onClose,
}: {
  allTags: string[];
  calendars: CalendarDTO[];
  groups: GroupDTO[];
  onlineFilter: OnlineFilter[];
  contentFilter: ContentFilter[];
  calendarFilter: string[];
  orientationFilter: Orientation[];
  groupFilter: string;
  tagFilter: string[];
  activeCount: number;
  onToggleOnline: (v: OnlineFilter) => void;
  onToggleContent: (v: ContentFilter) => void;
  onToggleCalendar: (id: string) => void;
  onToggleOrientation: (v: Orientation) => void;
  onGroupChange: (v: string) => void;
  onToggleTag: (t: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  return (
    <aside className="drawer z-50 space-y-4" role="dialog" aria-label="Filtros de pantallas">
      <div className="flex items-center gap-3">
        <h2 className="flex flex-1 items-center justify-center gap-2 text-lg font-semibold">
          <IconSliders className="h-4 w-4 text-accent" />
          Filtros
        </h2>
        <button onClick={onClose} aria-label="Cerrar" className="rounded-lg p-1 text-zinc-400 hover:bg-raised hover:text-zinc-100">
          <IconClose />
        </button>
      </div>

      <Collapsible title="Estado del contenido">
        <Check checked={contentFilter.includes("active")} onChange={() => onToggleContent("active")}>
          Activo
        </Check>
        <Check checked={contentFilter.includes("inactive")} onChange={() => onToggleContent("inactive")}>
          Inactivo
        </Check>
      </Collapsible>

      <Collapsible title="Calendario suscripto">
        <Check checked={calendarFilter.includes(NO_CALENDAR)} onChange={() => onToggleCalendar(NO_CALENDAR)}>
          Sin calendario
        </Check>
        {calendars.map((c) => (
          <Check key={c.id} checked={calendarFilter.includes(c.id)} onChange={() => onToggleCalendar(c.id)}>
            {c.name}
          </Check>
        ))}
      </Collapsible>

      <Collapsible title="Etiquetas">
        {allTags.length === 0 ? (
          <p className="px-2 text-xs text-zinc-500">Todavía no hay etiquetas</p>
        ) : (
          allTags.map((t) => (
            <Check key={t} checked={tagFilter.includes(t)} onChange={() => onToggleTag(t)}>
              {t}
            </Check>
          ))
        )}
        {tagFilter.length > 0 && <p className="px-2 text-xs text-zinc-500">La pantalla debe tener todas las etiquetas elegidas.</p>}
      </Collapsible>

      <Collapsible title="Estado del dispositivo">
        <Check checked={onlineFilter.includes("online")} onChange={() => onToggleOnline("online")}>
          En línea
        </Check>
        <Check checked={onlineFilter.includes("offline")} onChange={() => onToggleOnline("offline")}>
          Sin conexión
        </Check>
      </Collapsible>

      <Collapsible title="Orientación">
        <Check checked={orientationFilter.includes("landscape")} onChange={() => onToggleOrientation("landscape")}>
          Horizontal
        </Check>
        <Check checked={orientationFilter.includes("portrait")} onChange={() => onToggleOrientation("portrait")}>
          Vertical
        </Check>
      </Collapsible>

      <Collapsible title="Grupo">
        <select className="input w-full" value={groupFilter} onChange={(e) => onGroupChange(e.target.value)}>
          <option value="">Todos los grupos</option>
          <option value={NO_GROUP}>Sin grupo</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </Collapsible>

      <div className="border-t border-line pt-5">
        <button className="btn w-full" onClick={onClear} disabled={activeCount === 0}>
          Limpiar filtros
        </button>
      </div>
    </aside>
  );
}

/** Tarjeta con encabezado que se pliega/despliega (chevron). */
function Collapsible({
  title,
  badge,
  defaultOpen = true,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={CARD}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold hover:bg-white/[0.02]"
      >
        <span className="flex-1">{title}</span>
        {badge}
        <IconChevron className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="space-y-1 border-t border-line p-3">{children}</div>}
    </section>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: () => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-raised">
      <input type="checkbox" className="h-4 w-4 accent-accent" checked={checked} onChange={onChange} />
      <span className="min-w-0 truncate">{children}</span>
    </label>
  );
}

function PairModal({ onClose, onPaired }: { onClose: () => void; onPaired: () => void | Promise<void> }) {
  const [digits, setDigits] = useState<string[]>(() => Array.from({ length: CODE_LENGTH }, () => ""));
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const code = digits.join("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function focusBox(i: number) {
    const el = boxes.current[i];
    el?.focus();
    el?.select();
  }

  function setDigitAt(i: number, d: string) {
    setDigits((prev) => {
      const next = [...prev];
      next[i] = d;
      return next;
    });
  }

  function onBoxChange(i: number, raw: string) {
    const d = raw.replace(/\D/g, "").slice(-1);
    setDigitAt(i, d);
    if (d && i < CODE_LENGTH - 1) focusBox(i + 1);
  }

  function onBoxKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      e.preventDefault();
      setDigitAt(i - 1, "");
      focusBox(i - 1);
    } else if (e.key === "ArrowLeft" && i > 0) {
      e.preventDefault();
      focusBox(i - 1);
    } else if (e.key === "ArrowRight" && i < CODE_LENGTH - 1) {
      e.preventDefault();
      focusBox(i + 1);
    }
  }

  function onBoxPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (!text) return;
    e.preventDefault();
    setDigits(Array.from({ length: CODE_LENGTH }, (_, k) => text[k] ?? ""));
    focusBox(Math.min(text.length, CODE_LENGTH) - 1);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== CODE_LENGTH || !name.trim() || busy) return;
    setError(null);
    setBusy(true);
    try {
      await api("/api/devices/pair", { method: "POST", body: JSON.stringify({ code, name, location }) });
      await onPaired();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form role="dialog" aria-modal="true" aria-labelledby="pair-title" onSubmit={submit} className="modal space-y-5 p-6">
        <div className="flex items-center justify-between">
          <h2 id="pair-title" className="text-lg font-semibold">
            Ingresar código de vinculación
          </h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg p-1 text-zinc-400 hover:bg-raised hover:text-zinc-100">
            <IconClose />
          </button>
        </div>

        <p className="text-sm leading-relaxed text-zinc-400">
          Encendé la pantalla y buscá el código de 4 dígitos que muestra en pantalla. Necesita conexión de red.
        </p>

        <div className="space-y-2">
          <span className="text-sm font-medium">Código</span>
          <div className="flex gap-3">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  boxes.current[i] = el;
                }}
                autoFocus={i === 0}
                inputMode="numeric"
                aria-label={`Dígito ${i + 1}`}
                value={d}
                onChange={(e) => onBoxChange(i, e.target.value)}
                onKeyDown={(e) => onBoxKey(i, e)}
                onPaste={onBoxPaste}
                onFocus={(e) => e.target.select()}
                className="h-16 w-14 rounded-xl border border-accent bg-canvas text-center font-mono text-2xl font-semibold outline-none focus:ring-2 focus:ring-accent/40 sm:h-20 sm:w-16"
              />
            ))}
          </div>
        </div>

        <label className="block space-y-2">
          <span className="text-sm font-medium">Nombre</span>
          <input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="Pantalla del hall de entrada" />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium">Ubicación</span>
          <input className="input w-full" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Hall" />
        </label>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={code.length !== CODE_LENGTH || !name.trim() || busy}>
            Vincular
          </button>
        </div>
      </form>
    </div>
  );
}

type DevicePatch = {
  name?: string;
  location?: string | null;
  defaultPresentationId?: string | null;
  tags?: string[];
  groupId?: string | null;
  calendarId?: string | null;
  rotation?: number;
};

function DeviceDrawer({
  device,
  presentations,
  groups,
  calendars,
  onClose,
  reload,
}: {
  device: DeviceDTO;
  presentations: PresentationDTO[];
  groups: GroupDTO[];
  calendars: CalendarDTO[];
  onClose: () => void;
  reload: () => Promise<void>;
}) {
  const [name, setName] = useState(device.name);
  const [location, setLocation] = useState(device.location ?? "");
  const [tags, setTags] = useState(device.tags);
  const [tagDraft, setTagDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const dialogs = useDialogs();

  // Al llegar datos nuevos del servidor (polling), se toman como verdad.
  useEffect(() => {
    setTags(device.tags);
  }, [device.tags]);

  async function save(patch: DevicePatch): Promise<boolean> {
    setError(null);
    try {
      await api(`/api/devices/${device.id}`, { method: "PATCH", body: JSON.stringify(patch) });
      await reload();
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    }
  }

  async function saveTags(next: string[]) {
    const prev = tags;
    setTags(next);
    if (!(await save({ tags: next }))) setTags(prev);
  }

  function addTag() {
    const tag = tagDraft.trim().toLowerCase();
    if (!tag) return setTagDraft("");
    if (tags.includes(tag)) return setTagDraft("");
    if (tag.length > MAX_TAG_LENGTH) return setError(`Cada etiqueta puede tener hasta ${MAX_TAG_LENGTH} caracteres`);
    if (tags.length >= MAX_TAGS) return setError(`Una pantalla puede tener hasta ${MAX_TAGS} etiquetas`);
    setTagDraft("");
    void saveTags([...tags, tag]);
  }

  function saveName() {
    const v = name.trim();
    if (!v) return setName(device.name);
    if (v !== device.name) void save({ name: v });
  }

  function saveLocation() {
    const v = location.trim();
    if (v !== (device.location ?? "")) void save({ location: v || null });
  }

  async function remove() {
    const ok = await dialogs.confirm({
      title: "Desvincular pantalla",
      message: `¿Desvincular "${device.name}"? Va a tener que volver a vincularse con un código para mostrar contenido.`,
      danger: true,
      confirmLabel: "Desvincular",
    });
    if (!ok) return;
    setError(null);
    try {
      await api(`/api/devices/${device.id}`, { method: "DELETE" });
      toast.success("Pantalla desvinculada");
      onClose();
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const detectedRes = device.screenWidth && device.screenHeight ? `${device.screenWidth}×${device.screenHeight}` : "—";
  const live = device.content.source === "takeover";
  const scheduled = device.content.source === "schedule" || device.content.source === "default";

  return (
    <aside className="drawer space-y-4" aria-label={`Pantalla ${device.name}`}>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-raised">
          <IconDevices className="h-5 w-5 text-accent" />
        </span>
        <h2 className="flex-1 text-lg font-semibold">Pantalla</h2>
        <button onClick={onClose} aria-label="Cerrar" className="rounded-lg p-1 text-zinc-400 hover:bg-raised hover:text-zinc-100">
          <IconClose />
        </button>
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-medium">Nombre</span>
        <input
          className="input w-full"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
      </label>

      <Collapsible
        title="Estado"
        badge={
          device.online ? (
            <span className="pill pill-ok">
              <span className="dot dot-ok" />
              En línea
            </span>
          ) : (
            <span className="pill">
              <span className="dot" />
              Sin conexión
            </span>
          )
        }
      >
        <div className="space-y-3 p-1">
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-zinc-400">Contenido en vivo</span>
            <ContentBox text={live ? (device.content.label ?? "Sin nombre") : "Sin contenido en vivo"} />
          </div>
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-zinc-400">Contenido programado</span>
            <ContentBox text={scheduled ? (device.content.label ?? "Sin nombre") : "Sin contenido programado"} />
          </div>
          {!device.online && (
            <p className="text-xs text-zinc-500">
              {device.lastSeenAt
                ? `Visto por última vez: ${new Date(device.lastSeenAt).toLocaleString("es-AR")}`
                : "Todavía no se conectó"}
            </p>
          )}
        </div>
      </Collapsible>

      <Collapsible title="Calendario suscripto">
        <div className="space-y-2 p-1">
          <select
            className="input w-full"
            value={device.calendarId ?? ""}
            onChange={(e) => void save({ calendarId: e.target.value || null })}
          >
            <option value="">Sin calendario</option>
            {calendars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-zinc-500">La pantalla muestra lo programado en el calendario elegido.</p>
        </div>
      </Collapsible>

      <Collapsible title="Etiquetas">
        <div className="space-y-2 p-1">
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-full bg-raised py-1 pl-3 pr-1 text-xs text-zinc-200">
                  <IconTag />
                  {t}
                  <button
                    type="button"
                    aria-label={`Quitar etiqueta ${t}`}
                    className="rounded-full p-0.5 text-zinc-400 hover:bg-line hover:text-zinc-100"
                    onClick={() => void saveTags(tags.filter((x) => x !== t))}
                  >
                    <IconClose className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <input
            className="input w-full"
            value={tagDraft}
            maxLength={MAX_TAG_LENGTH}
            placeholder="Agregar etiquetas"
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTag();
              }
            }}
          />
          <p className="text-xs text-zinc-500">
            Escribí y pulsá Enter o coma. Hasta {MAX_TAGS} etiquetas, de {MAX_TAG_LENGTH} caracteres como máximo.
          </p>
        </div>
      </Collapsible>

      <Collapsible title="Ubicación">
        <div className="p-1">
          <input
            className="input w-full"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onBlur={saveLocation}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            placeholder="Sin ubicación"
          />
        </div>
      </Collapsible>

      <Collapsible title="Pantalla">
        <div className="space-y-4 p-1">
          <div className="space-y-2">
            <span className="text-xs font-medium text-zinc-400">Resolución detectada</span>
            <div className="flex flex-wrap items-center gap-2">
              <span className="tabular-nums text-zinc-300">{detectedRes}</span>
              {device.screenOrientation ? (
                <span className="pill">{ORIENTATION_LABEL[device.screenOrientation]}</span>
              ) : (
                <span className="text-zinc-500">Orientación desconocida</span>
              )}
            </div>
          </div>

          <label className="block space-y-2">
            <span className="text-xs font-medium text-zinc-400">Giro de pantalla</span>
            <select
              className="input w-full"
              value={device.rotation}
              onChange={(e) => void save({ rotation: Number(e.target.value) })}
            >
              {ROTATIONS.map((r) => (
                <option key={r} value={r}>
                  {r === 0 ? "Automático (0°)" : `${r}°`}
                </option>
              ))}
            </select>
            <p className="text-xs text-zinc-500">En automático, una presentación vertical se gira sola en una pantalla horizontal (y al revés). Si queda cabeza abajo, elegí 270°. Un giro fijo (90°, 180°, 270°) se aplica siempre.</p>
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-medium text-zinc-400">Grupo</span>
            <select
              className="input w-full"
              value={device.groupId ?? ""}
              onChange={(e) => void save({ groupId: e.target.value || null })}
            >
              <option value="">Sin grupo</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-medium text-zinc-400">Presentación por defecto</span>
            <select
              className="input w-full"
              value={device.defaultPresentationId ?? ""}
              onChange={(e) => void save({ defaultPresentationId: e.target.value || null })}
            >
              <option value="">Nada</option>
              {presentations.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Collapsible>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="border-t border-line pt-5">
        <button className="btn-danger w-full" onClick={remove}>
          Desvincular
        </button>
      </div>
    </aside>
  );
}

function ContentBox({ text }: { text: string }) {
  return <div className="rounded-lg bg-raised px-3 py-2.5 text-sm text-zinc-400">{text}</div>;
}

/* Iconos locales (mismo trazo que Icons.tsx). */

function IconSliders({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className={className} aria-hidden>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </svg>
  );
}

function IconBroadcast({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="12" cy="12" r="2" />
      <path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19.1 4.9a10 10 0 0 1 0 14.2M4.9 19.1a10 10 0 0 1 0-14.2" />
    </svg>
  );
}

function IconTag({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </svg>
  );
}

function IconChevron({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
