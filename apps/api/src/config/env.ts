import { z } from 'zod';

/**
 * Variáveis de ambiente validadas na inicialização. Se algo estiver faltando,
 * a API não sobe — melhor falhar no deploy do que em produção.
 */
const Env = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().default(3000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    /** Conexão do Postgres (Supabase: use o pooler em modo transação, porta 6543). */
    DATABASE_URL: z.url(),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).default(10),
    DATABASE_SSL: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),

    /** URL do projeto Supabase, ex.: https://xyz.supabase.co */
    SUPABASE_URL: z.url(),
    /**
     * Segredo HS256 (chaves legadas do Supabase ou ambiente local).
     * Sem ele, os tokens são validados pelas chaves públicas (JWKS) do projeto.
     */
    SUPABASE_JWT_SECRET: z.string().min(32).optional(),

    /** Origem do frontend: usada no CORS e para montar links de convite e da família. */
    WEB_URL: z.url(),
    CORS_ORIGINS: z
      .string()
      .optional()
      .transform((v) => (v ? v.split(',').map((s) => s.trim()) : [])),

    /** Sal para o hash de IPs no log de acesso da família (nunca guardamos o IP). */
    IP_HASH_SALT: z.string().min(16),
  })
  .transform((env) => ({
    ...env,
    corsOrigins: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : [env.WEB_URL],
  }));

export type Env = z.infer<typeof Env>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = Env.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Variáveis de ambiente inválidas:\n${details.join('\n')}`);
  }
  return parsed.data;
}

export const ENV = Symbol('ENV');
