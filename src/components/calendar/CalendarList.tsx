"use client";

import { useEffect, useState } from "react";
import { api, type CalendarDTO, type DeviceDTO } from "@/lib/client";
import { CAL_COLORS, IconCal, IconDots, IconEye, IconPlus } from "./helpers";

export function CalendarList({
  calendars,
  devices,
  hidden,
  selectedId,
  onToggle,
  onSelect,
  onAddEvent,
  onChanged,
  onDevicesChanged,
}: {
  calendars: CalendarDTO[];
  devices: DeviceDTO[];
  hidden: Set<string>;
  selectedId: string;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onAddEvent: () => void;
  onChanged: () => Promise<void>;
  onDevicesChanged: () => Promise<void>;
}) {
  const [menu, setMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [assign, setAssign] = useState<CalendarDTO | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menu]);

  async function run(fn: () => Promise<unknown>) {
    setErr(null);
    try {
      await fn();
      await onChanged();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  const create = () =>
    run(async () => {
      if (!name.trim()) return;
      const color = CAL_COLORS[calendars.length % CAL_COLORS.length];
      await api("/api/calendars", { method: "POST", body: JSON.stringify({ name: name.trim(), color }) });
      setName("");
      setAdding(false);
    });
  const rename = (id: string) =>
    run(async () => {
      if (!name.trim()) return;
      await api(`/api/calendars/${id}`, { method: "PATCH", body: JSON.stringify({ name: name.trim() }) });
      setRenaming(null);
    });
  const recolor = (id: string, color: string) => run(() => api(`/api/calendars/${id}`, { method: "PATCH", body: JSON.stringify({ color }) }));
  const remove = (c: CalendarDTO) => {
    if (!confirm(`¿Borrar el calendario "${c.name}"?${c.eventCount ? ` Se borrarán sus ${c.eventCount} evento(s).` : ""}`)) return;
    void run(() => api(`/api/calendars/${c.id}`, { method: "DELETE" }));
  };

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-line bg-panel/40">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-4">
        <div className="flex items-center gap-2 font-semibold">
          <IconCal size={20} /> Calendarios
        </div>
      </div>
      <div className="px-3 pt-3">
        <button className="btn-primary w-full" onClick={onAddEvent}>
          <IconPlus /> Agregar evento
        </button>
      </div>
      <ul className="mt-3 min-h-0 flex-1 overflow-auto">
        {calendars.map((c) => {
          const subs = devices.filter((d) => d.calendarId === c.id);
          const isHidden = hidden.has(c.id);
          return (
            <li key={c.id} className={`group relative ${selectedId === c.id ? "bg-white/[0.07]" : "hover:bg-white/[0.03]"}`}>
              {renaming === c.id ? (
                <form
                  className="flex gap-1 px-3 py-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void rename(c.id);
                  }}
                >
                  <input autoFocus className="input min-w-0 flex-1 py-1" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setRenaming(null)} />
                  <button className="btn-primary px-2 py-1">OK</button>
                </form>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <button type="button" onClick={() => onSelect(c.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left" aria-pressed={selectedId === c.id}>
                    <IconCal color={c.color} />
                    <span className="min-w-0">
                      <span className={`block truncate text-sm font-medium ${isHidden ? "text-zinc-500" : ""}`}>{c.name}</span>
                      <span className="block truncate text-[11px] text-zinc-500" title={subs.map((d) => d.name).join(", ")}>
                        {c.deviceCount} {c.deviceCount === 1 ? "pantalla" : "pantallas"}
                        {subs.length > 0 && ` · ${subs.map((d) => d.name).join(", ")}`}
                      </span>
                    </span>
                  </button>
                  <button type="button" onClick={() => onToggle(c.id)} aria-label={isHidden ? "Mostrar calendario" : "Ocultar calendario"} className={isHidden ? "text-zinc-600" : "text-zinc-200"}>
                    <IconEye off={isHidden} />
                  </button>
                  <button
                    type="button"
                    aria-label="Opciones del calendario"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenu(menu === c.id ? null : c.id);
                    }}
                    className="text-zinc-400 hover:text-zinc-100"
                  >
                    <IconDots />
                  </button>
                </div>
              )}
              {menu === c.id && (
                <div className="absolute right-2 top-10 z-30 w-44 rounded-lg border border-line bg-raised py-1 text-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="block w-full px-3 py-1.5 text-left hover:bg-white/10"
                    onClick={() => {
                      setMenu(null);
                      setName(c.name);
                      setRenaming(c.id);
                    }}
                  >
                    Renombrar
                  </button>
                  <label className="block w-full cursor-pointer px-3 py-1.5 hover:bg-white/10">
                    Cambiar color
                    <input type="color" className="sr-only" value={c.color} onChange={(e) => void recolor(c.id, e.target.value)} />
                  </label>
                  <button
                    className="block w-full px-3 py-1.5 text-left hover:bg-white/10"
                    onClick={() => {
                      setMenu(null);
                      setAssign(c);
                    }}
                  >
                    Asignar pantallas
                  </button>
                  <button
                    className="block w-full px-3 py-1.5 text-left text-red-400 hover:bg-white/10"
                    onClick={() => {
                      setMenu(null);
                      remove(c);
                    }}
                  >
                    Eliminar
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="border-t border-line p-3">
        {err && (
          <p role="alert" className="mb-2 text-xs text-red-400">
            {err}
          </p>
        )}
        {adding ? (
          <form
            className="flex gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <input autoFocus className="input min-w-0 flex-1 py-1.5" placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setAdding(false)} />
            <button className="btn-primary px-3 py-1.5" disabled={!name.trim()}>
              Crear
            </button>
          </form>
        ) : (
          <button
            className="text-sm text-accent hover:underline"
            onClick={() => {
              setName("");
              setAdding(true);
            }}
          >
            + Nuevo calendario
          </button>
        )}
      </div>
      {assign && (
        <AssignModal
          calendar={assign}
          devices={devices}
          onClose={() => setAssign(null)}
          onChanged={async () => {
            await onDevicesChanged();
            await onChanged();
          }}
        />
      )}
    </aside>
  );
}

function AssignModal({ calendar, devices, onClose, onChanged }: { calendar: CalendarDTO; devices: DeviceDTO[]; onClose: () => void; onChanged: () => Promise<void> }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function toggle(d: DeviceDTO, on: boolean) {
    setErr(null);
    setBusy(true);
    try {
      await api(`/api/devices/${d.id}`, { method: "PATCH", body: JSON.stringify({ calendarId: on ? calendar.id : null }) });
      await onChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="modal space-y-4 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Pantallas de “{calendar.name}”</h2>
          <button type="button" className="text-sm text-zinc-400 hover:text-zinc-100" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <p className="text-sm text-zinc-400">Las pantallas marcadas muestran los eventos de este calendario.</p>
        <ul className="max-h-72 space-y-1 overflow-auto text-sm">
          {devices.length === 0 && <li className="text-zinc-500">Todavía no hay pantallas vinculadas.</li>}
          {devices.map((d) => (
            <li key={d.id}>
              <label className="flex items-center gap-2 rounded px-1 py-1.5 hover:bg-white/5">
                <input type="checkbox" className="h-4 w-4 accent-[#2492ff]" disabled={busy} checked={d.calendarId === calendar.id} onChange={(e) => void toggle(d, e.target.checked)} />
                <span className="flex-1">{d.name}</span>
              </label>
            </li>
          ))}
        </ul>
        {err && (
          <p role="alert" className="text-sm text-red-400">
            {err}
          </p>
        )}
      </div>
    </div>
  );
}
