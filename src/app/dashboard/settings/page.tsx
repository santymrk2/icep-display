"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { api, type MediaDTO, type SettingsDTO, type TagDTO } from "@/lib/client";
import { toast } from "sonner";
import { IconClose, IconPlus, IconSearch } from "@/components/Icons";
import { useDialogs } from "@/components/Dialogs";

type Tab = "general" | "tags" | "providers";
type SettingsPatch = { timezone?: string; defaultBackgroundId?: string | null; sharePreviewLinks?: boolean };
type RunFn = (fn: () => Promise<unknown>, ok?: string) => Promise<void>;

const MAX_TAG_LENGTH = 24;
/** Ancho del selector de zona horaria y de la zona de carga (referencia de diseño). */
const FIELD_WIDTH = "max-w-[515px]";

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

  const load = useCallback(async () => setSettings(await api<SettingsDTO>("/api/settings")), []);

  useEffect(() => {
    void load().catch((e) => toast.error((e as Error).message));
  }, [load]);

  const run: RunFn = useCallback(async (fn, ok) => {
    try {
      await fn();
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, []);

  const saveSettings = (patch: SettingsPatch, ok: string) =>
    run(async () => {
      setSettings(await api<SettingsDTO>("/api/settings", { method: "PATCH", body: JSON.stringify(patch) }));
    }, ok);

  return (
    <div className="page max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold">Ajustes</h1>

      <div role="tablist" aria-label="Secciones de ajustes" className="flex gap-8 border-b border-line">
        {(
          [
            ["general", "General"],
            ["tags", "Etiquetas"],
            ["providers", "Proveedores de contenido"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`-mb-px border-b-2 pb-3 text-sm font-medium transition-colors ${
              tab === value ? "border-accent text-accent" : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>


      {tab === "general" &&
        (settings ? (
          <GeneralTab settings={settings} onSave={saveSettings} run={run} onSettings={setSettings} />
        ) : (
          <p className="text-sm text-zinc-500">Cargando…</p>
        ))}

      {tab === "tags" && <TagsTab run={run} />}

      {tab === "providers" && <ProvidersTab />}
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
    const id = toast.loading("Subiendo fondo…");
    await run(async () => {
      const asset = await api<MediaDTO>("/api/media/upload", {
        method: "PUT",
        body: file,
        headers: { "content-type": file.type, "x-file-name": encodeURIComponent(file.name) },
      });
      onSettings(await api<SettingsDTO>("/api/settings", { method: "PATCH", body: JSON.stringify({ defaultBackgroundId: asset.id }) }));
    }, "Fondo actualizado");
    toast.dismiss(id);
    setUploading(false);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void uploadBackground(file);
  }

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Zona horaria</h2>
          <p className="text-sm text-zinc-400">La zona horaria se aplica a todos los calendarios.</p>
        </div>
        <select
          className={`input w-full ${FIELD_WIDTH}`}
          value={settings.timezone}
          onChange={(e) => void onSave({ timezone: e.target.value }, "Zona horaria actualizada")}
        >
          {timezones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Fondo predeterminado</h2>
          <p className="text-sm text-zinc-400">
            Por defecto, los huecos sin contenido programado muestran fondo negro, salvo que subas una imagen acá.
          </p>
        </div>

        {settings.backgroundUrl && (
          <div className={`flex w-full items-center gap-4 rounded-xl border border-line bg-panel p-3 ${FIELD_WIDTH}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={settings.backgroundUrl} alt="Fondo predeterminado actual" className="aspect-video w-32 rounded-lg object-cover" />
            <span className="flex-1 text-sm text-zinc-400">Fondo actual</span>
            <button
              type="button"
              className="btn"
              onClick={() => void onSave({ defaultBackgroundId: null }, "Fondo quitado")}
            >
              Quitar
            </button>
          </div>
        )}

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${FIELD_WIDTH} ${
            dragging ? "border-accent bg-accent/10" : "border-line"
          }`}
        >
          <IconDownload className="h-6 w-6 text-zinc-400" />
          <p className="text-sm text-zinc-200">
            Arrastrá una imagen acá o{" "}
            <button
              type="button"
              className="text-accent underline-offset-4 hover:underline"
              onClick={() => setPicking(true)}
            >
              Elegir de Medios
            </button>
          </p>
          <p className="text-xs text-zinc-500">PNG, JPG, etc. · 1920 x 1080 recomendado</p>
          <button
            type="button"
            className="mt-1 text-xs text-zinc-400 underline-offset-4 hover:text-accent hover:underline disabled:opacity-50"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? "Subiendo…" : "o subila desde tu equipo"}
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
      </section>

      <section className={`space-y-4 border-t border-line pt-8 ${FIELD_WIDTH}`}>
        <Toggle
          label="Compartir enlaces de vista previa"
          description="Permite compartir enlaces de solo vista previa."
          on={settings.sharePreviewLinks}
          onChange={() =>
            void onSave(
              { sharePreviewLinks: !settings.sharePreviewLinks },
              settings.sharePreviewLinks ? "Enlaces de vista previa desactivados" : "Enlaces de vista previa activados",
            )
          }
        />
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

/** Interruptor con etiqueta "ON"/"OFF" a la derecha. */
function Toggle({
  label,
  description,
  on,
  onChange,
}: {
  label: string;
  description: string;
  on: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-6">
      <div className="space-y-0.5">
        <h3 className="text-sm font-medium text-zinc-100">{label}</h3>
        <p className="text-xs text-zinc-400">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={label}
          onClick={onChange}
          className={`relative h-6 w-11 rounded-full transition-colors ${on ? "bg-accent" : "bg-line"}`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`}
          />
        </button>
        <span className="w-8 text-xs font-semibold tracking-wide text-zinc-300">{on ? "ON" : "OFF"}</span>
      </div>
    </div>
  );
}

function ProvidersTab() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line py-16 text-center">
      <p className="text-sm font-medium text-zinc-200">Próximamente</p>
      <p className="text-xs text-zinc-500">Pronto vas a poder conectar proveedores de contenido desde acá.</p>
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
  const dialogs = useDialogs();

  const load = useCallback(async () => {
    setTags(await api<TagDTO[]>("/api/tags"));
    setLoaded(true);
  }, []);

  useEffect(() => {
    void run(load).catch(() => {});
  }, [load, run]);

  const q = filter.trim().toLowerCase();
  const visible = tags.filter((t) => !q || t.name.includes(q));

  async function remove(t: TagDTO) {
    const n = t.devices.length;
    const extra = n > 0 ? ` Se quitará de ${n} ${n === 1 ? "pantalla" : "pantallas"}.` : "";
    const ok = await dialogs.confirm({ title: "Borrar etiqueta", message: `¿Borrar la etiqueta "${t.name}"?${extra}`, danger: true, confirmLabel: "Borrar" });
    if (!ok) return;
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
                      <button className="btn-danger" onClick={() => void remove(t)}>
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

function IconDownload({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}
