# syntax=docker/dockerfile:1.7
# Imagem do frontend (Cloud Run). Build a partir da raiz do repositório:
#   docker build -f apps/web/Dockerfile -t pei-web .

FROM node:24-slim AS build
WORKDIR /repo
# Todos os package.json do workspace, para o npm ci bater com o package-lock.json.
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=npm,target=/root/.npm \
    npm ci -w @pei/shared -w @pei/web
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @pei/shared && npm run build -w @pei/web

# nginx sem root, escutando na porta 8080 (padrão do Cloud Run).
FROM nginxinc/nginx-unprivileged:1.31-alpine AS runtime
ENV API_URL=http://localhost:3000/v1 \
    API_ORIGIN=http://localhost:3000 \
    SUPABASE_URL=http://127.0.0.1:54321 \
    SUPABASE_ANON_KEY=""
# Só estas variáveis são substituídas no template (o resto, como $uri, fica intacto).
ENV NGINX_ENVSUBST_FILTER="^(API_URL|API_ORIGIN|SUPABASE_URL|SUPABASE_ANON_KEY)$"
COPY apps/web/docker/default.conf.template /etc/nginx/templates/default.conf.template
COPY apps/web/docker/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /repo/apps/web/dist/web/browser /usr/share/nginx/html
EXPOSE 8080
