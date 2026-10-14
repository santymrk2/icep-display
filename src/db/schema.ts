import {
  pgTable,
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
} from "drizzle-orm/pg-core";

export const mediaKind = pgEnum("media_kind", ["image", "video"]);

/** Carpetas / colecciones virtuales para organizar medios. */
export const mediaFolders = pgTable("media_folders", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
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
  folderId: uuid("folder_id").references(() => mediaFolders.id, { onDelete: "set null" }),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Contenedor de listas de reproducción. */
export const presentations = pgTable("presentations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
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
    mediaAssetId: uuid("media_asset_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
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

/** Smart TVs / clientes autorizados. */
export const devices = pgTable("devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  location: text("location"),
  /** Secreto que guarda el reproductor tras el emparejamiento. */
  connectionToken: text("connection_token").notNull().unique(),
  groupId: uuid("group_id").references(() => deviceGroups.id, { onDelete: "set null" }),
  /** Presentación por defecto cuando no hay programación ni takeover activo. */
  defaultPresentationId: uuid("default_presentation_id").references(() => presentations.id, {
    onDelete: "set null",
  }),
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
  deviceId: uuid("device_id").references(() => devices.id, { onDelete: "cascade" }),
  groupId: uuid("group_id").references(() => deviceGroups.id, { onDelete: "cascade" }),
  daysOfWeek: smallint("days_of_week").notNull().default(127),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  validFrom: date("valid_from"),
  validUntil: date("valid_until"),
  rrule: text("rrule"),
  priority: integer("priority").notNull().default(0),
  enabled: boolean("enabled").notNull().default(true),
});

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
