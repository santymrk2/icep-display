#!/usr/bin/env bash
# Respaldo de la base de datos y de los archivos multimedia.
# Uso (desde la carpeta del proyecto, dentro de WSL): ./scripts/backup.sh [carpeta-destino]
# Guarda los últimos 14 respaldos de cada tipo.
set -euo pipefail
cd "$(dirname "$0")/.."

DEST="${1:-./backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DEST"

echo "> Base de datos"
docker compose exec -T db pg_dump -U carteleria carteleria | gzip > "$DEST/db-$STAMP.sql.gz"

echo "> Archivos multimedia"
docker run --rm -v carteleria_miniodata:/data:ro -v "$(cd "$DEST" && pwd)":/backup alpine \
  tar czf "/backup/media-$STAMP.tgz" -C /data .

ls -1t "$DEST"/db-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm --
ls -1t "$DEST"/media-*.tgz 2>/dev/null | tail -n +15 | xargs -r rm --
echo "Listo: $DEST/db-$STAMP.sql.gz y $DEST/media-$STAMP.tgz"
