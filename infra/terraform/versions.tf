terraform {
  required_version = ">= 1.9"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.8"
    }
  }

  # Estado remoto num bucket do GCS (crie antes: ver infra/README.md).
  # Cada ambiente usa um prefixo: terraform init -backend-config="prefix=staging"
  backend "gcs" {}
}

provider "google" {
  project = var.project_id
  region  = var.region
}
