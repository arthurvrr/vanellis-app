#!/usr/bin/env bash
# Teste do backup (G06): roda o deploy/backup.sh de verdade, na mesma imagem do servidor
# (postgres:17-alpine), contra um Postgres de teste num container. Precisa só de Docker.
#
#   bash deploy/testar-backup.sh
#
# Casos:
#   1. backup bom: um arquivo novo, completo e conferido;
#   2. banco fora do ar: nenhum arquivo novo, registro de FALHA, nada antigo apagado;
#   3. rotação: depois de um backup bom, os 7 mais recentes ficam sempre; dos outros, só os de
#      mais de BACKUP_KEEP_DAYS dias saem.
set -euo pipefail
cd "$(dirname "$0")"

IMAGEM=postgres:17-alpine
REDE="vanellis-teste-backup-$$"
BANCO="vanellis-teste-backup-db-$$"
PASTA="$(mktemp -d)"
FALHAS=0

limpar() {
  docker rm -f "$BANCO" >/dev/null 2>&1 || true
  docker network rm "$REDE" >/dev/null 2>&1 || true
  # Os arquivos do teste foram criados pelo container (outro usuário): apaga por dentro dele.
  docker run --rm -v "$PASTA":/backups "$IMAGEM" sh -c 'rm -rf /backups/* /backups/.[!.]*' >/dev/null 2>&1 || true
  rmdir "$PASTA" 2>/dev/null || true
}
trap limpar EXIT

ok() { echo "  ok: $*"; }
falhou() {
  echo "  FALHOU: $*" >&2
  FALHAS=$((FALHAS + 1))
}

# Roda o backup uma vez. $1 = host do banco (um host que não existe simula o banco fora do ar).
rodar_backup() {
  docker run --rm --network "$REDE" -v "$PASTA":/backups -v "$PWD/backup.sh":/backup.sh:ro \
    -e PGHOST="$1" -e PGUSER=vanellis -e PGPASSWORD=teste -e PGDATABASE=vanellis \
    -e BACKUP_ONCE=1 -e BACKUP_KEEP_DAYS=14 "$IMAGEM" sh /backup.sh
}

# Lista os backups (nome e idade em dias), de dentro de um container com acesso à pasta.
backups() { docker run --rm -v "$PASTA":/backups "$IMAGEM" sh -c 'ls -1 /backups 2>/dev/null | grep "^vanellis-" || true'; }

echo "==> Subindo um Postgres de teste"
docker network create "$REDE" >/dev/null
docker run -d --name "$BANCO" --network "$REDE" -e POSTGRES_USER=vanellis -e POSTGRES_PASSWORD=teste \
  -e POSTGRES_DB=vanellis "$IMAGEM" >/dev/null
for _ in $(seq 1 30); do
  docker exec "$BANCO" pg_isready -U vanellis -d vanellis >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$BANCO" psql -U vanellis -d vanellis -q -c \
  "create table produto (id int primary key, nome text); insert into produto values (1, 'Coxinha');"

echo "==> 1. Backup bom"
if rodar_backup "$BANCO"; then ok "o script terminou sem erro"; else falhou "o script deu erro com o banco no ar"; fi
novo="$(backups | grep '\.sql\.gz$' | tail -n 1)"
if [ -n "$novo" ] && docker run --rm -v "$PASTA":/backups "$IMAGEM" sh -c \
  "gunzip -c /backups/$novo | grep -q 'Coxinha' && gunzip -c /backups/$novo | tail -n 5 | grep -q 'PostgreSQL database dump complete'"; then
  ok "backup $novo completo, com os dados"
else
  falhou "não há backup completo depois de um backup bom"
fi

echo "==> 2. Banco fora do ar"
# Backups antigos (30 dias), que não podem ser apagados por causa de uma falha.
docker run --rm -v "$PASTA":/backups "$IMAGEM" sh -c \
  'for i in 1 2 3; do echo velho > /backups/vanellis-2026-10-0${i}_0300.sql.gz; touch -d "@$(( $(date +%s) - 30 * 86400 ))" /backups/vanellis-2026-10-0${i}_0300.sql.gz; done'
antes="$(backups | wc -l)"
if rodar_backup host-que-nao-existe 2>"$PASTA.err"; then
  falhou "o script terminou sem erro com o banco fora do ar"
else
  ok "o script terminou com erro"
fi
grep -q 'FALHA' "$PASTA.err" && ok "registrou FALHA" || falhou "não registrou FALHA"
rm -f "$PASTA.err"
depois="$(backups | wc -l)"
[ "$depois" = "$antes" ] && ok "nenhum arquivo novo e nenhum antigo apagado ($depois arquivos)" ||
  falhou "a falha mudou os arquivos: antes $antes, depois $depois"
backups | grep -q '\.tmp' && falhou "sobrou arquivo .tmp" || ok "nenhum .tmp sobrando"

echo "==> 3. Rotação depois de um backup bom"
# 10 backups antigos (30 dias): com o novo, ficam os 7 mais recentes; os outros, velhos, saem.
docker run --rm -v "$PASTA":/backups "$IMAGEM" sh -c \
  'rm -f /backups/vanellis-*; n=0; for i in 01 02 03 04 05 06 07 08 09 10; do n=$((n + 1)); f=/backups/vanellis-2026-10-${i}_0300.sql.gz; echo velho > $f; touch -d "@$(( $(date +%s) - (40 - n) * 86400 ))" $f; done'
rodar_backup "$BANCO" >/dev/null
total="$(backups | wc -l)"
[ "$total" = 7 ] && ok "ficaram os 7 mais recentes" || falhou "esperava 7 backups, ficaram $total"
backups | grep -q 'vanellis-2026-10-10_' && ok "o antigo mais recente ficou" || falhou "apagou o antigo mais recente"
backups | grep -q 'vanellis-2026-10-01_' && falhou "o antigo mais velho não saiu" || ok "o antigo mais velho saiu"

echo
if [ "$FALHAS" = 0 ]; then
  echo "Backup: todos os casos passaram."
else
  echo "Backup: $FALHAS verificação(ões) falharam." >&2
  exit 1
fi
