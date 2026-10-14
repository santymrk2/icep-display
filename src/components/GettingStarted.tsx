"use client";

import Link from "next/link";
import { useState } from "react";

const STEPS = [
  { title: "Vinculá una pantalla", text: "Abrí /player en el TV, copiá el código de 4 dígitos y cargalo en Pantallas > Vincular pantalla.", href: "/dashboard/devices" },
  { title: "Subí tus medios", text: "En Medios arrastrá imágenes y videos (de a muchos) y ordenalos en carpetas.", href: "/dashboard/media" },
  { title: "Armá una presentación", text: "Elegí medios, ordenalos, ponele duración y transición, y decidí si es horizontal o vertical.", href: "/dashboard/presentations" },
  { title: "Programala en el calendario", text: "Creá eventos con repetición y asignalos a un calendario; las pantallas suscriptas lo reproducen solas.", href: "/dashboard/calendar" },
];

/** Botón flotante "Primeros pasos" con una guía corta. */
export default function GettingStarted() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="group flex w-full flex-col items-center gap-1.5 px-1 text-[11px] font-medium" onClick={() => setOpen(true)}>
        <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-teal-400/50 text-base font-semibold text-teal-300 transition-colors group-hover:bg-teal-400/10">?</span>
        <span className="text-zinc-400">Primeros pasos</span>
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <h2 className="text-lg font-semibold">Primeros pasos</h2>
              <button className="text-zinc-400 hover:text-white" onClick={() => setOpen(false)} aria-label="Cerrar">
                ✕
              </button>
            </div>
            <ol className="space-y-4 p-6">
              {STEPS.map((s, i) => (
                <li key={s.href} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/20 text-sm font-semibold text-accent">{i + 1}</span>
                  <div>
                    <Link href={s.href} className="font-medium hover:underline" onClick={() => setOpen(false)}>
                      {s.title}
                    </Link>
                    <p className="text-sm text-zinc-400">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
