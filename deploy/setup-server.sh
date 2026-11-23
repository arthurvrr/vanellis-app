#!/usr/bin/env bash
# Preparação de um servidor Ubuntu novo (22.04 ou 24.04) para o Vanellis. Rode UMA vez, como
# root, dentro da pasta do projeto clonada no servidor:
#
#   sudo bash deploy/setup-server.sh
#
# Instala o Docker, liga o firewall (só SSH, HTTP e HTTPS), as atualizações automáticas de
# segurança e a proteção contra tentativas de senha no SSH, cria um arquivo de troca de
# memória e gera o .env com uma senha forte para o banco.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Rode como root: sudo bash deploy/setup-server.sh" >&2
  exit 1
fi
cd "$(dirname "$0")/.."

echo "==> Atualizando o sistema"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y ca-certificates curl git ufw fail2ban unattended-upgrades

echo "==> Instalando o Docker (repositório oficial)"
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    >/etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

echo "==> Firewall: só SSH, HTTP e HTTPS"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "==> Atualizações automáticas de segurança"
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "==> Proteção contra tentativas de senha no SSH (fail2ban)"
systemctl enable --now fail2ban

# SSH só com chave: desliga a senha SÓ se já houver uma chave cadastrada, para não trancar ninguém fora.
if [ -s /root/.ssh/authorized_keys ] || ls /home/*/.ssh/authorized_keys >/dev/null 2>&1; then
  echo "==> Desligando o login por senha no SSH (há chave cadastrada)"
  printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\n' >/etc/ssh/sshd_config.d/99-vanellis.conf
  systemctl reload ssh || systemctl reload sshd || true
else
  echo "!! Nenhuma chave SSH encontrada: o login por senha continua ligado. Cadastre uma chave e rode de novo."
fi

echo "==> Memória de troca (swap) de 1 GB"
if ! swapon --show | grep -q .; then
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi

echo "==> Arquivo .env"
if [ ! -f .env ]; then
  cp .env.production.example .env
  sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 24)/" .env
  chmod 600 .env
  echo "   Criado .env com senha do banco. Edite DOMAIN e ACME_EMAIL: nano .env"
else
  echo "   .env já existe, mantido."
fi
mkdir -p backups

. /etc/os-release
if [ "${VERSION_ID}" = "22.04" ]; then
  echo "!! Ubuntu 22.04: o suporte padrão termina em abril de 2027. Ative o Ubuntu Pro (gratuito"
  echo "   para uso pessoal) para continuar recebendo atualizações: sudo pro attach <token>"
fi

echo
echo "Pronto. Próximos passos:"
echo "  1. nano .env            (DOMAIN e ACME_EMAIL)"
echo "  2. bash deploy/deploy.sh"
echo "  3. docker compose exec app node dist/seed.js          (carga inicial, só a 1a vez)"
echo "  4. docker compose exec app node dist/usuario-senha.js <usuario> --papel admin"
