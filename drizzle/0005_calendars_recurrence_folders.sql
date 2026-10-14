CREATE TYPE "public"."recurrence_end" AS ENUM('never', 'on', 'after');--> statement-breakpoint
CREATE TYPE "public"."recurrence_freq" AS ENUM('none', 'day', 'week', 'month', 'year');--> statement-breakpoint
CREATE TABLE "calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#e11d48' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "presentation_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "calendar_id" uuid;--> statement-breakpoint
ALTER TABLE "media_folders" ADD COLUMN "color" text DEFAULT '#3b82f6' NOT NULL;--> statement-breakpoint
ALTER TABLE "presentations" ADD COLUMN "folder_id" uuid;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "calendar_id" uuid;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "all_day" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "freq" "recurrence_freq" DEFAULT 'week' NOT NULL;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "interval" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "ends_mode" "recurrence_end" DEFAULT 'never' NOT NULL;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "ends_after" integer;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentations" ADD CONSTRAINT "presentations_folder_id_presentation_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."presentation_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "calendars" ("name") VALUES ('Calendario por defecto');--> statement-breakpoint
UPDATE "schedules" SET "calendar_id" = (SELECT "id" FROM "calendars" ORDER BY "created_at" LIMIT 1);--> statement-breakpoint
UPDATE "devices" SET "calendar_id" = (SELECT "id" FROM "calendars" ORDER BY "created_at" LIMIT 1);--> statement-breakpoint
UPDATE "schedules" SET "ends_mode" = 'on' WHERE "valid_until" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "schedules" ALTER COLUMN "calendar_id" SET NOT NULL;