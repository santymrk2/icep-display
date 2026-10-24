ALTER TABLE "meeting_types" ADD COLUMN "default_start_time" time;--> statement-breakpoint
-- Tipos de reunión de la base de la iglesia, con la hora habitual que usa la página web.
INSERT INTO "meeting_types" ("name", "default_start_time", "minutes_before")
SELECT v.name, v.t::time, v.before FROM (VALUES
	('Santa Cena', '09:00', 60),
	('Reunión de Enseñanza', '10:00', 120),
	('Escuela Bíblica Dominical', '11:30', 60),
	('Activados', '14:30', 60),
	('Encuentro de Jóvenes', '19:00', 60),
	('Encuentro de Mujeres', '17:00', 60),
	('Encuentro de Matrimonios', NULL, 60),
	('Encuentro de Oración', '20:00', 60)
) AS v(name, t, before)
WHERE NOT EXISTS (SELECT 1 FROM "meeting_types" m WHERE lower(m.name) = lower(v.name));
