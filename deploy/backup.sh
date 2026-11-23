#!/bin/sh
# Backup do banco (RNF11): um ao subir e depois um por dia, no horário BACKUP_HOUR, guardando
# os últimos BACKUP_KEEP_DAYS dias em ./backups. As fotos ficam no banco (RN56) e vão junto.
set -eu
HOUR="${BACKUP_HOUR:-03}"
KEEP="${BACKUP_KEEP_DAYS:-14}"

backup() {
  file="/backups/vanellis-$(date +%Y-%m-%d_%H%M).sql.gz"
  if pg_dump --no-owner --clean --if-exists | gzip > "$file.tmp"; then
    mv "$file.tmp" "$file"
    echo "$(date '+%F %T') backup salvo: $file ($(du -h "$file" | cut -f1))"
  else
    rm -f "$file.tmp"
    echo "$(date '+%F %T') FALHA no backup" >&2
  fi
  find /backups -name 'vanellis-*.sql.gz' -mtime +"$KEEP" -delete
}

backup
last="$(date +%F)"
while true; do
  sleep 600
  if [ "$(date +%H)" = "$HOUR" ] && [ "$(date +%F)" != "$last" ]; then
    backup
    last="$(date +%F)"
  fi
done
