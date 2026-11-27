#!/usr/bin/env bash
# Teste da cópia do backup para fora do servidor (RQ35): roda o deploy/copia-externa.sh de verdade,
# na mesma imagem do servidor (rclone), contra um "Drive de mentira": uma pasta local com a
# criptografia do rclone por cima, como no servidor. Precisa só de Docker, sem conta no Google.
#
#   bash deploy/testar-copia-externa.sh
#
# Casos:
#   1. desligada (BACKUP_REMOTE vazio): não envia nada e não dá erro;
#   2. envio: só os backups conferidos (nem .tmp nem outros arquivos), criptografados no destino;
#   3. baixar: o backup mais recente volta do destino legível e conferido (o caminho da restauração);
#   4. destino fora do ar: registra FALHA e não mexe nos backups locais;
#   5. retenção: no destino ficam sempre os 7 mais recentes; dos outros, saem os de mais de
#      BACKUP_REMOTE_KEEP_DAYS dias; backup local mais velho que isso não é reenviado;
#   6. backup diário parado: o mais recente tem mais de BACKUP_REMOTE_KEEP_DAYS dias → FALHA.
set -euo pipefail
cd "$(dirname "$0")"
# Sem o script, o Docker criaria uma pasta vazia no lugar dele ao montar o volume.
[ -f copia-externa.sh ] || { echo "deploy/copia-externa.sh não existe." >&2; exit 1; }

IMAGEM=rclone/rclone:1.69.1
LOCAL="$(mktemp -d)"
REMOTO="$(mktemp -d)"
FALHAS=0

limpar() {
  # Os arquivos foram criados pelo container (outro usuário): apaga por dentro dele.
  docker run --rm -v "$LOCAL":/backups -v "$REMOTO":/remoto --entrypoint sh "$IMAGEM" \
    -c 'rm -rf /backups/* /backups/.[!.]* /remoto/* /remoto/.[!.]*' >/dev/null 2>&1 || true
  rmdir "$LOCAL" "$REMOTO" 2>/dev/null || true
  rm -f "$LOCAL.log"
}
trap limpar EXIT

ok() { echo "  ok: $*"; }
falhou() {
  echo "  FALHOU: $*" >&2
  FALHAS=$((FALHAS + 1))
}

# Senha da criptografia do teste, no formato que o rclone guarda (rclone obscure).
SENHA="$(docker run --rm "$IMAGEM" obscure senha-do-teste)"

# Roda a cópia uma vez. $1 = destino (BACKUP_REMOTE); o resto vai como variáveis extras (-e).
copiar() {
  local destino="$1"
  shift
  docker run --rm -v "$LOCAL":/backups -v "$REMOTO":/remoto -v "$PWD/copia-externa.sh":/copia-externa.sh:ro \
    -e RCLONE_CONFIG_DESTINO_TYPE=local \
    -e RCLONE_CONFIG_CRIPTO_TYPE=crypt -e RCLONE_CONFIG_CRIPTO_REMOTE=destino:/remoto/vanellis-backups \
    -e RCLONE_CONFIG_CRIPTO_PASSWORD="$SENHA" \
    -e BACKUP_REMOTE="$destino" -e COPIA_ONCE=1 "$@" --entrypoint sh "$IMAGEM" /copia-externa.sh
}

# Comando dentro de um container com as duas pastas e o destino criptografado configurado.
dentro() {
  docker run --rm -v "$LOCAL":/backups -v "$REMOTO":/remoto \
    -e RCLONE_CONFIG_DESTINO_TYPE=local \
    -e RCLONE_CONFIG_CRIPTO_TYPE=crypt -e RCLONE_CONFIG_CRIPTO_REMOTE=destino:/remoto/vanellis-backups \
    -e RCLONE_CONFIG_CRIPTO_PASSWORD="$SENHA" --entrypoint sh "$IMAGEM" -c "$1"
}

# O que o destino mostra, já sem a criptografia (como o rclone do servidor vê).
no_destino() { dentro 'rclone lsf cripto: --files-only 2>/dev/null | sort' || true; }

# Cria um backup local "bom" (gzip com o fim do dump) com a idade dada em dias.
backup_local() { # $1 = nome, $2 = dias
  dentro "printf 'insert Coxinha;\n-- PostgreSQL database dump complete\n' | gzip > /backups/$1 && touch -d \"@\$(( \$(date +%s) - $2 * 86400 ))\" /backups/$1"
}

echo "==> 1. Desligada"
backup_local vanellis-2026-11-26_0300.sql.gz 1
if copiar "" >"$LOCAL.log" 2>&1; then ok "terminou sem erro"; else falhou "deu erro com a cópia desligada"; fi
grep -q 'desligada' "$LOCAL.log" && ok "avisou que está desligada" || falhou "não avisou que está desligada"
[ -z "$(dentro 'ls -A /remoto')" ] && ok "não enviou nada" || falhou "enviou algo com a cópia desligada"

echo "==> 2. Envio"
backup_local vanellis-2026-11-27_0300.sql.gz 0
dentro 'echo pela-metade > /backups/vanellis-2026-11-28_0300.sql.gz.tmp; echo outro > /backups/anotacoes.txt'
if copiar cripto: >"$LOCAL.log" 2>&1; then ok "terminou sem erro"; else falhou "deu erro no envio: $(cat "$LOCAL.log")"; fi
[ "$(no_destino)" = "$(printf 'vanellis-2026-11-26_0300.sql.gz\nvanellis-2026-11-27_0300.sql.gz')" ] &&
  ok "enviou os dois backups, sem .tmp nem outros arquivos" || falhou "destino inesperado: $(no_destino | tr '\n' ' ')"
grep -q 'vanellis-2026-11-27_0300.sql.gz' "$LOCAL.log" && ok "registrou o backup enviado" || falhou "não registrou o envio"
crus="$(dentro 'find /remoto -type f')"
echo "$crus" | grep -q 'vanellis-20' && falhou "o nome do arquivo aparece no destino sem criptografia" ||
  ok "nomes criptografados no destino"
dentro 'for f in $(find /remoto -type f); do gunzip -c "$f" 2>/dev/null | grep -q Coxinha && exit 1; done; exit 0' &&
  ok "conteúdo ilegível no destino" || falhou "o conteúdo aparece no destino sem criptografia"
copiar cripto: >/dev/null 2>&1 && ok "segunda rodada sem nada novo: sem erro" || falhou "a segunda rodada deu erro"

echo "==> 3. Baixar o mais recente (restauração)"
if copiar cripto: -e COPIA_BAIXAR=/backups/baixado >"$LOCAL.log" 2>&1; then ok "terminou sem erro"; else falhou "deu erro ao baixar: $(cat "$LOCAL.log")"; fi
dentro 'gunzip -c /backups/baixado/vanellis-2026-11-27_0300.sql.gz | grep -q Coxinha' &&
  ok "o backup voltou legível" || falhou "o backup baixado não está legível"
grep -q 'conferido' "$LOCAL.log" && ok "conferiu o arquivo baixado" || falhou "não conferiu o arquivo baixado"
dentro 'rm -rf /backups/baixado'

echo "==> 4. Destino fora do ar"
antes="$(dentro 'ls -1 /backups | sort')"
if copiar naoexiste: >"$LOCAL.log" 2>&1; then falhou "terminou sem erro com o destino fora do ar"; else ok "terminou com erro"; fi
grep -q 'FALHA' "$LOCAL.log" && ok "registrou FALHA" || falhou "não registrou FALHA"
[ "$(dentro 'ls -1 /backups | sort')" = "$antes" ] && ok "backups locais intactos" || falhou "a falha mexeu nos backups locais"

echo "==> 5. Retenção"
# 10 backups antigos (40 a 31 dias) chegam ao destino com um prazo longo; com o prazo de 30 dias,
# ficam os 7 mais recentes do destino e saem os 3 mais velhos; os antigos não são reenviados.
dentro 'rm -f /backups/*'
for i in 01 02 03 04 05 06 07 08 09 10; do backup_local "vanellis-2026-10-${i}_0300.sql.gz" $((41 - 10#$i)); done
backup_local vanellis-2026-11-27_0300.sql.gz 0
dentro 'rm -rf /remoto/*'
copiar cripto: -e BACKUP_REMOTE_KEEP_DAYS=60 >/dev/null 2>&1 || falhou "deu erro ao enviar com prazo longo"
[ "$(no_destino | wc -l)" = 11 ] && ok "com prazo longo, os 11 estão no destino" || falhou "esperava 11 no destino, há $(no_destino | wc -l)"
copiar cripto: -e BACKUP_REMOTE_KEEP_DAYS=30 >"$LOCAL.log" 2>&1 || falhou "deu erro na retenção: $(cat "$LOCAL.log")"
[ "$(no_destino | wc -l)" = 7 ] && ok "ficaram os 7 mais recentes" || falhou "esperava 7 no destino, há $(no_destino | wc -l)"
no_destino | grep -q 'vanellis-2026-11-27_' && ok "o novo ficou" || falhou "o novo saiu"
no_destino | grep -q 'vanellis-2026-10-10_' && ok "o antigo mais recente ficou" || falhou "apagou o antigo mais recente"
no_destino | grep -q 'vanellis-2026-10-01_' && falhou "o antigo mais velho não saiu" || ok "o antigo mais velho saiu"
grep -q 'apagad' "$LOCAL.log" && ok "registrou o que apagou" || falhou "não registrou a retenção"

echo "==> 6. Backup diário parado"
dentro 'rm -f /backups/*'
backup_local vanellis-2026-10-20_0300.sql.gz 35
if copiar cripto: >"$LOCAL.log" 2>&1; then falhou "não reclamou do backup parado"; else ok "terminou com erro"; fi
grep -q 'FALHA.*parou' "$LOCAL.log" && ok "registrou FALHA dizendo que o backup parou" || falhou "não explicou a falha: $(cat "$LOCAL.log")"

echo
if [ "$FALHAS" = 0 ]; then
  echo "Cópia externa: todos os casos passaram."
else
  echo "Cópia externa: $FALHAS verificação(ões) falharam." >&2
  exit 1
fi
