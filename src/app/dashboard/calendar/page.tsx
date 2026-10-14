"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type DeviceDTO, type PresentationDTO, type ScheduleDTO } from "@/lib/client";

const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const HOURS = Array.from({ length: 18 }, (_, i) => 6 + i);
const ROW_PX = 48;
const DAY_START = 6 * 60;
const DAY_END = 24 * 60;
const COLORS = ["bg-indigo-600", "bg-emerald-600", "bg-amber-600", "bg-rose-600", "bg-sky-600", "bg-fuchsia-600"];

type Form = {
  id: string | null;
  name: string;
  presentationId: string;
  deviceId: string;
  days: boolean[];
  startTime: string;
  endTime: string;
  enabled: boolean;
};

const emptyForm: Form = {
  id: null,
  name: "",
  presentationId: "",
  deviceId: "",
  days: [false, true, true, true, true, true, false],
  startTime: "09:00",
  endTime: "10:00",
  enabled: true,
};

const hasDay = (mask: number, day: number) => (mask & (1 << day)) !== 0;
const hhmm = (t: string) => t.slice(0, 5);
const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const bitmask = (days: boolean[]) => days.reduce((m, on, i) => (on ? m | (1 << i) : m), 0);

function toForm(s: ScheduleDTO): Form {
  return {
    id: s.id,
    name: s.name,
    presentationId: s.presentationId,
    deviceId: s.deviceId ?? "",
    days: DAYS.map((_, i) => hasDay(s.daysOfWeek, i)),
    startTime: hhmm(s.startTime),
    endTime: hhmm(s.endTime),
    enabled: s.enabled,
  };
}

function place(s: ScheduleDTO) {
  const start = Math.max(toMin(s.startTime), DAY_START);
  const end = Math.min(toMin(s.endTime), DAY_END);
  if (end <= start) return null;
  return { top: ((start - DAY_START) / 60) * ROW_PX, height: ((end - start) / 60) * ROW_PX };
}

export default function CalendarPage() {
  const [list, setList] = useState<ScheduleDTO[]>([]);
  const [presentations, setPresentations] = useState<PresentationDTO[]>([]);
  const [devices, setDevices] = useState<DeviceDTO[]>([]);
  const [form, setForm] = useState<Form>(emptyForm);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => setList(await api<ScheduleDTO[]>("/api/schedules")), []);

  useEffect(() => {
    void load();
    void api<PresentationDTO[]>("/api/presentations").then(setPresentations);
    void api<DeviceDTO[]>("/api/devices").then(setDevices);
  }, [load]);

  const presName = (id: string) => presentations.find((p) => p.id === id)?.name ?? "—";
  const colorOf = (id: string) => COLORS[Math.max(0, presentations.findIndex((p) => p.id === id)) % COLORS.length];
  const screenName = (id: string | null) => (id ? devices.find((d) => d.id === id)?.name ?? "Pantalla" : "Todas las pantallas");

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const toggleDay = (i: number) => setForm((f) => ({ ...f, days: f.days.map((on, j) => (j === i ? !on : on)) }));

  const canSave =
    form.name.trim() !== "" &&
    form.presentationId !== "" &&
    form.days.some(Boolean) &&
    form.startTime < form.endTime;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const body = JSON.stringify({
      name: form.name,
      presentationId: form.presentationId,
      deviceId: form.deviceId || null,
      daysOfWeek: bitmask(form.days),
      startTime: form.startTime,
      endTime: form.endTime,
      enabled: form.enabled,
    });
    try {
      if (form.id) await api(`/api/schedules/${form.id}`, { method: "PATCH", body });
      else await api("/api/schedules", { method: "POST", body });
      setForm(emptyForm);
      setMsg("Guardado. Las pantallas se actualizaron.");
      await load();
    } catch (err) {
      setMsg((err as Error).message);
    }
  }

  async function remove() {
    if (!form.id || !confirm(`¿Borrar "${form.name}"?`)) return;
    try {
      await api(`/api/schedules/${form.id}`, { method: "DELETE" });
      setForm(emptyForm);
      setMsg("Bloque borrado.");
      await load();
    } catch (err) {
      setMsg((err as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Calendario</h1>
      <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
        <div className="card overflow-x-auto">
          <div className="min-w-[44rem]">
            <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b border-zinc-800 text-xs text-zinc-400">
              <div />
              {DAYS.map((d) => (
                <div key={d} className="p-2 text-center font-medium">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]">
              <div>
                {HOURS.map((h) => (
                  <div key={h} className="h-12 pr-2 text-right text-xs text-zinc-500">
                    {String(h).padStart(2, "0")}:00
                  </div>
                ))}
              </div>
              {DAYS.map((_, day) => (
                <div key={day} className="relative border-l border-zinc-800">
                  {HOURS.map((h) => (
                    <div key={h} className="h-12 border-t border-zinc-800/70" />
                  ))}
                  {list
                    .filter((s) => hasDay(s.daysOfWeek, day))
                    .map((s) => {
                      const pos = place(s);
                      if (!pos) return null;
                      return (
                        <button
                          key={`${s.id}-${day}`}
                          type="button"
                          onClick={() => {
                            setMsg(null);
                            setForm(toForm(s));
                          }}
                          title={`${s.name} · ${presName(s.presentationId)} · ${screenName(s.deviceId)}`}
                          className={`absolute inset-x-0.5 overflow-hidden rounded px-1.5 py-0.5 text-left text-xs text-white ${colorOf(s.presentationId)} ${s.enabled ? "" : "opacity-40"} ${form.id === s.id ? "ring-2 ring-white" : ""}`}
                          style={{ top: pos.top, height: pos.height }}
                        >
                          <div className="truncate font-medium">{s.name}</div>
                          <div className="truncate opacity-80">
                            {hhmm(s.startTime)}–{hhmm(s.endTime)}
                          </div>
                        </button>
                      );
                    })}
                </div>
              ))}
            </div>
          </div>
        </div>

        <form onSubmit={save} className="card h-fit space-y-4 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">{form.id ? "Editar bloque" : "Nuevo bloque"}</h2>
            {form.id && (
              <button type="button" className="btn px-2" onClick={() => setForm(emptyForm)}>
                Nuevo
              </button>
            )}
          </div>
          <label className="block space-y-1 text-sm">
            <span className="text-zinc-400">Nombre</span>
            <input className="input w-full" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-zinc-400">Presentación</span>
            <select className="input w-full" value={form.presentationId} onChange={(e) => set("presentationId", e.target.value)}>
              <option value="">Elegí una presentación</option>
              {presentations.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-zinc-400">Pantalla</span>
            <select className="input w-full" value={form.deviceId} onChange={(e) => set("deviceId", e.target.value)}>
              <option value="">Todas las pantallas</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="text-sm">
            <legend className="mb-1 text-zinc-400">Días</legend>
            <div className="grid grid-cols-2 gap-1">
              {DAYS.map((d, i) => (
                <label key={d} className="flex items-center gap-2">
                  <input type="checkbox" checked={form.days[i]} onChange={() => toggleDay(i)} />
                  {d}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <label className="block space-y-1">
              <span className="text-zinc-400">Inicio</span>
              <input type="time" className="input w-full" value={form.startTime} onChange={(e) => set("startTime", e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-zinc-400">Fin</span>
              <input type="time" className="input w-full" value={form.endTime} onChange={(e) => set("endTime", e.target.value)} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} />
            Activo
          </label>
          {msg && <p className="text-sm text-zinc-400">{msg}</p>}
          <div className="flex gap-2">
            <button className="btn-primary" disabled={!canSave}>
              Guardar
            </button>
            {form.id && (
              <button type="button" className="btn-danger" onClick={remove}>
                Borrar
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
