"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { api, type MediaDTO, type SettingsDTO, type TagDTO } from "@/lib/client";
import { IconClose, IconPlus, IconSearch } from "@/components/Icons";

type Tab = "general" | "tags";
type Notice = { kind: "ok" | "error"; text: string } | null;
type SettingsPatch = { timezone?: string; defaultBackgroundId?: string | null; sharePreviewLinks?: boolean };
type RunFn = (fn: () => Promise<unknown>, ok?: string) => Promise<void>;

const MAX_TAG_LENGTH = 24;

const FALLBACK_TIMEZONES = [
  "UTC",
  "America/Argentina/Buenos_Aires",
  "America/Asuncion",
  "America/Bogota",
  "America/Caracas",
  "America/Chicago",
  "America/Denver",
  "America/La_Paz",
  "America/Lima",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/Montevideo",
  "America/New_York",
  "America/Santiago",
  "America/Sao_Paulo",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Rome",
];

/** Lista de zonas IANA del navegador; si no está disponible, una lista chica de respaldo. */
function listTimezones(): string[] {
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    if (supported) {
      const zones = supported.call(Intl, "timeZone");
      if (zones.length > 0) return zones.includes("UTC") ? zones : ["UTC", ...zones];
    }
  } catch {
    /* sin soporte: usamos la lista de respaldo */
  }
  return FALLBACK_TIMEZONES;
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("general");
  const [settings, setSettings] = useState<SettingsDTO | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const load = useCallback(async () => setSettings(await api<SettingsDTO>("/api/settings")), []);

  useEffect(() => {
    void load().catch((e) => setNotice({ kind: "error", text: (e as Error).message }));
  }, [load]);

  // Los avisos de éxito se borran solos; los de error quedan hasta la próxima acción.
  useEffect(() => {
    if (notice?.kind !== "ok") return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const run: RunFn = useCallback(async (fn, ok) => {
    setNotice(null);
    try {
      await fn();
      if (ok) setNotice({ kind: "ok", text: ok });
    } catch (e) {
      setNotice({ kind: "error", text: (e as Error).message });
    }
  }, []);

  const saveSettings = (patch: SettingsPatch, ok: string) =>
    run(async () => {
      setSettings(await api<SettingsDTO>("/api/settings", { method: "PATCH", body: JSON.stringify(patch) }));
    }, ok);

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold">Ajustes</h1>

      <div role="tablist" aria-label="Secciones de ajustes" className="flex gap-1 border-b border-line">
        {(
          [
            ["general", "General"],
            ["tags", "Etiquetas"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === value ? "border-accent text-zinc-100" : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {notice && <p className={`text-sm ${notice.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>{notice.text}</p>}

      {tab === "general" &&
        (settings ? (
          <GeneralTab settings={settings} onSave={saveSettings} run={run} onSettings={setSettings} />
        ) : (
          <p className="text-sm text-zinc-500">Cargando…</p>
        ))}

      {tab === "tags" && <TagsTab run={run} />}
    </div>
  );
}

/* ------------------------------------------------------------------ General */

function GeneralTab({
  settings,
  onSave,
  run,
  onSettings,
}: {
  settings: SettingsDTO;
  onSave: (patch: SettingsPatch, ok: string) => Promise<void>;
  run: RunFn;
  onSettings: (s: SettingsDTO) => void;
}) {
  const timezones = useMemo(() => {
    const zones = listTimezones();
    return zones.includes(settings.timezone) ? zones : [settings.timezone, ...zones];
  }, [settings.timezone]);

  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function uploadBackground(file: File) {
    if (!file.type.startsWith("image/")) return run(() => Promise.reject(new Error("Elegí una imagen")));
    setUploading(true);
    await run(async () => {
      const asset = await api<MediaDTO>("/api/media/upload", {
        method: "PUT",
        body: file,
        headers: { "content-type": file.type, "x-file-name": encodeURIComponent(file.name) },
      });
      onSettings(await api<SettingsDTO>("/api/settings", { method: "PATCH", body: JSON.stringify({ defaultBackgroundId: asset.id }) }));
    }, "Fondo actualizado");
    setUploading(false);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void uploadBackground(file);
  }

  return (
    <div className="space-y-6">
      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">Zona horaria</h2>
        <select
          className="input w-full max-w-md"
          value={settings.timezone}
          onChange={(e) => void onSave({ timezone: e.target.value }, "Zona horaria actualizada")}
        >
          {timezones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
        <p className="text-xs text-zinc-500">Se aplica a todos los calendarios.</p>
      </section>

      <section className="card space-y-4 p-5">
        <div className="space-y-1">
          <h2 className="font-semibold">Fondo predeterminado</h2>
          <p className="text-xs text-zinc-500">
            Por defecto, los huecos sin contenido programado muestran fondo negro, salvo que subas una imagen acá.
          </p>
        </div>

        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex aspect-video w-full shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-black sm:w-64">
            {settings.backgroundUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.backgroundUrl} alt="Fondo predeterminado actual" className="h-full w-full object-cover" />
            ) : (
              <span className="text-xs text-zinc-500">Negro</span>
            )}
          </div>

          <div className="flex-1 space-y-3">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`rounded-lg border-2 border-dashed p-6 text-center text-sm transition-colors ${
                dragging ? "border-accent bg-accent/10" : "border-line"
              }`}
            >
              <p className="text-zinc-400">Arrastrá una imagen acá o</p>
              <button
                type="button"
                className="mt-1 text-accent underline-offset-4 hover:underline disabled:opacity-50"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? "Subiendo…" : "subila desde tu equipo"}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void uploadBackground(file);
                }}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn" onClick={() => setPicking(true)}>
                Elegir de Medios
              </button>
              {settings.backgroundUrl && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => void onSave({ defaultBackgroundId: null }, "Fondo quitado")}
                >
                  Quitar
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="card flex items-start justify-between gap-4 p-5">
        <div className="space-y-1">
          <h2 className="font-semibold">Compartir enlaces de vista previa</h2>
          <p className="text-sm text-zinc-400">Permite compartir enlaces de solo vista previa.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.sharePreviewLinks}
          aria-label="Compartir enlaces de vista previa"
          onClick={() =>
            void onSave(
              { sharePreviewLinks: !settings.sharePreviewLinks },
              settings.sharePreviewLinks ? "Enlaces de vista previa desactivados" : "Enlaces de vista previa activados",
            )
          }
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${settings.sharePreviewLinks ? "bg-accent" : "bg-line"}`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
              settings.sharePreviewLinks ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </section>

      {picking && (
        <MediaPickerModal
          onClose={() => setPicking(false)}
          onPick={(id) => {
            setPicking(false);
            void onSave({ defaultBackgroundId: id }, "Fondo actualizado");
          }}
        />
      )}
    </div>
  );
}

function MediaPickerModal({ onClose, onPick }: { onClose: () => void; onPick: (id: string) => void }) {
  const [images, setImages] = useState<MediaDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<MediaDTO[]>("/api/media")
      .then((list) => setImages(list.filter((m) => m.kind === "image")))
      .catch((e) => setError((e as Error).message));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="picker-title" className="modal flex max-h-[85vh] max-w-2xl flex-col p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="picker-title" className="text-lg font-semibold">
            Elegir de Medios
          </h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg p-1 text-zinc-400 hover:bg-raised hover:text-zinc-100">
            <IconClose />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {error && <p className="text-sm text-red-400">{error}</p>}
          {!error && images === null && <p className="text-sm text-zinc-500">Cargando…</p>}
          {images?.length === 0 && <p className="py-12 text-center text-sm text-zinc-500">No hay imágenes en Medios todavía</p>}
          {images && images.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {images.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onPick(m.id)}
                  title={m.originalName}
                  className="group overflow-hidden rounded-lg border border-line bg-canvas text-left transition-colors hover:border-accent"
                >
                  <div className="aspect-video bg-black">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.thumbnailUrl ?? m.url} alt={m.originalName} className="h-full w-full object-cover" loading="lazy" />
                  </div>
                  <p className="truncate px-2 py-1.5 text-xs text-zinc-300 group-hover:text-zinc-100">{m.originalName}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Etiquetas */

function TagsTab({ run }: { run: RunFn }) {
  const [tags, setTags] = useState<TagDTO[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState("");
  const [modal, setModal] = useState<{ mode: "add" } | { mode: "edit"; tag: TagDTO } | null>(null);

  const load = useCallback(async () => {
    setTags(await api<TagDTO[]>("/api/tags"));
    setLoaded(true);
  }, []);

  useEffect(() => {
    void run(load).catch(() => {});
  }, [load, run]);

  const q = filter.trim().toLowerCase();
  const visible = tags.filter((t) => !q || t.name.includes(q));

  function remove(t: TagDTO) {
    const n = t.devices.length;
    const extra = n > 0 ? ` Se quitará de ${n} ${n === 1 ? "pantalla" : "pantallas"}.` : "";
    if (!confirm(`¿Borrar la etiqueta "${t.name}"?${extra}`)) return;
    void run(async () => {
      await api(`/api/tags/${t.id}`, { method: "DELETE" });
      await load();
    }, "Etiqueta borrada");
  }

  function register(t: TagDTO) {
    void run(async () => {
      await api<TagDTO>("/api/tags", { method: "POST", body: JSON.stringify({ name: t.name }) });
      await load();
    }, "Etiqueta registrada");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-md flex-1">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            className="input w-full pl-9"
            placeholder="Filtrar por nombre..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="pill">{tags.length} {tags.length === 1 ? "etiqueta" : "etiquetas"}</span>
          <button className="btn-primary" onClick={() => setModal({ mode: "add" })}>
            <IconPlus />
            Agregar etiqueta
          </button>
        </div>
      </div>

      <div className="table-shell overflow-x-auto">
        <table className="min-w-[760px]">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Descripción</th>
              <th>Creada</th>
              <th>Pantallas</th>
              <th className="text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="py-12 text-center text-zinc-500">
                  {!loaded ? "Cargando…" : tags.length === 0 ? "Todavía no hay etiquetas" : "Ninguna etiqueta coincide con el filtro"}
                </td>
              </tr>
            )}
            {visible.map((t) => (
              <tr key={t.id ?? `unregistered-${t.name}`}>
                <td className="font-medium">
                  {t.name}
                  {t.id === null && <span className="ml-2 text-xs font-normal text-amber-400">sin registrar</span>}
                </td>
                <td className="max-w-xs text-zinc-300">
                  {t.description ?? <span className="text-zinc-500">Sin descripción</span>}
                </td>
                <td className="whitespace-nowrap text-zinc-400">
                  {t.createdAt ? new Date(t.createdAt).toLocaleDateString("es-AR") : <span className="text-zinc-500">—</span>}
                </td>
                <td>
                  {t.devices.length === 0 ? (
                    <span className="text-zinc-500">—</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="pill">{t.devices.length}</span>
                      <span className="text-zinc-300">{t.devices.join(", ")}</span>
                    </div>
                  )}
                </td>
                <td className="space-x-2 text-right whitespace-nowrap">
                  {t.id === null ? (
                    <button className="btn-primary" onClick={() => register(t)}>
                      Registrar
                    </button>
                  ) : (
                    <>
                      <button className="btn" onClick={() => setModal({ mode: "edit", tag: t })}>
                        Editar descripción
                      </button>
                      <button className="btn-danger" onClick={() => remove(t)}>
                        Borrar
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <TagModal
          tag={modal.mode === "edit" ? modal.tag : null}
          onClose={() => setModal(null)}
          onDone={(msg) => {
            setModal(null);
            void run(load, msg);
          }}
        />
      )}
    </div>
  );
}

function TagModal({ tag, onClose, onDone }: { tag: TagDTO | null; onClose: () => void; onDone: (msg: string) => void }) {
  const editing = tag !== null;
  const [name, setName] = useState("");
  const [description, setDescription] = useState(tag?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!editing && !name.trim()) return;
    setError(null);
    setBusy(true);
    try {
      if (tag?.id) {
        await api(`/api/tags/${tag.id}`, { method: "PATCH", body: JSON.stringify({ description }) });
        onDone("Descripción actualizada");
      } else {
        await api("/api/tags", { method: "POST", body: JSON.stringify({ name, description }) });
        onDone("Etiqueta creada");
      }
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form role="dialog" aria-modal="true" aria-labelledby="tag-title" onSubmit={submit} className="modal space-y-5 p-6">
        <div className="flex items-center justify-between">
          <h2 id="tag-title" className="text-lg font-semibold">
            {editing ? `Editar “${tag.name}”` : "Agregar etiqueta"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg p-1 text-zinc-400 hover:bg-raised hover:text-zinc-100">
            <IconClose />
          </button>
        </div>

        {!editing && (
          <label className="block space-y-2">
            <span className="text-sm font-medium">Nombre</span>
            <input
              className="input w-full"
              value={name}
              maxLength={MAX_TAG_LENGTH}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              placeholder="hall"
            />
            <span className="text-xs text-zinc-500">Hasta {MAX_TAG_LENGTH} caracteres. Se guarda en minúsculas.</span>
          </label>
        )}

        <label className="block space-y-2">
          <span className="text-sm font-medium">Descripción</span>
          <input
            className="input w-full"
            value={description}
            autoFocus={editing}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Para qué sirve esta etiqueta"
          />
        </label>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={busy || (!editing && !name.trim())}>
            {editing ? "Guardar" : "Agregar"}
          </button>
        </div>
      </form>
    </div>
  );
}
