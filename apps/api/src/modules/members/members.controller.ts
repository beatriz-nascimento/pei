import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  AcceptInvitationInput,
  CreateInvitationInput,
  MemberRole,
  UpdateMemberInput,
  type Invitation,
  type Member,
} from '@pei/shared';
import { sql } from 'kysely';
import { CurrentUser } from '../../auth/auth.guard.js';
import type { AuthUser, TenantContext } from '../../auth/auth.types.js';
import { ENV, type Env } from '../../config/env.js';
import { createLinkToken, toIso, toIsoOrNull } from '../../common/tokens.js';
import { UuidPipe, ZodPipe } from '../../common/zod.pipe.js';
import { DbService } from '../../db/db.service.js';
import { Roles, Tenant, TenantGuard } from '../../tenancy/tenant.guard.js';

const INVITATION_TTL_DAYS = 7;

/** Passo "Cadastra responsáveis e permissões". */
@Controller('tenants/:tenantId')
@UseGuards(TenantGuard)
export class MembersController {
  constructor(
    private readonly db: DbService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get('members')
  list(@CurrentUser() user: AuthUser, @Tenant() t: TenantContext): Promise<Member[]> {
    return this.db.asUser(user, async (trx) => {
      const rows = await trx
        .selectFrom('memberships as m')
        .innerJoin('profiles as p', 'p.id', 'm.userId')
        .select(['m.userId', 'p.email', 'p.fullName', 'm.role', 'm.createdAt'])
        .where('m.tenantId', '=', t.tenantId)
        .orderBy('p.fullName')
        .orderBy('p.email')
        .execute();
      return rows.map((r) => ({
        userId: r.userId,
        email: r.email,
        fullName: r.fullName,
        role: MemberRole.parse(r.role),
        joinedAt: toIso(r.createdAt),
      }));
    });
  }

  @Patch('members/:userId')
  @Roles('admin')
  async updateRole(
    @CurrentUser() user: AuthUser,
    @Tenant() t: TenantContext,
    @Param('userId', UuidPipe) userId: string,
    @Body(new ZodPipe(UpdateMemberInput)) body: UpdateMemberInput,
  ): Promise<{ role: MemberRole }> {
    const updated = await this.db.asUser(user, (trx) =>
      trx
        .updateTable('memberships')
        .set({ role: body.role })
        .where('tenantId', '=', t.tenantId)
        .where('userId', '=', userId)
        .returning('role')
        .executeTakeFirst(),
    );
    if (!updated) throw new NotFoundException('Membro não encontrado');
    return { role: body.role };
  }

  /** Admin remove alguém; qualquer membro pode sair da conta. */
  @Delete('members/:userId')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthUser,
    @Tenant() t: TenantContext,
    @Param('userId', UuidPipe) userId: string,
  ): Promise<void> {
    if (t.role !== 'admin' && userId !== user.id) {
      throw new ForbiddenException('Somente administradores removem outros membros');
    }
    const res = await this.db.asUser(user, (trx) =>
      trx
        .deleteFrom('memberships')
        .where('tenantId', '=', t.tenantId)
        .where('userId', '=', userId)
        .executeTakeFirst(),
    );
    if (res.numDeletedRows === 0n) throw new NotFoundException('Membro não encontrado');
  }

  @Get('invitations')
  @Roles('admin')
  listInvitations(@CurrentUser() user: AuthUser, @Tenant() t: TenantContext): Promise<Invitation[]> {
    return this.db.asUser(user, async (trx) => {
      const rows = await trx
        .selectFrom('invitations')
        .select(['id', 'email', 'role', 'expiresAt', 'acceptedAt', 'createdAt'])
        .where('tenantId', '=', t.tenantId)
        .where('acceptedAt', 'is', null)
        .where('expiresAt', '>', new Date())
        .orderBy('createdAt', 'desc')
        .execute();
      return rows.map((r) => ({
        id: r.id,
        email: r.email,
        role: MemberRole.parse(r.role),
        expiresAt: toIso(r.expiresAt),
        acceptedAt: toIsoOrNull(r.acceptedAt),
        createdAt: toIso(r.createdAt),
      }));
    });
  }

  /**
   * Cria um convite e devolve o link para o admin compartilhar.
   * Envio automático por e-mail: próxima iteração (ver docs/roadmap.md).
   */
  @Post('invitations')
  @Roles('admin')
  createInvitation(
    @CurrentUser() user: AuthUser,
    @Tenant() t: TenantContext,
    @Body(new ZodPipe(CreateInvitationInput)) body: CreateInvitationInput,
  ): Promise<Invitation> {
    const { token, hash } = createLinkToken();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000);
    return this.db.asUser(user, async (trx) => {
      const row = await trx
        .insertInto('invitations')
        .values({
          tenantId: t.tenantId,
          email: body.email,
          role: body.role,
          tokenHash: hash,
          invitedBy: user.id,
          expiresAt,
        })
        .returning(['id', 'email', 'role', 'expiresAt', 'acceptedAt', 'createdAt'])
        .executeTakeFirstOrThrow();
      return {
        id: row.id,
        email: row.email,
        role: MemberRole.parse(row.role),
        expiresAt: toIso(row.expiresAt),
        acceptedAt: null,
        createdAt: toIso(row.createdAt),
        acceptUrl: `${this.env.WEB_URL.replace(/\/$/, '')}/convite/${token}`,
      };
    });
  }

  @Delete('invitations/:invitationId')
  @Roles('admin')
  @HttpCode(204)
  async revokeInvitation(
    @CurrentUser() user: AuthUser,
    @Tenant() t: TenantContext,
    @Param('invitationId', UuidPipe) id: string,
  ): Promise<void> {
    await this.db.asUser(user, (trx) =>
      trx.deleteFrom('invitations').where('tenantId', '=', t.tenantId).where('id', '=', id).execute(),
    );
  }
}

@Controller('invitations')
export class InvitationsController {
  constructor(private readonly db: DbService) {}

  @Post('accept')
  @HttpCode(200)
  accept(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(AcceptInvitationInput)) body: AcceptInvitationInput,
  ): Promise<{ tenantId: string }> {
    return this.db.asUser(user, async (trx) => {
      const { rows } = await sql<{ tenantId: string }>`
        select private.accept_invitation(${body.token}) as tenant_id
      `.execute(trx);
      return { tenantId: rows[0]!.tenantId };
    });
  }
}
