import Link from "next/link";

const nav = [
  { href: "/dashboard/devices", label: "Pantallas" },
  { href: "/dashboard/media", label: "Medios" },
  { href: "/dashboard/presentations", label: "Presentaciones" },
  { href: "/dashboard/calendar", label: "Calendario" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-zinc-800 p-4 md:w-56 md:border-b-0 md:border-r">
        <div className="mb-4 text-lg font-semibold">Cartelería</div>
        <nav className="flex gap-1 md:flex-col">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-md px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800">
              {n.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
