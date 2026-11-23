# Vanellis — site de pedidos

Cardápio interativo da Padaria e Confeitaria Vanellis: o cliente monta o pedido no site e o envia
pronto pelo WhatsApp; o operador mantém cardápio, preços e agenda num painel. O site não guarda
pedidos (o PDV é a fonte de verdade). Requisitos completos no doc de requisitos do projeto.

## Stack

PERN em monólito modular, um único deploy:

- `client/`: React 19 + Vite (TypeScript)
- `server/`: Express 5 + Drizzle ORM sobre PostgreSQL (TypeScript). Em produção também serve o site compilado.
- `shared/`: tipos do catálogo e regras de preço usados pelos dois lados (com testes)

```
server/src/
  app.ts                 rotas: um router por módulo de domínio
  config/env.ts          variáveis de ambiente validadas
  db/                    cliente, esquema reunido, migração e carga (seed)
  modules/catalogo/      esquema, consulta e rotas do cardápio
server/drizzle/          migrações SQL versionadas
server/scripts/          conversão do catálogo do protótipo
```

Novos módulos (`agenda`, `entrega`, `configuracoes`, `acesso` e, no futuro, `pedidos`, `clientes`,
`pagamentos`) entram em `server/src/modules/<nome>/` com seu próprio `schema.ts`, exportado em
`server/src/db/schema.ts`, e seu router, montado em `app.ts`.

## Primeira configuração

Requisitos: Node 20.19 ou mais novo e PostgreSQL.

1. Criar um papel de banco para o seu usuário e o banco do projeto (uma vez):

   ```bash
   sudo -u postgres createuser --createdb "$USER"
   createdb vanellis
   ```

2. Configurar o servidor e instalar as dependências:

   ```bash
   cp server/.env.example server/.env
   npm install
   ```

3. Criar as tabelas e carregar o catálogo:

   ```bash
   npm run db:migrate
   npm run db:seed
   ```

4. Criar as contas do painel (RN54): o superusuário e o operador. A senha é pedida no
   terminal e não aparece na tela.

   ```bash
   npm run usuario:senha -- <seu-usuário> --papel admin
   npm run usuario:senha -- <usuário-da-padaria> --papel operador
   ```

O site fica em http://localhost:5173 e o painel em http://localhost:5173/painel/.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor (porta 3000) e site (porta 5173) com recarga automática |
| `npm run build` | Compila site e servidor |
| `npm start` | Roda o servidor compilado, servindo API e site |
| `npm test` | Testes das regras (shared) e dos cenários do servidor |
| `npm run typecheck` | Verificação de tipos dos três pacotes |
| `npm run db:generate` | Gera uma migração a partir das mudanças no esquema |
| `npm run db:migrate` | Aplica as migrações pendentes |
| `npm run db:seed` | Carga inicial do catálogo, agenda e configurações (recusa se já houver produtos; para apagar e recarregar: `npm run db:seed -- --sobrescrever`) |
| `npm run usuario:senha -- <usuário>` | Troca a senha de uma conta do painel e encerra as sessões dela (com `--papel`, cria a conta) |
| `npm run demo:export` | Exporta catálogo, agenda e configurações do banco para a versão de teste |
| `npm run demo:build` | Compila a versão de teste em `client/dist` |

## Versão de teste (GitHub Pages)

Para a padaria validar o fluxo do cliente sem servidor. O GitHub Actions
(`.github/workflows/pages.yml`) publica a cada push na `main`, em
https://arthurvrr.github.io/vanellis-app/.

- Os dados vêm de `client/src/demo/dados.json`. Depois de mudar o catálogo ou a agenda no
  banco, rode `npm run demo:export` e faça o commit do arquivo.
- Os horários são calculados no navegador, com as mesmas regras do servidor.
- O pedido não abre o WhatsApp: a mensagem aparece na tela de confirmação.

## Catálogo inicial

`server/src/db/seed/catalogo.json` veio do protótipo anterior (`vanellis-app-pern`), convertido dos
11 tipos fixos para grupos de opção:

```bash
cd server && npx tsx scripts/converter-prototipo.ts ../../vanellis-app-pern/database.sql
```

São 3 categorias, 44 produtos e os 10 modelos de produto iniciais. O `db:seed` também carrega uma
agenda de retirada **provisória** até a padaria informar a real: funcionamento de segunda a sábado
7h30–19h e domingo 7h30–12h; retirada de 30 em 30 minutos a partir das 8h30, sem retirada das 12h às
14h, até 30 minutos antes do fechamento; antecedência de 2h; agendamento até 4 meses à frente; 24/12 e 31/12 como
datas especiais.

Pendências da carga, a acertar no painel:

- Códigos PDV vazios em todos os produtos e opções (RN41).
- Pesos provisórios em 7 tortas sem peso no protótipo; a lista sai no fim da conversão.
- Foto da Torta de Cremes (`bolo-cremes.png`) e do estilo Naked da Torta Ouro Branco não existem.
- As fotos em `client/public/images` somam cerca de 157 MB e precisam ser otimizadas (RNF03).

## Colocar no ar (servidor com Docker)

O sistema roda em qualquer servidor Linux com Docker, sempre do mesmo jeito: a imagem traz o
site, o painel e a API já compilados; o que muda de um servidor para outro (domínio, senhas)
fica no arquivo `.env` do servidor. São quatro serviços (`docker-compose.yml`):

| Serviço | O que faz |
| --- | --- |
| `app` | O sistema (Node). Aplica as migrações do banco ao subir |
| `db` | PostgreSQL, com os dados num volume; não fica exposto na internet |
| `caddy` | HTTPS automático (pede e renova o certificado sozinho) |
| `backup` | Backup do banco ao subir e todo dia às 3h, guardando 14 dias em `backups/` |

### Primeira vez (servidor Ubuntu 22.04 ou 24.04, com 2 GB de RAM ou mais)

1. No Registro.br (ou onde estiver o domínio), aponte `DOMINIO` e `www.DOMINIO` para o IP do servidor.
2. Entre no servidor por SSH e clone o projeto:

   ```bash
   git clone https://github.com/arthurvrr/vanellis-app.git && cd vanellis-app
   ```

3. Prepare o servidor (Docker, firewall, atualizações automáticas, proteção do SSH, `.env`):

   ```bash
   sudo bash deploy/setup-server.sh
   nano .env   # preencha DOMAIN e ACME_EMAIL
   ```

4. Suba o sistema, faça a carga inicial e crie as contas do painel:

   ```bash
   bash deploy/deploy.sh
   docker compose exec app node dist/seed.js
   docker compose exec app node dist/usuario-senha.js <seu-usuario> --papel admin
   docker compose exec app node dist/usuario-senha.js <usuario-da-padaria> --papel operador
   ```

O site fica em `https://DOMINIO` e o painel em `https://DOMINIO/painel/`.

### Dia a dia

| Tarefa | Comando |
| --- | --- |
| Atualizar para a versão mais nova da `main` | `bash deploy/deploy.sh` |
| Ver os registros do servidor | `docker compose logs -f app` |
| Ver os backups | `ls -lh backups/` |
| Restaurar um backup (substitui os dados) | `bash deploy/restore.sh backups/vanellis-AAAA-MM-DD_0300.sql.gz` |
| Trocar a senha de uma conta | `docker compose exec app node dist/usuario-senha.js <usuario>` |

Verificação mensal: conferir se há backups recentes em `backups/` e se o site responde. Vale
copiar de vez em quando um backup para fora do servidor (ex: `scp` para o seu computador).

### Testar no seu computador antes

`bash deploy/teste-local.sh` sobe o mesmo conjunto num projeto separado, com banco de teste, em
`https://localhost:8443` (certificado local: o navegador avisa). `bash deploy/teste-local.sh parar`
desliga e apaga os dados de teste. O seu usuário precisa poder usar o Docker
(`sudo usermod -aG docker $USER` e entrar de novo na sessão).
