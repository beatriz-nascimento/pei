import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ChangePeiStatusInput,
  CreatePeiInput,
  GoalInput,
  ProgressEntryInput,
  ReorderGoalsInput,
  UpdateGoalInput,
  UpdatePeiInput,
  type ActiveGoal,
  type GoalData,
  type Goal,
  type Pei,
  type PeiSummary,
  type ProgressEntry,
} from '@pei/shared';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { CurrentUser } from '../../auth/auth.guard.js';
import type { AuthUser, TenantContext } from '../../auth/auth.types.js';
import { UuidPipe, ZodPipe } from '../../common/zod.pipe.js';
import { Tenant, TenantGuard } from '../../tenancy/tenant.guard.js';
import { ExportService } from '../exports/export.service.js';
import { PeisService, type UpdatePeiData } from './peis.service.js';

const ExportQuery = z.object({ format: z.enum(['pdf', 'docx']).default('pdf') });

@Controller('tenants/:tenantId')
@UseGuards(TenantGuard)
export class PeisController {
  constructor(
    private readonly peis: PeisService,
    private readonly exporter: ExportService,
  ) {}

  @Get('active-goals')
  activeGoals(@CurrentUser() user: AuthUser, @Tenant() t: TenantContext): Promise<ActiveGoal[]> {
    return this.peis.activeGoals(user, t.tenantId);
  }

  @Get('students/:studentId/peis')
  list(
    @CurrentUser() user: AuthUser,
    @Tenant() t: TenantContext,
    @Param('studentId', UuidPipe) studentId: string,
  ): Promise<PeiSummary[]> {
    return this.peis.listForStudent(user, t.tenantId, studentId);
  }

  @Post('students/:studentId/peis')
  create(
    @CurrentUser() user: AuthUser,
    @Tenant() t: TenantContext,
    @Param('studentId', UuidPipe) studentId: string,
    @Body(new ZodPipe(CreatePeiInput)) body: CreatePeiInput,
  ): Promise<Pei> {
    return this.peis.create(user, t.tenantId, studentId, body);
  }

  @Get('peis/:peiId')
  get(
    @CurrentUser() user: AuthUser,
    @Tenant() t: TenantContext,
    @Param('peiId', UuidPipe) peiId: string,
  ): Promise<Pei> {
    return this.peis.get(user, t.tenantId, peiId);
  }

  @Patch('peis/:peiId')
  update(
    @CurrentUser() user: AuthUser,
    @Tenant() t: TenantContext,
    @Param('peiId', UuidPipe) peiId: string,
    @Body(new ZodPipe(UpdatePeiInput)) body: UpdatePeiData,
  ): Promise<Pei> {
    return this.peis.update(user, t.tenantId, peiId, body);
  }

  @Post('peis/:peiId/status')
  @HttpCode(200)
  changeStatus(
    @CurrentUser() user: AuthUser,
    @Tenant() t: TenantContext,
    @Param('peiId', UuidPipe) peiId: string,
    @Body(new ZodPipe(ChangePeiStatusInput)) body: ChangePeiStatusInput,
  ): Promise<Pei> {
    return this.peis.changeStatus(user, t.tenantId, peiId, body.status);
  }

  @Delete('peis/:peiId')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Tenant() t: TenantContext,
    @Param('peiId', UuidPipe) peiId: string,
  ): Promise<void> {
    return this.peis.remove(user, t.tenantId, peiId);
  }

  /** Passo 5: "Gera o documento do PEI — exporta em Word/PDF com assinaturas". */
  @Get('peis/:peiId/export')
  async export(
    @CurrentUser() user: AuthUser,
    @Tenant() t: TenantContext,
    @Param('peiId', UuidPipe) peiId: string,
    @Query(new ZodPipe(ExportQuery)) query: z.output<typeof ExportQuery>,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const file = await this.exporter.export(user, t.tenantId, peiId, query.format);
    await reply
      .header('Content-Type', file.contentType)
      .header('Content-Disposition', `attachment; filename="${file.filename}"`)
      .header('Cache-Control', 'no-store')
      .send(file.buffer);
  }

  /* Metas ------------------------------------------------------------------ */

  @Post('peis/:peiId/goals')
  addGoal(
    @CurrentUser() user: AuthUser,
    @Tenant() t: TenantContext,
    @Param('peiId', UuidPipe) peiId: string,
    @Body(new ZodPipe(GoalInput)) body: GoalData,
  ): Promise<Goal> {
    return this.peis.addGoal(user, t.tenantId, peiId, body);
  }

  @Put('peis/:peiId/goals/order')
  reorderGoals(
    @CurrentUser() user: AuthUser,
    @Tenant() t: TenantContext,
    @Param('peiId', UuidPipe) peiId: string,
    @Body(new ZodPipe(ReorderGoalsInput)) body: ReorderGoalsInput,
  ): Promise<Pei> {
    return this.peis.reorderGoals(user, t.tenantId, peiId, body.goalIds);
  }

  @Patch('peis/:peiId/goals/:goalId')
  updateGoal(
    @CurrentUser() user: AuthUser,
    @Tenant() t: TenantContext,
    @Param('peiId', UuidPipe) peiId: string,
    @Param('goalId', UuidPipe) goalId: string,
    @Body(new ZodPipe(UpdateGoalInput)) body: Partial<GoalData>,
  ): Promise<Goal> {
    return this.peis.updateGoal(user, t.tenantId, peiId, goalId, body);
  }

  @Delete('peis/:peiId/goals/:goalId')
  @HttpCode(204)
  removeGoal(
    @CurrentUser() user: AuthUser,
    @Tenant() t: TenantContext,
    @Param('peiId', UuidPipe) peiId: string,
    @Param('goalId', UuidPipe) goalId: string,
  ): Promise<void> {
    return this.peis.removeGoal(user, t.tenantId, peiId, goalId);
  }

  /* Progresso -------------------------------------------------------------- */

  @Get('peis/:peiId/goals/:goalId/progress')
  listProgress(
    @CurrentUser() user: AuthUser,
    @Tenant() t: TenantContext,
    @Param('peiId', UuidPipe) peiId: string,
    @Param('goalId', UuidPipe) goalId: string,
  ): Promise<ProgressEntry[]> {
    return this.peis.listProgress(user, t.tenantId, peiId, goalId);
  }

  @Post('peis/:peiId/goals/:goalId/progress')
  addProgress(
    @CurrentUser() user: AuthUser,
    @Tenant() t: TenantContext,
    @Param('peiId', UuidPipe) peiId: string,
    @Param('goalId', UuidPipe) goalId: string,
    @Body(new ZodPipe(ProgressEntryInput)) body: ProgressEntryInput,
  ): Promise<ProgressEntry> {
    return this.peis.addProgress(user, t.tenantId, peiId, goalId, body);
  }

  @Delete('peis/:peiId/goals/:goalId/progress/:entryId')
  @HttpCode(204)
  removeProgress(
    @CurrentUser() user: AuthUser,
    @Tenant() t: TenantContext,
    @Param('peiId', UuidPipe) peiId: string,
    @Param('goalId', UuidPipe) goalId: string,
    @Param('entryId', UuidPipe) entryId: string,
  ): Promise<void> {
    return this.peis.removeProgress(user, t.tenantId, peiId, goalId, entryId);
  }
}
