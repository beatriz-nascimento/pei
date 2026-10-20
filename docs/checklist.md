# Checklist — próximos passos de desenvolvimento e deploy

Ordem sugerida: cada bloco destrava o seguinte. Itens marcados com **(bloqueia produção)**
precisam estar resolvidos antes de abrir para clientes reais.

## 1. Arrumar o repositório

- [ x] Commitar a alteração pendente em `apps/web/src/app/features/shell/shell.scss`.
- [ x] Escolher **um** gerenciador de pacotes. CI, Dockerfiles e README usam npm
  (`package-lock.json`), mas também existem `pnpm-lock.yaml` e `pnpm-workspace.yaml`.
  Se ficar com npm, apagar os arquivos do pnpm.
- [ ] Rodar localmente `npm run format:check && npm run lint && npm run typecheck && npm test`.
- [ ] Impedir que o workflow **Deploy** falhe a cada push na `main` enquanto o GitHub não
      está configurado (ex.: `if: vars.GCP_PROJECT_ID != ''` no job, ou só `workflow_dispatch`
      por enquanto).
- [ ] Fixar a versão do Supabase CLI em `.github/workflows/deploy.yml` (hoje `version: latest`).
- [ ] Proteger a `main` no GitHub: exigir PR e os jobs do CI (app, terraform, docker) verdes.

## 2. Validar o MVP localmente, de ponta a ponta

- [ ] `supabase start`, API e frontend com `"mock": false` em `apps/web/public/config.json`.
- [ ] Percorrer os 7 fluxos do README: criar conta (escola e profissional), convidar equipe e
      testar os três papéis, cadastrar aluno e vínculos, PEI completo com metas SMART,
      registro de progresso pelo celular, exportar PDF e Word, link da família.
- [ ] Conferir que os tipos do Kysely estão em dia com as migrações (`npm run db:types` não
      gera diff).
- [ ] Anotar bugs e lacunas de UX encontrados e priorizar antes do piloto.

## 3. Homologação (staging)

Passo a passo detalhado em [infra/README.md](../infra/README.md).

- [ ] Supabase: projeto em São Paulo, _Site URL_ e _Redirect URLs_ apontando para o frontend.
- [ ] Google Cloud: projeto com faturamento, bucket do estado do Terraform com versionamento.
- [ ] `staging.tfvars` preenchido e `terraform apply`.
- [ ] Segredos no Secret Manager: `database-url` (pooler, porta 6543) e `ip-hash-salt`.
- [ ] Trocar `web_url`/`api_url` pelas URLs reais e rodar `apply` de novo.
- [ ] GitHub: environment `staging` com as variáveis e segredos da tabela do infra/README.
- [ ] Rodar o **Deploy** e verificar `/health/ready`.
- [ ] Teste de fumaça em staging: login por senha e link mágico, CORS, CSP (sem erros no
      console), exportações, portal da família.

## 4. Qualidade antes de produção

- [ ] Ampliar os testes do frontend (hoje 3 arquivos de spec): guards, interceptor de auth,
      editor do PEI, onboarding.
- [ ] Testes ponta a ponta com Playwright no CI usando `supabase start` (roadmap, item 7).
- [ ] Verificação de saúde também do frontend no workflow de deploy.
- [ ] Regra para migrações: como elas rodam **antes** da API nova subir, toda migração
      precisa ser compatível com a versão anterior da API (adicionar antes, remover depois).
- [ ] Documentar o rollback: `gcloud run services update-traffic ... --to-revisions=REV=100`
      e o que fazer se a migração já tiver rodado.

## 5. Segurança e LGPD

Detalhes em [docs/lgpd.md](lgpd.md).

- [ ] **(bloqueia produção)** Jurídico valida: texto do termo da família, papéis
      controlador/operador e DPA, base legal (`audit_log.legal_basis`), prazos de retenção,
      consentimento para o cadastro do aluno.
- [ ] **(bloqueia produção)** Teste de intrusão básico em staging.
- [ ] **(bloqueia produção)** Supabase Pro com backups e PITR; fazer **um teste de restauração**.
- [ ] **(bloqueia produção)** SMTP próprio com SPF/DKIM para os e-mails do Supabase Auth.
- [ ] Revisar Auth no Supabase: confirmação de e-mail obrigatória, política de senha,
      expiração da sessão.
- [ ] Rodar os _Security Advisors_ do painel do Supabase e resolver os alertas.
- [ ] Exportação de todos os dados do aluno (portabilidade, art. 18).
- [ ] Dependabot ativo e revisado com frequência.

## 6. Observabilidade e custos

- [ ] Uptime check em `/health/ready` com alerta por e-mail (Cloud Monitoring).
- [ ] Alertas de taxa de erro 5xx e latência da API.
- [ ] Rastreamento de erros (Cloud Error Reporting ou Sentry), sem dados pessoais.
- [ ] Retenção dos logs definida e compatível com a LGPD.
- [ ] Alerta de orçamento no faturamento do Google Cloud.
- [ ] Levar monitoramento e alertas para o Terraform.

## 7. Produção

- [ ] Repetir os passos 3 com `production.tfvars` e um projeto Supabase separado.
- [ ] Decidir `api_min_instances` (0 = mais barato, 1 = sem partida a frio).
- [ ] Domínio próprio via Load Balancer HTTPS ou Cloudflare; atualizar URLs no Supabase,
      `WEB_URL`/`CORS_ORIGINS` e conferir a CSP.
- [ ] Environment `production` no GitHub com aprovação obrigatória.
- [ ] Primeiro deploy manual, teste de fumaça e rollback ensaiado.
- [ ] Piloto com uma escola, com canal direto para feedback.

## 8. Depois do lançamento

Seguir [docs/roadmap.md](roadmap.md). Os mais urgentes para o piloto:

- [ ] E-mail automático de convite e do link da família.
- [ ] Lembretes de revisão de metas e PEIs.
- [ ] Banco de metas SMART/BNCC por perfil (depende do especialista em educação especial).
