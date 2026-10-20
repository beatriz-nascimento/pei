# Repositório de imagens Docker em São Paulo.
resource "google_artifact_registry_repository" "images" {
  repository_id = local.name
  location      = var.region
  format        = "DOCKER"
  description   = "Imagens da API e do frontend (${var.environment})"

  cleanup_policies {
    id     = "manter-ultimas-20"
    action = "KEEP"
    most_recent_versions {
      keep_count = 20
    }
  }

  depends_on = [google_project_service.services]
}
