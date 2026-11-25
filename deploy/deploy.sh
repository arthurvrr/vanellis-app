#!/usr/bin/env bash
# Deploy MANUAL, plano B do CD (ex: GitHub fora do ar): baixa o código da main, compila a imagem
# no próprio servidor e reinicia. No dia a dia, quem publica é o CD (deploy/publicar.sh, chamado
# pelo GitHub depois da sua aprovação). As migrações do banco rodam sozinhas quando o app sobe.
#
#   bash deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Baixando a versão nova (main)"
git fetch -q origin
git checkout -q main
git pull --ff-only

echo "==> Compilando no servidor (sem a imagem do GHCR)"
# O CD deixa APP_IMAGE apontando para a imagem pronta; o modo manual compila a sua própria.
sed -i '/^APP_IMAGE=/d' .env
docker compose up -d --build
# O backup lê deploy/backup.sh montado; reinicia para usar o script desta versão.
docker compose restart backup

echo "==> Limpando imagens antigas"
docker image prune -f >/dev/null

echo "==> Situação"
docker compose ps
echo
echo "Acompanhe com: docker compose logs -f app"
