import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  CONSENT_TERMS_VERSION,
  CreateFamilyLinkInput,
  FamilyConsentInput,
  type FamilyLink,
  type FamilyPortalView,
} from '@pei/shared';
import type { FastifyRequest } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import { CurrentUser, Public } from '../../auth/auth.guard.js';
import type { AuthUser, TenantContext } from '../../auth/auth.types.js';
import { ENV, type Env } from '../../config/env.js';
import { createLinkToken, hashIp, toIso, toIsoOrNull } from '../../common/tokens.js';
import { UuidPipe, ZodPipe } from '../../common/zod.pipe.js';
import { DbService } from '../../db/db.service.js';
import { Tenant, TenantGuard } from '../../tenancy/tenant.guard.js';

const TokenParam = new ZodPipe(z.string().regex(/^[A-Za-z0-9_-]{30,100}$/, 'Link inválido'));

/** Passo 6: "Convida a família (link + token) — sem cadastro, acesso por link". */
@Controller('tenants/:tenantId/students/:studentId/family-links')
@UseGuards(TenantGuard)
export class FamilyLinksController {
  constructor(
    private readonly db: DbService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Tenant() t: TenantContext,
    @Param('studentId', UuidPipe) studentId: string,
  ): Promise<FamilyLink[]> {
    return this.db.asUser(user, async (trx) => {
      const rows = await trx
        .selectFrom('familyLinks')
        .select([
          'id',
          'studentId',
          'label',
          'expiresAt',
          'revokedAt',
          'accessCount',
          'lastAccessAt',
          'createdAt',
        ])
        .where('tenantId', '=', t.tenantId)
        .where('studentId', '=', studentId)
        .orderBy('createdAt', 'desc')
        .execute();
      return rows.map(toLink);
    });
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Tenant() t: TenantContext,
    @Param('studentId', UuidPipe) studentId: string,
    @Body(new ZodPipe(CreateFamilyLinkInput)) body: z.output<typeof CreateFamilyLinkInput>,
  ): Promise<FamilyLink> {
    const { token, hash } = createLinkToken();
    return this.db.asUser(user, async (trx) => {
      const row = await trx
        .insertInto('familyLinks')
        .values({
          tenantId: t.tenantId,
          studentId,
          label: body.label || null,
          tokenHash: hash,
          createdBy: user.id,
          expiresAt: new Date(Date.now() + body.expiresInDays * 86_400_000),
        })
        .returning([
          'id',
          'studentId',
          'label',
          'expiresAt',
          'revokedAt',
          'accessCount',
          'lastAccessAt',
          'createdAt',
        ])
        .executeTakeFirstOrThrow();
      return { ...toLink(row), url: `${this.env.WEB_URL.replace(/\/$/, '')}/familia/${token}` };
    });
  }

  @Post(':linkId/revoke')
  @HttpCode(200)
  revoke(
    @CurrentUser() user: AuthUser,
    @Tenant() t: TenantContext,
    @Param('studentId', UuidPipe) studentId: string,
    @Param('linkId', UuidPipe) linkId: string,
  ): Promise<FamilyLink> {
    return this.db.asUser(user, async (trx) => {
      const row = await trx
        .updateTable('familyLinks')
        .set({ revokedAt: new Date() })
        .where('tenantId', '=', t.tenantId)
        .where('studentId', '=', studentId)
        .where('id', '=', linkId)
        .returning([
          'id',
          'studentId',
          'label',
          'expiresAt',
          'revokedAt',
          'accessCount',
          'lastAccessAt',
          'createdAt',
        ])
        .executeTakeFirst();
      if (!row) throw new NotFoundException('Link não encontrado');
      return toLink(row);
    });
  }
}

/** Passo 7: "Família acessa o portal — somente leitura · cada acesso é contado". */
@Controller('public/family')
@Public()
export class FamilyPortalController {
  constructor(
    private readonly db: DbService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get(':token')
  async view(
    @Param('token', TokenParam) token: string,
    @Req() req: FastifyRequest,
  ): Promise<FamilyPortalView> {
    const ipHash = hashIp(req.ip, this.env.IP_HASH_SALT);
    const view = await this.db.asAnon(async (trx) => {
      const { rows } = await sql<{ view: FamilyPortalView | null }>`
        select private.family_portal(${token}, ${CONSENT_TERMS_VERSION}, ${ipHash}) as view
      `.execute(trx);
      return rows[0]?.view ?? null;
    });
    if (!view) throw new NotFoundException('Link inválido, expirado ou revogado');
    return view;
  }

  @Post(':token/consent')
  @HttpCode(204)
  async consent(
    @Param('token', TokenParam) token: string,
    @Body(new ZodPipe(FamilyConsentInput)) body: FamilyConsentInput,
    @Req() req: FastifyRequest,
  ): Promise<void> {
    const ipHash = hashIp(req.ip, this.env.IP_HASH_SALT);
    const ok = await this.db.asAnon(async (trx) => {
      const { rows } = await sql<{ ok: boolean }>`
        select private.family_consent(
          ${token}, ${body.guardianName}, ${body.relationship}, ${CONSENT_TERMS_VERSION}, ${ipHash}
        ) as ok
      `.execute(trx);
      return rows[0]?.ok ?? false;
    });
    if (!ok) throw new NotFoundException('Link inválido, expirado ou revogado');
  }
}

function toLink(r: {
  id: string;
  studentId: string;
  label: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  accessCount: number;
  lastAccessAt: Date | null;
  createdAt: Date;
}): FamilyLink {
  return {
    id: r.id,
    studentId: r.studentId,
    label: r.label,
    expiresAt: toIso(r.expiresAt),
    revokedAt: toIsoOrNull(r.revokedAt),
    accessCount: r.accessCount,
    lastAccessAt: toIsoOrNull(r.lastAccessAt),
    createdAt: toIso(r.createdAt),
  };
}
