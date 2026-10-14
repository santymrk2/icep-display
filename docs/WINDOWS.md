# Instalación en el servidor Windows (WSL2)

Todo esto es una guía; no se probó en una máquina real todavía. Si algo no coincide, avisá y se ajusta.

## 1. Requisitos
- Windows 10/11 con WSL2 y una distro (Ubuntu) instalada.
- Docker Engine dentro de WSL (o Docker Desktop con integración WSL).
- Una IP fija para el servidor en el router (reserva DHCP), para que los TVs siempre encuentren la misma dirección.

## 2. Instalar
```bash
git clone https://github.com/santymrk2/icep-display.git carteleria
cd carteleria
cp .env.example .env     # cambiar las contraseñas
docker compose up -d --build
docker compose logs app  # si no definiste ADMIN_PASSWORD, la contraseña inicial aparece acá
```
Los contenedores tienen `restart: unless-stopped`, así que vuelven solos si Docker arranca.

## 3. Que los TVs y otras PCs lleguen al servidor
WSL2 por defecto está en una red virtual que la LAN no ve. Opciones:
- **Recomendada (Windows 11 22H2+):** en `C:\Users\<vos>\.wslconfig` poner
  ```
  [wsl2]
  networkingMode=mirrored
  ```
  y ejecutar `wsl --shutdown`. Después permitir el puerto 3000 en el Firewall de Windows (regla de entrada TCP 3000, solo red privada).
- **Alternativa:** reenviar el puerto con `netsh interface portproxy add v4tov4 listenport=3000 listenaddress=0.0.0.0 connectport=3000 connectaddress=<IP de WSL>` (la IP de WSL cambia al reiniciar; hay que reaplicarlo).

Prueba: desde otra PC de la red abrir `http://IP-DEL-SERVIDOR:3000/login`.

## 4. Arranque automático al encender Windows
Crear una tarea en el Programador de tareas (al iniciar sesión o al arrancar el sistema) que ejecute:
```
wsl.exe -d Ubuntu -u root -- bash -lc "service docker start; cd /ruta/a/carteleria && docker compose up -d"
```
(Cambiar `Ubuntu` y la ruta. Si usás Docker Desktop, alcanza con que Docker Desktop arranque con Windows.)
Conviene también desactivar la suspensión del equipo.

## 5. Respaldos
```bash
./scripts/backup.sh /mnt/d/respaldos-carteleria   # base de datos y medios
```
Se puede programar igual que el paso 4 (una vez por semana). Para restaurar: `./scripts/restore.sh <db.sql.gz> <media.tgz>`.

## 6. Acceso desde afuera (opcional)
Exponer **solo el panel**, nunca abrir puertos en el router:
- **Cloudflare Tunnel:** `cloudflared tunnel --url http://localhost:3000` (o un túnel con nombre apuntando a `localhost:3000`). Protegerlo además con Cloudflare Access.
- **NetBird/Tailscale:** instalar el cliente en el servidor y en tu celular/PC, y entrar por la IP de la red mesh.
Los TVs siguen entrando por la LAN. Con un túnel HTTPS, las cookies de sesión pasan a ser `Secure` automáticamente.
