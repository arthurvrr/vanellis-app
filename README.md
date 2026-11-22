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

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor (porta 3000) e site (porta 5173) com recarga automática |
| `npm run build` | Compila site e servidor |
| `npm start` | Roda o servidor compilado, servindo API e site |
| `npm test` | Testes das regras de preço |
| `npm run typecheck` | Verificação de tipos dos três pacotes |
| `npm run db:generate` | Gera uma migração a partir das mudanças no esquema |
| `npm run db:migrate` | Aplica as migrações pendentes |
| `npm run db:seed` | Apaga e recarrega o catálogo a partir de `server/src/db/seed/catalogo.json` |

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
