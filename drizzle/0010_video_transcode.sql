ALTER TABLE "media_assets" ADD COLUMN "processing" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Los videos que ya estaban subidos se convierten al arrancar (ver src/lib/transcode.ts).
UPDATE "media_assets" SET "processing" = true WHERE "kind" = 'video';
