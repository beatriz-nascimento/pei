import { Inject, Injectable } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import { ENV, type Env } from '../config/env.js';
import type { AuthUser } from './auth.types.js';

/**
 * Valida o access token emitido pelo Supabase Auth.
 *
 * - Projetos novos assinam com chaves assimétricas: validamos pelo JWKS público
 *   (`/auth/v1/.well-known/jwks.json`), sem precisar de segredo na API.
 * - Com SUPABASE_JWT_SECRET definido (chave legada HS256 ou ambiente local),
 *   validamos com o segredo compartilhado.
 */
@Injectable()
export class TokenVerifier {
  private readonly issuer: string;
  private readonly key: Uint8Array | JWTVerifyGetKey;

  constructor(@Inject(ENV) env: Env) {
    const base = env.SUPABASE_URL.replace(/\/$/, '');
    this.issuer = `${base}/auth/v1`;
    this.key = env.SUPABASE_JWT_SECRET
      ? new TextEncoder().encode(env.SUPABASE_JWT_SECRET)
      : createRemoteJWKSet(new URL(`${this.issuer}/.well-known/jwks.json`));
  }

  async verify(token: string): Promise<AuthUser> {
    const options = {
      issuer: this.issuer,
      audience: 'authenticated',
      clockTolerance: 5,
    };
    const { payload } =
      this.key instanceof Uint8Array
        ? await jwtVerify(token, this.key, { ...options, algorithms: ['HS256'] })
        : await jwtVerify(token, this.key, options);

    return toAuthUser(payload);
  }
}

function toAuthUser(payload: JWTPayload): AuthUser {
  const email = typeof payload['email'] === 'string' ? payload['email'].toLowerCase() : '';
  if (!payload.sub || payload['role'] !== 'authenticated') {
    throw new Error('Token sem usuário autenticado');
  }
  return {
    id: payload.sub,
    email,
    claims: { sub: payload.sub, email, role: 'authenticated', aud: payload.aud },
  };
}
