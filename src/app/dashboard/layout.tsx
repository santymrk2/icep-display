import Sidebar from "@/components/Sidebar";
import { HeaderUser } from "@/components/Session";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-16 shrink-0 items-center border-b border-line bg-panel px-6">
        <div className="flex items-center gap-2.5 text-xl font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-base font-bold">C</span>
          Cartelería
        </div>
        <HeaderUser />
      </header>
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-auto p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
