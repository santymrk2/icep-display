"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type CalendarDTO, type DeviceDTO, type GroupDTO, type PresentationDTO, type PresentationFolderDTO, type ScheduleDTO, type SettingsDTO } from "@/lib/client";
import { occursOn } from "@/lib/recurrence";
import { CalendarList } from "@/components/calendar/CalendarList";
import { EventPanel, type EventForm } from "@/components/calendar/EventPanel";
import { GroupsDialog } from "@/components/calendar/GroupsDialog";
import { PresentationPicker } from "@/components/calendar/PresentationPicker";
import {
  DAYS_LONG,
  DAYS_SHORT,
  IconChevronLeft,
  IconChevronRight,
  MONTHS_LONG,
  MONTHS_SHORT,
  addDays,
  fmtMin,
  hhmm,
  layoutLanes,
  parseYmd,
  sameDay,
  startOfDay,
  startOfWeek,
  toMin,
  ymd,
} from "@/components/calendar/helpers";

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
const DEFAULT_COLOR = "#2492ff";

const bitmask = (days: boolean[]) => days.reduce((m, on, i) => (on ? m | (1 << i) : m), 0);
const hasDay = (mask: number, day: number) => (mask & (1 << day)) !== 0;
const onlyDay = (wd: number) => DAYS_LONG.map((_, i) => i === wd);

function blankForm(calendarId: string, date: string, start = "09:00", end = "10:00"): EventForm {
  return {
    id: null,
    name: "",
    calendarId,
    date,
    startTime: start,
    endTime: end,
    allDay: false,
    repeats: false,
    freq: "week",
    interval: 1,
    days: onlyDay(parseYmd(date).getDay()),
    endsMode: "never",
    validUntil: date,
    endsAfter: 10,
    presentationId: "",
    mode: "all",
    groupId: "",
    deviceIds: [],
    enabled: true,
  };
}

function toForm(s: ScheduleDTO): EventForm {
  const date = s.validFrom ?? ymd(new Date());
  const repeats = s.freq !== "none";
  return {
    id: s.id,
    name: s.name,
    calendarId: s.calendarId,
    date,
    startTime: hhmm(s.startTime),
    endTime: hhmm(s.endTime),
    allDay: s.allDay,
    repeats,
    freq: repeats ? (s.freq as EventForm["freq"]) : "week",
    interval: s.interval || 1,
    days: s.daysOfWeek ? DAYS_LONG.map((_, i) => hasDay(s.daysOfWeek, i)) : onlyDay(parseYmd(date).getDay()),
    endsMode: s.endsMode,
    validUntil: s.validUntil ?? date,
    endsAfter: s.endsAfter ?? 10,
    presentationId: s.presentationId,
    mode: s.groupId ? "group" : s.deviceIds.length ? "devices" : "all",
    groupId: s.groupId ?? "",
    deviceIds: s.deviceIds,
    enabled: s.enabled,
  };
}

/** Bloque de un evento en una columna: arriba/alto en px (los de todo el día no se ubican en la grilla). */
function place(s: ScheduleDTO) {
  const start = Math.max(toMin(s.startTime), DAY_START);
  const end = Math.min(toMin(s.endTime), DAY_END);
  if (end <= start) return null;
  return { top: ((start - DAY_START) / 60) * ROW_PX, height: Math.max(((end - start) / 60) * ROW_PX, 18) };
}

function shortZone(tz: string | null) {
  if (!tz) return "";
  try {
    return new Intl.DateTimeFormat("es", { timeZone: tz, timeZoneName: "short" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value ?? tz;
  } catch {
    return tz;
  }
}

export default function CalendarPage() {
  const [list, setList] = useState<ScheduleDTO[]>([]);
  const [calendars, setCalendars] = useState<CalendarDTO[]>([]);
  const [presentations, setPresentations] = useState<PresentationDTO[]>([]);
  const [pFolders, setPFolders] = useState<PresentationFolderDTO[]>([]);
  const [devices, setDevices] = useState<DeviceDTO[]>([]);
  const [groups, setGroups] = useState<GroupDTO[]>([]);
  const [tz, setTz] = useState<string | null>(null);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selectedCal, setSelectedCal] = useState("");
  const [form, setForm] = useState<EventForm | null>(null);
  const [panel, setPanel] = useState<"form" | "picker">("form");
  const [msg, setMsg] = useState<string | null>(null);
  const [msgError, setMsgError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<View>("semana");
  const [now, setNow] = useState<Date | null>(null);
  const [cursor, setCursor] = useState<Date | null>(null);
  const [drag, setDrag] = useState<{ day: string; a: number; b: number } | null>(null);
  const dragRef = useRef<{ day: string; a: number; moved: boolean } | null>(null);

  const load = useCallback(async () => setList(await api<ScheduleDTO[]>("/api/schedules")), []);
  const loadGroups = useCallback(async () => setGroups(await api<GroupDTO[]>("/api/groups")), []);
  const loadDevices = useCallback(async () => setDevices(await api<DeviceDTO[]>("/api/devices")), []);
  const loadCalendars = useCallback(async () => {
    const cs = await api<CalendarDTO[]>("/api/calendars");
    setCalendars(cs);
    setSelectedCal((cur) => (cs.some((c) => c.id === cur) ? cur : (cs[0]?.id ?? "")));
  }, []);

  useEffect(() => {
    const t = new Date();
    setNow(t);
    setCursor(startOfDay(t));
    const id = setInterval(() => setNow(new Date()), 60_000);
    const quiet = (p: Promise<unknown>) => void p.catch(() => undefined);
    quiet(load());
    quiet(loadGroups());
    quiet(loadDevices());
    quiet(loadCalendars());
    quiet(api<PresentationDTO[]>("/api/presentations").then(setPresentations));
    quiet(api<PresentationFolderDTO[]>("/api/presentation-folders").then(setPFolders));
    quiet(api<SettingsDTO>("/api/settings").then((s) => setTz(s.timezone)));
    return () => clearInterval(id);
  }, [load, loadGroups, loadDevices, loadCalendars]);

  const calById = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars]);
  const colorOf = (s: ScheduleDTO) => calById.get(s.calendarId)?.color ?? DEFAULT_COLOR;
  const presName = (id: string) => presentations.find((p) => p.id === id)?.name ?? "—";
  const targetLabel = (s: ScheduleDTO) => {
    if (s.groupId) return `Grupo: ${groups.find((g) => g.id === s.groupId)?.name ?? "—"}`;
    if (s.deviceIds.length) return s.deviceIds.map((id) => devices.find((d) => d.id === id)?.name ?? "Pantalla").join(", ");
    return "Todas las pantallas del calendario";
  };

  // Un evento que se está editando se dibuja con los valores del formulario, antes de guardar.
  const live = useMemo(() => {
    if (!form?.id) return list;
    const rep = form.repeats;
    const week = rep && form.freq === "week";
    return list.map((s): ScheduleDTO =>
      s.id !== form.id
        ? s
        : {
            ...s,
            name: form.name.trim() || s.name,
            allDay: form.allDay,
            startTime: form.allDay ? "00:00" : form.startTime,
            endTime: form.allDay ? "23:59" : form.endTime,
            validFrom: form.date,
            freq: rep ? form.freq : ("none" as const),
            interval: rep ? Math.max(1, form.interval || 1) : 1,
            daysOfWeek: week ? bitmask(form.days) : bitmask(onlyDay(parseYmd(form.date).getDay())),
            endsMode: rep ? form.endsMode : "never",
            validUntil: rep && form.endsMode === "on" ? form.validUntil || null : null,
            endsAfter: rep && form.endsMode === "after" ? form.endsAfter : null,
          },
    );
  }, [list, form]);

  const eventsOn = (d: Date) => {
    const key = ymd(d);
    return live.filter((s) => !hidden.has(s.calendarId) && occursOn(s, key));
  };

  // Evento nuevo sin guardar: se dibuja provisoriamente donde quedaría.
  const isDraftOn = (d: Date) => {
    if (!form || form.id) return false;
    const rep = form.repeats;
    const week = rep && form.freq === "week";
    return occursOn(
      {
        freq: rep ? form.freq : "none",
        interval: rep ? Math.max(1, form.interval || 1) : 1,
        daysOfWeek: week ? bitmask(form.days) : bitmask(onlyDay(parseYmd(form.date).getDay())),
        validFrom: form.date,
        endsMode: rep ? form.endsMode : "never",
        validUntil: rep && form.endsMode === "on" ? form.validUntil || null : null,
        endsAfter: rep && form.endsMode === "after" ? form.endsAfter : null,
      },
      ymd(d),
    );
  };
  const draftName = form?.name.trim() || "(Sin título)";

  function openNew(date: Date, startMin?: number, endMin?: number) {
    setMsg(null);
    setPanel("form");
    const s = startMin === undefined ? 9 * 60 : Math.min(Math.max(startMin, DAY_START), DAY_END - 30);
    const e = endMin === undefined ? Math.min(s + 60, 23 * 60 + 59) : Math.min(Math.max(endMin, s + 15), 23 * 60 + 59);
    setForm(blankForm(selectedCal || calendars[0]?.id || "", ymd(date), fmtMin(s), fmtMin(e)));
  }

  function openEdit(s: ScheduleDTO, date?: Date) {
    setMsg(null);
    setPanel("form");
    const f = toForm(s);
    // En eventos repetidos la fecha del formulario es el inicio de la serie, no el día clicado.
    void date;
    setForm(f);
  }

  async function save() {
    if (!form) return;
    setMsg(null);
    setSaving(true);
    const rep = form.repeats;
    const week = rep && form.freq === "week";
    const mask = week ? bitmask(form.days) : bitmask(onlyDay(parseYmd(form.date).getDay()));
    const body = JSON.stringify({
      name: form.name.trim(),
      calendarId: form.calendarId,
      presentationId: form.presentationId,
      allDay: form.allDay,
      startTime: form.allDay ? "00:00" : form.startTime,
      endTime: form.allDay ? "23:59" : form.endTime,
      validFrom: form.date,
      freq: rep ? form.freq : "none",
      interval: rep ? form.interval : 1,
      daysOfWeek: mask,
      endsMode: rep ? form.endsMode : "never",
      validUntil: rep && form.endsMode === "on" ? form.validUntil : null,
      endsAfter: rep && form.endsMode === "after" ? form.endsAfter : null,
      deviceIds: form.mode === "devices" ? form.deviceIds : [],
      groupId: form.mode === "group" ? form.groupId || null : null,
      enabled: form.enabled,
    });
    try {
      if (form.id) await api(`/api/schedules/${form.id}`, { method: "PATCH", body });
      else await api("/api/schedules", { method: "POST", body });
      setForm(null);
      await Promise.all([load(), loadCalendars()]);
    } catch (err) {
      setMsgError(true);
      setMsg((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!form?.id || !confirm(`¿Borrar "${form.name}"?`)) return;
    try {
      await api(`/api/schedules/${form.id}`, { method: "DELETE" });
      setForm(null);
      await Promise.all([load(), loadCalendars()]);
    } catch (err) {
      setMsgError(true);
      setMsg((err as Error).message);
    }
  }

  function shift(dir: -1 | 1) {
    setCursor((c) => {
      if (!c) return c;
      if (view === "mes") return new Date(c.getFullYear(), c.getMonth() + dir, 1);
      return addDays(c, dir * (view === "semana" ? 7 : 1));
    });
  }

  // Arrastre sobre la grilla: define el rango horario del evento nuevo.
  const minAt = (e: React.PointerEvent<HTMLDivElement>, snap: number) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const raw = DAY_START + ((e.clientY - rect.top) / ROW_PX) * 60;
    return Math.min(Math.max(Math.floor(raw / snap) * snap, DAY_START), DAY_END - snap);
  };
  const onDown = (day: Date, e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.slot) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const a = minAt(e, 15);
    dragRef.current = { day: ymd(day), a, moved: false };
    setDrag({ day: ymd(day), a, b: a });
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const b = minAt(e, 15);
    if (Math.abs(b - d.a) >= 15) d.moved = true;
    setDrag({ day: d.day, a: d.a, b });
  };
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!d) return;
    const day = parseYmd(d.day);
    if (!d.moved) {
      const s = Math.floor(minAt(e, 30) / 30) * 30;
      openNew(day, s, s + 60);
    } else {
      const b = minAt(e, 15);
      openNew(day, Math.min(d.a, b), Math.max(d.a, b) + 15);
    }
  };

  if (!cursor || !now) {
    return <div className="p-6 text-sm text-zinc-400">Cargando calendario…</div>;
  }

  const isToday = (d: Date) => sameDay(d, now);
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
  const cols = view === "dia" ? "grid-cols-[3.5rem_minmax(0,1fr)]" : "grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]";
  const draftAllDay = !!form && !form.id && form.allDay;
  const hasAllDay = columns.some((d) => eventsOn(d).some((s) => s.allDay) || (draftAllDay && isDraftOn(d)));

  return (
    <div className="flex h-full min-h-0">
      <CalendarList
        calendars={calendars}
        devices={devices}
        hidden={hidden}
        selectedId={selectedCal}
        onToggle={(id) =>
          setHidden((h) => {
            const n = new Set(h);
            if (n.has(id)) n.delete(id);
            else n.add(id);
            return n;
          })
        }
        onSelect={setSelectedCal}
        onAddEvent={() => openNew(cursor)}
        onChanged={async () => {
          await Promise.all([loadCalendars(), load()]);
        }}
        onDevicesChanged={loadDevices}
      />

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-1 rounded-lg bg-raised px-1">
            <button className="p-2 text-zinc-300 hover:text-white" onClick={() => shift(-1)} aria-label="Anterior">
              <IconChevronLeft />
            </button>
            <button className="px-2 text-sm font-medium" onClick={() => setCursor(startOfDay(now))}>
              Hoy
            </button>
            <button className="p-2 text-zinc-300 hover:text-white" onClick={() => shift(1)} aria-label="Siguiente">
              <IconChevronRight />
            </button>
          </div>
          {tz && <span className="rounded-lg bg-raised px-3 py-2 text-xs font-medium text-zinc-300" title={tz}>{shortZone(tz)}</span>}
          <span className="text-sm font-medium text-zinc-300">{rangeLabel}</span>
          <button className="btn py-1.5" onClick={() => setGroupsOpen(true)}>
            Grupos
          </button>
          <div className="ml-auto flex items-center gap-1">
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
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="min-w-[44rem]">
              <div className="grid grid-cols-7 border-y border-line text-xs text-zinc-400">
                {DAYS_SHORT.map((d) => (
                  <div key={d} className="px-2 py-2 text-center font-semibold tracking-wide">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {monthCells.map((d) => {
                  const inMonth = d.getMonth() === cursor.getMonth();
                  const items = eventsOn(d);
                  return (
                    <button
                      type="button"
                      key={ymd(d)}
                      onClick={() => {
                        setCursor(d);
                        setView("dia");
                      }}
                      className={`flex min-h-28 flex-col gap-1 border-b border-r border-line/70 p-1.5 text-left hover:bg-white/[0.03] ${inMonth ? "" : "opacity-40"}`}
                    >
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${isToday(d) ? "bg-accent text-white" : "text-zinc-300"}`}>{d.getDate()}</span>
                      {items.slice(0, 3).map((s) => (
                        <span key={s.id} className={`truncate rounded px-1.5 py-0.5 text-[11px] text-white ${s.enabled ? "" : "opacity-40"}`} style={{ background: colorOf(s) }}>
                          {s.allDay ? "" : `${hhmm(s.startTime)} `}
                          {s.name}
                        </span>
                      ))}
                      {items.length > 3 && <span className="text-[11px] text-zinc-400">+{items.length - 3} más</span>}
                      {isDraftOn(d) && (
                        <span className="truncate rounded border border-dashed border-accent bg-accent/25 px-1.5 py-0.5 text-[11px] text-white">
                          {form?.allDay ? "" : `${form?.startTime} `}
                          {draftName}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="min-w-[40rem]">
              <div className={`sticky top-0 z-20 grid bg-canvas ${cols}`}>
                <div />
                {columns.map((d) => {
                  const t = isToday(d);
                  return (
                    <div key={ymd(d)} className={`flex flex-col items-center py-2 ${t ? "bg-accent/10" : ""}`}>
                      <span className="text-[11px] font-semibold tracking-wide text-zinc-400">{DAYS_SHORT[d.getDay()]}</span>
                      <span className={`text-2xl font-bold ${t ? "text-accent" : "text-zinc-100"}`}>{d.getDate()}</span>
                    </div>
                  );
                })}
                {hasAllDay && (
                  <>
                    <div className="px-1 pt-1 text-right text-[10px] text-zinc-500">Todo el día</div>
                    {columns.map((d) => (
                      <div key={ymd(d)} className="space-y-0.5 border-l border-line/70 p-0.5">
                        {eventsOn(d)
                          .filter((s) => s.allDay)
                          .map((s) => (
                            <button key={s.id} type="button" onClick={() => openEdit(s)} className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] text-white ${s.enabled ? "" : "opacity-40"}`} style={{ background: colorOf(s) }}>
                              {s.name}
                            </button>
                          ))}
                        {draftAllDay && isDraftOn(d) && (
                          <div className="truncate rounded border border-dashed border-accent bg-accent/25 px-1.5 py-0.5 text-[11px] text-white">{draftName}</div>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </div>

              <div className={`grid ${cols}`}>
                <div>
                  {HOURS.map((h) => (
                    <div key={h} className="h-14 pr-2 text-right text-xs text-zinc-500">
                      <span className="relative -top-2">{h < 12 ? `${h} AM` : h === 12 ? "12 PM" : h === 24 ? "12 AM" : `${h - 12} PM`}</span>
                    </div>
                  ))}
                </div>
                {columns.map((d) => {
                  const t = isToday(d);
                  const key = ymd(d);
                  const dayList = eventsOn(d).filter((s) => !s.allDay);
                  const lanes = layoutLanes(dayList);
                  return (
                    <div
                      key={key}
                      className={`relative cursor-cell touch-none select-none border-l border-line/70 ${t ? "bg-accent/[0.07]" : ""}`}
                      onPointerDown={(e) => onDown(d, e)}
                      onPointerMove={onMove}
                      onPointerUp={onUp}
                      onPointerCancel={() => {
                        dragRef.current = null;
                        setDrag(null);
                      }}
                    >
                      {HOURS.map((h) => (
                        <div key={h} data-slot="1" className="pointer-events-none h-14 border-t border-line/70" />
                      ))}
                      {drag && drag.day === key && (
                        <div
                          className="pointer-events-none absolute inset-x-0.5 z-[6] rounded-md border border-accent bg-accent/30"
                          style={{
                            top: ((Math.min(drag.a, drag.b) - DAY_START) / 60) * ROW_PX,
                            height: ((Math.abs(drag.b - drag.a) + 15) / 60) * ROW_PX,
                          }}
                        />
                      )}
                      {t && nowTop !== null && (
                        <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: nowTop }}>
                          <span className="-ml-1 h-2 w-2 rounded-full bg-accent" />
                          <span className="h-px flex-1 bg-accent" />
                        </div>
                      )}
                      {form && !form.id && !form.allDay && isDraftOn(d) && (() => {
                        const pos = place({ startTime: form.startTime, endTime: form.endTime } as ScheduleDTO);
                        if (!pos) return null;
                        return (
                          <div
                            data-testid="draft-event"
                            className="pointer-events-none absolute inset-x-0.5 z-[7] overflow-hidden rounded-md border-2 border-dashed border-accent bg-accent/30 px-1.5 py-1 text-xs leading-tight text-white"
                            style={{ top: pos.top, height: pos.height }}
                          >
                            <div className="truncate font-semibold">{form.startTime} – {form.endTime}</div>
                            <div className="break-words">{draftName}</div>
                          </div>
                        );
                      })()}
                      {dayList.map((s) => {
                        const pos = place(s);
                        if (!pos) return null;
                        const ln = lanes.get(s.id) ?? { lane: 0, lanes: 1 };
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(s, d);
                            }}
                            title={`${s.name} · ${presName(s.presentationId)} · ${targetLabel(s)}`}
                            className={`absolute z-[5] cursor-pointer overflow-hidden rounded-md border-l-4 border-white/40 px-1.5 py-1 text-left text-xs leading-tight text-white shadow ${s.enabled ? "" : "opacity-40"} ${form?.id === s.id ? "ring-2 ring-white" : ""}`}
                            style={{ background: colorOf(s), top: pos.top, height: pos.height, left: `calc(${(ln.lane / ln.lanes) * 100}% + 2px)`, width: `calc(${100 / ln.lanes}% - 4px)` }}
                          >
                            <div className="truncate font-semibold">{hhmm(s.startTime)} – {hhmm(s.endTime)}</div>
                            <div className="break-words">{s.name}</div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>

      {form && (
        <aside className="h-full w-[22rem] shrink-0 border-l border-line bg-panel">
          {panel === "picker" ? (
            <PresentationPicker
              presentations={presentations}
              folders={pFolders}
              selectedId={form.presentationId}
              onPick={(id) => {
                setForm({ ...form, presentationId: id });
                setPanel("form");
              }}
              onBack={() => setPanel("form")}
              onClose={() => setPanel("form")}
            />
          ) : (
            <EventPanel
              form={form}
              setForm={setForm}
              calendars={calendars}
              presentations={presentations}
              devices={devices}
              groups={groups}
              msg={msg}
              msgError={msgError}
              saving={saving}
              onSave={() => void save()}
              onDelete={() => void remove()}
              onPickContent={() => setPanel("picker")}
              onClose={() => setForm(null)}
            />
          )}
        </aside>
      )}

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
