# Contas de serviço com o mínimo de permissões.

resource "google_service_account" "api" {
  account_id   = "${local.name}-api"
  display_name = "PEI API (${var.environment})"
}

resource "google_service_account" "web" {
  account_id   = "${local.name}-web"
  display_name = "PEI Web (${var.environment})"
}

resource "google_service_account" "deployer" {
  account_id   = "${local.name}-deployer"
  display_name = "GitHub Actions deploy (${var.environment})"
}

# Deploy: publicar imagens e atualizar os serviços do Cloud Run.
resource "google_artifact_registry_repository_iam_member" "deployer_push" {
  repository = google_artifact_registry_repository.images.name
  location   = var.region
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_project_iam_member" "deployer_run" {
  project = var.project_id
  role    = "roles/run.developer"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

# Para fazer deploy "como" as contas de runtime.
resource "google_service_account_iam_member" "deployer_act_as" {
  for_each           = { api = google_service_account.api.name, web = google_service_account.web.name }
  service_account_id = each.value
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}

# Workload Identity Federation: o GitHub Actions autentica sem chave JSON,
# e só este repositório pode assumir a conta de deploy.
resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "${local.name}-github"
  display_name              = "GitHub (${var.environment})"
  depends_on                = [google_project_service.services]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-oidc"
  display_name                       = "GitHub OIDC"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }
  attribute_condition = "assertion.repository == '${var.github_repository}'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "github_impersonation" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}
