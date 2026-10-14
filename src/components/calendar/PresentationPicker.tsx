"use client";

import { useState } from "react";
import type { PresentationDTO, PresentationFolderDTO } from "@/lib/client";
import { IconBack, IconChevronDown, IconFolderSm, IconScreen, IconSearch, IconX } from "./helpers";

export function PresentationPicker({
  presentations,
  folders,
  selectedId,
  onPick,
  onBack,
  onClose,
}: {
  presentations: PresentationDTO[];
  folders: PresentationFolderDTO[];
  selectedId: string;
  onPick: (id: string) => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const query = q.trim().toLowerCase();
  const toggle = (id: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const row = (p: PresentationDTO, indent: boolean) => (
    <button
      key={p.id}
      type="button"
      onClick={() => onPick(p.id)}
      className={`flex w-full items-center gap-3 border-b border-line py-3.5 pr-4 text-left text-sm hover:bg-white/[0.04] ${indent ? "pl-9" : "pl-4"} ${
        selectedId === p.id ? "border-l-2 border-l-accent bg-white/[0.05]" : ""
      }`}
    >
      <span className="text-zinc-400">
        <IconScreen />
      </span>
      <span className="min-w-0 flex-1 truncate">{p.name}</span>
    </button>
  );

  const loose = presentations.filter((p) => !p.folderId || !folders.some((f) => f.id === p.folderId));
  const matches = presentations.filter((p) => p.name.toLowerCase().includes(query));

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-4 py-4">
        <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium text-accent">
          <IconBack /> Volver
        </button>
        <h2 className="font-semibold">Presentaciones</h2>
        <button type="button" onClick={onClose} aria-label="Cerrar" className="text-accent">
          <IconX />
        </button>
      </div>
      <div className="px-4 pb-3">
        <div className="flex items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-2 text-zinc-400 focus-within:border-accent">
          <IconSearch />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar aquí..."
            className="min-w-0 flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto border-t border-line">
        {query ? (
          matches.length === 0 ? (
            <p className="p-4 text-sm text-zinc-500">Sin resultados.</p>
          ) : (
            matches.map((p) => row(p, false))
          )
        ) : (
          <>
            {presentations.length === 0 && <p className="p-4 text-sm text-zinc-500">Todavía no hay presentaciones.</p>}
            {loose.map((p) => row(p, false))}
            {folders.map((f) => {
              const kids = presentations.filter((p) => p.folderId === f.id);
              const isOpen = open.has(f.id);
              return (
                <div key={f.id}>
                  <button
                    type="button"
                    onClick={() => toggle(f.id)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-3 border-b border-line py-3.5 pl-4 pr-4 text-left text-sm hover:bg-white/[0.04]"
                  >
                    <span className="text-teal-400">
                      <IconFolderSm />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <span className={`text-zinc-400 transition ${isOpen ? "rotate-180" : ""}`}>
                      <IconChevronDown />
                    </span>
                  </button>
                  {isOpen && (kids.length ? kids.map((p) => row(p, true)) : <p className="border-b border-line py-3 pl-9 text-sm text-zinc-500">Carpeta vacía.</p>)}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
