# Infraestrutura e deploy

Tudo roda no Brasil: Supabase em **sa-east-1** (AWS São Paulo) e Cloud Run em
**southamerica-east1** (Google São Paulo). Há dois ambientes: `staging` e `production`,
cada um com seu projeto Supabase e seu estado do Terraform.

```
Navegador ──► Cloud Run "web" (nginx + Angular)
     │
     └──────► Cloud Run "api" (NestJS) ──► Supabase Postgres (pooler, RLS)
     │
     └──────► Supabase Auth (login)
```

## 1. Supabase (uma vez por ambiente)

1. Crie o projeto no painel do Supabase, **região South America (São Paulo)**.
2. Em _Authentication → URL Configuration_, informe a URL do frontend como _Site URL_
   e `https://SEU-FRONTEND/auth/callback` em _Redirect URLs_.
3. Em _Authentication → Emails_, configure um SMTP próprio para produção (o padrão do
   Supabase tem limite baixo de envios).
4. Anote: _Project ref_, _Project URL_, chave pública (anon/publishable), senha do banco e a
   string do **pooler em modo transação** (porta 6543) em _Connect_.

As migrações são aplicadas pelo workflow de deploy (`supabase db push`). Para aplicar à mão:

```bash
supabase link --project-ref SEU_REF
supabase db push
```

## 2. Google Cloud (uma vez por ambiente)

```bash
gcloud config set project SEU_PROJETO

# Bucket para o estado do Terraform (nome único global)
gcloud storage buckets create gs://SEU_PROJETO-tfstate --location=southamerica-east1 \
  --uniform-bucket-level-access
gcloud storage buckets update gs://SEU_PROJETO-tfstate --versioning

cd infra/terraform
cp environments/staging.tfvars.example environments/staging.tfvars   # edite os valores
terraform init -backend-config="bucket=SEU_PROJETO-tfstate" -backend-config="prefix=staging"
terraform apply -var-file=environments/staging.tfvars
```

O primeiro `apply` sobe os serviços com uma imagem de exemplo. Depois:

1. **Preencha os segredos** (os valores não passam pelo Terraform):

   ```bash
   printf '%s' 'postgres://postgres.SEU_REF:SENHA@aws-0-sa-east-1.pooler.supabase.com:6543/postgres' \
     | gcloud secrets versions add pei-staging-database-url --data-file=-
   openssl rand -hex 32 | tr -d '\n' | gcloud secrets versions add pei-staging-ip-hash-salt --data-file=-
   ```

2. **Ajuste as URLs**: troque `web_url` e `api_url` no `.tfvars` pelas saídas
   `terraform output web_url` / `api_url` (ou pelos seus domínios) e rode `apply` de novo.

> Domínio próprio: o mapeamento de domínio do Cloud Run não está disponível em todas as
> regiões. Para `app.seudominio.com.br`, use um Load Balancer HTTPS na frente do Cloud Run
> (próxima iteração do Terraform) ou um proxy como o Cloudflare.

## 3. GitHub

Em _Settings → Environments_, crie `staging` e `production` (em produção, exija aprovação).
Em cada environment:

| Tipo     | Nome                             | Valor                                                |
| -------- | -------------------------------- | ---------------------------------------------------- |
| Variable | `GCP_PROJECT_ID`                 | ID do projeto GCP                                    |
| Variable | `SUPABASE_PROJECT_REF`           | Ref do projeto Supabase                              |
| Secret   | `GCP_WORKLOAD_IDENTITY_PROVIDER` | `terraform output github_workload_identity_provider` |
| Secret   | `GCP_SERVICE_ACCOUNT`            | `terraform output github_service_account`            |
| Secret   | `SUPABASE_ACCESS_TOKEN`          | Token pessoal do Supabase (painel → Account)         |
| Secret   | `SUPABASE_DB_PASSWORD`           | Senha do banco do projeto                            |

O GitHub Actions autentica no Google por **Workload Identity Federation**: não existe chave
JSON de conta de serviço, e só o repositório configurado em `github_repository` consegue
assumir a conta de deploy.

## Custos (ordem de grandeza)

- Cloud Run escala até zero: com pouco uso, fica perto do nível gratuito. `api_min_instances = 1`
  em produção elimina a "partida a frio" ao custo de uma instância sempre ligada.
- Supabase Pro por projeto (homologação pode usar o plano gratuito).
- Artifact Registry guarda só as 20 imagens mais recentes por ambiente.

Confira os preços atuais nas páginas do Google Cloud e do Supabase antes de decidir.
