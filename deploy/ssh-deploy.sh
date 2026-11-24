#!/usr/bin/env bash
# Porteiro da chave de deploy do GitHub (CD, RQ30). A chave fica em /root/.ssh/authorized_keys
# amarrada a este script com "command=", então qualquer coisa que ela peça vira uma chamada daqui,
# e daqui só sai uma coisa: publicar um commit. Sem terminal, sem túneis, sem outros comandos.
#
# Linha em authorized_keys (deploy/instalar-chave-deploy.sh monta):
#   command="/opt/vanellis-app/deploy/ssh-deploy.sh",restrict ssh-ed25519 AAAA... github-deploy
set -euo pipefail

pedido="${SSH_ORIGINAL_COMMAND:-}"
if [[ "$pedido" =~ ^publicar\ ([0-9a-f]{40})$ ]]; then
  versao="${BASH_REMATCH[1]}"
  # Uma publicação por vez; o registro fica no servidor para consulta.
  exec flock -n /run/vanellis-publicar.lock \
    bash -c 'bash /opt/vanellis-app/deploy/publicar.sh "$1" 2>&1 | tee -a /var/log/vanellis-publicar.log; exit "${PIPESTATUS[0]}"' _ "$versao"
fi

echo "Comando recusado. Esta chave só publica: publicar <commit de 40 caracteres>" >&2
logger -t vanellis-deploy "comando recusado para a chave de deploy: ${pedido:0:80}" || true
exit 1
