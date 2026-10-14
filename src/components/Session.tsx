"use client";

import { useEffect, useState } from "react";

export type Me = { id: string; username: string; role: "admin" | "operator" };

/** Usuario actual (null mientras carga o si no hay sesión). */
export function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then(setMe)
      .catch(() => setMe(null));
  }, []);
  return me;
}

export function HeaderUser() {
  const me = useMe();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }
  if (!me) return null;
  return (
    <div className="ml-auto flex items-center gap-3 text-sm">
      <span className="text-zinc-300">
        {me.username} <span className="text-zinc-500">· {me.role === "admin" ? "Administrador" : "Operador"}</span>
      </span>
      <button className="btn" onClick={logout}>
        Salir
      </button>
    </div>
  );
}
