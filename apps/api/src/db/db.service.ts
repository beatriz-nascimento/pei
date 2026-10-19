import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { CamelCasePlugin, Kysely, PostgresDialect, sql, type Transaction } from 'kysely';
import pg from 'pg';
import { ENV, type Env } from '../config/env.js';
import type { AuthUser } from '../auth/auth.types.js';
import type { DB } from './types.js';

// DATE vem como 'YYYY-MM-DD' (string), sem conversão para Date e sem surpresas de fuso.
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);
// BIGINT/identity como string (evita perda de precisão).
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => v);

export type Tx = Transaction<DB>;

/**
 * Acesso ao banco.
 *
 * Toda consulta de usuário roda dentro de uma transação que assume o papel
 * "authenticated" e injeta os claims do JWT — exatamente como o Supabase faz.
 * Assim, as políticas de RLS valem também para a API: mesmo que um handler
 * esqueça um filtro por conta, o banco não devolve dados de outro inquilino.
 */
@Injectable()
export class DbService implements OnModuleDestroy {
  readonly pool: pg.Pool;
  private readonly db: Kysely<DB>;

  constructor(@Inject(ENV) env: Env) {
    this.pool = new pg.Pool({
      connectionString: env.DATABASE_URL,
      max: env.DATABASE_POOL_MAX,
      ssl: env.DATABASE_SSL ? { rejectUnauthorized: true } : undefined,
      application_name: 'pei-api',
    });
    this.db = new Kysely<DB>({
      dialect: new PostgresDialect({ pool: this.pool }),
      plugins: [new CamelCasePlugin()],
    });
  }

  /** Executa `fn` como o usuário autenticado (RLS ativo). */
  asUser<T>(user: AuthUser, fn: (trx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction().execute(async (trx) => {
      await sql`select set_config('request.jwt.claims', ${JSON.stringify(user.claims)}, true)`.execute(
        trx,
      );
      await sql`set local role authenticated`.execute(trx);
      return fn(trx);
    });
  }

  /** Executa `fn` como visitante anônimo (portal da família). */
  asAnon<T>(fn: (trx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction().execute(async (trx) => {
      await sql`select set_config('request.jwt.claims', '{"role":"anon"}', true)`.execute(trx);
      await sql`set local role anon`.execute(trx);
      return fn(trx);
    });
  }

  /** Verificação de prontidão (health check). */
  async ping(): Promise<void> {
    await sql`select 1`.execute(this.db);
  }

  async onModuleDestroy(): Promise<void> {
    await this.db.destroy();
  }
}
