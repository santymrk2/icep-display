"use client";

import { useEffect, useRef, useState } from "react";

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

/** Avatar con inicial y menú desplegable (como en la referencia): nombre, rol y "Salir". */
export function HeaderUser() {
  const me = useMe();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }
  if (!me) return null;
  return (
    <div ref={ref} className="relative ml-auto">
      <button className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3 text-sm font-medium hover:bg-white/5" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-300 text-sm font-semibold uppercase text-zinc-600">{me.username[0]}</span>
        {me.username}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={`transition ${open ? "rotate-180" : ""}`}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-panel shadow-2xl">
          <div className="border-b border-line px-4 py-3 text-sm">
            <div className="font-medium">{me.username}</div>
            <div className="text-xs text-zinc-500">{me.role === "admin" ? "Administrador" : "Operador"}</div>
          </div>
          <button role="menuitem" className="block w-full px-4 py-2.5 text-left text-sm hover:bg-white/5" onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
