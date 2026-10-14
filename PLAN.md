# Plan de implementación y estado

Escala esperada: 2 o 3 pantallas, modelos de TV desconocidos (por eso el reproductor es ES5 plano).

## Hecho (probado en Chromium contra Postgres; MinIO simulado)
- Stack Docker Compose (db, minio, app), esquema Drizzle, WebSocket, subida en streaming, reproductor, panel.
- Calendario semanal/diario/mensual, detección de solapamientos, grupos de pantallas (los bloques de una pantalla ganan sobre los de su grupo, y estos sobre "todas").
- Medios: carpetas, miniaturas reales (generadas en el navegador) y duración de video.
- Pantallas: etiquetas, grupo, filtros, panel de detalle.
- Presentaciones: editor con arrastrar para ordenar y vista previa.
- Usuarios con login (administrador y operador), sesiones, límite de intentos.
- Reproductor: reconexión automática, vigilancia de videos trabados, sigue mostrando lo último si cae el servidor, arranca con la última lista guardada.
- Respaldos (`scripts/backup.sh`) y guía de instalación en Windows (`docs/WINDOWS.md`).

## No probado (necesita tu servidor y tus TVs)
- `docker compose up` real, MinIO real, WSL2 y red de la LAN, arranque automático, respaldos y restauración.
- Reproductor en TVs reales con MSX; video 4K (si un modelo no lo soporta, usar 1080p H.264/MP4).
- Túnel (Cloudflare o NetBird).
- Arrastrar filas con el mouse y otras interacciones finas del panel; uso desde celular.

## Limitaciones conocidas
- Si el servidor está caído al encender el TV, la página del reproductor no carga (no hay service worker; es una decisión por compatibilidad con TVs viejos).
- Las miniaturas se generan al subir: los archivos subidos antes no tienen (hay que volver a subirlos).
- Los bloques del calendario se repiten cada semana; no hay excepciones por fecha ni reglas tipo "cada 2 semanas" todavía (la columna `rrule` está reservada).
- Antes de producción conviene un chequeo de la tabla `schedules` si se editan bloques a la vez desde dos navegadores (la detección de solapamientos no es transaccional).

## Paridad con la nueva interfaz (PR "parity-for-new-ui")

Hecho: orientación horizontal/vertical por presentación; la pantalla reporta su resolución y el panel avisa si la orientación no coincide; giro de pantalla (0/90/180/270); transición corte/disolver (por presentación y por elemento); secciones; panel de detalle por elemento (escala, giro, espejo, duración); ajustes (zona horaria, fondo predeterminado, enlaces de vista previa); etiquetas; filtros de pantallas; inspector de medios.

Pendiente: calendarios múltiples (cada pantalla suscripta a un calendario), enlaces públicos de vista previa (el interruptor existe, todavía no genera enlaces), carpetas de presentaciones, proveedores de contenido.

Un bloque del calendario puede apuntar a varias pantallas elegidas a la vez (tabla `schedule_devices`), a un grupo o a todas; el calendario se puede filtrar por pantalla.
