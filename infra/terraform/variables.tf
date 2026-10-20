variable "project_id" {
  description = "ID do projeto no Google Cloud"
  type        = string
}

variable "environment" {
  description = "Nome do ambiente (staging, production)"
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Use staging ou production."
  }
}

variable "region" {
  description = "Região do Cloud Run. São Paulo mantém os dados de menores em território nacional."
  type        = string
  default     = "southamerica-east1"
}

variable "github_repository" {
  description = "Repositório autorizado a fazer deploy, no formato dono/repo"
  type        = string
  default     = "beatriz-nascimento/pei"
}

variable "api_image" {
  description = "Imagem inicial da API. Depois o deploy (GitHub Actions) atualiza a imagem."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "web_image" {
  description = "Imagem inicial do frontend. Depois o deploy (GitHub Actions) atualiza a imagem."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "supabase_url" {
  description = "URL do projeto Supabase (região sa-east-1), ex.: https://abcd.supabase.co"
  type        = string
}

variable "supabase_anon_key" {
  description = "Chave pública (anon/publishable) do Supabase. Não é segredo; vai para o navegador."
  type        = string
}

variable "web_url" {
  description = "URL pública do frontend (domínio próprio ou URL do Cloud Run)"
  type        = string
}

variable "api_url" {
  description = "URL pública da API, sem /v1 (domínio próprio ou URL do Cloud Run)"
  type        = string
}

variable "api_min_instances" {
  description = "Instâncias sempre ligadas da API. 0 economiza; 1 evita a primeira requisição lenta."
  type        = number
  default     = 0
}

variable "api_max_instances" {
  type    = number
  default = 10
}
