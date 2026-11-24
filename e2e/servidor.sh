#!/usr/bin/env bash
# Sobe o sistema completo (site, painel e API) para os testes de ponta a ponta, num banco só
# deles, recriado a cada execução. Nunca toca no banco de desenvolvimento.
#
# Variáveis (os padrões servem para o Postgres local, por socket):
#   E2E_ADMIN_URL     banco usado para apagar e criar o de teste
#   E2E_DATABASE_URL  banco de teste
#   E2E_PORT          porta do servidor de teste
#   E2E_SENHA         senha da conta "e2e" criada para os testes
set -euo pipefail
cd "$(dirname "$0")/.."

ADMIN_URL="${E2E_ADMIN_URL:-postgresql:///postgres?host=/var/run/postgresql}"
export DATABASE_URL="${E2E_DATABASE_URL:-postgresql:///vanellis_e2e?host=/var/run/postgresql}"
export PORT="${E2E_PORT:-3100}"
export NODE_ENV=test
SENHA="${E2E_SENHA:?defina E2E_SENHA}"
DB_NAME="$(node -e "console.log(new URL(process.argv[1]).pathname.slice(1))" "$DATABASE_URL")"

echo "==> Recriando o banco de teste $DB_NAME"
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -q -c "DROP DATABASE IF EXISTS \"$DB_NAME\" WITH (FORCE)" -c "CREATE DATABASE \"$DB_NAME\""

echo "==> Compilando site, painel e servidor"
npm run build --silent

cd server
echo "==> Migrações, carga inicial e dados previsíveis para os testes"
node dist/migrate.js
node dist/seed.js
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f ../e2e/dados.sql
printf '%s\n%s\n' "$SENHA" "$SENHA" | node dist/usuario-senha.js e2e --papel admin

echo "==> Servidor de teste em http://localhost:$PORT"
exec node dist/index.js
