#!/usr/bin/env bash
# Autoriza a chave pública de deploy do GitHub no servidor, restrita ao deploy/ssh-deploy.sh.
# Rode como root no servidor, passando a chave PÚBLICA (a privada fica só nos Secrets do GitHub):
#
#   bash deploy/instalar-chave-deploy.sh 'ssh-ed25519 AAAA... github-deploy'
#
# Pode rodar de novo: troca a chave de deploy anterior pela nova.
set -euo pipefail
chave="${1:?Informe a chave pública (ssh-ed25519 ...)}"
[[ "$chave" =~ ^ssh-ed25519\ [A-Za-z0-9+/=]+(\ [^\"]*)?$ ]] || { echo "Não parece uma chave pública ed25519." >&2; exit 1; }

porteiro="$(cd "$(dirname "$0")" && pwd)/ssh-deploy.sh"
chmod 755 "$porteiro"
arquivo=/root/.ssh/authorized_keys
install -m 700 -d /root/.ssh
touch "$arquivo" && chmod 600 "$arquivo"

# "restrict" desliga terminal, túneis e encaminhamentos; "command=" amarra a chave ao porteiro.
sed -i '/ github-deploy-vanellis$/d' "$arquivo"
printf 'command="%s",restrict %s github-deploy-vanellis\n' "$porteiro" "$(cut -d' ' -f1,2 <<<"$chave")" >>"$arquivo"
echo "Chave de deploy autorizada, restrita a ${porteiro}."
