# Cópia dos backups no Google Drive (RQ35)

O serviço `backup` faz um backup do banco por dia, às 3h, em `backups/` no servidor. Se o servidor
for perdido, esses backups vão junto. O serviço `copia-externa` resolve isso: manda cada backup
conferido para o Google Drive, **criptografado**, e guarda lá os últimos 30 dias.

- **Acesso restrito:** o rclone só enxerga os arquivos que ele mesmo criou no seu Drive (acesso
  `drive.file`). Ele não lê nem apaga mais nada.
- **Criptografia:** no Drive, nome e conteúdo dos arquivos ficam ilegíveis. Para abrir, são
  precisas as **duas senhas** que você vai gerar no passo 2.
- **Quando roda:** ao subir e depois a cada hora. Se o Drive falhar numa hora, a próxima tenta de
  novo. As falhas aparecem no log como `FALHA na cópia externa`.

> **Guarde as duas senhas da criptografia num gerenciador de senhas, fora do servidor.** Sem elas,
> os backups do Drive não abrem. Ninguém, nem o Google, consegue recuperá-las.

Tudo abaixo é feito por você: as credenciais nunca passam pelo Claude.

## 1. No seu computador: instalar o rclone

Ele só serve para autorizar o acesso ao Drive pelo navegador (o servidor não tem navegador).

```bash
sudo apt install rclone
```

## 2. No servidor: criar a configuração

Entre no servidor (`ssh vanellis`) e rode:

```bash
cd /opt/vanellis-app
docker compose run --rm --entrypoint rclone copia-externa config
```

O rclone faz perguntas. Responda assim (Enter = aceitar o padrão):

**Primeiro destino: o Drive**

| Pergunta | Resposta |
|---|---|
| `n/s/q>` | `n` (novo destino) |
| `name>` | `gdrive` |
| `Storage>` | `drive` |
| `client_id>` e `client_secret>` | Enter (vazio) |
| `scope>` | o número da opção **`drive.file`** ("Access to files created by rclone only") |
| `service_account_file>` | Enter |
| `Edit advanced config?` | `n` |
| `Use web browser to automatically authenticate?` | **`n`** |

Ele mostra um comando parecido com `rclone authorize "drive" "eyJ..."`. **Rode esse comando no seu
computador** (passo 1). O navegador abre: entre na conta Google que vai guardar os backups e
autorize. O terminal do seu computador mostra um código; copie e cole no servidor, em
`config_token>`. Depois:

| Pergunta | Resposta |
|---|---|
| `Configure this as a Shared Drive?` | `n` |
| `Keep this "gdrive" remote?` | `y` |

**Segundo destino: a criptografia por cima do Drive**

| Pergunta | Resposta |
|---|---|
| `n/s/q>` | `n` |
| `name>` | `cripto` |
| `Storage>` | `crypt` |
| `remote>` | `gdrive:vanellis-backups` |
| `filename_encryption>` | `standard` (o padrão) |
| `directory_name_encryption>` | `true` (o padrão) |
| `Password or pass phrase for encryption` | `g` (gerar), `128` bits, e `y` para usar |
| `Password or pass phrase for salt` | `g`, `128`, `y` |
| `Edit advanced config?` | `n` |
| `Keep this "cripto" remote?` | `y` |

**Ao gerar cada senha, o rclone mostra ela na tela: copie as duas para o gerenciador de senhas**,
com os nomes "Vanellis backup - senha" e "Vanellis backup - salt". Depois, `q` para sair.

A configuração fica em `/opt/vanellis-app/rclone/rclone.conf`, fora do git. Proteja o arquivo:

```bash
chmod 600 rclone/rclone.conf
```

## 3. Ligar a cópia

No `.env` do servidor, defina (ou acrescente):

```
BACKUP_REMOTE=cripto:
BACKUP_REMOTE_KEEP_DAYS=30
```

E suba o serviço:

```bash
docker compose up -d copia-externa
docker compose logs --tail 20 copia-externa
```

O log deve mostrar `cópia externa em dia: vanellis-...sql.gz em cripto:`. No Google Drive aparece a
pasta `vanellis-backups`, com arquivos de nomes embaralhados.

## 4. Provar que dá para voltar

O critério do RQ35 é restaurar um backup do Drive com sucesso. Rode:

```bash
bash deploy/conferir-copia-externa.sh
```

Ele baixa do Drive o backup mais recente, confere e restaura num Postgres **temporário**. O banco
do site não é tocado. No fim mostra, por exemplo, `Restaurado com sucesso: 46 produto(s), 4
cardápio(s), 12 foto(s).` Vale repetir de vez em quando, por exemplo a cada três meses.

## Se o servidor for perdido

Num servidor novo (ou no seu computador), com o rclone instalado:

1. Crie de novo os destinos `gdrive` e `cripto` (passo 2), mas, nas senhas da criptografia,
   responda `y` (digitar a sua) e cole as duas senhas guardadas no gerenciador.
2. Baixe o backup que quiser:

   ```bash
   rclone lsf cripto:
   rclone copy cripto: backups/ --include "vanellis-2026-12-01_0300.sql.gz"
   ```
3. Restaure com `bash deploy/restore.sh backups/vanellis-2026-12-01_0300.sql.gz`.

## Problemas comuns

- **`FALHA na cópia externa: ... token ... expired` ou `invalid_grant`:** o acesso ao Drive foi
  revogado (senha da conta Google trocada, por exemplo). Refaça só a parte do `gdrive` do passo 2
  (`docker compose run --rm --entrypoint rclone copia-externa config reconnect gdrive:`).
- **`FALHA ... o backup diário parou?`:** o serviço `backup` não gera backup há mais de 30 dias.
  Veja `docker compose logs backup`.
- **Desligar a cópia:** deixe `BACKUP_REMOTE=` vazio e rode `docker compose up -d copia-externa`.
