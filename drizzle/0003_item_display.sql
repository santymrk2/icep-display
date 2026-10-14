ALTER TABLE "presentation_items" ADD COLUMN "transition" "transition_kind";--> statement-breakpoint
ALTER TABLE "presentation_items" ADD COLUMN "rotation" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "presentation_items" ADD COLUMN "flip_h" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "presentation_items" ADD COLUMN "flip_v" boolean DEFAULT false NOT NULL;