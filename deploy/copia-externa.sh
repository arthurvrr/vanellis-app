#!/bin/sh
# Cópia do backup para fora do servidor (RQ35), no serviço copia-externa (imagem do rclone).
# Envia ao destino BACKUP_REMOTE (no servidor: "cripto:", o Google Drive com criptografia; ver
# deploy/BACKUP-DRIVE.md) os backups que o deploy/backup.sh já conferiu. Roda ao subir e depois
# a cada hora: reenviar o que já está lá não custa nada, e um Drive fora do ar às 3h é coberto
# na hora seguinte.
#
# Retenção no destino, como a dos backups locais: ficam sempre os 7 mais recentes; dos outros,
# saem os de mais de BACKUP_REMOTE_KEEP_DAYS dias. Backup local mais velho que isso não é enviado.
#
# BACKUP_REMOTE vazio = cópia desligada (o serviço fica parado, sem erro).
# COPIA_ONCE=1 roda uma vez e sai (código 0 = deu certo), para testes e uso manual.
# COPIA_BAIXAR=<pasta> baixa o backup mais recente do destino para a pasta, confere e sai.
set -eu
REMOTE="${BACKUP_REMOTE:-}"
KEEP="${BACKUP_REMOTE_KEEP_DAYS:-30}"
INTERVALO="${COPIA_INTERVALO:-3600}"
MIN_KEEP=7
FILTRO='vanellis-*.sql.gz'
ultimo=''

log() { echo "$(date '+%F %T') $*"; }
falha() {
  echo "$(date '+%F %T') FALHA na cópia externa: $*" >&2
  return 1
}

# Envia os backups conferidos (não os .tmp) e confere que o mais recente chegou.
copiar() {
  novo="$(cd /backups && ls -1t $FILTRO 2>/dev/null | head -n 1)" || true
  if [ -z "$novo" ]; then
    log "nenhum backup local para enviar ainda"
    return 0
  fi
  if [ -n "$(find "/backups/$novo" -mtime +"$KEEP")" ]; then
    falha "o backup mais recente ($novo) tem mais de $KEEP dias: o backup diário parou?"
    return 1
  fi
  if ! saida="$(rclone copy /backups "$REMOTE" --include "$FILTRO" --max-age "${KEEP}d" 2>&1)"; then
    falha "não foi possível enviar para $REMOTE: $(echo "$saida" | tail -n 1)"
    return 1
  fi
  if ! rclone lsf "$REMOTE" --files-only --include "$novo" 2>/dev/null | grep -qx "$novo"; then
    falha "o backup $novo não apareceu em $REMOTE depois do envio"
    return 1
  fi
  if [ "$novo" != "$ultimo" ]; then
    log "cópia externa em dia: $novo em $REMOTE"
    ultimo="$novo"
  fi
  reter
}

# Retenção no destino. Os nomes têm a data (vanellis-AAAA-MM-DD_HHMM), então a ordem do nome é a
# ordem do tempo; os MIN_KEEP mais recentes ficam fora da regra de apagar.
reter() {
  regras="$(mktemp)"
  rclone lsf "$REMOTE" --files-only --include "$FILTRO" | sort -r | head -n "$MIN_KEEP" |
    while read -r manter; do echo "- $manter"; done >"$regras"
  printf '+ %s\n- *\n' "$FILTRO" >>"$regras"
  if ! saida="$(rclone delete "$REMOTE" --min-age "${KEEP}d" --filter-from "$regras" -v 2>&1)"; then
    rm -f "$regras"
    falha "não foi possível apagar os backups antigos de $REMOTE: $(echo "$saida" | tail -n 1)"
    return 1
  fi
  rm -f "$regras"
  n="$(echo "$saida" | grep -c ': Deleted' || true)"
  [ "$n" = 0 ] || log "retenção: $n backup(s) com mais de $KEEP dias apagado(s) de $REMOTE"
}

# Baixa o backup mais recente do destino para a pasta $1 e confere que ele está inteiro.
baixar() {
  pasta="$1"
  arquivo="$(rclone lsf "$REMOTE" --files-only --include "$FILTRO" | sort | tail -n 1)"
  if [ -z "$arquivo" ]; then
    falha "nenhum backup em $REMOTE"
    return 1
  fi
  mkdir -p "$pasta"
  rclone copy "$REMOTE" "$pasta" --include "$arquivo"
  if ! gzip -t "$pasta/$arquivo" 2>/dev/null || ! gunzip -c "$pasta/$arquivo" | tail -n 5 | grep -q 'PostgreSQL database dump complete'; then
    falha "o backup $arquivo baixado de $REMOTE está incompleto"
    return 1
  fi
  log "baixado e conferido: $pasta/$arquivo"
}

if [ -z "$REMOTE" ]; then
  log "cópia externa desligada: defina BACKUP_REMOTE no .env (ver deploy/BACKUP-DRIVE.md)"
  [ "${COPIA_ONCE:-}" = 1 ] && exit 0
  # Fica parado sem sair, para o Docker não reiniciar o serviço em laço.
  while true; do sleep 86400; done
fi

if [ -n "${COPIA_BAIXAR:-}" ]; then
  baixar "$COPIA_BAIXAR"
  exit
fi

if [ "${COPIA_ONCE:-}" = 1 ]; then
  copiar
  exit
fi

while true; do
  copiar || true
  sleep "$INTERVALO"
done
