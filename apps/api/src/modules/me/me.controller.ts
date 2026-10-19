import { Body, Controller, Get, Patch } from '@nestjs/common';
import { AccountType, MemberRole, type Me } from '@pei/shared';
import { z } from 'zod';
import { CurrentUser } from '../../auth/auth.guard.js';
import type { AuthUser } from '../../auth/auth.types.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import { DbService } from '../../db/db.service.js';

const UpdateMeInput = z.object({ fullName: z.string().trim().min(1).max(160) });

@Controller('me')
export class MeController {
  constructor(private readonly db: DbService) {}

  @Get()
  get(@CurrentUser() user: AuthUser): Promise<Me> {
    return this.db.asUser(user, async (trx) => {
      const profile = await trx
        .selectFrom('profiles')
        .select(['id', 'email', 'fullName'])
        .where('id', '=', user.id)
        .executeTakeFirst();

      const memberships = await trx
        .selectFrom('memberships as m')
        .innerJoin('tenants as t', 't.id', 'm.tenantId')
        .select(['m.tenantId', 't.name', 't.type', 'm.role'])
        .where('m.userId', '=', user.id)
        .orderBy('t.name')
        .execute();

      return {
        id: user.id,
        email: profile?.email ?? user.email,
        fullName: profile?.fullName ?? null,
        memberships: memberships.map((m) => ({
          tenantId: m.tenantId,
          tenantName: m.name,
          tenantType: AccountType.parse(m.type),
          role: MemberRole.parse(m.role),
        })),
      };
    });
  }

  @Patch()
  async update(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(UpdateMeInput)) body: z.infer<typeof UpdateMeInput>,
  ): Promise<Me> {
    await this.db.asUser(user, (trx) =>
      trx.updateTable('profiles').set({ fullName: body.fullName }).where('id', '=', user.id).execute(),
    );
    return this.get(user);
  }
}
