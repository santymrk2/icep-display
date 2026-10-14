"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type DeviceDTO, type GroupDTO, type PresentationDTO } from "@/lib/client";
import { IconClose, IconDevices, IconPlus, IconSearch } from "@/components/Icons";

const CODE_LENGTH = 4;
const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 24;
/** Valor del select de grupo para "pantallas sin grupo". */
const NO_GROUP = "none";

type StatusFilter = "all" | "online" | "offline";

export default function DevicesPage() {
  const [devices, setDevices] = useState<DeviceDTO[]>([]);
  const [presentations, setPresentations] = useState<PresentationDTO[]>([]);
  const [groups, setGroups] = useState<GroupDTO[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [groupFilter, setGroupFilter] = useState("");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const filtersRef = useRef<HTMLDivElement>(null);

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

  // Cerrar el panel de filtros con clic afuera o Escape.
  useEffect(() => {
    if (!filtersOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!filtersRef.current?.contains(e.target as Node)) setFiltersOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFiltersOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [filtersOpen]);

  const allTags = useMemo(
    () => [...new Set(devices.flatMap((d) => d.tags))].sort((a, b) => a.localeCompare(b, "es")),
    [devices],
  );
  const groupName = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);

  const q = query.trim().toLowerCase();
  const activeFilters = (status !== "all" ? 1 : 0) + (groupFilter ? 1 : 0) + tagFilter.length;
  const filtersActive = activeFilters > 0;
  const visible = devices.filter((d) => {
    if (status === "online" && !d.online) return false;
    if (status === "offline" && d.online) return false;
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
    setStatus("all");
    setGroupFilter("");
    setTagFilter([]);
  }

  function toggleTag(tag: string) {
    setTagFilter((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
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
        <div ref={filtersRef} className="relative flex items-center gap-3">
          <button
            type="button"
            className="btn"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((o) => !o)}
          >
            Filtros
            {filtersActive && (
              <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold leading-5 text-white">
                {activeFilters}
              </span>
            )}
          </button>
          {filtersActive && (
            <button type="button" className="text-sm text-accent underline-offset-4 hover:underline" onClick={clearFilters}>
              Limpiar
            </button>
          )}
          {filtersOpen && (
            <div
              role="dialog"
              aria-label="Filtros de pantallas"
              className="absolute right-0 top-full z-20 mt-2 w-72 space-y-5 rounded-xl border border-line bg-panel p-4 shadow-2xl"
            >
              <div className="space-y-2">
                <span className="text-sm font-medium">Estado</span>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["all", "Todas"],
                      ["online", "Online"],
                      ["offline", "Offline"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={status === value}
                      className={chipClass(status === value)}
                      onClick={() => setStatus(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="block space-y-2">
                <span className="text-sm font-medium">Grupo</span>
                <select className="input w-full" value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
                  <option value="">Todos los grupos</option>
                  <option value={NO_GROUP}>Sin grupo</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="space-y-2">
                <span className="text-sm font-medium">Etiquetas</span>
                {allTags.length === 0 ? (
                  <p className="text-xs text-zinc-500">Todavía no hay etiquetas</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {allTags.map((t) => (
                      <button key={t} type="button" aria-pressed={tagFilter.includes(t)} className={chipClass(tagFilter.includes(t))} onClick={() => toggleTag(t)}>
                        {t}
                      </button>
                    ))}
                  </div>
                )}
                {tagFilter.length > 0 && <p className="text-xs text-zinc-500">La pantalla debe tener todas las etiquetas elegidas.</p>}
              </div>
            </div>
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
        <table className="min-w-[860px]">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Estado</th>
              <th>Presentación por defecto</th>
              <th>Ubicación</th>
              <th>Grupo</th>
              <th>Etiquetas</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
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

function chipClass(active: boolean) {
  return `rounded-full px-3 py-1 text-xs font-medium transition-colors ${
    active ? "bg-accent text-white" : "bg-raised text-zinc-300 hover:bg-line"
  }`;
}

type DevicePatch = {
  name?: string;
  location?: string | null;
  defaultPresentationId?: string | null;
  tags?: string[];
  groupId?: string | null;
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
