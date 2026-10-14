CREATE TABLE "schedule_devices" (
	"schedule_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	CONSTRAINT "schedule_devices_schedule_id_device_id_pk" PRIMARY KEY("schedule_id","device_id")
);
--> statement-breakpoint
ALTER TABLE "schedules" DROP CONSTRAINT "schedules_device_id_devices_id_fk";
--> statement-breakpoint
ALTER TABLE "schedule_devices" ADD CONSTRAINT "schedule_devices_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_devices" ADD CONSTRAINT "schedule_devices_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "schedule_devices" ("schedule_id", "device_id") SELECT "id", "device_id" FROM "schedules" WHERE "device_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "schedules" DROP COLUMN "device_id";