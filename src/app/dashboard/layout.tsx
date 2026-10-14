import Sidebar from "@/components/Sidebar";
import { HeaderUser } from "@/components/Session";

/**
 * Marco general. El contenido (`main`) no tiene relleno propio: cada página lo define
 * (clase `page` para páginas simples; columnas a ras del borde para Medios y Presentaciones).
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-14 shrink-0 items-center border-b border-line bg-bar px-6">
        <div className="flex items-center gap-2.5 text-xl font-semibold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-base font-bold">C</span>
          Cartelería
        </div>
        <HeaderUser />
      </header>
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="min-h-0 flex-1 overflow-auto">{children}</main>
          <footer className="flex h-10 shrink-0 items-center gap-6 border-t border-line bg-canvas px-6 text-xs text-zinc-500">
            <span>© 2026 Cartelería local</span>
            <span>Los datos se guardan en tu propio servidor</span>
          </footer>
        </div>
      </div>
    </div>
  );
}
