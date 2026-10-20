output "api_url" {
  description = "URL gerada pelo Cloud Run para a API"
  value       = google_cloud_run_v2_service.api.uri
}

output "web_url" {
  description = "URL gerada pelo Cloud Run para o frontend"
  value       = google_cloud_run_v2_service.web.uri
}

output "artifact_registry" {
  description = "Prefixo das imagens Docker"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}"
}

output "github_workload_identity_provider" {
  description = "Valor para o secret GCP_WORKLOAD_IDENTITY_PROVIDER no GitHub"
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "github_service_account" {
  description = "Valor para o secret GCP_SERVICE_ACCOUNT no GitHub"
  value       = google_service_account.deployer.email
}

output "secret_ids" {
  description = "Segredos a preencher (gcloud secrets versions add ...)"
  value       = { for k, s in google_secret_manager_secret.api : k => s.secret_id }
}
