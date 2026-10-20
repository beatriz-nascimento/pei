import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Adaptation,
  BaselineEntry,
  CaseStudy,
  DevelopmentArea,
  GoalStatus,
  MeasurementFrequency,
  MeasurementMethod,
  PeiStatus,
  ProgressLevel,
  Service,
  SupportType,
  type CreatePeiInput,
  type ActiveGoal,
  type Goal,
  type GoalData,
  type Pei,
  type PeiSummary,
  type ProgressEntry,
  type ProgressEntryInput,
} from '@pei/shared';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AuthUser } from '../../auth/auth.types.js';
import { toIso } from '../../common/tokens.js';
import { DbService, type Tx } from '../../db/db.service.js';

/** Transições de status permitidas. Arquivado é estado final (registro histórico). */
const TRANSITIONS: Record<PeiStatus, PeiStatus[]> = {
  draft: ['active'],
  active: ['archived'],
  archived: [],
};

const CaseStudyJson = CaseStudy.catch(CaseStudy.parse({}));
const BaselineJson = z.array(BaselineEntry).catch([]);
const AdaptationsJson = z.array(Adaptation).catch([]);
const ServicesJson = z.array(Service).catch([]);

export interface UpdatePeiData {
  startDate?: string | null;
  reviewDate?: string | null;
  caseStudy?: CaseStudy;
  baseline?: BaselineEntry[];
  adaptations?: Adaptation[];
  services?: Service[];
}

@Injectable()
export class PeisService {
  constructor(private readonly db: DbService) {}

  /* ------------------------------------------------------------------------ */
  /* PEI                                                                      */
  /* ------------------------------------------------------------------------ */

  listForStudent(user: AuthUser, tenantId: string, studentId: string): Promise<PeiSummary[]> {
    return this.db.asUser(user, async (trx) => {
      const rows = await trx
        .selectFrom('peis as p')
        .select([
          'p.id',
          'p.studentId',
          'p.schoolYear',
          'p.version',
          'p.status',
          'p.startDate',
          'p.reviewDate',
          'p.updatedAt',
          (eb) =>
            eb
              .selectFrom('peiGoals as g')
              .select(eb.fn.countAll<string>().as('n'))
              .whereRef('g.peiId', '=', 'p.id')
              .as('goalCount'),
        ])
        .where('p.tenantId', '=', tenantId)
        .where('p.studentId', '=', studentId)
        .orderBy('p.schoolYear', 'desc')
        .orderBy('p.version', 'desc')
        .execute();
      return rows.map((r) => ({
        id: r.id,
        studentId: r.studentId,
        schoolYear: r.schoolYear,
        version: r.version,
        status: PeiStatus.parse(r.status),
        startDate: r.startDate,
        reviewDate: r.reviewDate,
        goalCount: Number(r.goalCount ?? 0),
        updatedAt: toIso(r.updatedAt),
      }));
    });
  }

  /** Passo 2 do fluxo: "Cria o PEI do aluno — novo PEI em rascunho, por ano/versão". */
  create(user: AuthUser, tenantId: string, studentId: string, input: CreatePeiInput): Promise<Pei> {
    return this.db.asUser(user, async (trx) => {
      const student = await trx
        .selectFrom('students')
        .select('id')
        .where('tenantId', '=', tenantId)
        .where('id', '=', studentId)
        .executeTakeFirst();
      if (!student) throw new NotFoundException('Aluno não encontrado');

      // Serializa a criação de versões do mesmo aluno/ano para evitar números duplicados.
      await sql`select pg_advisory_xact_lock(hashtext(${studentId + ':' + input.schoolYear}))`.execute(
        trx,
      );

      const { maxVersion } = await trx
        .selectFrom('peis')
        .select((eb) => eb.fn.max('version').as('maxVersion'))
        .where('studentId', '=', studentId)
        .where('schoolYear', '=', input.schoolYear)
        .executeTakeFirstOrThrow();

      let source:
        | { caseStudy: unknown; baseline: unknown; adaptations: unknown; services: unknown }
        | undefined;
      if (input.copyFromPeiId) {
        source = await trx
          .selectFrom('peis')
          .select(['caseStudy', 'baseline', 'adaptations', 'services'])
          .where('id', '=', input.copyFromPeiId)
          .where('studentId', '=', studentId)
          .executeTakeFirst();
        if (!source) throw new NotFoundException('PEI de origem não encontrado');
      }

      const { id } = await trx
        .insertInto('peis')
        .values({
          tenantId,
          studentId,
          schoolYear: input.schoolYear,
          version: (maxVersion ?? 0) + 1,
          startDate: input.startDate ?? null,
          reviewDate: input.reviewDate ?? null,
          caseStudy: JSON.stringify(
            source ? CaseStudyJson.parse(source.caseStudy) : CaseStudy.parse({}),
          ),
          baseline: JSON.stringify(source ? BaselineJson.parse(source.baseline) : []),
          adaptations: JSON.stringify(source ? AdaptationsJson.parse(source.adaptations) : []),
          services: JSON.stringify(source ? ServicesJson.parse(source.services) : []),
          createdBy: user.id,
        })
        .returning('id')
        .executeTakeFirstOrThrow();

      if (input.copyFromPeiId) {
        await sql`
          insert into public.pei_goals (
            tenant_id, student_id, pei_id, position, area, description, success_criterion,
            target_date, bncc_code, strategies, responsible, measurement_method, measurement_frequency
          )
          select tenant_id, student_id, ${id}, position, area, description, success_criterion,
                 target_date, bncc_code, strategies, responsible, measurement_method, measurement_frequency
          from public.pei_goals
          where pei_id = ${input.copyFromPeiId} and status <> 'discontinued'
        `.execute(trx);
      }

      return this.findIn(trx, tenantId, id);
    });
  }

  get(user: AuthUser, tenantId: string, peiId: string): Promise<Pei> {
    return this.db.asUser(user, (trx) => this.findIn(trx, tenantId, peiId));
  }

  /** Passo 3: "Preenche as abas do PEI". */
  update(user: AuthUser, tenantId: string, peiId: string, input: UpdatePeiData): Promise<Pei> {
    return this.db.asUser(user, async (trx) => {
      await this.requireWritable(trx, tenantId, peiId);
      const patch = {
        ...(input.startDate !== undefined && { startDate: input.startDate }),
        ...(input.reviewDate !== undefined && { reviewDate: input.reviewDate }),
        ...(input.caseStudy !== undefined && { caseStudy: JSON.stringify(input.caseStudy) }),
        ...(input.baseline !== undefined && { baseline: JSON.stringify(input.baseline) }),
        ...(input.adaptations !== undefined && { adaptations: JSON.stringify(input.adaptations) }),
        ...(input.services !== undefined && { services: JSON.stringify(input.services) }),
      };
      if (Object.keys(patch).length > 0) {
        await trx.updateTable('peis').set(patch).where('id', '=', peiId).execute();
      }
      return this.findIn(trx, tenantId, peiId);
    });
  }

  changeStatus(user: AuthUser, tenantId: string, peiId: string, next: PeiStatus): Promise<Pei> {
    return this.db.asUser(user, async (trx) => {
      const pei = await this.requireEditable(trx, tenantId, peiId);
      const current = PeiStatus.parse(pei.status);
      if (current === next) return this.findIn(trx, tenantId, peiId);
      if (!TRANSITIONS[current].includes(next)) {
        throw new ConflictException(`Não é possível mudar de "${current}" para "${next}"`);
      }

      if (next === 'active') {
        const goals = await trx
          .selectFrom('peiGoals')
          .select((eb) => eb.fn.countAll<string>().as('n'))
          .where('peiId', '=', peiId)
          .executeTakeFirstOrThrow();
        if (Number(goals.n) === 0) {
          throw new ConflictException(
            'Cadastre pelo menos uma meta antes de colocar o PEI em vigor',
          );
        }
        // O PEI anterior em vigor vira histórico.
        await trx
          .updateTable('peis')
          .set({ status: 'archived' })
          .where('studentId', '=', pei.studentId)
          .where('status', '=', 'active')
          .where('id', '!=', peiId)
          .execute();
      }

      await trx
        .updateTable('peis')
        .set({ status: next, ...(next === 'active' && { activatedAt: new Date() }) })
        .where('id', '=', peiId)
        .execute();
      return this.findIn(trx, tenantId, peiId);
    });
  }

  remove(user: AuthUser, tenantId: string, peiId: string): Promise<void> {
    return this.db.asUser(user, async (trx) => {
      const pei = await this.requireEditable(trx, tenantId, peiId);
      if (pei.status !== 'draft') {
        throw new ConflictException('Só é possível excluir PEIs em rascunho');
      }
      await trx.deleteFrom('peis').where('id', '=', peiId).execute();
    });
  }

  /* ------------------------------------------------------------------------ */
  /* Metas                                                                    */
  /* ------------------------------------------------------------------------ */

  /** Passo 4: "Define metas e acompanha a evolução". */
  addGoal(user: AuthUser, tenantId: string, peiId: string, input: GoalData): Promise<Goal> {
    return this.db.asUser(user, async (trx) => {
      const pei = await this.requireWritable(trx, tenantId, peiId);
      const { maxPos } = await trx
        .selectFrom('peiGoals')
        .select((eb) => eb.fn.max('position').as('maxPos'))
        .where('peiId', '=', peiId)
        .executeTakeFirstOrThrow();
      const { id } = await trx
        .insertInto('peiGoals')
        .values({
          tenantId,
          studentId: pei.studentId,
          peiId,
          position: (maxPos ?? -1) + 1,
          area: input.area,
          description: input.description,
          successCriterion: input.successCriterion,
          targetDate: input.targetDate,
          bnccCode: input.bnccCode || null,
          strategies: input.strategies,
          responsible: input.responsible,
          measurementMethod: input.measurementMethod,
          measurementFrequency: input.measurementFrequency,
          status: input.status,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return this.findGoal(trx, peiId, id);
    });
  }

  updateGoal(
    user: AuthUser,
    tenantId: string,
    peiId: string,
    goalId: string,
    input: Partial<GoalData>,
  ): Promise<Goal> {
    return this.db.asUser(user, async (trx) => {
      await this.requireWritable(trx, tenantId, peiId);
      const patch = goalColumns(input);
      if (Object.keys(patch).length > 0) {
        const res = await trx
          .updateTable('peiGoals')
          .set(patch)
          .where('peiId', '=', peiId)
          .where('id', '=', goalId)
          .executeTakeFirst();
        if (res.numUpdatedRows === 0n) throw new NotFoundException('Meta não encontrada');
      }
      return this.findGoal(trx, peiId, goalId);
    });
  }

  removeGoal(user: AuthUser, tenantId: string, peiId: string, goalId: string): Promise<void> {
    return this.db.asUser(user, async (trx) => {
      await this.requireWritable(trx, tenantId, peiId);
      const res = await trx
        .deleteFrom('peiGoals')
        .where('peiId', '=', peiId)
        .where('id', '=', goalId)
        .executeTakeFirst();
      if (res.numDeletedRows === 0n) throw new NotFoundException('Meta não encontrada');
    });
  }

  reorderGoals(user: AuthUser, tenantId: string, peiId: string, goalIds: string[]): Promise<Pei> {
    return this.db.asUser(user, async (trx) => {
      await this.requireWritable(trx, tenantId, peiId);
      await sql`
        update public.pei_goals g
        set position = o.ord - 1
        from unnest(${goalIds}::uuid[]) with ordinality as o(id, ord)
        where g.id = o.id and g.pei_id = ${peiId}
      `.execute(trx);
      return this.findIn(trx, tenantId, peiId);
    });
  }

  /* ------------------------------------------------------------------------ */
  /* Progresso                                                                */
  /* ------------------------------------------------------------------------ */

  listProgress(
    user: AuthUser,
    tenantId: string,
    peiId: string,
    goalId: string,
  ): Promise<ProgressEntry[]> {
    return this.db.asUser(user, async (trx) => {
      await this.requireGoal(trx, tenantId, peiId, goalId);
      const rows = await trx
        .selectFrom('progressEntries as e')
        .leftJoin('profiles as p', 'p.id', 'e.recordedBy')
        .select([
          'e.id',
          'e.goalId',
          'e.level',
          'e.support',
          'e.note',
          'e.observedAt',
          'e.recordedBy',
          'p.fullName',
        ])
        .where('e.goalId', '=', goalId)
        .orderBy('e.observedAt', 'desc')
        .limit(500)
        .execute();
      return rows.map(toProgressEntry);
    });
  }

  /** Registro rápido (celular): um toque no nível + nota opcional. */
  addProgress(
    user: AuthUser,
    tenantId: string,
    peiId: string,
    goalId: string,
    input: ProgressEntryInput,
  ): Promise<ProgressEntry> {
    return this.db.asUser(user, async (trx) => {
      const pei = await this.requireWritable(trx, tenantId, peiId);
      await this.requireGoal(trx, tenantId, peiId, goalId);
      const row = await trx
        .insertInto('progressEntries')
        .values({
          tenantId,
          studentId: pei.studentId,
          goalId,
          level: input.level,
          support: input.support ?? null,
          note: input.note || null,
          observedAt: input.observedAt ? new Date(input.observedAt) : new Date(),
          recordedBy: user.id,
        })
        .returning(['id', 'goalId', 'level', 'support', 'note', 'observedAt', 'recordedBy'])
        .executeTakeFirstOrThrow();

      // A primeira medição tira a meta de "não iniciada".
      await trx
        .updateTable('peiGoals')
        .set({ status: 'in_progress' })
        .where('id', '=', goalId)
        .where('status', '=', 'not_started')
        .execute();

      const profile = await trx
        .selectFrom('profiles')
        .select('fullName')
        .where('id', '=', user.id)
        .executeTakeFirst();
      return toProgressEntry({ ...row, fullName: profile?.fullName ?? null });
    });
  }

  removeProgress(
    user: AuthUser,
    tenantId: string,
    peiId: string,
    goalId: string,
    entryId: string,
  ): Promise<void> {
    return this.db.asUser(user, async (trx) => {
      await this.requireGoal(trx, tenantId, peiId, goalId);
      const res = await trx
        .deleteFrom('progressEntries')
        .where('goalId', '=', goalId)
        .where('id', '=', entryId)
        .executeTakeFirst();
      if (res.numDeletedRows === 0n) {
        throw new NotFoundException('Registro não encontrado ou sem permissão para excluir');
      }
    });
  }

  /** Metas dos PEIs em vigor que o usuário enxerga (registro rápido no celular). */
  activeGoals(user: AuthUser, tenantId: string): Promise<ActiveGoal[]> {
    return this.db.asUser(user, async (trx) => {
      const rows = await this.goalsQuery(trx)
        .innerJoin('peis as p', 'p.id', 'g.peiId')
        .innerJoin('students as s', 's.id', 'g.studentId')
        .select([
          's.fullName as studentName',
          sql<boolean>`exists (select 1 from private.editable_student_ids() e where e = g.student_id)`.as(
            'canEdit',
          ),
        ])
        .where('g.tenantId', '=', tenantId)
        .where('p.status', '=', 'active')
        .where('s.archivedAt', 'is', null)
        .where('g.status', 'in', ['not_started', 'in_progress'])
        .clearOrderBy()
        .orderBy('s.fullName')
        .orderBy('g.position')
        .execute();
      return rows.map((r) => ({
        studentId: r.studentId,
        studentName: r.studentName,
        peiId: r.peiId,
        canEdit: r.canEdit,
        goal: toGoal(r),
      }));
    });
  }

  /* ------------------------------------------------------------------------ */
  /* Leitura e checagens                                                      */
  /* ------------------------------------------------------------------------ */

  async findIn(trx: Tx, tenantId: string, peiId: string): Promise<Pei> {
    const p = await trx
      .selectFrom('peis as p')
      .innerJoin('students as s', 's.id', 'p.studentId')
      .selectAll('p')
      .select(['s.fullName as studentName'])
      .select(
        sql<boolean>`exists (select 1 from private.editable_student_ids() e where e = p.student_id)`.as(
          'canEdit',
        ),
      )
      .where('p.tenantId', '=', tenantId)
      .where('p.id', '=', peiId)
      .executeTakeFirst();
    if (!p) throw new NotFoundException('PEI não encontrado');

    const goals = await this.goalsQuery(trx).where('g.peiId', '=', peiId).execute();

    return {
      id: p.id,
      studentId: p.studentId,
      student: { id: p.studentId, fullName: p.studentName },
      schoolYear: p.schoolYear,
      version: p.version,
      status: PeiStatus.parse(p.status),
      startDate: p.startDate,
      reviewDate: p.reviewDate,
      caseStudy: CaseStudyJson.parse(p.caseStudy),
      baseline: BaselineJson.parse(p.baseline),
      adaptations: AdaptationsJson.parse(p.adaptations),
      services: ServicesJson.parse(p.services),
      goals: goals.map(toGoal),
      goalCount: goals.length,
      canEdit: p.canEdit && p.status !== 'archived',
      createdAt: toIso(p.createdAt),
      updatedAt: toIso(p.updatedAt),
    };
  }

  private goalsQuery(trx: Tx) {
    return trx
      .selectFrom('peiGoals as g')
      .selectAll('g')
      .select((eb) => [
        eb
          .selectFrom('progressEntries as e')
          .select(eb.fn.countAll<string>().as('n'))
          .whereRef('e.goalId', '=', 'g.id')
          .as('progressCount'),
        eb
          .selectFrom('progressEntries as e')
          .select(
            sql<{
              level: string;
              observedAt: string;
            }>`json_build_object('level', e.level, 'observedAt', e.observed_at)`.as('last'),
          )
          .whereRef('e.goalId', '=', 'g.id')
          .orderBy('e.observedAt', 'desc')
          .limit(1)
          .as('lastProgress'),
      ])
      .orderBy('g.position')
      .orderBy('g.createdAt');
  }

  private async findGoal(trx: Tx, peiId: string, goalId: string): Promise<Goal> {
    const g = await this.goalsQuery(trx)
      .where('g.peiId', '=', peiId)
      .where('g.id', '=', goalId)
      .executeTakeFirst();
    if (!g) throw new NotFoundException('Meta não encontrada');
    return toGoal(g);
  }

  private async requireGoal(trx: Tx, tenantId: string, peiId: string, goalId: string) {
    const goal = await trx
      .selectFrom('peiGoals')
      .select('id')
      .where('tenantId', '=', tenantId)
      .where('peiId', '=', peiId)
      .where('id', '=', goalId)
      .executeTakeFirst();
    if (!goal) throw new NotFoundException('Meta não encontrada');
  }

  /** PEI visível e editável pelo usuário (papel + vínculo com o aluno). */
  private async requireEditable(trx: Tx, tenantId: string, peiId: string) {
    const pei = await trx
      .selectFrom('peis as p')
      .select([
        'p.id',
        'p.studentId',
        'p.status',
        sql<boolean>`exists (select 1 from private.editable_student_ids() e where e = p.student_id)`.as(
          'canEdit',
        ),
      ])
      .where('p.tenantId', '=', tenantId)
      .where('p.id', '=', peiId)
      .executeTakeFirst();
    if (!pei) throw new NotFoundException('PEI não encontrado');
    if (!pei.canEdit) throw new ForbiddenException('Você tem acesso somente leitura a este PEI');
    return pei;
  }

  /** Como requireEditable, mas também bloqueia PEIs arquivados. */
  private async requireWritable(trx: Tx, tenantId: string, peiId: string) {
    const pei = await this.requireEditable(trx, tenantId, peiId);
    if (pei.status === 'archived') {
      throw new ConflictException('PEI arquivado não pode ser alterado. Crie uma nova versão.');
    }
    return pei;
  }
}

function goalColumns(input: Partial<GoalData>) {
  return {
    ...(input.area !== undefined && { area: input.area }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.successCriterion !== undefined && { successCriterion: input.successCriterion }),
    ...(input.targetDate !== undefined && { targetDate: input.targetDate }),
    ...(input.bnccCode !== undefined && { bnccCode: input.bnccCode || null }),
    ...(input.strategies !== undefined && { strategies: input.strategies }),
    ...(input.responsible !== undefined && { responsible: input.responsible }),
    ...(input.measurementMethod !== undefined && { measurementMethod: input.measurementMethod }),
    ...(input.measurementFrequency !== undefined && {
      measurementFrequency: input.measurementFrequency,
    }),
    ...(input.status !== undefined && { status: input.status }),
  };
}

interface GoalRow {
  id: string;
  peiId: string;
  position: number;
  area: string;
  description: string;
  successCriterion: string;
  targetDate: string;
  bnccCode: string | null;
  strategies: string;
  responsible: string;
  measurementMethod: string;
  measurementFrequency: string;
  status: string;
  updatedAt: Date;
  progressCount: string | null;
  lastProgress: { level: string; observedAt: string } | null;
}

function toGoal(g: GoalRow): Goal {
  return {
    id: g.id,
    peiId: g.peiId,
    position: g.position,
    area: DevelopmentArea.parse(g.area),
    description: g.description,
    successCriterion: g.successCriterion,
    targetDate: g.targetDate,
    bnccCode: g.bnccCode,
    strategies: g.strategies,
    responsible: g.responsible,
    measurementMethod: MeasurementMethod.parse(g.measurementMethod),
    measurementFrequency: MeasurementFrequency.parse(g.measurementFrequency),
    status: GoalStatus.parse(g.status),
    progressCount: Number(g.progressCount ?? 0),
    lastProgress: g.lastProgress
      ? {
          level: ProgressLevel.parse(g.lastProgress.level),
          observedAt: new Date(g.lastProgress.observedAt).toISOString(),
        }
      : null,
    updatedAt: toIso(g.updatedAt),
  };
}

function toProgressEntry(r: {
  id: string;
  goalId: string;
  level: string;
  support: string | null;
  note: string | null;
  observedAt: Date;
  recordedBy: string | null;
  fullName: string | null;
}): ProgressEntry {
  return {
    id: r.id,
    goalId: r.goalId,
    level: ProgressLevel.parse(r.level),
    support: r.support ? SupportType.parse(r.support) : null,
    note: r.note,
    observedAt: toIso(r.observedAt),
    recordedBy: { userId: r.recordedBy ?? '', fullName: r.fullName },
  };
}
