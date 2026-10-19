import type { MemberRole } from '@pei/shared';

export interface AuthUser {
  id: string;
  email: string;
  /** Claims do JWT repassados ao Postgres (auth.uid(), auth.jwt()). */
  claims: Record<string, unknown>;
}

/** Contexto da conta resolvido pelo TenantGuard para rotas /tenants/:tenantId/... */
export interface TenantContext {
  tenantId: string;
  role: MemberRole;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
    tenant?: TenantContext;
  }
}
