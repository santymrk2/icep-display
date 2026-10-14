"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type DeviceDTO, type PresentationDTO } from "@/lib/client";

export default function DevicesPage() {
  const [devices, setDevices] = useState<DeviceDTO[]>([]);
  const [presentations, setPresentations] = useState<PresentationDTO[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setDevices(await api<DeviceDTO[]>("/api/devices"));
  }, []);

  useEffect(() => {
    void load();
    void api<PresentationDTO[]>("/api/presentations").then(setPresentations);
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  async function pair(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      await api("/api/devices/pair", { method: "POST", body: JSON.stringify({ code, name, location }) });
      setCode("");
      setName("");
      setLocation("");
      setMsg("Pantalla vinculada");
      await load();
    } catch (err) {
      setMsg((err as Error).message);
    }
  }

  async function update(id: string, patch: Partial<DeviceDTO>) {
    await api(`/api/devices/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    await load();
  }

  async function remove(d: DeviceDTO) {
    if (!confirm(`¿Desvincular "${d.name}"?`)) return;
    await api(`/api/devices/${d.id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Pantallas</h1>

      <form onSubmit={pair} className="card flex flex-wrap items-end gap-3 p-4">
        <label className="flex flex-col gap-1 text-sm">
          Código en pantalla
          <input className="input w-28 font-mono tracking-widest" inputMode="numeric" maxLength={4} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="0000" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Nombre
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="TV Hall de entrada" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Ubicación
          <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Hall" />
        </label>
        <button className="btn-primary" disabled={code.length !== 4 || !name}>
          Vincular
        </button>
        {msg && <p className="w-full text-sm text-zinc-400">{msg}</p>}
      </form>

      <div className="card divide-y divide-zinc-800">
        {devices.length === 0 && (
          <p className="p-4 text-sm text-zinc-400">
            Todavía no hay pantallas. Abrí <code>/player</code> en el TV y cargá acá el código que aparece.
          </p>
        )}
        {devices.map((d) => (
          <div key={d.id} className="flex flex-wrap items-center gap-4 p-4">
            <span className={`h-2.5 w-2.5 rounded-full ${d.online ? "bg-emerald-500" : "bg-zinc-600"}`} title={d.online ? "Online" : "Offline"} />
            <div className="min-w-40 flex-1">
              <div className="font-medium">{d.name}</div>
              <div className="text-xs text-zinc-400">
                {d.location ?? "Sin ubicación"} · {d.online ? "Online" : d.lastSeenAt ? `Visto ${new Date(d.lastSeenAt).toLocaleString()}` : "Offline"}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-400">
              Por defecto
              <select className="input" value={d.defaultPresentationId ?? ""} onChange={(e) => update(d.id, { defaultPresentationId: e.target.value || null })}>
                <option value="">Nada</option>
                {presentations.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn-danger" onClick={() => remove(d)}>
              Desvincular
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
