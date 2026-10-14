"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type DeviceDTO, type GroupDTO, type PresentationDTO, type ScheduleDTO } from "@/lib/client";

const DAYS_LONG = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const DAYS_SHORT = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
const DAYS_INITIAL = ["D", "L", "M", "M", "J", "V", "S"];
const MONTHS_LONG = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const MONTHS_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const VIEWS = [
  { id: "dia", label: "Día" },
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mes" },
] as const;
type View = (typeof VIEWS)[number]["id"];

const HOURS = Array.from({ length: 18 }, (_, i) => 6 + i);
const ROW_PX = 56;
const DAY_START = 6 * 60;
const DAY_END = 24 * 60;
const PALETTE = ["bg-rose-600", "bg-sky-600", "bg-emerald-600", "bg-amber-600", "bg-violet-600", "bg-teal-600"];

type Form = {
  id: string | null;
  name: string;
  presentationId: string;
  /** "" = todas las pantallas, "g:<id>" = grupo, "d:<id>" = pantalla. */
  target: string;
  days: boolean[];
  startTime: string;
  endTime: string;
  enabled: boolean;
};

const blankForm = (days: boolean[] = [false, true, true, true, true, true, false]): Form => ({
  id: null,
  name: "",
  presentationId: "",
  target: "",
  days,
  startTime: "09:00",
  endTime: "10:00",
  enabled: true,
});

const hasDay = (mask: number, day: number) => (mask & (1 << day)) !== 0;
const hhmm = (t: string) => t.slice(0, 5);
const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const fmtMin = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const bitmask = (days: boolean[]) => days.reduce((m, on, i) => (on ? m | (1 << i) : m), 0);

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const startOfWeek = (d: Date) => addDays(d, -d.getDay());
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const targetOf = (s: { deviceId: string | null; groupId: string | null }) =>
  s.groupId ? `g:${s.groupId}` : s.deviceId ? `d:${s.deviceId}` : "";

const targetIds = (target: string) =>
  target.startsWith("g:")
    ? { deviceId: null, groupId: target.slice(2) }
    : { deviceId: target.startsWith("d:") ? target.slice(2) : null, groupId: null };

function toForm(s: ScheduleDTO): Form {
  return {
    id: s.id,
    name: s.name,
    presentationId: s.presentationId,
    target: targetOf(s),
    days: DAYS_LONG.map((_, i) => hasDay(s.daysOfWeek, i)),
    startTime: hhmm(s.startTime),
    endTime: hhmm(s.endTime),
    enabled: s.enabled,
  };
}

/** Reparte en carriles los bloques que se pisan en el tiempo para que se vean lado a lado. */
function layoutLanes(list: ScheduleDTO[]) {
  const sorted = [...list].sort((a, b) => toMin(a.startTime) - toMin(b.startTime) || toMin(b.endTime) - toMin(a.endTime));
  const result = new Map<string, { lane: number; lanes: number }>();
  let cluster: { s: ScheduleDTO; lane: number }[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = cluster.reduce((m, c) => Math.max(m, c.lane + 1), 1);
    for (const c of cluster) result.set(c.s.id, { lane: c.lane, lanes });
    cluster = [];
  };
  const laneEnds: number[] = [];
  for (const s of sorted) {
    const start = toMin(s.startTime);
    if (start >= clusterEnd) {
      flush();
      laneEnds.length = 0;
      clusterEnd = -1;
    }
    let lane = laneEnds.findIndex((end) => end <= start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = toMin(s.endTime);
    clusterEnd = Math.max(clusterEnd, toMin(s.endTime));
    cluster.push({ s, lane });
  }
  flush();
  return result;
}

function place(s: ScheduleDTO) {
  const start = Math.max(toMin(s.startTime), DAY_START);
  const end = Math.min(toMin(s.endTime), DAY_END);
  if (end <= start) return null;
  return { top: ((start - DAY_START) / 60) * ROW_PX, height: ((end - start) / 60) * ROW_PX };
}

// Iconos locales de esta página (no están en Icons.tsx).
const svgBase = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const IconChevronLeft = () => (
  <svg {...svgBase}>
    <path d="m15 18-6-6 6-6" />
  </svg>
);
const IconChevronRight = () => (
  <svg {...svgBase}>
    <path d="m9 18 6-6-6-6" />
  </svg>
);

export default function CalendarPage() {
  const [list, setList] = useState<ScheduleDTO[]>([]);
  const [presentations, setPresentations] = useState<PresentationDTO[]>([]);
  const [devices, setDevices] = useState<DeviceDTO[]>([]);
  const [groups, setGroups] = useState<GroupDTO[]>([]);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [form, setForm] = useState<Form>(() => blankForm());
  const [msg, setMsg] = useState<string | null>(null);
  const [msgError, setMsgError] = useState(false);
  const [view, setView] = useState<View>("semana");
  // Se fijan al montar para no producir diferencias entre servidor y cliente.
  const [now, setNow] = useState<Date | null>(null);
  const [cursor, setCursor] = useState<Date | null>(null);

  const load = useCallback(async () => setList(await api<ScheduleDTO[]>("/api/schedules")), []);
  const loadGroups = useCallback(async () => setGroups(await api<GroupDTO[]>("/api/groups")), []);

  useEffect(() => {
    const t = new Date();
    setNow(t);
    setCursor(startOfDay(t));
    const id = setInterval(() => setNow(new Date()), 60_000);
    void load();
    void loadGroups();
    void api<PresentationDTO[]>("/api/presentations").then(setPresentations);
    void api<DeviceDTO[]>("/api/devices").then(setDevices);
    return () => clearInterval(id);
  }, [load, loadGroups]);

  const presName = (id: string) => presentations.find((p) => p.id === id)?.name ?? "—";
  const colorOf = (id: string) => PALETTE[Math.max(0, presentations.findIndex((p) => p.id === id)) % PALETTE.length];
  const targetLabel = (s: ScheduleDTO) => {
    if (s.groupId) return `Grupo: ${groups.find((g) => g.id === s.groupId)?.name ?? "—"}`;
    if (s.deviceId) return devices.find((d) => d.id === s.deviceId)?.name ?? "Pantalla";
    return "Todas las pantallas";
  };

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
      ...targetIds(form.target),
      daysOfWeek: bitmask(form.days),
      startTime: form.startTime,
      endTime: form.endTime,
      enabled: form.enabled,
    });
    try {
      if (form.id) await api(`/api/schedules/${form.id}`, { method: "PATCH", body });
      else await api("/api/schedules", { method: "POST", body });
      setForm(blankForm());
      setMsgError(false);
      setMsg("Guardado. Las pantallas se actualizaron.");
      await load();
    } catch (err) {
      setMsgError(true);
      setMsg((err as Error).message);
    }
  }

  async function remove() {
    if (!form.id || !confirm(`¿Borrar "${form.name}"?`)) return;
    try {
      await api(`/api/schedules/${form.id}`, { method: "DELETE" });
      setForm(blankForm());
      setMsgError(false);
      setMsg("Bloque borrado.");
      await load();
    } catch (err) {
      setMsgError(true);
      setMsg((err as Error).message);
    }
  }

  function editSchedule(s: ScheduleDTO) {
    setMsg(null);
    setForm(toForm(s));
  }

  // Clic en una celda vacía: nuevo bloque con ese día y hora (de media en media hora).
  function pickSlot(day: Date, startMin: number) {
    setMsg(null);
    const start = Math.min(Math.max(startMin, DAY_START), DAY_END - 60);
    setForm({
      ...blankForm(DAYS_LONG.map((_, i) => i === day.getDay())),
      startTime: fmtMin(start),
      endTime: fmtMin(Math.min(start + 60, 23 * 60 + 59)),
    });
  }

  function onColumnClick(day: Date, e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const raw = DAY_START + ((e.clientY - rect.top) / ROW_PX) * 60;
    pickSlot(day, Math.floor(raw / 30) * 30);
  }

  function shift(dir: -1 | 1) {
    setCursor((c) => {
      if (!c) return c;
      if (view === "mes") return new Date(c.getFullYear(), c.getMonth() + dir, 1);
      return addDays(c, dir * (view === "semana" ? 7 : 1));
    });
  }

  if (!cursor || !now) {
    return <div className="p-6 text-sm text-zinc-400">Cargando calendario…</div>;
  }

  const isToday = (d: Date) => sameDay(d, now);
  const onDate = (d: Date) => list.filter((s) => hasDay(s.daysOfWeek, d.getDay()));
  const columns = view === "dia" ? [cursor] : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i));

  const weekStart = startOfWeek(cursor);
  const weekEnd = addDays(weekStart, 6);
  const rangeLabel =
    view === "dia"
      ? `${DAYS_LONG[cursor.getDay()]} ${cursor.getDate()} de ${MONTHS_LONG[cursor.getMonth()]} ${cursor.getFullYear()}`
      : view === "semana"
        ? `${weekStart.getDate()} ${MONTHS_SHORT[weekStart.getMonth()]} – ${weekEnd.getDate()} ${MONTHS_SHORT[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`
        : `${MONTHS_LONG[cursor.getMonth()]} ${cursor.getFullYear()}`;

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowTop = nowMin >= DAY_START && nowMin < DAY_END ? ((nowMin - DAY_START) / 60) * ROW_PX : null;

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthCells = Array.from({ length: 42 }, (_, i) => addDays(startOfWeek(monthStart), i));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Calendario</h1>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="card min-w-0 overflow-hidden">
          <header className="flex flex-wrap items-center gap-3 border-b border-line p-3">
            <button className="btn" onClick={() => setCursor(startOfDay(now))}>
              Hoy
            </button>
            <div className="flex items-center gap-1">
              <button className="btn px-2" onClick={() => shift(-1)} aria-label="Anterior">
                <IconChevronLeft />
              </button>
              <button className="btn px-2" onClick={() => shift(1)} aria-label="Siguiente">
                <IconChevronRight />
              </button>
            </div>
            <span className="text-sm font-medium">{rangeLabel}</span>
            <button className="btn" onClick={() => setGroupsOpen(true)}>
              Grupos
            </button>
            <div className="ml-auto inline-flex rounded-lg border border-line bg-canvas p-0.5">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setView(v.id)}
                  className={`rounded-md px-3 py-1.5 text-sm transition ${view === v.id ? "bg-accent text-white" : "text-zinc-400 hover:text-zinc-100"}`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </header>

          {view === "mes" ? (
            <div className="overflow-x-auto">
              <div className="min-w-[44rem]">
                <div className="grid grid-cols-7 border-b border-line text-xs text-zinc-400">
                  {DAYS_SHORT.map((d) => (
                    <div key={d} className="px-2 py-2 text-center font-semibold tracking-wide">
                      {d}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {monthCells.map((d) => {
                    const inMonth = d.getMonth() === cursor.getMonth();
                    const items = onDate(d);
                    return (
                      <button
                        type="button"
                        key={d.toISOString()}
                        onClick={() => {
                          setCursor(d);
                          setView("dia");
                        }}
                        className={`flex min-h-28 flex-col gap-1 border-b border-r border-line/70 p-1.5 text-left hover:bg-white/[0.03] ${inMonth ? "" : "opacity-40"}`}
                      >
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                            isToday(d) ? "bg-accent text-white" : "text-zinc-300"
                          }`}
                        >
                          {d.getDate()}
                        </span>
                        {items.slice(0, 3).map((s) => (
                          <span
                            key={s.id}
                            className={`truncate rounded px-1.5 py-0.5 text-[11px] text-white ${colorOf(s.presentationId)} ${s.enabled ? "" : "opacity-40"}`}
                          >
                            {hhmm(s.startTime)} {s.name}
                          </span>
                        ))}
                        {items.length > 3 && <span className="text-[11px] text-zinc-400">+{items.length - 3} más</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="max-h-[70vh] overflow-auto">
              <div className="min-w-[40rem]">
                {/* Encabezado de días */}
                <div className={`sticky top-0 z-20 grid border-b border-line bg-panel ${view === "dia" ? "grid-cols-[3.5rem_minmax(0,1fr)]" : "grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]"}`}>
                  <div />
                  {columns.map((d) => {
                    const t = isToday(d);
                    return (
                      <div key={d.toISOString()} className={`flex flex-col items-center py-2 ${t ? "text-accent" : "text-zinc-400"}`}>
                        <span className="text-[11px] font-semibold tracking-wide">{DAYS_SHORT[d.getDay()]}</span>
                        <span
                          className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-lg font-semibold ${
                            t ? "bg-accent text-white" : "text-zinc-100"
                          }`}
                        >
                          {d.getDate()}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Grilla horaria */}
                <div className={`grid ${view === "dia" ? "grid-cols-[3.5rem_minmax(0,1fr)]" : "grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]"}`}>
                  <div>
                    {HOURS.map((h) => (
                      <div key={h} className="h-14 pr-2 text-right text-xs text-zinc-500">
                        {String(h).padStart(2, "0")}:00
                      </div>
                    ))}
                  </div>
                  {columns.map((d) => {
                    const t = isToday(d);
                    return (
                      <div
                        key={d.toISOString()}
                        className={`relative cursor-cell border-l border-line/70 ${t ? "bg-accent/5" : ""}`}
                        onClick={(e) => onColumnClick(d, e)}
                      >
                        {HOURS.map((h) => (
                          <div key={h} className="h-14 border-t border-line/70" />
                        ))}
                        {t && nowTop !== null && (
                          <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: nowTop }}>
                            <span className="-ml-1 h-2 w-2 rounded-full bg-accent" />
                            <span className="h-px flex-1 bg-accent" />
                          </div>
                        )}
                        {(() => {
                          const dayList = onDate(d);
                          const lanes = layoutLanes(dayList);
                          return dayList.map((s) => {
                          const pos = place(s);
                          if (!pos) return null;
                          const ln = lanes.get(s.id) ?? { lane: 0, lanes: 1 };
                          return (
                            <button
                              key={`${s.id}-${d.getDay()}`}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                editSchedule(s);
                              }}
                              title={`${s.name} · ${presName(s.presentationId)} · ${targetLabel(s)}`}
                              className={`absolute z-[5] overflow-hidden rounded-md px-2 py-1 text-left text-xs leading-tight text-white shadow ${colorOf(s.presentationId)} ${
                                s.enabled ? "" : "opacity-40"
                              } ${form.id === s.id ? "ring-2 ring-white" : ""}`}
                              style={{ top: pos.top, height: pos.height, left: `calc(${(ln.lane / ln.lanes) * 100}% + 2px)`, width: `calc(${100 / ln.lanes}% - 4px)` }}
                            >
                              <div className="truncate font-semibold">{s.name}</div>
                              <div className="truncate opacity-80">
                                {hhmm(s.startTime)} – {hhmm(s.endTime)}
                                {(s.deviceId || s.groupId) && ` · ${targetLabel(s)}`}
                              </div>
                            </button>
                          );
                          });
                        })()}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Panel derecho: crear / editar bloque */}
        <form onSubmit={save} className="card h-fit space-y-5 p-5 xl:sticky xl:top-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{form.id ? "Editar bloque" : "Nuevo bloque"}</h2>
            {form.id && (
              <button
                type="button"
                className="text-sm text-zinc-400 hover:text-zinc-100"
                onClick={() => {
                  setMsg(null);
                  setForm(blankForm());
                }}
              >
                Nuevo
              </button>
            )}
          </div>

          <label className="block space-y-1.5 text-sm">
            <span className="text-zinc-400">Nombre del evento</span>
            <input className="input w-full" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </label>

          <div className="space-y-1.5 text-sm">
            <span className="text-zinc-400">Horario</span>
            <div className="flex items-center gap-2">
              <input type="time" className="input min-w-0 flex-1" value={form.startTime} onChange={(e) => set("startTime", e.target.value)} aria-label="Hora de inicio" />
              <span className="text-zinc-500">–</span>
              <input type="time" className="input min-w-0 flex-1" value={form.endTime} onChange={(e) => set("endTime", e.target.value)} aria-label="Hora de fin" />
            </div>
          </div>

          <fieldset className="space-y-1.5 text-sm">
            <legend className="mb-1.5 text-zinc-400">Se repite</legend>
            <div className="flex gap-1.5">
              {DAYS_INITIAL.map((letter, i) => {
                const on = form.days[i];
                return (
                  <button
                    type="button"
                    key={i}
                    aria-pressed={on}
                    aria-label={DAYS_LONG[i]}
                    title={DAYS_LONG[i]}
                    onClick={() => toggleDay(i)}
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition ${
                      on ? "bg-accent text-white" : "bg-raised text-zinc-400 hover:text-zinc-100"
                    }`}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <label className="block space-y-1.5 text-sm">
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

          <label className="block space-y-1.5 text-sm">
            <span className="text-zinc-400">Pantalla</span>
            <select className="input w-full" value={form.target} onChange={(e) => set("target", e.target.value)}>
              <option value="">Todas las pantallas</option>
              <optgroup label="Grupos">
                {groups.map((g) => (
                  <option key={g.id} value={`g:${g.id}`}>
                    {g.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Pantallas">
                {devices.map((d) => (
                  <option key={d.id} value={`d:${d.id}`}>
                    {d.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} />
            Activo
          </label>

          {msg && (
            <p role={msgError ? "alert" : "status"} className={`text-sm ${msgError ? "text-red-400" : "text-zinc-400"}`}>
              {msg}
            </p>
          )}

          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={!canSave}>
              Guardar
            </button>
            {form.id && (
              <button type="button" className="btn-danger" onClick={remove}>
                Eliminar
              </button>
            )}
          </div>
        </form>
      </div>

      {groupsOpen && (
        <GroupsDialog
          groups={groups}
          onChanged={async () => {
            await loadGroups();
            await load();
          }}
          onClose={() => setGroupsOpen(false)}
        />
      )}
    </div>
  );
}

function GroupsDialog({ groups, onChanged, onClose }: { groups: GroupDTO[]; onChanged: () => Promise<void>; onClose: () => void }) {
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  async function run(action: () => Promise<string>) {
    setMsg(null);
    try {
      const text = await action();
      setMsg({ text, error: false });
      await onChanged();
    } catch (err) {
      setMsg({ text: (err as Error).message, error: true });
    }
  }

  function create(e: React.FormEvent) {
    e.preventDefault();
    void run(async () => {
      await api("/api/groups", { method: "POST", body: JSON.stringify({ name: newName }) });
      setNewName("");
      return "Grupo creado.";
    });
  }

  function rename(id: string) {
    void run(async () => {
      await api(`/api/groups/${id}`, { method: "PATCH", body: JSON.stringify({ name: editName }) });
      setEditId(null);
      return "Grupo renombrado.";
    });
  }

  function remove(g: GroupDTO) {
    if (!confirm(`¿Borrar el grupo "${g.name}"? También se borrarán sus bloques de programación. Sus pantallas quedan sin grupo.`)) return;
    void run(async () => {
      const res = await api<{ schedulesDeleted: number }>(`/api/groups/${g.id}`, { method: "DELETE" });
      return `Grupo borrado. Se borraron ${res.schedulesDeleted} bloque(s).`;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Grupos de pantallas"
        className="card w-full max-w-md space-y-4 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Grupos de pantallas</h2>
          <button type="button" className="text-sm text-zinc-400 hover:text-zinc-100" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <form onSubmit={create} className="flex gap-2">
          <input
            className="input min-w-0 flex-1"
            placeholder="Nombre del grupo"
            aria-label="Nombre del nuevo grupo"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button className="btn-primary" disabled={!newName.trim()}>
            Crear
          </button>
        </form>

        {groups.length === 0 ? (
          <p className="text-sm text-zinc-500">Todavía no hay grupos.</p>
        ) : (
          <ul className="text-sm">
            {groups.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-2 border-b border-line py-2 last:border-0">
                {editId === g.id ? (
                  <>
                    <input
                      className="input min-w-0 flex-1"
                      aria-label="Nuevo nombre"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                    <button type="button" className="btn-primary" disabled={!editName.trim()} onClick={() => rename(g.id)}>
                      Guardar
                    </button>
                    <button type="button" className="btn" onClick={() => setEditId(null)}>
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{g.name}</div>
                      <div className="text-xs text-zinc-500">
                        {g.deviceCount} {g.deviceCount === 1 ? "pantalla" : "pantallas"}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setMsg(null);
                        setEditId(g.id);
                        setEditName(g.name);
                      }}
                    >
                      Renombrar
                    </button>
                    <button type="button" className="btn-danger" onClick={() => remove(g)}>
                      Borrar
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {msg && (
          <p role={msg.error ? "alert" : "status"} className={`text-sm ${msg.error ? "text-red-400" : "text-zinc-400"}`}>
            {msg.text}
          </p>
        )}
      </div>
    </div>
  );
}
