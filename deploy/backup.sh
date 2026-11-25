#!/bin/sh
# Backup do banco (RNF11): um ao subir e depois um por dia, no horário BACKUP_HOUR, em ./backups.
# As fotos ficam no banco (RN56) e vão junto. Teste: deploy/testar-backup.sh.
#
# Um backup só é aceito depois de conferido (G06): se o pg_dump falhar, nenhum arquivo é salvo,
# a falha é registrada e nenhum backup antigo é apagado. A rotação mantém sempre os 7 mais
# recentes; dos outros, apaga os de mais de BACKUP_KEEP_DAYS dias.
#
# BACKUP_ONCE=1 faz um backup só e sai (código 0 = deu certo), para testes e uso manual.
set -eu
set -o pipefail
HOUR="${BACKUP_HOUR:-03}"
KEEP="${BACKUP_KEEP_DAYS:-14}"
MIN_KEEP=7

log() { echo "$(date '+%F %T') $*"; }
falha() {
  echo "$(date '+%F %T') FALHA no backup: $*" >&2
  return 1
}

backup() {
  file="/backups/vanellis-$(date +%Y-%m-%d_%H%M).sql.gz"
  tmp="$file.tmp"
  rm -f /backups/*.tmp
  if ! pg_dump --no-owner --clean --if-exists | gzip >"$tmp"; then
    rm -f "$tmp"
    falha "o pg_dump não terminou (banco fora do ar ou sem acesso?)"
    return 1
  fi
  # Confere antes de aceitar: gzip íntegro e o dump até o fim.
  if ! gzip -t "$tmp" 2>/dev/null || ! gunzip -c "$tmp" | tail -n 5 | grep -q 'PostgreSQL database dump complete'; then
    rm -f "$tmp"
    falha "o arquivo gerado está incompleto"
    return 1
  fi
  mv "$tmp" "$file"
  log "backup salvo: $file ($(du -h "$file" | cut -f1))"
  rotacionar
}

# Só roda depois de um backup bom. Mantém sempre os MIN_KEEP mais recentes; dos outros, apaga os
# de mais de KEEP dias (assim uma sequência de falhas nunca deixa a pasta sem backup).
rotacionar() {
  ls -1t /backups/vanellis-*.sql.gz 2>/dev/null | tail -n +$((MIN_KEEP + 1)) | while read -r antigo; do
    if [ -n "$(find "$antigo" -mtime +"$KEEP")" ]; then
      rm -f "$antigo"
      log "backup antigo apagado: $antigo"
    fi
  done
}

if [ "${BACKUP_ONCE:-}" = 1 ]; then
  backup
  exit
fi

backup || true
last="$(date +%F)"
while true; do
  sleep 600
  if [ "$(date +%H)" = "$HOUR" ] && [ "$(date +%F)" != "$last" ]; then
    backup || true
    last="$(date +%F)"
  fi
done
