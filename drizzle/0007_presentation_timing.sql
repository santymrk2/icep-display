ALTER TABLE "presentation_items" ADD COLUMN "sound" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "presentations" ADD COLUMN "default_duration_seconds" integer;