import { sql } from "drizzle-orm";
import {
  pgTable,
  type AnyPgColumn,
  uuid,
  text,
  integer,
  bigint,
  timestamp,
  boolean,
  pgEnum,
  smallint,
  time,
  date,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

export const mediaKind = pgEnum("media_kind", ["image", "video"]);
export const orientation = pgEnum("orientation", ["landscape", "portrait"]);
export const transitionKind = pgEnum("transition_kind", ["cut", "dissolve"]);
export const recurrenceFreq = pgEnum("recurrence_freq", ["none", "day", "week", "month", "year"]);
export const recurrenceEnd = pgEnum("recurrence_end", ["never", "on", "after"]);
export const userRole = pgEnum("user_role", ["admin", "operator"]);

/** Carpetas / colecciones virtuales para organizar medios. */
export const mediaFolders = pgTable("media_folders", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** Carpeta que la contiene; null = raíz ("Mi biblioteca"). */
  parentId: uuid("parent_id").references((): AnyPgColumn => mediaFolders.id, { onDelete: "set null" }),
  /** Color del ícono de la carpeta (hex). */
  color: text("color").notNull().default("#3b82f6"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Catálogo de archivos almacenados en MinIO. */
export const mediaAssets = pgTable("media_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  originalName: text("original_name").notNull(),
  objectKey: text("object_key").notNull().unique(),
  mimeType: text("mime_type").notNull(),
  kind: mediaKind("kind").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  /** Miniatura JPEG generada en el navegador al subir (clave en MinIO). */
  thumbnailKey: text("thumbnail_key"),
  /** Duración en segundos (solo videos), medida en el navegador al subir. */
  durationSeconds: integer("duration_seconds"),
  /** Resolución en píxeles, medida en el navegador al subir. */
  width: integer("width"),
  height: integer("height"),
  /** Video en conversión a un formato que reproduzca cualquier TV (ver lib/transcode.ts). Mientras tanto no se envía a las pantallas. */
  processing: boolean("processing").notNull().default(false),
  folderId: uuid("folder_id").references(() => mediaFolders.id, { onDelete: "set null" }),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Carpetas para ordenar presentaciones. */
export const presentationFolders = pgTable("presentation_folders", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Contenedor de listas de reproducción. */
export const presentations = pgTable("presentations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  folderId: uuid("folder_id").references(() => presentationFolders.id, { onDelete: "set null" }),
  description: text("description"),
  /** Orientación de pantalla para la que se diseñó la presentación. */
  orientation: orientation("orientation").notNull().default("landscape"),
  transition: transitionKind("transition").notNull().default("cut"),
  /** Segundos que dura cada imagen sin duración propia; null = 10 s. */
  defaultDurationSeconds: integer("default_duration_seconds"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Elementos ordenados de una presentación. */
export const presentationItems = pgTable(
  "presentation_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    presentationId: uuid("presentation_id")
      .notNull()
      .references(() => presentations.id, { onDelete: "cascade" }),
    /** null = encabezado de sección (agrupa los elementos que le siguen). */
    mediaAssetId: uuid("media_asset_id").references(() => mediaAssets.id, { onDelete: "cascade" }),
    sectionName: text("section_name"),
    /** Cómo se ajusta a la pantalla: "contain" (entero) o "cover" (llena y recorta). */
    fit: text("fit").notNull().default("contain"),
    /** Transición propia de este elemento; null = la de la presentación. */
    transition: transitionKind("transition"),
    /** Giro (0/90/180/270) y espejo del elemento. */
    rotation: smallint("rotation").notNull().default(0),
    flipH: boolean("flip_h").notNull().default(false),
    flipV: boolean("flip_v").notNull().default(false),
    /** Videos: reproducir con sonido (si el navegador de la pantalla lo permite). */
    sound: boolean("sound").notNull().default(false),
    position: integer("position").notNull(),
    /** Duración para imágenes. Los videos usan su duración real si es null. */
    durationSeconds: integer("duration_seconds"),
  },
  (t) => [index("presentation_items_presentation_idx").on(t.presentationId, t.position)],
);

/** Grupos de pantallas (ej. "Hall", "Salón principal"). */
export const deviceGroups = pgTable("device_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
});

/** Calendarios: cada pantalla se suscribe a uno y reproduce sus eventos. */
export const calendars = pgTable("calendars", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#e11d48"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Smart TVs / clientes autorizados. */
export const devices = pgTable("devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  location: text("location"),
  /** Secreto que guarda el reproductor tras el emparejamiento. */
  connectionToken: text("connection_token").notNull().unique(),
  groupId: uuid("group_id").references(() => deviceGroups.id, { onDelete: "set null" }),
  tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
  /** Calendario al que está suscripta (null = sin calendario). */
  calendarId: uuid("calendar_id").references(() => calendars.id, { onDelete: "set null" }),
  /** Presentación por defecto cuando no hay programación ni takeover activo. */
  defaultPresentationId: uuid("default_presentation_id").references(() => presentations.id, {
    onDelete: "set null",
  }),
  /** Resolución reportada por el reproductor (en píxeles CSS, ya con la rotación aplicada). */
  screenWidth: integer("screen_width"),
  screenHeight: integer("screen_height"),
  /** Giro en grados (0/90/180/270) para TVs montados al revés o en vertical sin opción en el TV. */
  rotation: smallint("rotation").notNull().default(0),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Programación. Apunta a un dispositivo o a un grupo (uno de los dos, o ninguno = todas).
 * Regla semanal simple: días de la semana (bitmask, bit 0 = domingo) + franja horaria.
 * rrule queda reservado para reglas más complejas (etapa de calendarios).
 */
export const schedules = pgTable("schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  presentationId: uuid("presentation_id")
    .notNull()
    .references(() => presentations.id, { onDelete: "cascade" }),
  groupId: uuid("group_id").references(() => deviceGroups.id, { onDelete: "cascade" }),
  calendarId: uuid("calendar_id")
    .notNull()
    .references(() => calendars.id, { onDelete: "cascade" }),
  allDay: boolean("all_day").notNull().default(false),
  /** Repetición: none = evento único (en validFrom); si no, cada `interval` días/semanas/meses/años. */
  freq: recurrenceFreq("freq").notNull().default("week"),
  interval: integer("interval").notNull().default(1),
  /** Cuándo termina: nunca, en la fecha validUntil, o tras `endsAfter` repeticiones. */
  endsMode: recurrenceEnd("ends_mode").notNull().default("never"),
  endsAfter: integer("ends_after"),
  /** Días de la semana (bitmask) para repeticiones semanales. */
  daysOfWeek: smallint("days_of_week").notNull().default(127),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  validFrom: date("valid_from"),
  validUntil: date("valid_until"),
  rrule: text("rrule"),
  priority: integer("priority").notNull().default(0),
  enabled: boolean("enabled").notNull().default(true),
  /** Reunión de Notion de la que sale este evento (null = creado a mano). Se sincroniza solo. */
  notionPageId: text("notion_page_id").unique(),
  meetingTypeId: uuid("meeting_type_id").references((): AnyPgColumn => meetingTypes.id, { onDelete: "cascade" }),
});

/**
 * Tipos de reunión de Notion (ej. "Reunión de oración"). Notion solo trae el inicio; acá se define
 * cuánto antes empieza a mostrarse, cuánto después termina y qué presentación usar.
 */
export const meetingTypes = pgTable("meeting_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Nombre tal cual aparece en Notion. */
  name: text("name").notNull().unique(),
  /** Sin presentación no se crean eventos para este tipo. */
  presentationId: uuid("presentation_id").references(() => presentations.id, { onDelete: "set null" }),
  /** null = el primer calendario. */
  calendarId: uuid("calendar_id").references(() => calendars.id, { onDelete: "set null" }),
  /** Hora de inicio si en Notion la reunión tiene solo fecha ("HH:MM:SS"); null = se ignora. */
  defaultStartTime: time("default_start_time"),
  minutesBefore: integer("minutes_before").notNull().default(60),
  minutesAfter: integer("minutes_after").notNull().default(150),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Pantallas a las que apunta un bloque (varias a la vez). Sin filas ni grupo = todas las pantallas. */
export const scheduleDevices = pgTable(
  "schedule_devices",
  {
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => schedules.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.scheduleId, t.deviceId] })],
);

/** Toma de control: interrumpe todo lo demás hasta que se cierre o expire. */
export const takeovers = pgTable("takeovers", {
  id: uuid("id").primaryKey().defaultRandom(),
  mediaAssetId: uuid("media_asset_id").references(() => mediaAssets.id, { onDelete: "cascade" }),
  presentationId: uuid("presentation_id").references(() => presentations.id, {
    onDelete: "cascade",
  }),
  /** null = todas las pantallas. */
  deviceId: uuid("device_id").references(() => devices.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

export type MediaAsset = typeof mediaAssets.$inferSelect;
export type Device = typeof devices.$inferSelect;
export type Presentation = typeof presentations.$inferSelect;

/** Usuarios del panel. "admin" gestiona todo; "operator" solo ve y hace tomas de control. */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull().default("operator"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Sesiones del panel. Se guarda el hash SHA-256 del token, nunca el token. */
export const sessions = pgTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export type User = typeof users.$inferSelect;

/** Etiquetas del panel (las pantallas guardan el nombre en devices.tags). */
export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Ajustes globales clave/valor: timezone, defaultBackgroundId, sharePreviewLinks. */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
