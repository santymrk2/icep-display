import type { ScheduleDTO } from "@/lib/client";

export const DAYS_LONG = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export const DAYS_SHORT = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
export const DAYS_INITIAL = ["D", "L", "M", "M", "J", "V", "S"];
export const MONTHS_LONG = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
export const MONTHS_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
export const CAL_COLORS = ["#e5484d", "#2492ff", "#30a46c", "#f5a524", "#8e4ec6", "#12a594", "#e93d82", "#f76b15"];

export const hhmm = (t: string) => t.slice(0, 5);
export const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
export const fmtMin = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Fecha local "AAAA-MM-DD" (sin toISOString, que usa UTC). */
export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const parseYmd = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const startOfWeek = (d: Date) => addDays(d, -d.getDay());
export const sameDay = (a: Date, b: Date) => ymd(a) === ymd(b);
export const longDate = (s: string) => {
  const d = parseYmd(s);
  return `${DAYS_LONG[d.getDay()]}, ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
};

/** Reparte en carriles los bloques que se pisan en el tiempo para que se vean lado a lado. */
export function layoutLanes(list: ScheduleDTO[]) {
  const sorted = [...list].sort((a, b) => toMin(a.startTime) - toMin(b.startTime) || toMin(b.endTime) - toMin(a.endTime));
  const result = new Map<string, { lane: number; lanes: number }>();
  let cluster: { s: ScheduleDTO; lane: number }[] = [];
  let clusterEnd = -1;
  const laneEnds: number[] = [];
  const flush = () => {
    const lanes = cluster.reduce((m, c) => Math.max(m, c.lane + 1), 1);
    for (const c of cluster) result.set(c.s.id, { lane: c.lane, lanes });
    cluster = [];
  };
  for (const s of sorted) {
    const start = toMin(s.startTime);
    if (start >= clusterEnd) {
      flush();
      laneEnds.length = 0;
      clusterEnd = -1;
    }
    let lane = laneEnds.findIndex((end) => end <= start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = toMin(s.endTime);
    clusterEnd = Math.max(clusterEnd, toMin(s.endTime));
    cluster.push({ s, lane });
  }
  flush();
  return result;
}

const svg = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
export const IconChevronLeft = () => (
  <svg {...svg}>
    <path d="m15 18-6-6 6-6" />
  </svg>
);
export const IconChevronRight = () => (
  <svg {...svg}>
    <path d="m9 18 6-6-6-6" />
  </svg>
);
export const IconChevronDown = ({ className }: { className?: string }) => (
  <svg {...svg} width={16} height={16} className={className}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);
export const IconCal = ({ color, size = 16 }: { color?: string; size?: number }) => (
  <svg {...svg} width={size} height={size} style={{ color }}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M16 3v4M8 3v4M3 10h18" />
  </svg>
);
export const IconEye = ({ off }: { off?: boolean }) => (
  <svg {...svg} width={17} height={17}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
    {off && <path d="m3 3 18 18" />}
  </svg>
);
export const IconDots = () => (
  <svg {...svg} width={16} height={16}>
    <circle cx="5" cy="12" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
  </svg>
);
export const IconBack = () => (
  <svg {...svg}>
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
);
export const IconX = () => (
  <svg {...svg}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);
export const IconPlus = () => (
  <svg {...svg} width={16} height={16}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconSearch = () => (
  <svg {...svg} width={16} height={16}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);
export const IconScreen = () => (
  <svg {...svg} width={16} height={16}>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" />
  </svg>
);
export const IconFolderSm = () => (
  <svg {...svg} width={16} height={16}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
  </svg>
);
