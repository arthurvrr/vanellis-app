#!/usr/bin/env bash
# Atualiza o site no servidor: baixa o código novo, recompila a imagem e reinicia. As migrações
# do banco rodam sozinhas quando o app sobe. Os dados e os backups não são tocados.
#
#   bash deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Baixando a versão nova"
git pull --ff-only

echo "==> Compilando e subindo"
docker compose up -d --build

echo "==> Limpando imagens antigas"
docker image prune -f >/dev/null

echo "==> Situação"
docker compose ps
echo
echo "Acompanhe com: docker compose logs -f app"
