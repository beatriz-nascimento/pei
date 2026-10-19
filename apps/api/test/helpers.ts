import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { SignJWT } from 'jose';
import pg from 'pg';
import { createApp } from '../src/bootstrap.js';
import { loadEnv } from '../src/config/env.js';
import { TEST_DATABASE_URL } from './global-setup.js';

export const JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';
export const SUPABASE_URL = 'http://supabase.test';

export const testEnv = loadEnv({
  NODE_ENV: 'test',
  DATABASE_URL: TEST_DATABASE_URL,
  SUPABASE_URL,
  SUPABASE_JWT_SECRET: JWT_SECRET,
  WEB_URL: 'http://app.test',
  IP_HASH_SALT: 'test-salt-0123456789',
});

export async function startApp(): Promise<NestFastifyApplication> {
  const app = await createApp(testEnv);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

/** Conexão "superusuário" para preparar dados (equivale ao Supabase Auth criando usuários). */
export const adminPool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 3 });

export interface TestUser {
  id: string;
  email: string;
  token: string;
}

export async function createUser(name: string): Promise<TestUser> {
  const id = randomUUID();
  const email = `${name.toLowerCase().replace(/\W+/g, '.')}.${id.slice(0, 8)}@exemplo.com.br`;
  await adminPool.query(
    `insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`,
    [id, email, { full_name: name }],
  );
  const token = await new SignJWT({ email, role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(id)
    .setIssuer(`${SUPABASE_URL}/auth/v1`)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(JWT_SECRET));
  return { id, email, token };
}

/** Chamada HTTP autenticada via fastify.inject (sem abrir porta). */
export function api(app: NestFastifyApplication, user?: TestUser) {
  const call = async (method: string, url: string, payload?: unknown) => {
    const res = await app.inject({
      method: method as 'GET',
      url,
      payload: payload as Record<string, unknown> | undefined,
      headers: user ? { authorization: `Bearer ${user.token}` } : {},
    });
    const isJson = res.headers['content-type']?.toString().includes('application/json');
    return {
      status: res.statusCode,
      body: isJson ? res.json() : undefined,
      raw: res.rawPayload,
      headers: res.headers,
    };
  };
  return {
    get: (url: string) => call('GET', url),
    post: (url: string, body?: unknown) => call('POST', url, body ?? {}),
    put: (url: string, body?: unknown) => call('PUT', url, body ?? {}),
    patch: (url: string, body?: unknown) => call('PATCH', url, body ?? {}),
    del: (url: string) => call('DELETE', url),
  };
}
