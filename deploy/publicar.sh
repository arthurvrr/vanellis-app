#!/usr/bin/env bash
# Publica no servidor uma versão já compilada pelo GitHub (CD, etapa 5 da aba "Qualidade e CI/CD").
#
#   bash deploy/publicar.sh <commit>
#
# Passos: 1) põe os arquivos do projeto (compose, Caddyfile, scripts) no mesmo commit;
# 2) baixa a imagem pronta do GHCR; 3) backup do banco na hora (RQ32), conferido antes de seguir;
# 4) troca a versão e sobe; 5) teste de fumaça: API, site e painel respondem e a versão é a
# pedida (RQ33); 6) se o teste falhar, volta sozinho para a versão anterior (RQ34).
#
# As migrações do banco rodam quando o app sobe e NÃO são desfeitas na volta automática. Uma
# migração que só acrescenta (coluna, tabela) não atrapalha a versão anterior. Uma que apaga ou
# transforma (já houve: 0002 apagou tabelas, 0004 uma coluna) exige volta manual, com
# deploy/restore.sh e o backup feito no passo 3; avalie isso no PR antes de aprovar a publicação.
#
# Tudo fica dentro de main(): o Bash lê a função inteira antes de executar, então o passo 1 pode
# trocar este próprio arquivo sem atrapalhar a execução em andamento.
set -euo pipefail

IMAGEM_BASE="ghcr.io/arthurvrr/vanellis-app"

main() {
  local versao="${1:-}"
  if [[ ! "$versao" =~ ^[0-9a-f]{7,40}$ ]]; then
    echo "Uso: bash deploy/publicar.sh <commit>  (recebido: '${versao}')" >&2
    exit 2
  fi
  cd "$(dirname "$0")/.."
  [ -f .env ] || { echo "Sem .env: rode deploy/setup-server.sh antes." >&2; exit 1; }

  local dominio nova anterior commit_anterior
  dominio="$(valor_env DOMAIN)"
  nova="${IMAGEM_BASE}:${versao}"
  anterior="$(valor_env APP_IMAGE)"
  commit_anterior="$(git rev-parse HEAD)"
  log "Publicando ${nova}"
  log "Versão no ar antes: ${anterior:-vanellis-app (compilada no servidor)}, arquivos em ${commit_anterior:0:12}"

  # 1. Arquivos do projeto no commit pedido (compose, Caddyfile, scripts de backup).
  log "1/5 Arquivos do projeto no commit ${versao:0:12}"
  git fetch -q origin
  git -c advice.detachedHead=false checkout -q --detach "$versao"

  # 2. Imagem pronta. Se não existir ou não puder ser baixada, nada mudou ainda no ar.
  log "2/5 Baixando a imagem"
  if ! docker pull -q "$nova" >/dev/null; then
    git -c advice.detachedHead=false checkout -q --detach "$commit_anterior"
    falha "não foi possível baixar ${nova}. Nada foi alterado no site."
  fi

  # 3. Backup na hora, conferido: um arquivo vazio não serve (o mesmo problema do item G06).
  log "3/5 Backup do banco antes de trocar a versão"
  local backup
  backup="backups/antes-de-publicar-$(date +%Y-%m-%d_%H%M%S)-${versao:0:7}.sql.gz"
  mkdir -p backups
  if ! docker compose exec -T db pg_dump -U vanellis -d vanellis --no-owner --clean --if-exists | gzip >"${backup}.tmp" ||
    ! gunzip -c "${backup}.tmp" | tail -n 5 | grep -q 'PostgreSQL database dump complete'; then
    rm -f "${backup}.tmp"
    git -c advice.detachedHead=false checkout -q --detach "$commit_anterior"
    falha "o backup não ficou completo. Nada foi alterado no site."
  fi
  mv "${backup}.tmp" "$backup"
  log "   backup: ${backup} ($(du -h "$backup" | cut -f1))"

  # 4. Troca a versão e sobe (sem compilar nada no servidor).
  log "4/5 Subindo a versão nova"
  definir_env APP_IMAGE "$nova"
  docker compose up -d --no-build --remove-orphans

  # 5. Teste de fumaça; se falhar, volta para a versão anterior.
  log "5/5 Teste de fumaça"
  if fumaca "$dominio" "$versao"; then
    log "Publicado: ${versao:0:12} no ar em https://${dominio}"
    # O backup lê deploy/backup.sh montado do servidor; sem reiniciar, o processo antigo seguiria
    # com o script velho. Ao reiniciar, ele faz um backup na hora e volta ao horário diário.
    docker compose restart backup >/dev/null && log "   serviço de backup reiniciado com o script desta versão"
    limpar_imagens "$nova" "$anterior"
    return 0
  fi

  log "!! O teste de fumaça falhou. Voltando para a versão anterior."
  docker compose logs --tail 40 app || true
  git -c advice.detachedHead=false checkout -q --detach "$commit_anterior"
  if [ -n "$anterior" ]; then definir_env APP_IMAGE "$anterior"; else remover_env APP_IMAGE; fi
  docker compose up -d --no-build --remove-orphans
  local versao_anterior="${anterior##*:}"
  if fumaca "$dominio" ""; then
    falha "a versão ${versao:0:12} não passou no teste de fumaça; o site voltou para ${versao_anterior:-a versão anterior}. Backup de antes: ${backup}"
  fi
  falha "a versão nova falhou E a anterior não respondeu. Verifique já: docker compose ps; docker compose logs app. Backup: ${backup}"
}

# API, site e painel respondem pelo Caddy (HTTPS do domínio), e a versão é a esperada.
fumaca() {
  local dominio="$1" esperada="$2" i health
  for i in $(seq 1 30); do
    health="$(curl -fsS --max-time 5 --resolve "${dominio}:443:127.0.0.1" "https://${dominio}/api/health" 2>/dev/null || true)"
    if [ -n "$health" ] && { [ -z "$esperada" ] || grep -q "\"version\":\"${esperada}\"" <<<"$health"; }; then
      if curl -fsS --max-time 5 --resolve "${dominio}:443:127.0.0.1" "https://${dominio}/" | grep -q '<div id="root">' &&
        curl -fsS --max-time 5 --resolve "${dominio}:443:127.0.0.1" "https://${dominio}/painel/" | grep -q '<div id="root">'; then
        log "   ok: ${health}"
        return 0
      fi
    fi
    sleep 3
  done
  log "   sem resposta certa em 90 s (última resposta da API: ${health:-nenhuma})"
  return 1
}

# Mantém só a imagem no ar e a anterior (para uma volta rápida); apaga as mais antigas.
limpar_imagens() {
  local manter_a="$1" manter_b="$2" img
  while read -r img; do
    [ "$img" = "$manter_a" ] || [ "$img" = "$manter_b" ] || docker image rm "$img" >/dev/null 2>&1 || true
  done < <(docker image ls "$IMAGEM_BASE" --format '{{.Repository}}:{{.Tag}}')
  docker image prune -f >/dev/null
}

valor_env() { grep -E "^$1=" .env | tail -n 1 | cut -d= -f2- || true; }
definir_env() {
  if grep -qE "^$1=" .env; then sed -i "s#^$1=.*#$1=$2#" .env; else printf '%s=%s\n' "$1" "$2" >>.env; fi
}
remover_env() { sed -i "/^$1=/d" .env; }
log() { echo "$(date '+%F %T') $*"; }
falha() {
  log "FALHOU: $*"
  exit 1
}

main "$@"
exit
