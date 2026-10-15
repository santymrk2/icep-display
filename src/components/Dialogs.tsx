"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Toaster } from "sonner";
import { IconClose } from "@/components/Icons";

/**
 * Modales propios para reemplazar `confirm()` y `prompt()` del navegador, con el mismo
 * estilo que el resto del panel. Se usan como promesas:
 *
 *   const { confirm, prompt } = useDialogs();
 *   if (!(await confirm({ title: "¿Borrar?", danger: true }))) return;
 *   const name = await prompt({ title: "Nueva carpeta", label: "Nombre" }); // null si se cancela
 */

export type ConfirmOptions = {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Botón de confirmación en rojo (para borrar, desvincular, etc.). */
  danger?: boolean;
};

export type PromptOptions = {
  title: string;
  message?: React.ReactNode;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  inputType?: "text" | "password";
  /** Devuelve un mensaje de error para bloquear el envío, o null si el valor es válido. */
  validate?: (value: string) => string | null;
};

type Pending =
  | { kind: "confirm"; options: ConfirmOptions; resolve: (ok: boolean) => void }
  | { kind: "prompt"; options: PromptOptions; resolve: (value: string | null) => void };

type DialogsApi = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
};

const DialogsContext = createContext<DialogsApi | null>(null);

export function useDialogs(): DialogsApi {
  const api = useContext(DialogsContext);
  if (!api) throw new Error("useDialogs debe usarse dentro de <DialogsProvider>");
  return api;
}

/** Provee los modales y el contenedor de avisos (toasts) a todo el panel. */
export function DialogsProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ kind: "confirm", options, resolve })),
    [],
  );
  const prompt = useCallback(
    (options: PromptOptions) => new Promise<string | null>((resolve) => setPending({ kind: "prompt", options, resolve })),
    [],
  );

  const api = useMemo<DialogsApi>(() => ({ confirm, prompt }), [confirm, prompt]);

  return (
    <DialogsContext.Provider value={api}>
      {children}
      {pending?.kind === "confirm" && (
        <ConfirmDialog
          options={pending.options}
          onDone={(ok) => {
            setPending(null);
            pending.resolve(ok);
          }}
        />
      )}
      {pending?.kind === "prompt" && (
        <PromptDialog
          options={pending.options}
          onDone={(value) => {
            setPending(null);
            pending.resolve(value);
          }}
        />
      )}
      <Toaster
        theme="dark"
        position="bottom-right"
        richColors
        closeButton
        toastOptions={{ classNames: { toast: "!rounded-xl !border-line", title: "!text-sm", description: "!whitespace-pre-line" } }}
      />
    </DialogsContext.Provider>
  );
}

function useEscape(onEscape: () => void) {
  useEffect(() => {
    // En fase de captura y sin propagar, para que Escape no cierre también el modal de abajo.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onEscape();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onEscape]);
}

function DialogShell({
  title,
  onClose,
  onSubmit,
  children,
}: {
  title: string;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  children: React.ReactNode;
}) {
  useEscape(onClose);
  return (
    <div className="modal-backdrop z-[60]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form role="dialog" aria-modal="true" aria-labelledby="dialog-title" onSubmit={onSubmit} className="modal space-y-5 p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 id="dialog-title" className="text-lg font-semibold">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg p-1 text-zinc-400 hover:bg-raised hover:text-zinc-100">
            <IconClose />
          </button>
        </div>
        {children}
      </form>
    </div>
  );
}

function ConfirmDialog({ options, onDone }: { options: ConfirmOptions; onDone: (ok: boolean) => void }) {
  const cancel = useCallback(() => onDone(false), [onDone]);
  return (
    <DialogShell
      title={options.title}
      onClose={cancel}
      onSubmit={(e) => {
        e.preventDefault();
        onDone(true);
      }}
    >
      {options.message && <div className="text-sm leading-relaxed text-zinc-400">{options.message}</div>}
      <div className="flex justify-end gap-3 pt-1">
        <button type="button" className="btn" onClick={cancel}>
          {options.cancelLabel ?? "Cancelar"}
        </button>
        <button type="submit" autoFocus className={options.danger ? "btn-danger" : "btn-primary"}>
          {options.confirmLabel ?? (options.danger ? "Eliminar" : "Aceptar")}
        </button>
      </div>
    </DialogShell>
  );
}

function PromptDialog({ options, onDone }: { options: PromptOptions; onDone: (value: string | null) => void }) {
  const [value, setValue] = useState(options.defaultValue ?? "");
  const [error, setError] = useState<string | null>(null);
  const cancel = useCallback(() => onDone(null), [onDone]);

  return (
    <DialogShell
      title={options.title}
      onClose={cancel}
      onSubmit={(e) => {
        e.preventDefault();
        // Las contraseñas se devuelven tal cual; el resto, sin espacios en los extremos.
        const result = options.inputType === "password" ? value : value.trim();
        const problem = options.validate?.(result) ?? null;
        if (problem) return setError(problem);
        onDone(result);
      }}
    >
      {options.message && <div className="text-sm leading-relaxed text-zinc-400">{options.message}</div>}
      <label className="block space-y-2">
        {options.label && <span className="text-sm font-medium">{options.label}</span>}
        <input
          className="input w-full"
          type={options.inputType ?? "text"}
          autoFocus
          onFocus={(e) => e.target.select()}
          value={value}
          placeholder={options.placeholder}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
        />
      </label>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex justify-end gap-3 pt-1">
        <button type="button" className="btn" onClick={cancel}>
          {options.cancelLabel ?? "Cancelar"}
        </button>
        <button type="submit" className="btn-primary" disabled={!value.trim()}>
          {options.confirmLabel ?? "Aceptar"}
        </button>
      </div>
    </DialogShell>
  );
}
