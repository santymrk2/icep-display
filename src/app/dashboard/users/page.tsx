"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { useMe } from "@/components/Session";
import { useDialogs } from "@/components/Dialogs";
import { toast } from "sonner";

type UserDTO = { id: string; username: string; role: "admin" | "operator"; createdAt: string };

export default function UsersPage() {
  const me = useMe();
  const [users, setUsers] = useState<UserDTO[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "operator">("operator");
  const dialogs = useDialogs();

  const load = useCallback(async () => setUsers(await api<UserDTO[]>("/api/users")), []);
  useEffect(() => {
    void load().catch((e) => toast.error((e as Error).message));
  }, [load]);

  async function run(fn: () => Promise<unknown>, ok?: string) {
    try {
      await fn();
      if (ok) toast.success(ok);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api("/api/users", { method: "POST", body: JSON.stringify({ username, password, role }) });
      setUsername("");
      setPassword("");
    }, "Usuario creado");
  };

  return (
    <div className="page max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Usuarios</h1>
      <p className="text-sm text-zinc-400">
        Los administradores gestionan todo. Los operadores pueden ver el panel y poner contenido “al aire”, pero no cambiar nada más.
      </p>

      <form onSubmit={create} className="card flex flex-wrap items-end gap-3 p-4">
        <label className="flex flex-col gap-1 text-sm">
          Usuario
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Contraseña (8+)
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Rol
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as "admin" | "operator")}>
            <option value="operator">Operador</option>
            <option value="admin">Administrador</option>
          </select>
        </label>
        <button className="btn-primary" disabled={!username || password.length < 8}>
          Crear
        </button>
      </form>

      <div className="table-shell">
        <table>
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Rol</th>
              <th className="text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  {u.username} {me?.id === u.id && <span className="text-xs text-zinc-500">(vos)</span>}
                </td>
                <td>
                  <select
                    className="input py-1"
                    value={u.role}
                    onChange={(e) => run(() => api(`/api/users/${u.id}`, { method: "PATCH", body: JSON.stringify({ role: e.target.value }) }), "Rol actualizado")}
                  >
                    <option value="operator">Operador</option>
                    <option value="admin">Administrador</option>
                  </select>
                </td>
                <td className="space-x-2 text-right">
                  <button
                    className="btn"
                    onClick={async () => {
                      const pw = await dialogs.prompt({
                        title: "Cambiar contraseña",
                        message: `Nueva contraseña para ${u.username}.`,
                        label: "Contraseña",
                        inputType: "password",
                        confirmLabel: "Guardar",
                        validate: (v) => (v.length < 8 ? "Tiene que tener al menos 8 caracteres" : null),
                      });
                      if (pw) void run(() => api(`/api/users/${u.id}`, { method: "PATCH", body: JSON.stringify({ password: pw }) }), "Contraseña actualizada");
                    }}
                  >
                    Cambiar contraseña
                  </button>
                  <button
                    className="btn-danger"
                    disabled={me?.id === u.id}
                    onClick={async () =>
                      (await dialogs.confirm({ title: "Borrar usuario", message: `¿Borrar a ${u.username}? No se puede deshacer.`, danger: true, confirmLabel: "Borrar" })) &&
                      run(() => api(`/api/users/${u.id}`, { method: "DELETE" }), "Usuario borrado")}
                  >
                    Borrar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
