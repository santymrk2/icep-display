CREATE TYPE "public"."orientation" AS ENUM('landscape', 'portrait');--> statement-breakpoint
CREATE TYPE "public"."transition_kind" AS ENUM('cut', 'dissolve');--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "presentation_items" ALTER COLUMN "media_asset_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "screen_width" integer;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "screen_height" integer;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "rotation" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "width" integer;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "height" integer;--> statement-breakpoint
ALTER TABLE "presentation_items" ADD COLUMN "section_name" text;--> statement-breakpoint
ALTER TABLE "presentation_items" ADD COLUMN "fit" text DEFAULT 'contain' NOT NULL;--> statement-breakpoint
ALTER TABLE "presentations" ADD COLUMN "orientation" "orientation" DEFAULT 'landscape' NOT NULL;--> statement-breakpoint
ALTER TABLE "presentations" ADD COLUMN "transition" "transition_kind" DEFAULT 'cut' NOT NULL;