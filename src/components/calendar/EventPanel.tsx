"use client";

import type { CalendarDTO, DeviceDTO, GroupDTO, PresentationDTO } from "@/lib/client";
import { DAYS_INITIAL, DAYS_LONG, IconX, longDate, parseYmd } from "./helpers";

export type EventForm = {
  id: string | null;
  name: string;
  calendarId: string;
  date: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  repeats: boolean;
  freq: "day" | "week" | "month" | "year";
  interval: number;
  days: boolean[];
  endsMode: "never" | "on" | "after";
  validUntil: string;
  endsAfter: number;
  presentationId: string;
  mode: "all" | "group" | "devices";
  groupId: string;
  deviceIds: string[];
  enabled: boolean;
  /** Evento generado desde una reunión de Notion: solo lectura. */
  fromNotion: boolean;
};

const FREQS = [
  ["day", "Día"],
  ["week", "Semana"],
  ["month", "Mes"],
  ["year", "Año"],
] as const;

const box = "h-4 w-4 accent-[#2492ff]";
const field = "rounded-lg border border-line bg-raised px-3 py-2 text-sm outline-none focus:border-accent";

export function EventPanel({
  form,
  setForm,
  calendars,
  presentations,
  devices,
  groups,
  saving,
  onSave,
  onDelete,
  onPickContent,
  onClose,
}: {
  form: EventForm;
  setForm: (f: EventForm) => void;
  calendars: CalendarDTO[];
  presentations: PresentationDTO[];
  devices: DeviceDTO[];
  groups: GroupDTO[];
  saving: boolean;
  onSave: () => void;
  onDelete: () => void;
  onPickContent: () => void;
  onClose: () => void;
}) {
  const set = <K extends keyof EventForm>(k: K, v: EventForm[K]) => setForm({ ...form, [k]: v });
  const pres = presentations.find((p) => p.id === form.presentationId);
  const timesOk = form.allDay || form.startTime < form.endTime;
  const canSave =
    form.name.trim() !== "" &&
    form.presentationId !== "" &&
    form.date !== "" &&
    timesOk &&
    (!form.repeats || form.interval >= 1) &&
    (!form.repeats || form.freq !== "week" || form.days.some(Boolean)) &&
    (!form.repeats || form.endsMode !== "on" || (form.validUntil !== "" && form.validUntil >= form.date)) &&
    (!form.repeats || form.endsMode !== "after" || form.endsAfter >= 1) &&
    (form.mode !== "group" || form.groupId !== "") &&
    (form.mode !== "devices" || form.deviceIds.length > 0);

  const dateBtn = (value: string, onChange: (v: string) => void, label: string) => (
    <label className={`${field} relative flex min-w-0 flex-1 cursor-pointer items-center justify-center text-center`}>
      <span>{value ? longDate(value) : "—"}</span>
      <input
        type="date"
        aria-label={label}
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </label>
  );

  const endsRow = (mode: EventForm["endsMode"], label: string, extra?: React.ReactNode) => (
    <div className="flex items-center gap-3">
      <label className="flex w-20 items-center gap-2 text-sm">
        <input type="checkbox" className={box} checked={form.endsMode === mode} onChange={() => set("endsMode", mode)} />
        {label}
      </label>
      {extra}
    </div>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave && !saving) onSave();
      }}
      className="flex h-full flex-col"
    >
      <div className="flex items-center justify-between px-5 pt-4">
        <h2 className="font-semibold">{form.fromNotion ? "Reunión de Notion" : form.id ? "Editar evento" : "Nuevo evento"}</h2>
        <button type="button" onClick={onClose} aria-label="Cerrar" className="text-zinc-400 hover:text-zinc-100">
          <IconX />
        </button>
      </div>
      <fieldset disabled={form.fromNotion} className="min-h-0 flex-1 space-y-5 overflow-auto p-5">
        {form.fromNotion && (
          <p className="rounded-lg border border-accent/40 bg-accent/10 p-3 text-xs leading-relaxed text-zinc-300">
            Este evento sale de Notion y se actualiza solo. El día y la hora se cambian en Notion; cuánto antes empieza, cuánto después termina y la presentación, en{" "}
            <a href="/dashboard/settings?tab=meetings" className="text-accent underline">
              Ajustes &gt; Reuniones
            </a>
            .
          </p>
        )}
        <label className="block space-y-2 text-sm">
          <span className="font-semibold">Nombre del evento</span>
          <input
            className="input w-full border-accent/60 py-3"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Anuncios de la mañana"
          />
        </label>

        <div className="space-y-2 text-sm">
          <span className="font-semibold">Horario</span>
          <div className="flex flex-col gap-2">
            <div className="flex">
              {dateBtn(form.date, (v) => {
                const wd = parseYmd(v).getDay();
                setForm({ ...form, date: v, days: form.repeats ? form.days : DAYS_LONG.map((_, i) => i === wd) });
              }, "Fecha")}
            </div>
            {!form.allDay && (
              <div className="flex items-center gap-2">
                <input type="time" aria-label="Hora de inicio" className={`${field} min-w-0 flex-1 px-2`} value={form.startTime} onChange={(e) => set("startTime", e.target.value)} />
                <span className="text-zinc-500">-</span>
                <input type="time" aria-label="Hora de fin" className={`${field} min-w-0 flex-1 px-2`} value={form.endTime} onChange={(e) => set("endTime", e.target.value)} />
              </div>
            )}
          </div>
          {!timesOk && <p className="text-xs text-red-400">La hora de fin debe ser posterior a la de inicio.</p>}
        </div>

        <div className="space-y-3 text-sm">
          <label className="flex items-center gap-3">
            <input type="checkbox" className={box} checked={form.allDay} onChange={(e) => set("allDay", e.target.checked)} />
            Todo el día
          </label>
          <label className="flex items-center gap-3">
            <input type="checkbox" className={box} checked={form.repeats} onChange={(e) => set("repeats", e.target.checked)} />
            Se repite
          </label>
        </div>

        {form.repeats && (
          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span>Se repite cada</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  aria-label="Intervalo"
                  className={`${field} w-16 text-center`}
                  value={form.interval}
                  onChange={(e) => set("interval", Math.max(1, Math.floor(Number(e.target.value)) || 1))}
                />
                <select className={`${field} w-28`} aria-label="Frecuencia" value={form.freq} onChange={(e) => set("freq", e.target.value as EventForm["freq"])}>
                  {FREQS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {form.freq === "week" && (
              <div className="flex items-center justify-between gap-3">
                <span>Se repite el</span>
                <div className="flex gap-1">
                  {DAYS_INITIAL.map((letter, i) => (
                    <button
                      type="button"
                      key={i}
                      aria-pressed={form.days[i]}
                      aria-label={DAYS_LONG[i]}
                      title={DAYS_LONG[i]}
                      onClick={() => set("days", form.days.map((on, j) => (j === i ? !on : on)))}
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                        form.days[i] ? "bg-accent text-white" : "bg-raised text-zinc-400 hover:text-zinc-100"
                      }`}
                    >
                      {letter}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <span className="block">Termina</span>
              {endsRow("never", "Nunca")}
              {endsRow(
                "on",
                "El",
                <label className={`${field} relative flex flex-1 cursor-pointer items-center justify-center ${form.endsMode === "on" ? "" : "opacity-60"}`}>
                  <span>{form.validUntil ? longDate(form.validUntil) : "Elegir fecha"}</span>
                  <input
                    type="date"
                    aria-label="Fecha de fin"
                    min={form.date}
                    value={form.validUntil}
                    onChange={(e) => setForm({ ...form, validUntil: e.target.value, endsMode: "on" })}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                </label>,
              )}
              {endsRow(
                "after",
                "Después de",
                <div className="flex flex-1 items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    aria-label="Repeticiones"
                    className={`${field} w-16 text-center text-accent`}
                    value={form.endsAfter}
                    onChange={(e) => setForm({ ...form, endsAfter: Math.max(1, Math.floor(Number(e.target.value)) || 1), endsMode: "after" })}
                  />
                  <span>repeticiones</span>
                </div>,
              )}
            </div>
          </div>
        )}

        <div className="space-y-2 text-sm">
          <span className="font-semibold">
            Contenido a mostrar<span className="text-red-400">*</span>
          </span>
          <button type="button" onClick={onPickContent} className={`${field} flex w-full items-center justify-between text-left hover:border-accent`}>
            <span className={pres ? "truncate" : "text-zinc-500"}>{pres ? pres.name : "Elegir una presentación"}</span>
            <span className="text-accent">{pres ? "Cambiar" : "Elegir"}</span>
          </button>
        </div>

        <div className="space-y-2 text-sm">
          <span className="font-semibold">Pantallas</span>
          <div className="inline-flex w-full rounded-lg border border-line bg-canvas p-0.5">
            {([["all", "Todas"], ["group", "Grupo"], ["devices", "Elegir"]] as const).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => set("mode", m)}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm transition ${form.mode === m ? "bg-accent text-white" : "text-zinc-400 hover:text-zinc-100"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {form.mode === "group" && (
            <select className="input w-full" value={form.groupId} onChange={(e) => set("groupId", e.target.value)}>
              <option value="">Elegí un grupo</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
          {form.mode === "devices" && (
            <div className="space-y-1 rounded-lg border border-line bg-canvas p-2">
              {devices.length === 0 && <p className="text-zinc-500">Todavía no hay pantallas vinculadas.</p>}
              {devices.length > 1 && (
                <button
                  type="button"
                  className="text-xs text-accent hover:underline"
                  onClick={() => set("deviceIds", form.deviceIds.length === devices.length ? [] : devices.map((d) => d.id))}
                >
                  {form.deviceIds.length === devices.length ? "Quitar todas" : "Seleccionar todas"}
                </button>
              )}
              {devices.map((d) => (
                <label key={d.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className={box}
                    checked={form.deviceIds.includes(d.id)}
                    onChange={(e) => set("deviceIds", e.target.checked ? [...form.deviceIds, d.id] : form.deviceIds.filter((x) => x !== d.id))}
                  />
                  {d.name}
                </label>
              ))}
            </div>
          )}
        </div>

        <label className="block space-y-2 text-sm">
          <span className="font-semibold">Calendario</span>
          <select className="input w-full" value={form.calendarId} onChange={(e) => set("calendarId", e.target.value)}>
            {calendars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" className={box} checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} />
          Activo
        </label>

      </fieldset>
      {!form.fromNotion && <div className="flex gap-2 border-t border-line p-4">
        <button className="btn-primary flex-1" disabled={!canSave || saving}>
          Guardar
        </button>
        {form.id && (
          <button type="button" className="btn-danger" onClick={onDelete}>
            Eliminar
          </button>
        )}
      </div>}
    </form>
  );
}
