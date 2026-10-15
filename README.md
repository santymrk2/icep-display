# Cartelería digital local

Plataforma web para manejar las pantallas de la iglesia desde la red local.
Stack: Next.js (App Router) + Postgres/Drizzle + MinIO + WebSockets, todo con Docker Compose.

## Instalar (servidor Windows con WSL2 + Docker)

```bash
cp .env.example .env      # editar contraseñas, ADMIN_PASSWORD y TZ
docker compose up -d --build
```

- Panel: `http://IP-DEL-SERVIDOR:3000/dashboard`
- Reproductor (lo que abre cada TV en MSX): `http://IP-DEL-SERVIDOR:3000/player`
- En Media Station X: Settings → Start Parameter → Setup, escribir solo `IP-DEL-SERVIDOR:3000` (sin `/`). MSX pide `/msx/start.json` y desde ahí abre el reproductor.

Las migraciones y el bucket de MinIO se crean solos al arrancar.

> Con WSL2 hay que permitir el puerto 3000 en el firewall de Windows y que WSL sea accesible desde la LAN
> (modo de red `mirrored` en `.wslconfig`, o `netsh interface portproxy`). Esto hay que probarlo en la máquina real.

> **Sobre la imagen de MinIO:** `minio/minio` ya no existe en Docker Hub. El compose usa `bitnamilegacy/minio` fijada en la versión 2025.7.23 (una build real de MinIO, pero congelada: no recibe actualizaciones de seguridad). Como MinIO no se publica fuera de Docker, el riesgo en una red local es bajo. Para migrar más adelante a otro almacenamiento compatible con S3 alcanza con cambiar la imagen y las variables en `docker-compose.yml`; el código solo usa la API S3.

## Desarrollo

```bash
docker compose -f docker-compose.dev.yml up -d
cp .env.dev.example .env.dev
npm install
npm run dev
```

Si cambiás `src/db/schema.ts`: `npm run db:generate` y se aplica al reiniciar.

## Cómo funciona

- `server.ts`: servidor Node propio que sirve Next, el WebSocket en `/ws` y `/files/*` (proxy a MinIO con soporte de Range para videos). MinIO no se publica al exterior.
- Emparejamiento: el TV abre `/player`, recibe un código de 4 dígitos por WebSocket; el admin lo ingresa en Pantallas y el servidor le entrega un token que el TV guarda.
- Qué se muestra (`src/lib/playback.ts`): takeover activo > programación vigente > presentación por defecto de la pantalla.
- Cada cambio (guardar presentación, takeover, etc.) vuelve a calcular y empuja el contenido a las pantallas conectadas; además hay un chequeo cada 30 s para horarios y takeovers que vencen.

## Calendario

- `/dashboard/calendar`: grilla semanal (06:00–23:00). Cada bloque es una franja de `schedules` con presentación, pantalla (o todas), días y horario; clic en un bloque para editarlo.
- Los días se guardan como bitmask (bit 0 = domingo ... bit 6 = sábado) y las horas como `HH:MM:SS` en la zona horaria del servidor (`TZ`).
- Los bloques desactivados se ven atenuados y no se reproducen. Si varios bloques se superponen, gana el de mayor `priority` (por ahora siempre 0, así que se usa el orden de la base).
- API: `/api/schedules` (GET, POST) y `/api/schedules/[id]` (PATCH, DELETE). Cada cambio vuelve a calcular lo que muestra cada pantalla.

## Compatibilidad con TVs

El reproductor (`public/player.html`) es HTML + JavaScript ES5 plano, sin React ni Tailwind, para que corra en navegadores de TV viejos (Tizen, webOS, Android TV, MSX). Detalles:
- Guarda el token en `localStorage` y, si el TV no lo permite, en una cookie.
- Videos silenciados con `playsinline` (requisito de autoplay), con vigilancia: si un video se traba más de 20 s salta al siguiente o reintenta.
- Si se corta la red sigue mostrando lo último y reconecta solo; aparece un punto rojo abajo a la derecha mientras no hay conexión.
- Probado en Chromium moderno. **No probado en ningún TV real**: el punto crítico es el decodificado de video 4K; si un modelo no lo soporta, conviene subir videos en 1080p (H.264/MP4).

## Seguridad y usuarios

- El panel y la API piden iniciar sesión (`/login`). Hay dos roles: **administrador** (todo) y **operador** (ver y poner contenido "al aire").
- El primer administrador se crea al arrancar por primera vez, con `ADMIN_USER` y `ADMIN_PASSWORD`; si no definís la contraseña se genera una y se imprime en `docker compose logs app`. Después, usuarios y contraseñas se gestionan desde **Usuarios** en el panel.
- `/player`, `/ws` y `/files` quedan abiertos en la LAN (los TV no tienen cómo loguearse). Para acceso remoto, exponer solo el panel por el túnel.
- La autenticación está en `server.ts` (no en middleware de Next, que rompe las subidas grandes). Las sesiones se guardan hasheadas en Postgres y duran 30 días; hay límite de intentos de login por IP.

## Instalación en Windows, respaldos y acceso remoto

Ver `docs/WINDOWS.md` y `scripts/backup.sh`.

## Qué falta

Ver `PLAN.md`.
