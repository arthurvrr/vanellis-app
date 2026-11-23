#!/usr/bin/env bash
# Restaura o banco a partir de um backup de ./backups. SUBSTITUI os dados atuais.
#
#   bash deploy/restore.sh backups/vanellis-2026-12-01_0300.sql.gz
set -euo pipefail
cd "$(dirname "$0")/.."
file="${1:?Informe o arquivo de backup, ex: backups/vanellis-2026-12-01_0300.sql.gz}"
[ -f "$file" ] || { echo "Arquivo não encontrado: $file" >&2; exit 1; }

read -r -p "Isso substitui TODOS os dados atuais pelo backup $file. Continuar? (digite sim) " ok
[ "$ok" = "sim" ] || { echo "Cancelado."; exit 1; }

docker compose stop app
gunzip -c "$file" | docker compose exec -T db psql -U vanellis -d vanellis -v ON_ERROR_STOP=1 >/dev/null
docker compose start app
echo "Banco restaurado a partir de $file."
