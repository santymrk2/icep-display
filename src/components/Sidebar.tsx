"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconCalendar, IconDevices, IconMedia, IconPresentations } from "./Icons";

const nav = [
  { href: "/dashboard/devices", label: "Pantallas", Icon: IconDevices },
  { href: "/dashboard/media", label: "Medios", Icon: IconMedia },
  { href: "/dashboard/presentations", label: "Presentaciones", Icon: IconPresentations },
  { href: "/dashboard/calendar", label: "Calendario", Icon: IconCalendar },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <nav className="flex w-[84px] shrink-0 flex-col items-center gap-3 border-r border-line bg-panel py-5">
      {nav.map(({ href, label, Icon }) => {
        const active = path.startsWith(href);
        return (
          <Link key={href} href={href} className="group flex w-full flex-col items-center gap-1.5 px-1 text-[11px] font-medium">
            <span className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${active ? "bg-accent/20 text-accent" : "text-zinc-400 group-hover:bg-white/5"}`}>
              <Icon />
            </span>
            <span className={active ? "text-zinc-100" : "text-zinc-400"}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
