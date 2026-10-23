# Infraestrutura e deploy — passo a passo

Tudo roda no Brasil: Supabase em **sa-east-1** (AWS São Paulo) e Cloud Run em
**southamerica-east1** (Google São Paulo). Há dois ambientes, `staging` e `production`, cada
um com seu projeto Supabase, seu projeto no Google Cloud e seu estado do Terraform.

```
Navegador ──► Cloud Run "pei-<env>-web" (nginx + Angular)
     │
     ├──────► Cloud Run "pei-<env>-api" (NestJS) ──► Supabase Postgres (pooler, RLS)
     │
     └──────► Supabase Auth (login)
```

Faça tudo primeiro em **staging**. Para produção, repita com `ENV=production` e veja as
diferenças na [seção 7](#7-produção).

| Passo                                                            | Frequência           |
| ---------------------------------------------------------------- | -------------------- |
| [0. Pré-requisitos](#0-pré-requisitos)                           | uma vez              |
| [1. Supabase](#1-supabase)                                       | uma vez por ambiente |
| [2. Google Cloud](#2-google-cloud)                               | uma vez por ambiente |
| [3. GitHub](#3-github)                                           | uma vez por ambiente |
| [4. Deploy da API e do frontend](#4-deploy-da-api-e-do-frontend) | a cada versão        |
| [5. Verificação](#5-verificação)                                 | a cada deploy        |
| [6. Rollback](#6-rollback)                                       | quando der problema  |

---

## 0. Pré-requisitos

**Contas:** organização no [Supabase](https://supabase.com), conta de faturamento no Google
Cloud e acesso de administrador ao repositório `beatriz-nascimento/pei` no GitHub.

**Ferramentas:**

```bash
brew install --cask google-cloud-sdk
brew install supabase/tap/supabase gh
# O Terraform saiu do Homebrew padrão: instale pelo repositório da HashiCorp
brew install hashicorp/tap/terraform
# Docker Desktop só é necessário para o deploy manual (4.2)

gcloud auth login
gcloud auth application-default login   # credenciais usadas pelo Terraform
supabase login
gh auth login
```

**Variáveis usadas nos comandos abaixo** (abra um terminal e mantenha-o durante o setup):

```bash
export ENV=staging                       # ou production
export PROJECT_ID=pei-staging-123456     # ID único global do projeto GCP
export REGION=southamerica-east1
export REF=abcdefghijklmnop              # Project ref do Supabase (passo 1.2)
```

---

## 1. Supabase

### 1.1 Criar o projeto

No painel, **New project**:

- Nome: `pei-staging` (ou `pei-production`)
- Região: **South America (São Paulo)**
- Senha do banco: gere uma forte e guarde num gerenciador de senhas
- Plano: o gratuito serve para staging. Produção precisa do **Pro**, por causa dos backups e do PITR

### 1.2 Anotar os dados do projeto

| Dado                         | Onde encontrar                                            | Usado em                    |
| ---------------------------- | --------------------------------------------------------- | --------------------------- |
| Project ref                  | _Project Settings → General_                              | `REF`, GitHub               |
| Project URL                  | _Project Settings → Data API_ (`https://REF.supabase.co`) | `supabase_url` no Terraform |
| Chave pública (publishable)  | _Project Settings → API Keys_ (`sb_publishable_...`)      | `supabase_anon_key`         |
| String do pooler (transação) | botão **Connect** → _Transaction pooler_ (porta **6543**) | segredo `database-url`      |

A string do pooler tem este formato (copie a do painel, porque o host pode variar):

```
postgresql://postgres.REF:SENHA@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
```

Se a senha tiver caracteres especiais (`@ : / ? #`), codifique-os para URL (`@` vira `%40`)
ou gere uma senha só com letras e números.

### 1.3 Conferir as chaves de assinatura do JWT

A API valida os tokens de login pelas **chaves públicas (JWKS)** do projeto, sem segredo
compartilhado. Confira se o projeto publica pelo menos uma chave:

```bash
curl -s "https://$REF.supabase.co/auth/v1/.well-known/jwks.json"
# Esperado: {"keys":[{ ... }]}  — lista não vazia
```

Se vier `{"keys":[]}`, o projeto ainda usa o segredo legado HS256. Em _Project Settings →
JWT Keys_, migre para chaves assimétricas e faça a rotação para a nova chave. Sem isso,
toda requisição autenticada à API volta com 401.

### 1.4 Aplicar as migrações do banco

```bash
supabase link --project-ref "$REF"        # pede a senha do banco
supabase db push --dry-run                # mostra o que será aplicado
supabase db push
```

Depois, no painel, abra _Advisors → Security Advisor_ e confirme que não há tabela sem RLS.
Nos próximos deploys, o GitHub Actions aplica as migrações sozinho.

### 1.5 Configurar o Auth

Essas configurações ficam **no painel**. O `supabase db push` não as aplica, e **não use
`supabase config push`**: o `supabase/config.toml` tem URLs de `localhost`.

_Authentication → Sign In / Providers → Email_:

- Email habilitado
- **Confirm email**: ligado (pode ficar desligado em staging para testar mais rápido)
- Tamanho mínimo da senha **10**, exigindo minúsculas, maiúsculas e dígitos, igual ao ambiente local

_Authentication → URL Configuration_ (volte aqui depois do passo 2.5, quando souber a URL do
frontend):

- **Site URL**: `https://URL-DO-FRONTEND`
- **Redirect URLs**: `https://URL-DO-FRONTEND/**` (o login por link volta para
  `/auth/callback?returnUrl=...`)

_Authentication → Emails → SMTP Settings_: em produção, configure um SMTP próprio (ex.:
Amazon SES, Resend, Postmark) com SPF e DKIM no domínio. O SMTP padrão do Supabase envia
poucos e-mails por hora e serve só para testes.

---

## 2. Google Cloud

### 2.1 Projeto e faturamento

Use um projeto por ambiente: assim a conta de deploy de staging não alcança produção.

```bash
gcloud projects create "$PROJECT_ID" --name="PEI $ENV"
gcloud billing accounts list
gcloud billing projects link "$PROJECT_ID" --billing-account=XXXXXX-XXXXXX-XXXXXX
gcloud config set project "$PROJECT_ID"
gcloud auth application-default set-quota-project "$PROJECT_ID"

# APIs que o próprio Terraform precisa para habilitar as demais
gcloud services enable serviceusage.googleapis.com cloudresourcemanager.googleapis.com
```

### 2.2 Bucket do estado do Terraform

```bash
gcloud storage buckets create "gs://$PROJECT_ID-tfstate" --location="$REGION" \
  --uniform-bucket-level-access
gcloud storage buckets update "gs://$PROJECT_ID-tfstate" --versioning
```

### 2.3 Preencher o `.tfvars`

```bash
cd infra/terraform
cp "environments/$ENV.tfvars.example" "environments/$ENV.tfvars"   # fica fora do git

# As URLs do Cloud Run seguem o padrão https://SERVICO-NUMERO_DO_PROJETO.REGIAO.run.app
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
echo "web_url = https://pei-$ENV-web-$PROJECT_NUMBER.$REGION.run.app"
echo "api_url = https://pei-$ENV-api-$PROJECT_NUMBER.$REGION.run.app"
```

Edite `environments/$ENV.tfvars`:

| Variável            | Valor                                                  |
| ------------------- | ------------------------------------------------------ |
| `project_id`        | `$PROJECT_ID`                                          |
| `supabase_url`      | Project URL (1.2)                                      |
| `supabase_anon_key` | chave publishable (1.2)                                |
| `web_url`/`api_url` | as URLs impressas acima, **sem barra no final**        |
| `api_min_instances` | `0` em staging, `1` em produção (evita partida a frio) |

### 2.4 Inicializar o Terraform

```bash
terraform init -backend-config="bucket=$PROJECT_ID-tfstate" -backend-config="prefix=$ENV"
```

### 2.5 Aplicar em duas etapas

O Cloud Run não cria a revisão da API se os segredos que ela usa ainda não tiverem valor.
Por isso, primeiro crie só as APIs e os segredos:

```bash
terraform apply -var-file="environments/$ENV.tfvars" \
  -target=google_project_service.services \
  -target=google_secret_manager_secret.api
```

Preencha os segredos (os valores não passam pelo Terraform nem ficam no estado):

```bash
# Copie a string do pooler (1.2), já com a senha no lugar de [YOUR-PASSWORD], e rode:
# (pbpaste lê da área de transferência; a senha não aparece na tela nem no histórico)
pbpaste | tr -d '[:space:]' | gcloud secrets versions add "pei-$ENV-database-url" --data-file=-

openssl rand -hex 32 | tr -d '\n' | gcloud secrets versions add "pei-$ENV-ip-hash-salt" --data-file=-
```

Agora aplique todo o resto:

```bash
terraform apply -var-file="environments/$ENV.tfvars"
terraform output
```

Os serviços sobem com uma imagem de exemplo (`hello`). A imagem real chega no passo 4.
Confira se `api_url` e `web_url` do `terraform output` são iguais às do `.tfvars`. Se não
forem, corrija o `.tfvars` e rode o `apply` de novo.

Volte ao **passo 1.5** e preencha a _Site URL_ e as _Redirect URLs_ com o `web_url`.

> Domínio próprio: o mapeamento de domínio do Cloud Run não está disponível em todas as
> regiões. Para `app.seudominio.com.br`, use um Load Balancer HTTPS na frente do Cloud Run
> (próxima iteração do Terraform) ou um proxy como o Cloudflare. Ao trocar a URL, atualize
> `web_url`/`api_url` no `.tfvars` e as URLs no Supabase.

---

## 3. GitHub

O GitHub Actions autentica no Google por **Workload Identity Federation**: não existe chave
JSON de conta de serviço, e só o repositório definido em `github_repository` consegue
assumir a conta de deploy.

Crie o environment e cadastre variáveis e segredos (rode dentro de `infra/terraform`):

```bash
gh api -X PUT "repos/beatriz-nascimento/pei/environments/$ENV"

gh variable set GCP_PROJECT_ID       --env "$ENV" --body "$PROJECT_ID"
gh variable set SUPABASE_PROJECT_REF --env "$ENV" --body "$REF"

gh secret set GCP_WORKLOAD_IDENTITY_PROVIDER --env "$ENV" \
  --body "$(terraform output -raw github_workload_identity_provider)"
gh secret set GCP_SERVICE_ACCOUNT --env "$ENV" \
  --body "$(terraform output -raw github_service_account)"

gh secret set SUPABASE_ACCESS_TOKEN --env "$ENV"   # cole o token pessoal do Supabase
gh secret set SUPABASE_DB_PASSWORD  --env "$ENV"   # cole a senha do banco (1.1)
```

O token do Supabase é criado em _Account → Access Tokens_
(https://supabase.com/dashboard/account/tokens).

| Tipo     | Nome                             | Valor                                                |
| -------- | -------------------------------- | ---------------------------------------------------- |
| Variable | `GCP_PROJECT_ID`                 | ID do projeto GCP                                    |
| Variable | `SUPABASE_PROJECT_REF`           | Ref do projeto Supabase                              |
| Secret   | `GCP_WORKLOAD_IDENTITY_PROVIDER` | `terraform output github_workload_identity_provider` |
| Secret   | `GCP_SERVICE_ACCOUNT`            | `terraform output github_service_account`            |
| Secret   | `SUPABASE_ACCESS_TOKEN`          | Token pessoal do Supabase                            |
| Secret   | `SUPABASE_DB_PASSWORD`           | Senha do banco do projeto                            |

Para `production`, em _Settings → Environments → production_: ative **Required reviewers**
e, em _Deployment branches_, permita só a `main`.

---

## 4. Deploy da API e do frontend

A ordem é sempre: **migrações → API → frontend**. A mesma imagem do frontend serve qualquer
ambiente, porque o nginx gera o `/config.json` a partir das variáveis do Cloud Run.

### 4.1 Pelo GitHub Actions (caminho normal)

- **Staging**: cada push na `main` dispara o workflow **Deploy**.
- **Manual** (qualquer ambiente):

  ```bash
  gh workflow run Deploy -f environment=staging      # ou production
  gh run watch
  ```

  Em produção, o deploy espera a aprovação de um revisor do environment.

O workflow ([.github/workflows/deploy.yml](../.github/workflows/deploy.yml)) aplica as
migrações com `supabase db push`, gera as imagens com a tag do commit, publica no Artifact
Registry, cria as novas revisões `pei-$ENV-api` e `pei-$ENV-web` e chama `/health/ready`.

### 4.2 Manual, pelo seu computador (primeiro deploy ou depuração)

Sua conta precisa de permissão no projeto (dono ou editor). Rode na raiz do repositório:

```bash
supabase link --project-ref "$REF" && supabase db push

gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet
IMAGES="$REGION-docker.pkg.dev/$PROJECT_ID/pei-$ENV"
TAG=$(git rev-parse --short=12 HEAD)

# --platform é obrigatório em Mac com chip Apple: o Cloud Run roda amd64
docker buildx build --platform linux/amd64 -f apps/api/Dockerfile -t "$IMAGES/api:$TAG" --push .
docker buildx build --platform linux/amd64 -f apps/web/Dockerfile -t "$IMAGES/web:$TAG" --push .

gcloud run deploy "pei-$ENV-api" --image "$IMAGES/api:$TAG" --region "$REGION" --quiet
gcloud run deploy "pei-$ENV-web" --image "$IMAGES/web:$TAG" --region "$REGION" --quiet
```

Variáveis de ambiente, segredos e escala vêm do Terraform. Não passe `--set-env-vars` aqui:
o próximo `terraform apply` desfaria a mudança.

---

## 5. Verificação

```bash
cd infra/terraform
API_URL=$(terraform output -raw api_url)
WEB_URL=$(terraform output -raw web_url)

curl -f "$API_URL/health"          # {"status":"ok"}: processo no ar
curl -f "$API_URL/health/ready"    # {"status":"ok"}: banco acessível
curl -s "$WEB_URL/config.json"     # apiUrl, supabaseUrl e chave do ambiente certo, sem "mock"
```

No navegador, em `$WEB_URL`, com o DevTools aberto:

1. Criar conta, confirmar o e-mail e entrar (por senha e por link mágico)
2. Concluir o onboarding e cadastrar um aluno
3. Criar um PEI e exportar em PDF e em Word
4. Gerar o link da família e abri-lo numa janela anônima
5. Conferir que o console não mostra erros de CORS nem de CSP

Logs:

```bash
gcloud run services logs read "pei-$ENV-api" --region "$REGION" --limit 50
gcloud run services logs read "pei-$ENV-web" --region "$REGION" --limit 50
```

---

## 6. Rollback

Voltar a API ou o frontend para uma revisão anterior é imediato:

```bash
gcloud run revisions list --service "pei-$ENV-api" --region "$REGION"
gcloud run services update-traffic "pei-$ENV-api" --region "$REGION" \
  --to-revisions=pei-$ENV-api-00012-abc=100
```

As migrações **não** são desfeitas. Como elas rodam antes da API nova subir, escreva cada
migração de forma que a versão anterior da API continue funcionando (adicionar colunas e
tabelas primeiro; remover só num deploy seguinte). Para corrigir uma migração errada, crie
uma nova migração.

---

## 7. Produção

Repita os passos 1 a 3 com `ENV=production`, com estas diferenças:

- Projeto Supabase **separado**, no plano Pro, com **PITR** habilitado. Teste uma
  restauração antes de colocar clientes.
- **Confirm email** ligado e **SMTP próprio** configurado (1.5).
- Projeto GCP separado, `api_min_instances = 1`.
- Environment `production` no GitHub com revisores obrigatórios.
- Os serviços do Cloud Run de produção têm `deletion_protection`: o Terraform não os apaga
  por engano.
- Deploy só manual: `gh workflow run Deploy -f environment=production`.

Antes de abrir para clientes, veja também as pendências de [docs/lgpd.md](../docs/lgpd.md) e
[docs/checklist.md](../docs/checklist.md).

---

## Problemas comuns

| Sintoma                                                              | Causa provável e solução                                                                                                                             |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `terraform apply` falha ao criar `pei-<env>-api`: segredo sem versão | Os segredos não foram preenchidos. Siga a ordem do passo 2.5.                                                                                        |
| `/health/ready` responde 503                                         | `DATABASE_URL` errada: confira porta 6543, usuário `postgres.REF`, senha codificada para URL. Adicione nova versão do segredo e faça deploy de novo. |
| Logs da API: `self-signed certificate in certificate chain`          | A imagem não tem a CA do Supabase. Confira `apps/api/certs/supabase-root-2021.crt` e `NODE_EXTRA_CA_CERTS` no `apps/api/Dockerfile`.                 |
| Logs da API: `Variáveis de ambiente inválidas`                       | Algum segredo vazio ou curto (`IP_HASH_SALT` precisa de 16+ caracteres).                                                                             |
| Login funciona, mas toda chamada à API dá 401                        | O projeto Supabase ainda assina com HS256. Veja o passo 1.3.                                                                                         |
| Erro de CORS no navegador                                            | `web_url` no `.tfvars` diferente do endereço real do frontend (ou com `/` no final). Corrija e rode `terraform apply`.                               |
| Link de login leva para `localhost`                                  | _Site URL_ e _Redirect URLs_ não configuradas no Supabase (1.5).                                                                                     |
| Container não inicia: `exec format error`                            | Imagem gerada em Mac com chip Apple sem `--platform linux/amd64` (4.2).                                                                              |
| Workflow falha em `google-github-actions/auth`                       | `github_repository` errado no `.tfvars`, ou os segredos `GCP_*` trocados entre si.                                                                   |
| Workflow falha em `supabase db push`                                 | `SUPABASE_ACCESS_TOKEN` expirado ou `SUPABASE_DB_PASSWORD` incorreta no environment.                                                                 |

## Custos (ordem de grandeza)

- Cloud Run escala até zero: com pouco uso, fica perto do nível gratuito. `api_min_instances = 1`
  em produção elimina a "partida a frio" ao custo de uma instância sempre ligada.
- Supabase Pro por projeto (homologação pode usar o plano gratuito).
- Artifact Registry guarda só as 20 imagens mais recentes por ambiente.

Confira os preços atuais nas páginas do Google Cloud e do Supabase antes de decidir, e crie um
alerta de orçamento no faturamento do Google Cloud.
