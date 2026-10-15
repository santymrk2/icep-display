"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api, type GroupDTO } from "@/lib/client";
import { useDialogs } from "@/components/Dialogs";

export function GroupsDialog({ groups, onChanged, onClose }: { groups: GroupDTO[]; onChanged: () => Promise<void>; onClose: () => void }) {
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const dialogs = useDialogs();

  async function run(action: () => Promise<string>) {
    try {
      const text = await action();
      toast.success(text);
      await onChanged();
    } catch (err) {
      toast.error((err as Error).message);
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

  async function remove(g: GroupDTO) {
    const ok = await dialogs.confirm({
      title: "Borrar grupo",
      message: `¿Borrar el grupo "${g.name}"? También se borrarán sus bloques de programación. Sus pantallas quedan sin grupo.`,
      danger: true,
      confirmLabel: "Borrar",
    });
    if (!ok) return;
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
                        setEditId(g.id);
                        setEditName(g.name);
                      }}
                    >
                      Renombrar
                    </button>
                    <button type="button" className="btn-danger" onClick={() => void remove(g)}>
                      Borrar
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

      </div>
    </div>
  );
}
