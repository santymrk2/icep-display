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

Las migraciones y el bucket de MinIO se crean solos al arrancar.

> Con WSL2 hay que permitir el puerto 3000 en el firewall de Windows y que WSL sea accesible desde la LAN
> (modo de red `mirrored` en `.wslconfig`, o `netsh interface portproxy`). Esto hay que probarlo en la máquina real.

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

## Compatibilidad con TVs

El reproductor (`public/player.html`) es HTML + JavaScript ES5 plano, sin React ni Tailwind, para que corra en navegadores de TV viejos (Tizen, webOS, Android TV, MSX). Detalles:
- Guarda el token en `localStorage` y, si el TV no lo permite, en una cookie.
- Videos silenciados con `playsinline` (requisito de autoplay), con vigilancia: si un video se traba más de 20 s salta al siguiente o reintenta.
- Si se corta la red sigue mostrando lo último y reconecta solo; aparece un punto rojo abajo a la derecha mientras no hay conexión.
- Probado en Chromium moderno. **No probado en ningún TV real**: el punto crítico es el decodificado de video 4K; si un modelo no lo soporta, conviene subir videos en 1080p (H.264/MP4).

## Seguridad

- `ADMIN_PASSWORD` activa autenticación básica en `/dashboard` y `/api`. Sin definir, el panel queda abierto.
- `/player`, `/ws` y `/files` quedan abiertos en la LAN (los TV no tienen cómo loguearse). Para acceso remoto, exponer solo el panel por el túnel (Cloudflare Tunnel / NetBird) y mantener la contraseña puesta.
- La autenticación se hace en `server.ts` (no en middleware de Next, que rompe las subidas grandes). No hay usuarios ni roles todavía.

## Qué falta

Ver `PLAN.md`.
