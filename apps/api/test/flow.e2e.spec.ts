/**
 * Percorre o fluxo comercial do fluxograma, do cliente ao PEI em uso:
 * conta Escola → equipe e papéis → aluno → PEI (abas, metas, progresso)
 * → documento → convite da família → portal.
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FamilyLink, Invitation, Pei, Student, Tenant } from '@pei/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminPool, api, createUser, startApp, type TestUser } from './helpers.js';

let app: NestFastifyApplication;
let gestora: TestUser;
let aee: TestUser;
let regente: TestUser;
let tenant: Tenant;
let student: Student;
let pei: Pei;
let familyUrl: string;

beforeAll(async () => {
  app = await startApp();
  gestora = await createUser('Gestora Ana');
  aee = await createUser('Professora AEE Bia');
  regente = await createUser('Professor Regente Caio');
});

afterAll(async () => {
  await app.close();
});

describe('fluxo Escola', () => {
  it('① cria a conta Escola e a gestora vira administradora', async () => {
    const res = await api(app, gestora).post('/v1/tenants', {
      name: 'Escola Aurora',
      type: 'school',
      city: 'Curitiba',
      state: 'pr',
    });
    expect(res.status).toBe(201);
    tenant = res.body;
    expect(tenant).toMatchObject({ name: 'Escola Aurora', type: 'school', state: 'PR' });

    const me = await api(app, gestora).get('/v1/me');
    expect(me.body.memberships).toEqual([
      expect.objectContaining({ tenantId: tenant.id, role: 'admin', tenantType: 'school' }),
    ]);
  });

  it('cadastra responsáveis e permissões (convites)', async () => {
    const asGestora = api(app, gestora);
    const invAee = await asGestora.post(`/v1/tenants/${tenant.id}/invitations`, {
      email: aee.email.toUpperCase(),
      role: 'editor',
    });
    expect(invAee.status).toBe(201);
    const invitation: Invitation = invAee.body;
    expect(invitation.acceptUrl).toMatch(/^http:\/\/app\.test\/convite\/[\w-]{43}$/);

    // O convite só vale para o e-mail convidado.
    const token = invitation.acceptUrl!.split('/').pop()!;
    const wrong = await api(app, regente).post('/v1/invitations/accept', { token });
    expect(wrong.status).toBe(403);

    const ok = await api(app, aee).post('/v1/invitations/accept', { token });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ tenantId: tenant.id });

    // Convite usado não pode ser reaproveitado.
    const again = await api(app, aee).post('/v1/invitations/accept', { token });
    expect(again.status).toBe(404);

    const invReg = await asGestora.post(`/v1/tenants/${tenant.id}/invitations`, {
      email: regente.email,
      role: 'viewer',
    });
    await api(app, regente).post('/v1/invitations/accept', {
      token: invReg.body.acceptUrl.split('/').pop(),
    });

    const members = await asGestora.get(`/v1/tenants/${tenant.id}/members`);
    expect(members.body.map((m: { role: string }) => m.role).sort()).toEqual([
      'admin',
      'editor',
      'viewer',
    ]);
  });

  it('só administradores convidam', async () => {
    const res = await api(app, aee).post(`/v1/tenants/${tenant.id}/invitations`, {
      email: 'x@exemplo.com.br',
      role: 'admin',
    });
    expect(res.status).toBe(403);
  });

  it('cadastra o aluno e vincula a equipe', async () => {
    const created = await api(app, gestora).post(`/v1/tenants/${tenant.id}/students`, {
      fullName: 'Lucas Andrade Lima',
      birthDate: '2017-03-12',
      grade: '3º ano',
      classGroup: 'B',
      conditions: ['TEA nível 1'],
      guardians: [{ name: 'Marina Lima', relationship: 'Mãe', email: 'marina@exemplo.com.br' }],
    });
    expect(created.status).toBe(201);
    student = created.body;

    // Editor sem vínculo não enxerga o aluno (minimização de acesso).
    const before = await api(app, aee).get(`/v1/tenants/${tenant.id}/students`);
    expect(before.body).toEqual([]);

    await api(app, gestora).put(`/v1/tenants/${tenant.id}/students/${student.id}/staff/${aee.id}`, {
      function: 'aee',
    });
    const linked = await api(app, gestora).put(
      `/v1/tenants/${tenant.id}/students/${student.id}/staff/${regente.id}`,
      { function: 'regente' },
    );
    expect(linked.body.staff).toHaveLength(2);

    const after = await api(app, aee).get(`/v1/tenants/${tenant.id}/students`);
    expect(after.body.map((s: Student) => s.id)).toEqual([student.id]);
  });

  it('② cria o PEI em rascunho', async () => {
    const res = await api(app, aee).post(
      `/v1/tenants/${tenant.id}/students/${student.id}/peis`,
      { schoolYear: 2026, startDate: '2026-03-01', reviewDate: '2026-07-15' },
    );
    expect(res.status).toBe(201);
    pei = res.body;
    expect(pei).toMatchObject({ status: 'draft', version: 1, canEdit: true });
  });

  it('③ preenche as abas', async () => {
    const res = await api(app, aee).patch(`/v1/tenants/${tenant.id}/peis/${pei.id}`, {
      caseStudy: { strengths: 'Memória visual, interesse por números', challenges: 'Transições' },
      baseline: [{ area: 'comunicacao', currentPerformance: 'Pede ajuda com apoio verbal' }],
      adaptations: [{ category: 'material', description: 'Rotina visual na mesa' }],
      services: [{ type: 'aee_sala_recursos', frequency: '2x por semana', durationMinutes: 50 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.caseStudy.strengths).toContain('Memória visual');
    expect(res.body.caseStudy.familyContext).toBe('');
    expect(res.body.services[0].durationMinutes).toBe(50);

    const invalid = await api(app, aee).patch(`/v1/tenants/${tenant.id}/peis/${pei.id}`, {
      baseline: [{ area: 'astrologia', currentPerformance: 'x' }],
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.issues[0].path).toBe('baseline.0.area');
  });

  it('professor só leitura não edita', async () => {
    const view = await api(app, regente).get(`/v1/tenants/${tenant.id}/peis/${pei.id}`);
    expect(view.status).toBe(200);
    expect(view.body.canEdit).toBe(false);

    const edit = await api(app, regente).patch(`/v1/tenants/${tenant.id}/peis/${pei.id}`, {
      startDate: '2026-02-01',
    });
    expect(edit.status).toBe(403);
  });

  it('④ define metas e registra progresso', async () => {
    const asAee = api(app, aee);
    const g1 = await asAee.post(`/v1/tenants/${tenant.id}/peis/${pei.id}/goals`, {
      area: 'comunicacao',
      description: 'Pedir ajuda usando o cartão de comunicação',
      successCriterion: 'Em 4 de 5 oportunidades, por 3 semanas',
      targetDate: '2026-06-30',
      bnccCode: 'EF01LP02',
    });
    expect(g1.status).toBe(201);
    const g2 = await asAee.post(`/v1/tenants/${tenant.id}/peis/${pei.id}/goals`, {
      area: 'autonomia',
      description: 'Organizar o material ao fim da aula',
      successCriterion: 'Sem apoio em 3 dias seguidos',
      targetDate: '2026-05-30',
    });
    expect(g2.body.position).toBe(1);

    const reordered = await asAee.put(`/v1/tenants/${tenant.id}/peis/${pei.id}/goals/order`, {
      goalIds: [g2.body.id, g1.body.id],
    });
    expect(reordered.body.goals.map((g: { id: string }) => g.id)).toEqual([g2.body.id, g1.body.id]);

    for (const level of ['emerging', 'developing', 'developing'] as const) {
      const r = await asAee.post(
        `/v1/tenants/${tenant.id}/peis/${pei.id}/goals/${g1.body.id}/progress`,
        { level, support: 'verbal' },
      );
      expect(r.status).toBe(201);
    }

    const progress = await asAee.get(
      `/v1/tenants/${tenant.id}/peis/${pei.id}/goals/${g1.body.id}/progress`,
    );
    expect(progress.body).toHaveLength(3);
    expect(progress.body[0].recordedBy.fullName).toBe('Professora AEE Bia');

    const full = await asAee.get(`/v1/tenants/${tenant.id}/peis/${pei.id}`);
    const goal = full.body.goals.find((g: { id: string }) => g.id === g1.body.id);
    expect(goal).toMatchObject({ status: 'in_progress', progressCount: 3 });
    expect(goal.lastProgress.level).toBe('developing');
  });

  it('coloca o PEI em vigor e arquiva o anterior ao ativar nova versão', async () => {
    const active = await api(app, aee).post(`/v1/tenants/${tenant.id}/peis/${pei.id}/status`, {
      status: 'active',
    });
    expect(active.status).toBe(200);
    expect(active.body.status).toBe('active');

    const v2 = await api(app, aee).post(`/v1/tenants/${tenant.id}/students/${student.id}/peis`, {
      schoolYear: 2026,
      copyFromPeiId: pei.id,
    });
    expect(v2.body).toMatchObject({ version: 2, status: 'draft' });
    expect(v2.body.goals).toHaveLength(2);
    expect(v2.body.goals.every((g: { status: string }) => g.status === 'not_started')).toBe(true);

    // Rascunho pode ser excluído; o PEI em vigor não.
    expect((await api(app, aee).del(`/v1/tenants/${tenant.id}/peis/${v2.body.id}`)).status).toBe(204);
    expect((await api(app, aee).del(`/v1/tenants/${tenant.id}/peis/${pei.id}`)).status).toBe(409);
  });

  it('⑤ gera o documento em PDF e DOCX', async () => {
    const pdf = await api(app, aee).get(`/v1/tenants/${tenant.id}/peis/${pei.id}/export?format=pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.headers['content-disposition']).toContain('PEI_Lucas_Andrade_Lima_2026_v1.pdf');
    expect(pdf.raw.subarray(0, 5).toString()).toBe('%PDF-');

    const docx = await api(app, aee).get(`/v1/tenants/${tenant.id}/peis/${pei.id}/export?format=docx`);
    expect(docx.status).toBe(200);
    expect(docx.raw.subarray(0, 2).toString()).toBe('PK'); // .docx é um zip

    const { rows } = await adminPool.query(
      `select action, actor_id from public.audit_log where record_id = $1 and action = 'export'`,
      [pei.id],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].actor_id).toBe(aee.id);
  });

  it('⑥ convida a família por link', async () => {
    const res = await api(app, aee).post(
      `/v1/tenants/${tenant.id}/students/${student.id}/family-links`,
      { expiresInDays: 30, label: 'Mãe — Marina' },
    );
    expect(res.status).toBe(201);
    const link: FamilyLink = res.body;
    familyUrl = link.url!;
    expect(familyUrl).toMatch(/^http:\/\/app\.test\/familia\/[\w-]{43}$/);

    // O token não fica guardado em texto puro.
    const { rows } = await adminPool.query(`select token_hash from public.family_links where id = $1`, [
      link.id,
    ]);
    expect(rows[0].token_hash).toHaveLength(64);
    expect(familyUrl).not.toContain(rows[0].token_hash);
  });

  it('⑦ família acessa o portal: consentimento, somente leitura e acesso contado', async () => {
    const token = familyUrl.split('/').pop()!;
    const anon = api(app);

    const first = await anon.get(`/v1/public/family/${token}`);
    expect(first.status).toBe(200);
    expect(first.body.consent.required).toBe(true);
    expect(first.body.peis).toEqual([]);
    expect(first.body.student).toEqual({ firstName: 'Lucas', grade: '3º ano', schoolName: 'Escola Aurora' });

    const consent = await anon.post(`/v1/public/family/${token}/consent`, {
      guardianName: 'Marina Lima',
      relationship: 'Mãe',
      accepted: true,
    });
    expect(consent.status).toBe(204);

    const view = await anon.get(`/v1/public/family/${token}`);
    expect(view.body.consent.required).toBe(false);
    expect(view.body.peis).toHaveLength(1);
    const goals = view.body.peis[0].goals;
    expect(goals[1].progress.map((p: { level: string }) => p.level)).toEqual([
      'emerging',
      'developing',
      'developing',
    ]);
    // Nada clínico nem anotações internas no portal.
    const json = JSON.stringify(view.body);
    expect(json).not.toContain('TEA');
    expect(json).not.toContain('Memória visual');
    expect(json).not.toContain('Andrade');

    const links = await api(app, aee).get(
      `/v1/tenants/${tenant.id}/students/${student.id}/family-links`,
    );
    expect(links.body[0].accessCount).toBe(2);

    // Link revogado deixa de funcionar.
    await api(app, aee).post(
      `/v1/tenants/${tenant.id}/students/${student.id}/family-links/${links.body[0].id}/revoke`,
    );
    expect((await anon.get(`/v1/public/family/${token}`)).status).toBe(404);
  });
});

describe('isolamento entre contas', () => {
  it('uma conta Profissional não vê nada da Escola', async () => {
    const fono = await createUser('Fonoaudióloga Dani');
    const own = await api(app, fono).post('/v1/tenants', { name: 'Dani Fono', type: 'professional' });
    expect(own.status).toBe(201);

    const asFono = api(app, fono);
    expect((await asFono.get(`/v1/tenants/${tenant.id}`)).status).toBe(404);
    expect((await asFono.get(`/v1/tenants/${tenant.id}/students`)).status).toBe(404);
    // Mesmo trocando o tenant da URL pelo próprio, o PEI de outra conta não aparece.
    expect((await asFono.get(`/v1/tenants/${own.body.id}/peis/${pei.id}`)).status).toBe(404);
    expect((await asFono.get(`/v1/tenants/${own.body.id}/students/${student.id}`)).status).toBe(404);
  });

  it('rejeita token inválido', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: 'Bearer abc.def.ghi' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('administração', () => {
  it('não permite que a conta fique sem administrador', async () => {
    const res = await api(app, gestora).del(`/v1/tenants/${tenant.id}/members/${gestora.id}`);
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('administrador');
  });

  it('a trilha de auditoria não pode ser alterada', async () => {
    await expect(adminPool.query(`delete from public.audit_log`)).rejects.toThrow(/somente inclusão/);
    await expect(adminPool.query(`update public.audit_log set action = 'x'`)).rejects.toThrow(
      /somente inclusão/,
    );
  });
});

afterAll(async () => {
  await adminPool.end();
});
