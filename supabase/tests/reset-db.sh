#!/usr/bin/env bash
# Recria um banco de teste em Postgres puro: shim do Supabase + todas as migrações.
# Uso: DATABASE_URL=postgres://postgres:postgres@localhost:54322/pei_test ./supabase/tests/reset-db.sh
set -euo pipefail

: "${DATABASE_URL:?defina DATABASE_URL}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DB_NAME="${DATABASE_URL##*/}"
DB_NAME="${DB_NAME%%\?*}"
ADMIN_URL="${DATABASE_URL%/*}/postgres"

psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -q -c "drop database if exists \"$DB_NAME\" with (force)"
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -q -c "create database \"$DB_NAME\""

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/tests/auth-shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done
echo "Banco $DB_NAME pronto."
