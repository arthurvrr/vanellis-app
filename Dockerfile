# Imagem de produção do Vanellis: o site do cliente, o painel e a API num processo só.
# Roda igual em qualquer máquina com Docker; o que muda de um servidor para outro vem do .env.

# ---------- 1. Compilação ----------
FROM node:25-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY tsconfig.base.json ./
COPY shared shared
COPY server server
COPY client client
RUN npm run build -w client && npm run build -w server

# ---------- 2. Só as dependências que o servidor usa em produção ----------
FROM node:25-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev --workspace server

# ---------- 3. Imagem final ----------
FROM node:25-bookworm-slim
ENV NODE_ENV=production \
    PORT=3000 \
    TZ=America/Sao_Paulo
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server/package.json server/
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/drizzle server/drizzle
COPY --from=build /app/client/dist client/dist
WORKDIR /app/server
USER node
EXPOSE 3000
# Versão (commit) desta imagem, mostrada no /api/health. O CD passa o commit; local fica "dev".
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Aplica as migrações pendentes e sobe o servidor.
CMD ["sh", "-c", "node dist/migrate.js && exec node dist/index.js"]
