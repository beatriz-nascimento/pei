import {
  AcceptInvitationInput,
  type ActiveGoal,
  AssignStaffInput,
  CONSENT_TERMS_VERSION,
  ChangePeiStatusInput,
  CreateFamilyLinkInput,
  CreateInvitationInput,
  CreatePeiInput,
  CreateStudentInput,
  CreateTenantInput,
  FamilyConsentInput,
  type FamilyLink,
  type FamilyPortalView,
  type Goal,
  GoalInput,
  type Invitation,
  type Me,
  type Member,
  type MemberRole,
  type Pei,
  type PeiStatus,
  type PeiSummary,
  ProgressEntryInput,
  type ProgressEntry,
  ReorderGoalsInput,
  type Student,
  type StudentSummary,
  type Tenant,
  UpdateGoalInput,
  UpdateMemberInput,
  UpdatePeiInput,
  UpdateStudentInput,
  UpdateTenantInput,
  CaseStudy,
} from '@pei/shared';
import { z } from 'zod';
import {
  type MockData,
  type MockDb,
  type MockFamilyLink,
  type MockGoal,
  type MockPei,
  type MockProgress,
  type MockStudent,
  type MockUser,
  linkToken,
  now,
  uuid,
} from './db';

/**
 * API simulada: mesmas rotas, respostas e regras de permissão de apps/api
 * (papéis, vínculo com o aluno, transições de status), sobre o banco em memória.
 */

export interface MockRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
  userId: string | null;
}

export interface MockResponse {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues?: Array<{ path: string; message: string }>,
  ) {
    super(message);
  }
}

const ERROR_NAMES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  501: 'Not Implemented',
};

const NO_CONTENT = Symbol('no-content');

const TRANSITIONS: Record<PeiStatus, PeiStatus[]> = {
  draft: ['active'],
  active: ['archived'],
  archived: [],
};

const INVITATION_TTL_DAYS = 7;

/* -------------------------------------------------------------------------- */
/* Contexto da requisição                                                     */
/* -------------------------------------------------------------------------- */

class Ctx {
  constructor(
    readonly data: MockData,
    readonly req: MockRequest,
    readonly params: Record<string, string>,
  ) {}

  user(): MockUser {
    const user = this.data.users.find((u) => u.id === this.req.userId);
    if (!user) throw new HttpError(401, 'Sessão expirada. Entre novamente.');
    return user;
  }

  /** Usuário + papel na conta da rota (/tenants/:tenantId/...). */
  tenant(...roles: MemberRole[]): { tenantId: string; user: MockUser; role: MemberRole } {
    const user = this.user();
    const tenantId = this.params['tenantId']!;
    const m = this.data.memberships.find((x) => x.tenantId === tenantId && x.userId === user.id);
    if (!m) throw new HttpError(403, 'Você não tem acesso a esta conta');
    if (roles.length > 0 && !roles.includes(m.role)) {
      throw new HttpError(403, 'Você não tem permissão para esta ação');
    }
    return { tenantId, user, role: m.role };
  }

  parse<S extends z.ZodType>(schema: S, value: unknown = this.req.body): z.output<S> {
    const result = schema.safeParse(value ?? {});
    if (!result.success) {
      throw new HttpError(
        400,
        'Dados inválidos',
        result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }
    return result.data;
  }

  /* Visibilidade, como private.readable_student_ids / editable_student_ids no banco. */

  private isStaff(studentId: string, userId: string): boolean {
    return this.data.staff.some((s) => s.studentId === studentId && s.userId === userId);
  }
  canRead(studentId: string, userId: string, role: MemberRole): boolean {
    return role === 'admin' || this.isStaff(studentId, userId);
  }
  canEdit(studentId: string, userId: string, role: MemberRole): boolean {
    return role === 'admin' || (role === 'editor' && this.isStaff(studentId, userId));
  }

  student(id = this.params['studentId']!): MockStudent {
    const { tenantId, user, role } = this.tenant();
    const s = this.data.students.find((x) => x.id === id && x.tenantId === tenantId);
    if (!s || !this.canRead(s.id, user.id, role)) throw new HttpError(404, 'Aluno não encontrado');
    return s;
  }

  editableStudent(id = this.params['studentId']!): MockStudent {
    const s = this.student(id);
    const { user, role } = this.tenant();
    if (!this.canEdit(s.id, user.id, role)) {
      throw new HttpError(403, 'Você tem acesso somente leitura a este aluno');
    }
    return s;
  }

  pei(id = this.params['peiId']!): MockPei {
    const { tenantId, user, role } = this.tenant();
    const p = this.data.peis.find((x) => x.id === id && x.tenantId === tenantId);
    if (!p || !this.canRead(p.studentId, user.id, role)) {
      throw new HttpError(404, 'PEI não encontrado');
    }
    return p;
  }

  editablePei(): MockPei {
    const p = this.pei();
    const { user, role } = this.tenant();
    if (!this.canEdit(p.studentId, user.id, role)) {
      throw new HttpError(403, 'Você tem acesso somente leitura a este PEI');
    }
    return p;
  }

  /** Como editablePei, mas também bloqueia PEIs arquivados. */
  writablePei(): MockPei {
    const p = this.editablePei();
    if (p.status === 'archived') {
      throw new HttpError(409, 'PEI arquivado não pode ser alterado. Crie uma nova versão.');
    }
    return p;
  }

  goal(pei: MockPei): MockGoal {
    const g = this.data.goals.find((x) => x.id === this.params['goalId'] && x.peiId === pei.id);
    if (!g) throw new HttpError(404, 'Meta não encontrada');
    return g;
  }

  origin(): string {
    return location.origin;
  }
}

/* -------------------------------------------------------------------------- */
/* Conversão para os tipos de resposta (@pei/shared/dto)                      */
/* -------------------------------------------------------------------------- */

function toTenant(t: MockData['tenants'][number]): Tenant {
  return {
    id: t.id,
    name: t.name,
    type: t.type,
    city: t.city,
    state: t.state,
    createdAt: t.createdAt,
  };
}

function toMe(data: MockData, user: MockUser): Me {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    memberships: data.memberships
      .filter((m) => m.userId === user.id)
      .map((m) => {
        const t = data.tenants.find((x) => x.id === m.tenantId)!;
        return { tenantId: t.id, tenantName: t.name, tenantType: t.type, role: m.role };
      })
      .sort((a, b) => a.tenantName.localeCompare(b.tenantName)),
  };
}

function toStudentSummary(data: MockData, s: MockStudent): StudentSummary {
  return {
    id: s.id,
    fullName: s.fullName,
    grade: s.grade,
    classGroup: s.classGroup,
    schoolName: s.schoolName,
    conditions: s.conditions,
    activePeiId: data.peis.find((p) => p.studentId === s.id && p.status === 'active')?.id ?? null,
    updatedAt: s.updatedAt,
  };
}

function toStudent(data: MockData, s: MockStudent): Student {
  return {
    ...toStudentSummary(data, s),
    birthDate: s.birthDate,
    notes: s.notes,
    guardians: s.guardians,
    staff: data.staff
      .filter((x) => x.studentId === s.id)
      .map((x) => {
        const u = data.users.find((y) => y.id === x.userId)!;
        return { userId: u.id, fullName: u.fullName, email: u.email, function: x.function };
      }),
    archivedAt: s.archivedAt,
    createdAt: s.createdAt,
  };
}

function progressOf(data: MockData, goalId: string): MockProgress[] {
  return data.progress
    .filter((e) => e.goalId === goalId)
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
}

function toGoal(data: MockData, g: MockGoal): Goal {
  const entries = progressOf(data, g.id);
  const last = entries.at(-1);
  return {
    ...g,
    lastProgress: last ? { level: last.level, observedAt: last.observedAt } : null,
    progressCount: entries.length,
  };
}

function goalsOf(data: MockData, peiId: string): MockGoal[] {
  return data.goals.filter((g) => g.peiId === peiId).sort((a, b) => a.position - b.position);
}

function toPeiSummary(data: MockData, p: MockPei): PeiSummary {
  return {
    id: p.id,
    studentId: p.studentId,
    schoolYear: p.schoolYear,
    version: p.version,
    status: p.status,
    startDate: p.startDate,
    reviewDate: p.reviewDate,
    goalCount: data.goals.filter((g) => g.peiId === p.id).length,
    updatedAt: p.updatedAt,
  };
}

function toPei(ctx: Ctx, p: MockPei): Pei {
  const { user, role } = ctx.tenant();
  const student = ctx.data.students.find((s) => s.id === p.studentId)!;
  return {
    ...toPeiSummary(ctx.data, p),
    student: { id: student.id, fullName: student.fullName },
    caseStudy: p.caseStudy,
    baseline: p.baseline,
    adaptations: p.adaptations,
    services: p.services,
    goals: goalsOf(ctx.data, p.id).map((g) => toGoal(ctx.data, g)),
    createdAt: p.createdAt,
    canEdit: ctx.canEdit(p.studentId, user.id, role),
  };
}

function toProgress(data: MockData, e: MockProgress): ProgressEntry {
  const u = data.users.find((x) => x.id === e.recordedBy);
  return {
    id: e.id,
    goalId: e.goalId,
    level: e.level,
    support: e.support,
    note: e.note,
    observedAt: e.observedAt,
    recordedBy: { userId: e.recordedBy, fullName: u?.fullName ?? null },
  };
}

function toLink(l: MockFamilyLink): FamilyLink {
  return {
    id: l.id,
    studentId: l.studentId,
    label: l.label,
    expiresAt: l.expiresAt,
    revokedAt: l.revokedAt,
    accessCount: l.accessCount,
    lastAccessAt: l.lastAccessAt,
    createdAt: l.createdAt,
  };
}

/* -------------------------------------------------------------------------- */
/* Rotas                                                                      */
/* -------------------------------------------------------------------------- */

type Handler = (ctx: Ctx) => unknown;
type Route = [method: string, pattern: string, handler: Handler];

const ListStudentsQuery = z.object({
  q: z.string().trim().max(100).optional(),
  archived: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
const UpdateMeInput = z.object({ fullName: z.string().trim().min(1).max(160) });

const routes: Route[] = [
  /* Usuário e contas ------------------------------------------------------- */
  ['GET', '/health', () => ({ status: 'ok' })],
  ['GET', '/me', (c) => toMe(c.data, c.user())],
  [
    'PATCH',
    '/me',
    (c) => {
      const user = c.user();
      user.fullName = c.parse(UpdateMeInput).fullName;
      return toMe(c.data, user);
    },
  ],
  [
    'POST',
    '/tenants',
    (c) => {
      const user = c.user();
      const body = c.parse(CreateTenantInput);
      const tenant = {
        id: uuid(),
        name: body.name,
        type: body.type,
        city: body.city || null,
        state: body.state ?? null,
        createdAt: now(),
      };
      c.data.tenants.push(tenant);
      c.data.memberships.push({
        tenantId: tenant.id,
        userId: user.id,
        role: 'admin',
        joinedAt: now(),
      });
      return toTenant(tenant);
    },
  ],
  [
    'GET',
    '/tenants/:tenantId',
    (c) => toTenant(c.data.tenants.find((t) => t.id === c.tenant().tenantId)!),
  ],
  [
    'PATCH',
    '/tenants/:tenantId',
    (c) => {
      const tenant = c.data.tenants.find((t) => t.id === c.tenant('admin').tenantId)!;
      const body = c.parse(UpdateTenantInput);
      if (body.name !== undefined) tenant.name = body.name;
      if (body.city !== undefined) tenant.city = body.city || null;
      if (body.state !== undefined) tenant.state = body.state ?? null;
      return toTenant(tenant);
    },
  ],

  /* Membros e convites ------------------------------------------------------ */
  [
    'GET',
    '/tenants/:tenantId/members',
    (c): Member[] => {
      const { tenantId } = c.tenant();
      return c.data.memberships
        .filter((m) => m.tenantId === tenantId)
        .map((m) => {
          const u = c.data.users.find((x) => x.id === m.userId)!;
          return {
            userId: u.id,
            email: u.email,
            fullName: u.fullName,
            role: m.role,
            joinedAt: m.joinedAt,
          };
        })
        .sort((a, b) => (a.fullName ?? a.email).localeCompare(b.fullName ?? b.email));
    },
  ],
  [
    'PATCH',
    '/tenants/:tenantId/members/:userId',
    (c) => {
      const { tenantId } = c.tenant('admin');
      const { role } = c.parse(UpdateMemberInput);
      const m = c.data.memberships.find(
        (x) => x.tenantId === tenantId && x.userId === c.params['userId'],
      );
      if (!m) throw new HttpError(404, 'Membro não encontrado');
      m.role = role;
      return { role };
    },
  ],
  [
    'DELETE',
    '/tenants/:tenantId/members/:userId',
    (c) => {
      const { tenantId, user, role } = c.tenant();
      const userId = c.params['userId'];
      if (role !== 'admin' && userId !== user.id) {
        throw new HttpError(403, 'Somente administradores removem outros membros');
      }
      const before = c.data.memberships.length;
      c.data.memberships = c.data.memberships.filter(
        (m) => !(m.tenantId === tenantId && m.userId === userId),
      );
      if (c.data.memberships.length === before) throw new HttpError(404, 'Membro não encontrado');
      c.data.staff = c.data.staff.filter(
        (s) => !(s.userId === userId && studentTenant(c.data, s.studentId) === tenantId),
      );
      return NO_CONTENT;
    },
  ],
  [
    'GET',
    '/tenants/:tenantId/invitations',
    (c): Invitation[] => {
      const { tenantId } = c.tenant('admin');
      return c.data.invitations
        .filter((i) => i.tenantId === tenantId && i.acceptedAt === null)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(({ id, email, role, expiresAt, acceptedAt, createdAt }) => ({
          id,
          email,
          role,
          expiresAt,
          acceptedAt,
          createdAt,
        }));
    },
  ],
  [
    'POST',
    '/tenants/:tenantId/invitations',
    (c): Invitation => {
      const { tenantId } = c.tenant('admin');
      const body = c.parse(CreateInvitationInput);
      const inv = {
        id: uuid(),
        tenantId,
        token: linkToken(),
        email: body.email,
        role: body.role,
        expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000).toISOString(),
        acceptedAt: null,
        createdAt: now(),
      };
      c.data.invitations.push(inv);
      return {
        id: inv.id,
        email: inv.email,
        role: inv.role,
        expiresAt: inv.expiresAt,
        acceptedAt: inv.acceptedAt,
        createdAt: inv.createdAt,
        acceptUrl: `${c.origin()}/convite/${inv.token}`,
      };
    },
  ],
  [
    'DELETE',
    '/tenants/:tenantId/invitations/:invitationId',
    (c) => {
      const { tenantId } = c.tenant('admin');
      c.data.invitations = c.data.invitations.filter(
        (i) => !(i.tenantId === tenantId && i.id === c.params['invitationId']),
      );
      return NO_CONTENT;
    },
  ],
  [
    'POST',
    '/invitations/accept',
    (c) => {
      const user = c.user();
      const { token } = c.parse(AcceptInvitationInput);
      const inv = c.data.invitations.find((i) => i.token === token);
      if (!inv || inv.acceptedAt || inv.expiresAt < now()) {
        throw new HttpError(404, 'Convite inválido ou expirado');
      }
      if (inv.email !== user.email.toLowerCase()) {
        throw new HttpError(403, 'Este convite foi enviado para outro e-mail');
      }
      if (!c.data.memberships.some((m) => m.tenantId === inv.tenantId && m.userId === user.id)) {
        c.data.memberships.push({
          tenantId: inv.tenantId,
          userId: user.id,
          role: inv.role,
          joinedAt: now(),
        });
      }
      inv.acceptedAt = now();
      return { tenantId: inv.tenantId };
    },
  ],

  /* Alunos ------------------------------------------------------------------ */
  [
    'GET',
    '/tenants/:tenantId/students',
    (c) => {
      const { tenantId, user, role } = c.tenant();
      const { q, archived } = c.parse(ListStudentsQuery, Object.fromEntries(c.req.query));
      const needle = normalize(q ?? '');
      return c.data.students
        .filter(
          (s) =>
            s.tenantId === tenantId &&
            c.canRead(s.id, user.id, role) &&
            (archived ? s.archivedAt !== null : s.archivedAt === null) &&
            normalize(s.fullName).includes(needle),
        )
        .sort((a, b) => a.fullName.localeCompare(b.fullName))
        .map((s) => toStudentSummary(c.data, s));
    },
  ],
  [
    'POST',
    '/tenants/:tenantId/students',
    (c) => {
      const { tenantId } = c.tenant('admin');
      const body = c.parse(CreateStudentInput);
      const s: MockStudent = {
        id: uuid(),
        tenantId,
        fullName: body.fullName,
        birthDate: body.birthDate ?? null,
        schoolName: body.schoolName || null,
        grade: body.grade || null,
        classGroup: body.classGroup || null,
        conditions: body.conditions,
        notes: body.notes || null,
        guardians: body.guardians,
        archivedAt: null,
        createdAt: now(),
        updatedAt: now(),
      };
      c.data.students.push(s);
      return toStudent(c.data, s);
    },
  ],
  ['GET', '/tenants/:tenantId/students/:studentId', (c) => toStudent(c.data, c.student())],
  [
    'PATCH',
    '/tenants/:tenantId/students/:studentId',
    (c) => {
      const s = c.editableStudent();
      const body = c.parse(UpdateStudentInput);
      if (body.fullName !== undefined) s.fullName = body.fullName;
      if (body.birthDate !== undefined) s.birthDate = body.birthDate ?? null;
      if (body.schoolName !== undefined) s.schoolName = body.schoolName || null;
      if (body.grade !== undefined) s.grade = body.grade || null;
      if (body.classGroup !== undefined) s.classGroup = body.classGroup || null;
      if (body.conditions !== undefined) s.conditions = body.conditions;
      if (body.notes !== undefined) s.notes = body.notes || null;
      if (body.guardians !== undefined) s.guardians = body.guardians;
      s.updatedAt = now();
      return toStudent(c.data, s);
    },
  ],
  ['POST', '/tenants/:tenantId/students/:studentId/archive', (c) => setArchived(c, true)],
  ['POST', '/tenants/:tenantId/students/:studentId/unarchive', (c) => setArchived(c, false)],
  [
    'DELETE',
    '/tenants/:tenantId/students/:studentId',
    (c) => {
      c.tenant('admin');
      const s = c.student();
      const peiIds = new Set(c.data.peis.filter((p) => p.studentId === s.id).map((p) => p.id));
      const goalIds = new Set(c.data.goals.filter((g) => peiIds.has(g.peiId)).map((g) => g.id));
      c.data.students = c.data.students.filter((x) => x.id !== s.id);
      c.data.staff = c.data.staff.filter((x) => x.studentId !== s.id);
      c.data.peis = c.data.peis.filter((p) => !peiIds.has(p.id));
      c.data.goals = c.data.goals.filter((g) => !goalIds.has(g.id));
      c.data.progress = c.data.progress.filter((e) => !goalIds.has(e.goalId));
      c.data.familyLinks = c.data.familyLinks.filter((l) => l.studentId !== s.id);
      return NO_CONTENT;
    },
  ],
  [
    'PUT',
    '/tenants/:tenantId/students/:studentId/staff/:userId',
    (c) => {
      const { tenantId } = c.tenant('admin');
      const s = c.student();
      const fn = c.parse(AssignStaffInput.pick({ function: true })).function;
      const userId = c.params['userId']!;
      if (!c.data.memberships.some((m) => m.tenantId === tenantId && m.userId === userId)) {
        throw new HttpError(400, 'Referência inválida');
      }
      const existing = c.data.staff.find((x) => x.studentId === s.id && x.userId === userId);
      if (existing) existing.function = fn;
      else c.data.staff.push({ studentId: s.id, userId, function: fn });
      return toStudent(c.data, s);
    },
  ],
  [
    'DELETE',
    '/tenants/:tenantId/students/:studentId/staff/:userId',
    (c) => {
      c.tenant('admin');
      const s = c.student();
      c.data.staff = c.data.staff.filter(
        (x) => !(x.studentId === s.id && x.userId === c.params['userId']),
      );
      return toStudent(c.data, s);
    },
  ],

  /* PEIs -------------------------------------------------------------------- */
  [
    'GET',
    '/tenants/:tenantId/active-goals',
    (c): ActiveGoal[] => {
      const { tenantId, user, role } = c.tenant();
      const result: ActiveGoal[] = [];
      const students = c.data.students
        .filter((s) => s.tenantId === tenantId && !s.archivedAt && c.canRead(s.id, user.id, role))
        .sort((a, b) => a.fullName.localeCompare(b.fullName));
      for (const s of students) {
        const pei = c.data.peis.find((p) => p.studentId === s.id && p.status === 'active');
        if (!pei) continue;
        for (const g of goalsOf(c.data, pei.id)) {
          if (g.status !== 'not_started' && g.status !== 'in_progress') continue;
          result.push({
            studentId: s.id,
            studentName: s.fullName,
            peiId: pei.id,
            canEdit: c.canEdit(s.id, user.id, role),
            goal: toGoal(c.data, g),
          });
        }
      }
      return result;
    },
  ],
  [
    'GET',
    '/tenants/:tenantId/students/:studentId/peis',
    (c) => {
      const s = c.student();
      return c.data.peis
        .filter((p) => p.studentId === s.id)
        .sort((a, b) => b.schoolYear - a.schoolYear || b.version - a.version)
        .map((p) => toPeiSummary(c.data, p));
    },
  ],
  [
    'POST',
    '/tenants/:tenantId/students/:studentId/peis',
    (c) => {
      const { tenantId } = c.tenant();
      const s = c.editableStudent();
      const body = c.parse(CreatePeiInput);
      const sameYear = c.data.peis.filter(
        (p) => p.studentId === s.id && p.schoolYear === body.schoolYear,
      );
      let source: MockPei | undefined;
      if (body.copyFromPeiId) {
        source = c.data.peis.find((p) => p.id === body.copyFromPeiId && p.studentId === s.id);
        if (!source) throw new HttpError(404, 'PEI de origem não encontrado');
      }
      const pei: MockPei = {
        id: uuid(),
        tenantId,
        studentId: s.id,
        schoolYear: body.schoolYear,
        version: Math.max(0, ...sameYear.map((p) => p.version)) + 1,
        status: 'draft',
        startDate: body.startDate ?? null,
        reviewDate: body.reviewDate ?? null,
        caseStudy: source ? structuredClone(source.caseStudy) : CaseStudy.parse({}),
        baseline: source ? structuredClone(source.baseline) : [],
        adaptations: source ? structuredClone(source.adaptations) : [],
        services: source ? structuredClone(source.services) : [],
        createdAt: now(),
        updatedAt: now(),
      };
      c.data.peis.push(pei);
      if (source) {
        for (const g of goalsOf(c.data, source.id)) {
          if (g.status === 'discontinued') continue;
          c.data.goals.push({
            ...g,
            id: uuid(),
            peiId: pei.id,
            status: 'not_started',
            updatedAt: now(),
          });
        }
      }
      return toPei(c, pei);
    },
  ],
  ['GET', '/tenants/:tenantId/peis/:peiId', (c) => toPei(c, c.pei())],
  [
    'PATCH',
    '/tenants/:tenantId/peis/:peiId',
    (c) => {
      const pei = c.writablePei();
      const body = c.parse(UpdatePeiInput);
      if (body.startDate !== undefined) pei.startDate = body.startDate;
      if (body.reviewDate !== undefined) pei.reviewDate = body.reviewDate;
      if (body.caseStudy !== undefined) pei.caseStudy = body.caseStudy;
      if (body.baseline !== undefined) pei.baseline = body.baseline;
      if (body.adaptations !== undefined) pei.adaptations = body.adaptations;
      if (body.services !== undefined) pei.services = body.services;
      pei.updatedAt = now();
      return toPei(c, pei);
    },
  ],
  [
    'POST',
    '/tenants/:tenantId/peis/:peiId/status',
    (c) => {
      const pei = c.editablePei();
      const { status: next } = c.parse(ChangePeiStatusInput);
      if (pei.status === next) return toPei(c, pei);
      if (!TRANSITIONS[pei.status].includes(next)) {
        throw new HttpError(409, `Não é possível mudar de "${pei.status}" para "${next}"`);
      }
      if (next === 'active') {
        if (!c.data.goals.some((g) => g.peiId === pei.id)) {
          throw new HttpError(409, 'Cadastre pelo menos uma meta antes de colocar o PEI em vigor');
        }
        // O PEI anterior em vigor vira histórico.
        for (const p of c.data.peis) {
          if (p.studentId === pei.studentId && p.status === 'active') p.status = 'archived';
        }
      }
      pei.status = next;
      pei.updatedAt = now();
      return toPei(c, pei);
    },
  ],
  [
    'DELETE',
    '/tenants/:tenantId/peis/:peiId',
    (c) => {
      const pei = c.editablePei();
      if (pei.status !== 'draft')
        throw new HttpError(409, 'Só é possível excluir PEIs em rascunho');
      const goalIds = new Set(c.data.goals.filter((g) => g.peiId === pei.id).map((g) => g.id));
      c.data.peis = c.data.peis.filter((p) => p.id !== pei.id);
      c.data.goals = c.data.goals.filter((g) => !goalIds.has(g.id));
      c.data.progress = c.data.progress.filter((e) => !goalIds.has(e.goalId));
      return NO_CONTENT;
    },
  ],
  [
    'GET',
    '/tenants/:tenantId/peis/:peiId/export',
    (c): MockResponse => {
      const pei = toPei(c, c.pei());
      const format = c.req.query.get('format') ?? 'pdf';
      if (format !== 'pdf') {
        throw new HttpError(501, 'No modo demonstração, só a exportação em PDF está disponível');
      }
      const name = pei.student.fullName.split(' ')[0];
      return {
        status: 200,
        body: demoPdf(pei),
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="PEI-${name}-${pei.schoolYear}-v${pei.version}-demo.pdf"`,
        },
      };
    },
  ],

  /* Metas ------------------------------------------------------------------- */
  [
    'POST',
    '/tenants/:tenantId/peis/:peiId/goals',
    (c) => {
      const pei = c.writablePei();
      const body = c.parse(GoalInput);
      const g: MockGoal = {
        id: uuid(),
        peiId: pei.id,
        position: Math.max(-1, ...goalsOf(c.data, pei.id).map((x) => x.position)) + 1,
        ...body,
        bnccCode: body.bnccCode || null,
        updatedAt: now(),
      };
      c.data.goals.push(g);
      pei.updatedAt = now();
      return toGoal(c.data, g);
    },
  ],
  [
    'PUT',
    '/tenants/:tenantId/peis/:peiId/goals/order',
    (c) => {
      const pei = c.writablePei();
      const { goalIds } = c.parse(ReorderGoalsInput);
      goalIds.forEach((id, i) => {
        const g = c.data.goals.find((x) => x.id === id && x.peiId === pei.id);
        if (g) g.position = i;
      });
      return toPei(c, pei);
    },
  ],
  [
    'PATCH',
    '/tenants/:tenantId/peis/:peiId/goals/:goalId',
    (c) => {
      const pei = c.writablePei();
      const g = c.goal(pei);
      const body = c.parse(UpdateGoalInput);
      Object.assign(
        g,
        body,
        body.bnccCode !== undefined ? { bnccCode: body.bnccCode || null } : {},
      );
      g.updatedAt = now();
      return toGoal(c.data, g);
    },
  ],
  [
    'DELETE',
    '/tenants/:tenantId/peis/:peiId/goals/:goalId',
    (c) => {
      const pei = c.writablePei();
      const g = c.goal(pei);
      c.data.goals = c.data.goals.filter((x) => x.id !== g.id);
      c.data.progress = c.data.progress.filter((e) => e.goalId !== g.id);
      return NO_CONTENT;
    },
  ],

  /* Progresso --------------------------------------------------------------- */
  [
    'GET',
    '/tenants/:tenantId/peis/:peiId/goals/:goalId/progress',
    (c) => {
      const g = c.goal(c.pei());
      return progressOf(c.data, g.id)
        .reverse()
        .map((e) => toProgress(c.data, e));
    },
  ],
  [
    'POST',
    '/tenants/:tenantId/peis/:peiId/goals/:goalId/progress',
    (c) => {
      const pei = c.writablePei();
      const g = c.goal(pei);
      const body = c.parse(ProgressEntryInput);
      const entry: MockProgress = {
        id: uuid(),
        goalId: g.id,
        level: body.level,
        support: body.support ?? null,
        note: body.note || null,
        observedAt: body.observedAt ? new Date(body.observedAt).toISOString() : now(),
        recordedBy: c.user().id,
      };
      c.data.progress.push(entry);
      // A primeira medição tira a meta de "não iniciada".
      if (g.status === 'not_started') g.status = 'in_progress';
      return toProgress(c.data, entry);
    },
  ],
  [
    'DELETE',
    '/tenants/:tenantId/peis/:peiId/goals/:goalId/progress/:entryId',
    (c) => {
      const { user, role } = c.tenant();
      const g = c.goal(c.pei());
      const entry = c.data.progress.find((e) => e.id === c.params['entryId'] && e.goalId === g.id);
      if (!entry || (role !== 'admin' && entry.recordedBy !== user.id)) {
        throw new HttpError(404, 'Registro não encontrado ou sem permissão para excluir');
      }
      c.data.progress = c.data.progress.filter((e) => e.id !== entry.id);
      return NO_CONTENT;
    },
  ],

  /* Links da família -------------------------------------------------------- */
  [
    'GET',
    '/tenants/:tenantId/students/:studentId/family-links',
    (c) => {
      const s = c.student();
      return c.data.familyLinks
        .filter((l) => l.studentId === s.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(toLink);
    },
  ],
  [
    'POST',
    '/tenants/:tenantId/students/:studentId/family-links',
    (c) => {
      const { tenantId } = c.tenant();
      const s = c.editableStudent();
      const body = c.parse(CreateFamilyLinkInput);
      const link: MockFamilyLink = {
        id: uuid(),
        tenantId,
        studentId: s.id,
        token: linkToken(),
        label: body.label || null,
        expiresAt: new Date(Date.now() + body.expiresInDays * 86_400_000).toISOString(),
        revokedAt: null,
        accessCount: 0,
        lastAccessAt: null,
        createdAt: now(),
        consents: [],
      };
      c.data.familyLinks.push(link);
      return { ...toLink(link), url: `${c.origin()}/familia/${link.token}` };
    },
  ],
  [
    'POST',
    '/tenants/:tenantId/students/:studentId/family-links/:linkId/revoke',
    (c) => {
      const s = c.editableStudent();
      const link = c.data.familyLinks.find(
        (l) => l.id === c.params['linkId'] && l.studentId === s.id,
      );
      if (!link) throw new HttpError(404, 'Link não encontrado');
      link.revokedAt ??= now();
      return toLink(link);
    },
  ],

  /* Portal da família (público, sem login) ---------------------------------- */
  [
    'GET',
    '/public/family/:token',
    (c): FamilyPortalView => {
      const link = validLink(c);
      link.accessCount += 1;
      link.lastAccessAt = now();
      const s = c.data.students.find((x) => x.id === link.studentId)!;
      const t = c.data.tenants.find((x) => x.id === link.tenantId)!;
      const consented = link.consents.includes(CONSENT_TERMS_VERSION);
      return {
        student: {
          firstName: s.fullName.trim().split(' ')[0]!,
          grade: s.grade,
          schoolName: s.schoolName ?? (t.type === 'school' ? t.name : null),
        },
        tenantName: t.name,
        consent: { required: !consented, termsVersion: CONSENT_TERMS_VERSION },
        peis: !consented
          ? []
          : c.data.peis
              .filter(
                (p) => p.studentId === s.id && (p.status === 'active' || p.status === 'archived'),
              )
              .sort((a, b) => b.schoolYear - a.schoolYear || b.version - a.version)
              .map((p) => ({
                id: p.id,
                schoolYear: p.schoolYear,
                version: p.version,
                status: p.status,
                startDate: p.startDate,
                reviewDate: p.reviewDate,
                adaptations: p.adaptations,
                services: p.services,
                goals: goalsOf(c.data, p.id).map((g) => ({
                  id: g.id,
                  area: g.area,
                  description: g.description,
                  successCriterion: g.successCriterion,
                  targetDate: g.targetDate,
                  status: g.status,
                  progress: progressOf(c.data, g.id).map((e) => ({
                    level: e.level,
                    observedAt: e.observedAt,
                  })),
                })),
              })),
      };
    },
  ],
  [
    'POST',
    '/public/family/:token/consent',
    (c) => {
      const link = validLink(c);
      c.parse(FamilyConsentInput);
      if (!link.consents.includes(CONSENT_TERMS_VERSION)) link.consents.push(CONSENT_TERMS_VERSION);
      return NO_CONTENT;
    },
  ],
];

function setArchived(c: Ctx, archived: boolean): Student {
  c.tenant('admin');
  const s = c.student();
  s.archivedAt = archived ? (s.archivedAt ?? now()) : null;
  s.updatedAt = now();
  return toStudent(c.data, s);
}

function validLink(c: Ctx): MockFamilyLink {
  const link = c.data.familyLinks.find((l) => l.token === c.params['token']);
  if (!link || link.revokedAt || link.expiresAt < now()) {
    throw new HttpError(404, 'Link inválido, expirado ou revogado');
  }
  return link;
}

function studentTenant(data: MockData, studentId: string): string | undefined {
  return data.students.find((s) => s.id === studentId)?.tenantId;
}

/** Comparação sem acentos e sem diferenciar maiúsculas, como o ilike + unaccent. */
function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/* -------------------------------------------------------------------------- */
/* Despacho                                                                   */
/* -------------------------------------------------------------------------- */

const compiled = routes.map(([method, pattern, handler]) => {
  const names: string[] = [];
  const regex = new RegExp(
    '^' +
      pattern.replace(/:(\w+)/g, (_, name: string) => {
        names.push(name);
        return '([^/]+)';
      }) +
      '/?$',
  );
  return { method, regex, names, handler };
});

export function handleMockRequest(db: MockDb, req: MockRequest): MockResponse {
  let pathMatched = false;
  for (const route of compiled) {
    const m = route.regex.exec(req.path);
    if (!m) continue;
    pathMatched = true;
    if (route.method !== req.method) continue;
    const params = Object.fromEntries(
      route.names.map((n, i) => [n, decodeURIComponent(m[i + 1]!)]),
    );
    try {
      const result = route.handler(new Ctx(db.data, req, params));
      if (req.method !== 'GET' || req.path.startsWith('/public/')) db.save();
      if (result === NO_CONTENT) return { status: 204 };
      if (isRaw(result)) return result;
      // Cópia: o componente não pode alterar o "banco" mexendo na resposta.
      return { status: 200, body: structuredClone(result) };
    } catch (e) {
      if (e instanceof HttpError) {
        return {
          status: e.status,
          body: {
            statusCode: e.status,
            error: ERROR_NAMES[e.status] ?? 'Error',
            message: e.message,
            ...(e.issues ? { issues: e.issues } : {}),
          },
        };
      }
      throw e;
    }
  }
  const status = pathMatched ? 405 : 404;
  return {
    status,
    body: {
      statusCode: status,
      error: pathMatched ? 'Method Not Allowed' : 'Not Found',
      message: `Rota não simulada: ${req.method} ${req.path}`,
    },
  };
}

function isRaw(v: unknown): v is MockResponse {
  return typeof v === 'object' && v !== null && 'status' in v && 'body' in v && 'headers' in v;
}

/* -------------------------------------------------------------------------- */
/* PDF de demonstração (uma página, texto simples)                            */
/* -------------------------------------------------------------------------- */

function demoPdf(pei: Pei): Blob {
  const lines = [
    `PEI - ${pei.student.fullName}`,
    `Ano letivo ${pei.schoolYear} - versao ${pei.version}`,
    '',
    'Documento de demonstracao gerado pelo modo mock do frontend.',
    'O PDF completo e gerado pela API (apps/api/src/modules/exports).',
    '',
    `Metas (${pei.goals.length}):`,
    ...pei.goals.map((g, i) => `${i + 1}. ${g.description}`.slice(0, 95)),
  ];
  const ascii = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\x20-\x7e]/g, '?')
      .replace(/([\\()])/g, '\\$1');
  const stream = [
    'BT',
    '/F1 12 Tf',
    '16 TL',
    '50 800 Td',
    ...lines.map((l) => `(${ascii(l)}) '`),
    'ET',
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Blob([pdf], { type: 'application/pdf' });
}
