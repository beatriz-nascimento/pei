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
  UseGuards,
} from '@nestjs/common';
import {
  AssignStaffInput,
  CreateStudentInput,
  StaffFunction,
  UpdateStudentInput,
  type CreateStudentData,
  type Student,
  type StudentSummary,
} from '@pei/shared';
import { z } from 'zod';
import { CurrentUser } from '../../auth/auth.guard.js';
import type { AuthUser, TenantContext } from '../../auth/auth.types.js';
import { UuidPipe, ZodPipe } from '../../common/zod.pipe.js';
import { Roles, Tenant, TenantGuard } from '../../tenancy/tenant.guard.js';
import { StudentsService } from './students.service.js';

const ListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  archived: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

const StaffBody = AssignStaffInput.pick({ function: true });

/** Passo "Cadastra os alunos" (Escola) / "Cadastra seus alunos" (Profissional). */
@Controller('tenants/:tenantId/students')
@UseGuards(TenantGuard)
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Tenant() t: TenantContext,
    @Query(new ZodPipe(ListQuery)) query: z.output<typeof ListQuery>,
  ): Promise<StudentSummary[]> {
    return this.students.list(user, t.tenantId, query);
  }

  @Post()
  @Roles('admin')
  create(
    @CurrentUser() user: AuthUser,
    @Tenant() t: TenantContext,
    @Body(new ZodPipe(CreateStudentInput)) body: CreateStudentData,
  ): Promise<Student> {
    return this.students.create(user, t.tenantId, body);
  }

  @Get(':studentId')
  get(
    @CurrentUser() user: AuthUser,
    @Tenant() t: TenantContext,
    @Param('studentId', UuidPipe) id: string,
  ): Promise<Student> {
    return this.students.get(user, t.tenantId, id);
  }

  @Patch(':studentId')
  update(
    @CurrentUser() user: AuthUser,
    @Tenant() t: TenantContext,
    @Param('studentId', UuidPipe) id: string,
    @Body(new ZodPipe(UpdateStudentInput)) body: Partial<CreateStudentData>,
  ): Promise<Student> {
    return this.students.update(user, t.tenantId, id, body);
  }

  @Post(':studentId/archive')
  @Roles('admin')
  @HttpCode(200)
  archive(
    @CurrentUser() user: AuthUser,
    @Tenant() t: TenantContext,
    @Param('studentId', UuidPipe) id: string,
  ): Promise<Student> {
    return this.students.setArchived(user, t.tenantId, id, true);
  }

  @Post(':studentId/unarchive')
  @Roles('admin')
  @HttpCode(200)
  unarchive(
    @CurrentUser() user: AuthUser,
    @Tenant() t: TenantContext,
    @Param('studentId', UuidPipe) id: string,
  ): Promise<Student> {
    return this.students.setArchived(user, t.tenantId, id, false);
  }

  @Delete(':studentId')
  @Roles('admin')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Tenant() t: TenantContext,
    @Param('studentId', UuidPipe) id: string,
  ): Promise<void> {
    return this.students.remove(user, t.tenantId, id);
  }

  /** Vincula um membro da equipe ao aluno (prof. regente, AEE, ...). */
  @Put(':studentId/staff/:userId')
  @Roles('admin')
  assignStaff(
    @CurrentUser() user: AuthUser,
    @Tenant() t: TenantContext,
    @Param('studentId', UuidPipe) studentId: string,
    @Param('userId', UuidPipe) staffUserId: string,
    @Body(new ZodPipe(StaffBody)) body: { function: StaffFunction },
  ): Promise<Student> {
    return this.students.assignStaff(user, t.tenantId, studentId, staffUserId, body.function);
  }

  @Delete(':studentId/staff/:userId')
  @Roles('admin')
  unassignStaff(
    @CurrentUser() user: AuthUser,
    @Tenant() t: TenantContext,
    @Param('studentId', UuidPipe) studentId: string,
    @Param('userId', UuidPipe) staffUserId: string,
  ): Promise<Student> {
    return this.students.unassignStaff(user, t.tenantId, studentId, staffUserId);
  }
}
