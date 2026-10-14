"use client";

import { useState } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (res.ok) {
      window.location.href = "/dashboard/devices";
      return;
    }
    setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "No se pudo iniciar sesión");
    setBusy(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
        <div className="flex items-center gap-2.5 text-xl font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-base font-bold">C</span>
          Cartelería
        </div>
        <label className="flex flex-col gap-1.5 text-sm">
          Usuario
          <input className="input" autoComplete="username" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          Contraseña
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="btn-primary w-full" disabled={busy || !username || !password}>
          Entrar
        </button>
      </form>
    </div>
  );
}
