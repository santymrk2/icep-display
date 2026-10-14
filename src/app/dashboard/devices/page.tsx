"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type DeviceDTO, type GroupDTO, type Orientation, type PresentationDTO } from "@/lib/client";
import { IconClose, IconDevices, IconPlus, IconSearch } from "@/components/Icons";

const CODE_LENGTH = 4;
const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 24;
/** Valor del select de grupo para "pantallas sin grupo". */
const NO_GROUP = "none";
/** Giros posibles del TV, en grados. */
const ROTATIONS = [0, 90, 180, 270] as const;

type OnlineFilter = "online" | "offline";
type ContentFilter = "active" | "inactive";

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
  const [query, setQuery] = useState("");
  const [onlineFilter, setOnlineFilter] = useState<OnlineFilter[]>([]);
  const [contentFilter, setContentFilter] = useState<ContentFilter[]>([]);
  const [orientationFilter, setOrientationFilter] = useState<Orientation[]>([]);
  const [groupFilter, setGroupFilter] = useState("");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [list, groupList] = await Promise.all([
      api<DeviceDTO[]>("/api/devices"),
      api<GroupDTO[]>("/api/groups").catch(() => null),
    ]);
    setDevices(list);
    if (groupList) setGroups(groupList);
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
  const groupName = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);

  const q = query.trim().toLowerCase();
  // Dentro de un grupo de checkboxes, nada tildado = sin filtro (igual que todos tildados).
  const activeFilters =
    onlineFilter.length + contentFilter.length + orientationFilter.length + (groupFilter ? 1 : 0) + tagFilter.length;
  const filtersActive = activeFilters > 0;
  const visible = devices.filter((d) => {
    if (onlineFilter.length > 0 && !onlineFilter.includes(d.online ? "online" : "offline")) return false;
    if (contentFilter.length > 0 && !contentFilter.includes(d.content.source === "none" ? "inactive" : "active")) return false;
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
  const selected = devices.find((d) => d.id === selectedId) ?? null;
  const presentationName = (id: string | null) => presentations.find((p) => p.id === id)?.name;
  const closePairing = useCallback(() => setPairing(false), []);
  const deviceWord = devices.length === 1 ? "pantalla" : "pantallas";

  function clearFilters() {
    setOnlineFilter([]);
    setContentFilter([]);
    setOrientationFilter([]);
    setGroupFilter("");
    setTagFilter([]);
  }

  return (
    <div className="space-y-6">
      <h1 className="sr-only">Pantallas</h1>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-md flex-1">
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
        <div className="ml-auto flex items-center gap-3">
          <span className="pill pill-warn">
            {filtersActive || q
              ? `${visible.length} de ${devices.length} ${deviceWord}`
              : `${devices.length} ${deviceWord}`}
          </span>
          <button className="btn-primary" onClick={() => setPairing(true)}>
            <IconPlus />
            Vincular pantalla
          </button>
        </div>
      </div>

      {notice && <p className="text-sm text-emerald-400">{notice}</p>}

      <div className="table-shell overflow-x-auto">
        <table className="min-w-[1040px]">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Estado</th>
              <th>Resolución</th>
              <th>Reproduciendo</th>
              <th>Presentación por defecto</th>
              <th>Ubicación</th>
              <th>Grupo</th>
              <th>Etiquetas</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={8} className="py-12 text-center text-zinc-500">
                  {devices.length === 0
                    ? "No hay pantallas todavía"
                    : filtersActive || q
                      ? "Ninguna pantalla coincide con la búsqueda o los filtros"
                      : "Ninguna pantalla coincide con la búsqueda"}
                </td>
              </tr>
            )}
            {visible.map((d) => (
              <tr key={d.id} className="row-click" onClick={() => setSelectedId(d.id)}>
                <td>
                  <button className="font-medium underline underline-offset-4 hover:text-accent">{d.name}</button>
                </td>
                <td>
                  {d.online ? (
                    <span className="pill pill-ok">
                      <span className="dot dot-ok" />
                      Online
                    </span>
                  ) : (
                    <span className="pill">
                      <span className="dot" />
                      Offline
                    </span>
                  )}
                </td>
                <td>
                  <ResolutionCell device={d} />
                </td>
                <td>
                  {d.content.source === "none" ? (
                    <span className="text-zinc-500">Nada</span>
                  ) : (
                    <div>
                      <div className="text-zinc-200">{d.content.label ?? "Sin nombre"}</div>
                      <div className="text-xs text-zinc-500">{SOURCE_LABEL[d.content.source]}</div>
                    </div>
                  )}
                </td>
                <td className="text-zinc-300">{presentationName(d.defaultPresentationId) ?? <span className="text-zinc-500">Nada</span>}</td>
                <td className="text-zinc-300">{d.location ?? <span className="text-zinc-500">Sin ubicación</span>}</td>
                <td className="text-zinc-300">
                  {(d.groupId && groupName.get(d.groupId)) || <span className="text-zinc-500">—</span>}
                </td>
                <td>
                  {d.tags.length === 0 ? (
                    <span className="text-xs italic text-zinc-500">Agregar etiquetas</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {d.tags.map((t) => (
                        <span key={t} className="rounded-full bg-raised px-2 py-0.5 text-xs text-zinc-300">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtersOpen && (
        <FiltersDrawer
          allTags={allTags}
          groups={groups}
          onlineFilter={onlineFilter}
          contentFilter={contentFilter}
          orientationFilter={orientationFilter}
          groupFilter={groupFilter}
          tagFilter={tagFilter}
          activeCount={activeFilters}
          onToggleOnline={(v) => setOnlineFilter((prev) => toggleIn(prev, v))}
          onToggleContent={(v) => setContentFilter((prev) => toggleIn(prev, v))}
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
            setNotice("Pantalla vinculada");
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
          onClose={() => setSelectedId(null)}
          reload={load}
        />
      )}
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
  groups,
  onlineFilter,
  contentFilter,
  orientationFilter,
  groupFilter,
  tagFilter,
  activeCount,
  onToggleOnline,
  onToggleContent,
  onToggleOrientation,
  onGroupChange,
  onToggleTag,
  onClear,
  onClose,
}: {
  allTags: string[];
  groups: GroupDTO[];
  onlineFilter: OnlineFilter[];
  contentFilter: ContentFilter[];
  orientationFilter: Orientation[];
  groupFilter: string;
  tagFilter: string[];
  activeCount: number;
  onToggleOnline: (v: OnlineFilter) => void;
  onToggleContent: (v: ContentFilter) => void;
  onToggleOrientation: (v: Orientation) => void;
  onGroupChange: (v: string) => void;
  onToggleTag: (t: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  return (
    <aside className="drawer z-50 space-y-6" role="dialog" aria-label="Filtros de pantallas">
      <div className="flex items-center gap-3">
        <h2 className="flex-1 text-lg font-semibold">Filtros</h2>
        <button onClick={onClose} aria-label="Cerrar" className="rounded-lg p-1 text-zinc-400 hover:bg-raised hover:text-zinc-100">
          <IconClose />
        </button>
      </div>

      <FilterGroup title="Estado del contenido">
        <Check checked={contentFilter.includes("active")} onChange={() => onToggleContent("active")}>
          Activo
        </Check>
        <Check checked={contentFilter.includes("inactive")} onChange={() => onToggleContent("inactive")}>
          Inactivo
        </Check>
      </FilterGroup>

      <FilterGroup title="Etiquetas">
        {allTags.length === 0 ? (
          <p className="text-xs text-zinc-500">Todavía no hay etiquetas</p>
        ) : (
          allTags.map((t) => (
            <Check key={t} checked={tagFilter.includes(t)} onChange={() => onToggleTag(t)}>
              {t}
            </Check>
          ))
        )}
        {tagFilter.length > 0 && <p className="text-xs text-zinc-500">La pantalla debe tener todas las etiquetas elegidas.</p>}
      </FilterGroup>

      <FilterGroup title="Estado">
        <Check checked={onlineFilter.includes("online")} onChange={() => onToggleOnline("online")}>
          En línea
        </Check>
        <Check checked={onlineFilter.includes("offline")} onChange={() => onToggleOnline("offline")}>
          Sin conexión
        </Check>
      </FilterGroup>

      <FilterGroup title="Orientación">
        <Check checked={orientationFilter.includes("landscape")} onChange={() => onToggleOrientation("landscape")}>
          Horizontal
        </Check>
        <Check checked={orientationFilter.includes("portrait")} onChange={() => onToggleOrientation("portrait")}>
          Vertical
        </Check>
      </FilterGroup>

      <label className="block space-y-2">
        <span className="text-sm font-medium">Grupo</span>
        <select className="input w-full" value={groupFilter} onChange={(e) => onGroupChange(e.target.value)}>
          <option value="">Todos los grupos</option>
          <option value={NO_GROUP}>Sin grupo</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>

      <div className="border-t border-line pt-5">
        <button className="btn w-full" onClick={onClear} disabled={activeCount === 0}>
          Limpiar filtros
        </button>
      </div>
    </aside>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <span className="text-sm font-medium">{title}</span>
      <div className="space-y-1">{children}</div>
    </div>
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
            Vincular pantalla
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
                className="h-16 w-14 rounded-xl border border-accent/60 bg-canvas text-center font-mono text-2xl font-semibold outline-none focus:border-accent focus:ring-2 focus:ring-accent/40 sm:h-20 sm:w-16"
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
  rotation?: number;
};

function DeviceDrawer({
  device,
  presentations,
  groups,
  onClose,
  reload,
}: {
  device: DeviceDTO;
  presentations: PresentationDTO[];
  groups: GroupDTO[];
  onClose: () => void;
  reload: () => Promise<void>;
}) {
  const [name, setName] = useState(device.name);
  const [location, setLocation] = useState(device.location ?? "");
  const [tags, setTags] = useState(device.tags);
  const [tagDraft, setTagDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

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
    if (!confirm(`¿Desvincular "${device.name}"?`)) return;
    setError(null);
    try {
      await api(`/api/devices/${device.id}`, { method: "DELETE" });
      onClose();
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const detectedRes = device.screenWidth && device.screenHeight ? `${device.screenWidth}×${device.screenHeight}` : "—";

  return (
    <aside className="drawer space-y-6" aria-label={`Pantalla ${device.name}`}>
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
        <span className="text-sm font-medium">Nombre de la pantalla</span>
        <input
          className="input w-full"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
      </label>

      <div className="space-y-2">
        <span className="text-sm font-medium">Estado</span>
        <div>
          {device.online ? (
            <span className="pill pill-ok">
              <span className="dot dot-ok" />
              Online
            </span>
          ) : (
            <span className="pill">
              <span className="dot" />
              Offline
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-500">
          {device.online
            ? "Conectada ahora"
            : device.lastSeenAt
              ? `Visto por última vez: ${new Date(device.lastSeenAt).toLocaleString("es-AR")}`
              : "Todavía no se conectó"}
        </p>
      </div>

      <div className="space-y-2">
        <span className="text-sm font-medium">Pantalla detectada</span>
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
        <span className="text-sm font-medium">Giro de pantalla</span>
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
        <span className="text-sm font-medium">Ubicación</span>
        <input
          className="input w-full"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          onBlur={saveLocation}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          placeholder="Sin ubicación"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium">Grupo</span>
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

      <div className="space-y-2">
        <span className="text-sm font-medium">Etiquetas</span>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-full bg-raised py-1 pl-3 pr-1 text-xs text-zinc-200">
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
          placeholder="Escribí y pulsá Enter o coma"
          onChange={(e) => setTagDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTag();
            }
          }}
        />
        <p className="text-xs text-zinc-500">
          Hasta {MAX_TAGS} etiquetas, de {MAX_TAG_LENGTH} caracteres como máximo.
        </p>
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-medium">Presentación por defecto</span>
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

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="border-t border-line pt-5">
        <button className="btn-danger w-full" onClick={remove}>
          Desvincular
        </button>
      </div>
    </aside>
  );
}
