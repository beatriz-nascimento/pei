# API NestJS -------------------------------------------------------------------
resource "google_cloud_run_v2_service" "api" {
  name                = "${local.name}-api"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = var.environment == "production"

  template {
    service_account = google_service_account.api.email

    scaling {
      min_instance_count = var.api_min_instances
      max_instance_count = var.api_max_instances
    }

    containers {
      image = var.api_image

      ports {
        container_port = 8080
      }

      resources {
        limits = { cpu = "1", memory = "512Mi" }
        # CPU só durante requisições: mais barato para tráfego irregular.
        cpu_idle          = true
        startup_cpu_boost = true
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "SUPABASE_URL"
        value = var.supabase_url
      }
      env {
        name  = "WEB_URL"
        value = var.web_url
      }
      env {
        name  = "DATABASE_SSL"
        value = "true"
      }
      env {
        name  = "DATABASE_POOL_MAX"
        value = "5"
      }

      dynamic "env" {
        for_each = google_secret_manager_secret.api
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value.secret_id
              version = "latest"
            }
          }
        }
      }

      startup_probe {
        http_get {
          path = "/health/ready"
        }
        initial_delay_seconds = 2
        period_seconds        = 5
        failure_threshold     = 6
      }

      liveness_probe {
        http_get {
          path = "/health"
        }
        period_seconds = 30
      }
    }
  }

  # O GitHub Actions troca a imagem a cada deploy; o Terraform não desfaz isso.
  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }

  depends_on = [google_secret_manager_secret_iam_member.api_access]
}

# Frontend Angular (nginx) -------------------------------------------------------
resource "google_cloud_run_v2_service" "web" {
  name                = "${local.name}-web"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = var.environment == "production"

  template {
    service_account = google_service_account.web.email

    scaling {
      min_instance_count = 0
      max_instance_count = 5
    }

    containers {
      image = var.web_image

      ports {
        container_port = 8080
      }

      resources {
        limits            = { cpu = "1", memory = "256Mi" }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      env {
        name  = "API_URL"
        value = "${trimsuffix(var.api_url, "/")}/v1"
      }
      env {
        name  = "API_ORIGIN"
        value = trimsuffix(var.api_url, "/")
      }
      env {
        name  = "SUPABASE_URL"
        value = var.supabase_url
      }
      env {
        name  = "SUPABASE_ANON_KEY"
        value = var.supabase_anon_key
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }

  depends_on = [google_project_service.services]
}

# Acesso público (o controle de acesso é feito pela aplicação + RLS).
resource "google_cloud_run_v2_service_iam_member" "public" {
  for_each = {
    api = google_cloud_run_v2_service.api.name
    web = google_cloud_run_v2_service.web.name
  }
  name     = each.value
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}
