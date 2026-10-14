#!/usr/bin/env bash
# Restaura un respaldo. Reemplaza TODO el contenido actual.
# Uso: ./scripts/restore.sh backups/db-AAAAMMDD-HHMMSS.sql.gz backups/media-AAAAMMDD-HHMMSS.tgz
set -euo pipefail
cd "$(dirname "$0")/.."
[ $# -eq 2 ] || { echo "Uso: $0 <db.sql.gz> <media.tgz>"; exit 1; }
read -r -p "Esto borra los datos actuales. ¿Seguir? (escribí SI) " ok
[ "$ok" = "SI" ] || exit 1

docker compose stop app
docker compose exec -T db psql -U carteleria -d postgres -c "DROP DATABASE IF EXISTS carteleria WITH (FORCE);" -c "CREATE DATABASE carteleria OWNER carteleria;"
gunzip -c "$1" | docker compose exec -T db psql -U carteleria -d carteleria
docker run --rm -v carteleria_miniodata:/data -v "$(cd "$(dirname "$2")" && pwd)":/backup alpine \
  sh -c "rm -rf /data/* /data/.minio.sys && tar xzf /backup/$(basename "$2") -C /data"
docker compose restart minio
docker compose start app
