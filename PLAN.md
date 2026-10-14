# Plan de implementación

Decisiones tomadas para arrancar (cambiables): una sola contraseña de administración, un solo servidor Node (Next + WebSocket en el mismo proceso), archivos servidos a través de la app, hora del servidor como zona horaria de la programación.

## Etapa 0: Scaffold (hecho)
Compose (db, minio, app), esquema Drizzle con las 5 entidades del SRS más carpetas, grupos y takeovers, WebSocket, subida en streaming a MinIO, reproductor, panel básico.
Verificado: `tsc` y `next build` pasan, `docker compose config` valida, y la API, el WebSocket y el reproductor funcionan contra un Postgres real y un MinIO simulado (el reproductor, en Chromium). **No probado**: Docker Compose, MinIO real, TVs reales, WSL2.

## Etapa 1: Primera versión usable (MVP)
Objetivo: reproducir contenido real en un TV de la iglesia.
0. Escala esperada: 2 o 3 pantallas, modelos de TV desconocidos. Por eso el reproductor es ES5 plano y no se optimiza para más.
1. Levantar con `docker compose up` en el servidor real y corregir lo que aparezca.
2. Probar el reproductor en el TV con MSX (localStorage, autoplay de video, reconexión, pantalla completa). Es el mayor riesgo técnico.
3. Probar la subida de un video 4K de varios GB por la LAN.
4. Emparejamiento, medios, presentaciones y takeover de punta a punta con 1-2 pantallas.
5. Acceso desde el celular/notebook por IP local.

## Etapa 2: Calendarios
- Pantalla de calendario semanal/mensual para crear bloques (inicio, fin, días, presentación, pantalla o grupo).
- Hoy el backend ya resuelve franjas semanales simples (`schedules`); falta la interfaz, validación de solapamientos y reglas más ricas (excepciones, fechas puntuales, `rrule`).
- Mostrar en Pantallas qué se está reproduciendo y por qué (takeover, programación, defecto).

## Etapa 3: Organización de medios
- Carpetas/colecciones en la UI (la tabla ya existe), mover archivos, búsqueda.
- Miniaturas reales de video (generadas al subir) y duración del video.
- Arrastrar y soltar para ordenar presentaciones.
- Grupos de pantallas.

## Etapa 4: Robustez en el TV
- Caché local en el reproductor (Cache API / service worker) para seguir funcionando si cae la red.
- Transiciones, precarga de video, indicador de estado, comandos remotos (recargar, siguiente slide).
- Estado "reproduciendo ahora" en tiempo real en el panel (WebSocket del lado admin).

## Etapa 5: Acceso remoto y seguridad
- Túnel (Cloudflare Tunnel o NetBird) solo para el panel.
- Usuarios y roles (admin / operador que solo hace takeovers), sesiones en lugar de Basic Auth, límites de subida.
- Respaldos de Postgres y MinIO, arranque automático del stack con Windows.

## Preguntas abiertas
- ¿Cuántas pantallas y qué modelo de TV? (define cuánto cuidar el rendimiento de video 4K en MSX)
- ¿Más de una persona va a operar el panel? ¿Hacen falta roles?
- ¿Texto/anuncios o URLs además de imagen y video? El SRS solo menciona imagen y video.
- ¿Cloudflare Tunnel o NetBird?
