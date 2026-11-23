#!/usr/bin/env bash
# Sobe o conjunto de produção no computador para testar antes do servidor (projeto separado,
# com banco próprio, sem mexer no banco de desenvolvimento). Para parar e apagar:
#   bash deploy/teste-local.sh parar
set -euo pipefail
cd "$(dirname "$0")/.."
export COMPOSE_PROJECT_NAME=vanellis-teste
ENV=deploy/.env.teste
if [ ! -f "$ENV" ]; then
  printf 'DOMAIN=localhost\nACME_EMAIL=teste@exemplo.com\nPOSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 24)" >"$ENV"
fi
compose() { docker compose --env-file "$ENV" -f docker-compose.yml -f deploy/teste-local.yml "$@"; }

if [ "${1:-}" = "parar" ]; then
  compose down -v
  echo "Teste parado e dados de teste apagados."
  exit 0
fi

compose up -d --build
echo "==> Carga inicial do catálogo (só se o banco de teste estiver vazio)"
compose exec -T app node dist/seed.js || true
compose ps
echo
echo "Site:   https://localhost:8443"
echo "Painel: https://localhost:8443/painel/"
echo "Conta:  docker compose -p vanellis-teste exec app node dist/usuario-senha.js teste --papel admin"
