import type {
  ActiveGoal,
  ApiErrorBody,
  FamilyPortalView,
  Me,
  Pei,
  StudentSummary,
} from '@pei/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { handleMockRequest, type MockResponse } from './api';
import { MockDb } from './db';
import { DEMO_FAMILY_TOKEN, DEMO_USERS } from './seed';

describe('API simulada', () => {
  let db: MockDb;

  beforeEach(() => {
    localStorage.clear();
    db = new MockDb();
  });

  function call<T = unknown>(
    userId: string | null,
    method: string,
    url: string,
    body?: unknown,
  ): MockResponse & { body: T } {
    const [path = '/', qs = ''] = url.split('?');
    return handleMockRequest(db, {
      method,
      path,
      query: new URLSearchParams(qs),
      body,
      userId,
    }) as MockResponse & { body: T };
  }

  const ana = DEMO_USERS.ana.id;
  const bruno = DEMO_USERS.bruno.id;
  const carla = DEMO_USERS.carla.id;

  function schoolId(): string {
    const me = call(ana, 'GET', '/me').body as Me;
    return me.memberships.find((m) => m.tenantType === 'school')!.tenantId;
  }

  it('exige login e devolve /me com as contas', () => {
    expect(call(null, 'GET', '/me').status).toBe(401);
    const me = call(ana, 'GET', '/me').body as Me;
    expect(me.memberships).toHaveLength(2);
  });

  it('filtra alunos por papel, arquivamento e busca sem acento', () => {
    const t = schoolId();
    const names = (uid: string, qs = '') =>
      (call(uid, 'GET', `/tenants/${t}/students${qs}`).body as StudentSummary[]).map(
        (s) => s.fullName,
      );
    expect(names(ana)).toHaveLength(3);
    expect(names(bruno)).toEqual(['Lucas Oliveira Santos']);
    expect(names(carla)).toHaveLength(2);
    expect(names(ana, '?archived=true')).toEqual(['Sofia Ribeiro']);
    expect(names(ana, '?q=MARIA')).toEqual(['Maria Eduarda Costa']);
  });

  it('aplica as permissões de escrita', () => {
    const t = schoolId();
    const student = { fullName: 'Novo Aluno' };
    expect(call(bruno, 'POST', `/tenants/${t}/students`, student).status).toBe(403);
    expect(call(ana, 'POST', `/tenants/${t}/students`, student).status).toBe(200);
    expect(
      call<ApiErrorBody>(ana, 'POST', `/tenants/${t}/students`, {}).body.issues?.[0]?.path,
    ).toBe('fullName');

    const goals = call(carla, 'GET', `/tenants/${t}/active-goals`).body as ActiveGoal[];
    expect(goals.length).toBeGreaterThan(0);
    expect(goals.every((g) => !g.canEdit)).toBe(true);
    const { peiId, goal } = goals[0]!;
    const progress = `/tenants/${t}/peis/${peiId}/goals/${goal.id}/progress`;
    expect(call(carla, 'POST', progress, { level: 'achieved' }).status).toBe(403);
    expect(call(bruno, 'POST', progress, { level: 'achieved' }).status).toBe(200);
  });

  it('segue o ciclo de vida do PEI: rascunho → em vigor → arquivado', () => {
    const t = schoolId();
    const pedro = (call(ana, 'GET', `/tenants/${t}/students?q=pedro`).body as StudentSummary[])[0]!;
    const pei = call(ana, 'POST', `/tenants/${t}/students/${pedro.id}/peis`, {
      schoolYear: 2026,
    }).body as Pei;
    const path = `/tenants/${t}/peis/${pei.id}`;
    expect(pei.status).toBe('draft');
    expect(call(ana, 'POST', `${path}/status`, { status: 'active' }).status).toBe(409);

    const goal = {
      area: 'autonomia',
      description: 'Guardar o material',
      successCriterion: '5 de 5 dias',
      targetDate: '2026-12-01',
    };
    expect(call(ana, 'POST', `${path}/goals`, goal).status).toBe(200);
    expect(call<Pei>(ana, 'POST', `${path}/status`, { status: 'active' }).body.status).toBe(
      'active',
    );
    expect(call(ana, 'DELETE', path).status).toBe(409);
    expect(call<Pei>(ana, 'POST', `${path}/status`, { status: 'archived' }).body.status).toBe(
      'archived',
    );
    expect(call(ana, 'PATCH', path, { startDate: '2026-02-01' }).status).toBe(409);
  });

  it('pede consentimento no portal da família antes de mostrar o PEI', () => {
    const url = `/public/family/${DEMO_FAMILY_TOKEN}`;
    let view = call(null, 'GET', url).body as FamilyPortalView;
    expect(view.consent.required).toBe(true);
    expect(view.peis).toEqual([]);

    const consent = { guardianName: 'Juliana', relationship: 'Mãe', accepted: true };
    expect(call(null, 'POST', `${url}/consent`, consent).status).toBe(204);
    view = call(null, 'GET', url).body as FamilyPortalView;
    expect(view.student.firstName).toBe('Lucas');
    expect(view.peis.map((p) => p.status)).toEqual(['active', 'archived']);
    expect(call(null, 'GET', '/public/family/token-que-nao-existe-000').status).toBe(404);
  });

  it('persiste as alterações e restaura o seed', () => {
    const t = schoolId();
    call(ana, 'POST', `/tenants/${t}/students`, { fullName: 'Persistido' });
    expect(new MockDb().data.students.some((s) => s.fullName === 'Persistido')).toBe(true);
    db.reset();
    expect(new MockDb().data.students.some((s) => s.fullName === 'Persistido')).toBe(false);
  });
});
