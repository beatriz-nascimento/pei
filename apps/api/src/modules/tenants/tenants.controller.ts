import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import {
  AccountType,
  CreateTenantInput,
  UpdateTenantInput,
  type Tenant as TenantDto,
} from '@pei/shared';
import { sql } from 'kysely';
import { CurrentUser } from '../../auth/auth.guard.js';
import type { AuthUser, TenantContext } from '../../auth/auth.types.js';
import { toIso } from '../../common/tokens.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import { DbService, type Tx } from '../../db/db.service.js';
import { Roles, Tenant, TenantGuard } from '../../tenancy/tenant.guard.js';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly db: DbService) {}

  /** Passo "Assina o plano e cria a conta": escolhe Escola ou Profissional. */
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(CreateTenantInput)) body: CreateTenantInput,
  ): Promise<TenantDto> {
    return this.db.asUser(user, async (trx) => {
      const { rows } = await sql<{ id: string }>`
        select private.create_tenant(${body.name}, ${body.type}, ${body.city ?? null}, ${body.state ?? null}) as id
      `.execute(trx);
      return findTenant(trx, rows[0]!.id);
    });
  }

  @Get(':tenantId')
  @UseGuards(TenantGuard)
  get(@CurrentUser() user: AuthUser, @Tenant() t: TenantContext): Promise<TenantDto> {
    return this.db.asUser(user, (trx) => findTenant(trx, t.tenantId));
  }

  @Patch(':tenantId')
  @UseGuards(TenantGuard)
  @Roles('admin')
  update(
    @CurrentUser() user: AuthUser,
    @Tenant() t: TenantContext,
    @Body(new ZodPipe(UpdateTenantInput)) body: UpdateTenantInput,
  ): Promise<TenantDto> {
    return this.db.asUser(user, async (trx) => {
      if (Object.keys(body).length > 0) {
        await trx.updateTable('tenants').set(body).where('id', '=', t.tenantId).execute();
      }
      return findTenant(trx, t.tenantId);
    });
  }
}

async function findTenant(trx: Tx, id: string): Promise<TenantDto> {
  const row = await trx
    .selectFrom('tenants')
    .select(['id', 'name', 'type', 'city', 'state', 'createdAt'])
    .where('id', '=', id)
    .executeTakeFirstOrThrow();
  return {
    id: row.id,
    name: row.name,
    type: AccountType.parse(row.type),
    city: row.city,
    state: row.state,
    createdAt: toIso(row.createdAt),
  };
}
