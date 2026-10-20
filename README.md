# PEI — Plano Educacional Individualizado

SaaS para escolas e profissionais (psicopedagogos, fonoaudiólogos, TOs…) elaborarem e
acompanharem PEIs: estudo de caso, linha de base, metas SMART, medição, adaptações,
serviços, documento em PDF/Word e portal da família.

Fluxo coberto nesta versão (MVP):

1. Cliente cria a conta e escolhe o tipo: **Escola** ou **Profissional**
2. Escola convida a equipe e define papéis: **Admin · Edita PEI · Só leitura**
3. Cadastro de alunos e vínculo com os responsáveis (prof. regente, AEE…)
4. PEI em rascunho por ano/versão → preenchimento das abas → metas SMART
5. Registro de progresso (inclusive pelo celular) e PEI em vigor
6. Documento do PEI em **PDF** e **Word**, com assinaturas
7. Link da família (sem cadastro, só leitura, com termo LGPD e contagem de acessos)

## Stack

| Camada       | Tecnologia                                                             |
| ------------ | ---------------------------------------------------------------------- |
| Frontend     | Angular 22 (standalone, signals, Signal Forms) + Angular Material 22   |
| API          | NestJS 12 sobre Fastify, Kysely (SQL tipado)                           |
| Banco e auth | Supabase (Postgres 17 + Row-Level Security + Supabase Auth), sa-east-1 |
| Validação    | zod 4 — os mesmos esquemas no formulário e na API (`packages/shared`)  |
| Documentos   | pdfmake (PDF) e docx (Word), gerados na hora, sem guardar arquivos     |
| Infra        | Google Cloud Run (São Paulo), Artifact Registry, Secret Manager        |
| IaC e CI/CD  | Terraform + GitHub Actions (Workload Identity Federation, sem chave)   |

Bibliotecas de apoio, em uma linha cada:

- **Kysely**: monta consultas SQL com tipos gerados a partir do banco (`kysely-codegen`).
- **jose**: valida os tokens JWT do Supabase (chaves públicas JWKS ou segredo HS256).
- **nestjs-pino / pino**: logs estruturados em JSON, já no formato do Cloud Logging.
- **@fastify/helmet, @fastify/cors, @fastify/rate-limit**: cabeçalhos de segurança, CORS e limite de requisições.
- **@supabase/supabase-js**: cliente oficial do Supabase (login no frontend).
- **@fontsource-variable/inter, material-symbols**: fonte e ícones servidos pelo próprio app, sem Google Fonts.
- **Vitest**: testes unitários e de integração (API, pacote compartilhado e Angular).

## Estrutura

```
apps/
  api/          NestJS — módulos: me, tenants, members, students, peis, exports, family, health
  web/          Angular — features: auth, onboarding, shell, students, pei, progress, team, family
packages/
  shared/       Esquemas zod, enums, rótulos em português e tipos das respostas da API
supabase/
  migrations/   Esquema, RLS, funções e auditoria (fonte da verdade do banco)
  tests/        Shim do Supabase para testar em Postgres puro (CI)
infra/
  terraform/    Cloud Run, Artifact Registry, Secret Manager, IAM e WIF
.github/        CI, deploy e Dependabot
docs/           Arquitetura, LGPD e próximos passos
```

## Rodando localmente

Pré-requisitos: Node 24 (`.nvmrc`), npm 11, Docker e [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
npm install
npm run build:shared

# Banco + Auth locais (Postgres em 54322, API do Supabase em 54321)
supabase start          # aplica supabase/migrations automaticamente
supabase status         # mostra a "anon key" (ou "publishable key")

# API
cp apps/api/.env.example apps/api/.env   # ajuste se precisar
npm run dev:api                           # http://localhost:3000

# Frontend: cole a chave pública do Supabase em apps/web/public/config.json
npm run dev:web                           # http://localhost:4200
```

E-mails do Supabase local (confirmação, link mágico) aparecem em http://localhost:54324.

## Testes e qualidade

```bash
npm run lint
npm run typecheck
npm test        # inclui testes de RLS e do fluxo completo da API contra Postgres
```

Os testes da API recriam o banco `pei_test` a partir das migrações. Por padrão usam
`postgres://postgres:postgres@localhost:54322/pei_test` (o Postgres do `supabase start`);
mude com `TEST_DATABASE_URL`.

Depois de alterar o banco, regenere os tipos do Kysely:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:54322/postgres npm run db:types
```

## Deploy

Veja [infra/README.md](infra/README.md): criar o projeto Supabase em São Paulo, aplicar o
Terraform, cadastrar os segredos e as variáveis do GitHub. Depois disso, cada push na `main`
publica em homologação, e produção sai por execução manual do workflow **Deploy**.

## Documentação

- [docs/arquitetura.md](docs/arquitetura.md): decisões técnicas (multi-tenancy, RLS, auth, documentos)
- [docs/lgpd.md](docs/lgpd.md): como o sistema trata dados de menores e o que validar com o jurídico
- [docs/roadmap.md](docs/roadmap.md): o que ficou para as próximas iterações
- [docs/checklist.md](docs/checklist.md): checklist de próximos passos até a produção
