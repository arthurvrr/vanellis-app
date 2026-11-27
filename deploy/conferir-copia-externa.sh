#!/usr/bin/env bash
# Prova que a cópia externa serve para voltar (RQ35): baixa do Google Drive o backup mais recente,
# confere e restaura num Postgres TEMPORÁRIO, à parte. O banco do site não é tocado.
#
#   bash deploy/conferir-copia-externa.sh                 baixa do Drive e restaura (no servidor)
#   bash deploy/conferir-copia-externa.sh <arquivo.sql.gz> só restaura um arquivo já baixado
#
# No fim, mostra quantos produtos, cardápios e fotos o backup tem. O Postgres temporário e o
# arquivo baixado são apagados ao terminar.
set -euo pipefail
cd "$(dirname "$0")/.."

PASTA=backups/conferencia
BANCO="vanellis-conferencia-$$"

limpar() {
  docker rm -f "$BANCO" >/dev/null 2>&1 || true
  # O arquivo baixado é do usuário do container: apaga por dentro de um.
  if [ -d "$PASTA" ]; then
    docker run --rm -v "$PWD/backups":/backups --entrypoint sh rclone/rclone:1.69.1 \
      -c 'rm -rf /backups/conferencia' >/dev/null 2>&1 || true
  fi
}
trap limpar EXIT

if [ $# -ge 1 ]; then
  arquivo="$1"
else
  echo "==> Baixando do Drive o backup mais recente"
  docker compose run --rm -T -e COPIA_BAIXAR="/$PASTA" copia-externa
  arquivo="$(ls -1 "$PASTA"/vanellis-*.sql.gz | tail -n 1)"
fi
[ -f "$arquivo" ] || { echo "Arquivo não encontrado: $arquivo" >&2; exit 1; }

echo "==> Restaurando $(basename "$arquivo") num Postgres temporário"
docker run -d --name "$BANCO" -e POSTGRES_USER=vanellis -e POSTGRES_PASSWORD=conferencia \
  -e POSTGRES_DB=vanellis postgres:17-alpine >/dev/null
# Espera o banco aceitar consultas (na primeira subida, a imagem reinicia uma vez antes).
pronto=0
for _ in $(seq 1 60); do
  if docker exec "$BANCO" psql -U vanellis -d vanellis -qtAc 'select 1' >/dev/null 2>&1; then
    pronto=1
    break
  fi
  sleep 1
done
[ "$pronto" = 1 ] || { echo "O Postgres temporário não ficou pronto em 60 s." >&2; exit 1; }
sleep 2
gunzip -c "$arquivo" | docker exec -i "$BANCO" psql -U vanellis -d vanellis -v ON_ERROR_STOP=1 -q >/dev/null

contar() { docker exec "$BANCO" psql -U vanellis -d vanellis -tAc "select count(*) from $1"; }
echo
echo "Restaurado com sucesso: $(contar product) produto(s), $(contar category) cardápio(s), $(contar stored_image) foto(s)."
