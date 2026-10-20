# Segredos da API. O Terraform cria os "cofres"; os valores são adicionados
# fora do código (ver infra/README.md), para não ficarem no estado do Terraform.
locals {
  api_secrets = {
    DATABASE_URL = "Conexão do Postgres do Supabase (pooler, modo transação, porta 6543)"
    IP_HASH_SALT = "Sal para o hash de IP no log de acesso da família"
  }
}

resource "google_secret_manager_secret" "api" {
  for_each  = local.api_secrets
  secret_id = "${local.name}-${lower(replace(each.key, "_", "-"))}"

  labels = { app = "pei", environment = var.environment }

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  depends_on = [google_project_service.services]
}

resource "google_secret_manager_secret_iam_member" "api_access" {
  for_each  = google_secret_manager_secret.api
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api.email}"
}
