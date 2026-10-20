import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const TEST_DATABASE_URL =
  process.env['TEST_DATABASE_URL'] ?? 'postgres://postgres:postgres@localhost:54322/pei_test';

/** Recria o banco de teste (shim do Supabase + migrações) uma vez por execução. */
export default function setup(): void {
  const script = fileURLToPath(new URL('../../../supabase/tests/reset-db.sh', import.meta.url));
  execFileSync(script, {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'inherit',
  });
}
