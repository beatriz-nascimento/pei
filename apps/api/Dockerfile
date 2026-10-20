# syntax=docker/dockerfile:1.7
# Imagem da API (Cloud Run). Build a partir da raiz do repositório:
#   docker build -f apps/api/Dockerfile -t pei-api .

FROM node:24-slim AS base
WORKDIR /repo
# Todos os package.json do workspace, para o npm ci bater com o package-lock.json.
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

FROM base AS build
RUN --mount=type=cache,id=npm,target=/root/.npm \
    npm ci -w @pei/shared -w @pei/api
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @pei/shared && npm run build -w @pei/api

# Só a API, o pacote compartilhado e dependências de produção.
FROM base AS prod
RUN --mount=type=cache,id=npm,target=/root/.npm \
    npm ci --omit=dev -w @pei/shared -w @pei/api \
 && rm -rf apps/web tsconfig.base.json
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/apps/api/dist apps/api/dist

FROM node:24-slim AS runtime
ENV NODE_ENV=production PORT=8080
COPY --from=prod --chown=node:node /repo /app
WORKDIR /app/apps/api
EXPOSE 8080
# Usuário sem privilégios de root.
USER node
CMD ["node", "dist/main.js"]
