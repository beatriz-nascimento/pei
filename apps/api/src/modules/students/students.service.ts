import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  GuardianInput,
  StaffFunction,
  type CreateStudentData,
  type Student,
  type StudentSummary,
} from '@pei/shared';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AuthUser } from '../../auth/auth.types.js';
import { toIso } from '../../common/tokens.js';
import { DbService, type Tx } from '../../db/db.service.js';

const Guardians = z.array(GuardianInput).catch([]);

@Injectable()
export class StudentsService {
  constructor(private readonly db: DbService) {}

  list(
    user: AuthUser,
    tenantId: string,
    opts: { q?: string; archived?: boolean },
  ): Promise<StudentSummary[]> {
    return this.db.asUser(user, async (trx) => {
      let query = trx
        .selectFrom('students as s')
        .select([
          's.id',
          's.fullName',
          's.grade',
          's.classGroup',
          's.schoolName',
          's.conditions',
          's.updatedAt',
          (eb) =>
            eb
              .selectFrom('peis as p')
              .select('p.id')
              .whereRef('p.studentId', '=', 's.id')
              .where('p.status', '=', 'active')
              .limit(1)
              .as('activePeiId'),
        ])
        .where('s.tenantId', '=', tenantId)
        .orderBy('s.fullName');

      query = opts.archived
        ? query.where('s.archivedAt', 'is not', null)
        : query.where('s.archivedAt', 'is', null);

      if (opts.q) {
        query = query.where(sql<boolean>`s.full_name ilike ${'%' + escapeLike(opts.q) + '%'}`);
      }

      const rows = await query.execute();
      return rows.map((r) => ({
        id: r.id,
        fullName: r.fullName,
        grade: r.grade,
        classGroup: r.classGroup,
        schoolName: r.schoolName,
        conditions: r.conditions,
        activePeiId: r.activePeiId,
        updatedAt: toIso(r.updatedAt),
      }));
    });
  }

  create(user: AuthUser, tenantId: string, input: CreateStudentData): Promise<Student> {
    return this.db.asUser(user, async (trx) => {
      const { id } = await trx
        .insertInto('students')
        .values({
          tenantId,
          fullName: input.fullName,
          birthDate: input.birthDate ?? null,
          schoolName: input.schoolName || null,
          grade: input.grade || null,
          classGroup: input.classGroup || null,
          conditions: input.conditions,
          notes: input.notes || null,
          guardians: JSON.stringify(input.guardians),
          createdBy: user.id,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return this.findIn(trx, tenantId, id);
    });
  }

  get(user: AuthUser, tenantId: string, id: string): Promise<Student> {
    return this.db.asUser(user, (trx) => this.findIn(trx, tenantId, id));
  }

  update(
    user: AuthUser,
    tenantId: string,
    id: string,
    input: Partial<CreateStudentData>,
  ): Promise<Student> {
    return this.db.asUser(user, async (trx) => {
      const patch = {
        ...(input.fullName !== undefined && { fullName: input.fullName }),
        ...(input.birthDate !== undefined && { birthDate: input.birthDate || null }),
        ...(input.schoolName !== undefined && { schoolName: input.schoolName || null }),
        ...(input.grade !== undefined && { grade: input.grade || null }),
        ...(input.classGroup !== undefined && { classGroup: input.classGroup || null }),
        ...(input.conditions !== undefined && { conditions: input.conditions }),
        ...(input.notes !== undefined && { notes: input.notes || null }),
        ...(input.guardians !== undefined && { guardians: JSON.stringify(input.guardians) }),
      };
      if (Object.keys(patch).length > 0) {
        const res = await trx
          .updateTable('students')
          .set(patch)
          .where('tenantId', '=', tenantId)
          .where('id', '=', id)
          .executeTakeFirst();
        if (res.numUpdatedRows === 0n) await this.throwMissing(trx, tenantId, id);
      }
      return this.findIn(trx, tenantId, id);
    });
  }

  /** Sem linhas afetadas: distingue "não existe" de "existe, mas você só pode ler". */
  private async throwMissing(trx: Tx, tenantId: string, id: string): Promise<never> {
    const visible = await trx
      .selectFrom('students')
      .select('id')
      .where('tenantId', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    if (visible) throw new ForbiddenException('Você tem acesso somente leitura a este aluno');
    throw new NotFoundException('Aluno não encontrado');
  }

  setArchived(user: AuthUser, tenantId: string, id: string, archived: boolean): Promise<Student> {
    return this.db.asUser(user, async (trx) => {
      const res = await trx
        .updateTable('students')
        .set({ archivedAt: archived ? new Date() : null })
        .where('tenantId', '=', tenantId)
        .where('id', '=', id)
        .executeTakeFirst();
      if (res.numUpdatedRows === 0n) throw new NotFoundException('Aluno não encontrado');
      return this.findIn(trx, tenantId, id);
    });
  }

  /** Exclusão definitiva (direito de eliminação, LGPD art. 18). Apaga PEIs e registros em cascata. */
  async remove(user: AuthUser, tenantId: string, id: string): Promise<void> {
    const res = await this.db.asUser(user, (trx) =>
      trx
        .deleteFrom('students')
        .where('tenantId', '=', tenantId)
        .where('id', '=', id)
        .executeTakeFirst(),
    );
    if (res.numDeletedRows === 0n) throw new NotFoundException('Aluno não encontrado');
  }

  assignStaff(
    user: AuthUser,
    tenantId: string,
    studentId: string,
    staffUserId: string,
    fn: StaffFunction,
  ): Promise<Student> {
    return this.db.asUser(user, async (trx) => {
      await trx
        .insertInto('studentStaff')
        .values({ studentId, tenantId, userId: staffUserId, function: fn })
        .onConflict((oc) => oc.columns(['studentId', 'userId']).doUpdateSet({ function: fn }))
        .execute();
      return this.findIn(trx, tenantId, studentId);
    });
  }

  unassignStaff(
    user: AuthUser,
    tenantId: string,
    studentId: string,
    staffUserId: string,
  ): Promise<Student> {
    return this.db.asUser(user, async (trx) => {
      await trx
        .deleteFrom('studentStaff')
        .where('tenantId', '=', tenantId)
        .where('studentId', '=', studentId)
        .where('userId', '=', staffUserId)
        .execute();
      return this.findIn(trx, tenantId, studentId);
    });
  }

  async findIn(trx: Tx, tenantId: string, id: string): Promise<Student> {
    const s = await trx
      .selectFrom('students as s')
      .selectAll('s')
      .select((eb) =>
        eb
          .selectFrom('peis as p')
          .select('p.id')
          .whereRef('p.studentId', '=', 's.id')
          .where('p.status', '=', 'active')
          .limit(1)
          .as('activePeiId'),
      )
      .where('s.tenantId', '=', tenantId)
      .where('s.id', '=', id)
      .executeTakeFirst();
    if (!s) throw new NotFoundException('Aluno não encontrado');

    const staff = await trx
      .selectFrom('studentStaff as ss')
      .innerJoin('profiles as p', 'p.id', 'ss.userId')
      .select(['ss.userId', 'ss.function', 'p.fullName', 'p.email'])
      .where('ss.studentId', '=', id)
      .orderBy('p.fullName')
      .execute();

    return {
      id: s.id,
      fullName: s.fullName,
      birthDate: s.birthDate,
      grade: s.grade,
      classGroup: s.classGroup,
      schoolName: s.schoolName,
      conditions: s.conditions,
      notes: s.notes,
      guardians: Guardians.parse(s.guardians),
      activePeiId: s.activePeiId,
      staff: staff.map((m) => ({
        userId: m.userId,
        fullName: m.fullName,
        email: m.email,
        function: StaffFunction.parse(m.function),
      })),
      archivedAt: s.archivedAt ? toIso(s.archivedAt) : null,
      createdAt: toIso(s.createdAt),
      updatedAt: toIso(s.updatedAt),
    };
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
