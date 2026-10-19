import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  SetMetadata,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { MemberRole } from '@pei/shared';
import { z } from 'zod';
import { DbService } from '../db/db.service.js';
import type { TenantContext } from '../auth/auth.types.js';

const ROLES = 'tenantRoles';

/** Restringe a rota a determinados papéis na conta. Sem o decorator: qualquer membro. */
export const Roles = (...roles: MemberRole[]) => SetMetadata(ROLES, roles);

/**
 * Resolve a conta das rotas `/tenants/:tenantId/...` e confere se o usuário é membro.
 * É uma checagem de experiência (mensagens de erro claras). A barreira de segurança
 * de verdade é o RLS no banco, que vale mesmo se este guard for esquecido.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: DbService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const params = request.params as Record<string, string | undefined>;
    const tenantId = z.uuid().safeParse(params['tenantId']);
    if (!request.user || !tenantId.success) throw new NotFoundException('Conta não encontrada');

    const membership = await this.db.asUser(request.user, (trx) =>
      trx
        .selectFrom('memberships')
        .select('role')
        .where('tenantId', '=', tenantId.data)
        .where('userId', '=', request.user!.id)
        .executeTakeFirst(),
    );
    if (!membership) throw new NotFoundException('Conta não encontrada');

    const role = MemberRole.parse(membership.role);
    const allowed = this.reflector.getAllAndOverride<MemberRole[] | undefined>(ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowed && !allowed.includes(role)) {
      throw new ForbiddenException('Seu papel nesta conta não permite esta ação');
    }

    request.tenant = { tenantId: tenantId.data, role };
    return true;
  }
}

export const Tenant = createParamDecorator((_: unknown, ctx: ExecutionContext): TenantContext => {
  const tenant = ctx.switchToHttp().getRequest<FastifyRequest>().tenant;
  if (!tenant) throw new Error('TenantGuard não aplicado nesta rota');
  return tenant;
});
