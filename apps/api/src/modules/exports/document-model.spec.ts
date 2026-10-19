import type { Pei, Student } from '@pei/shared';
import { describe, expect, it } from 'vitest';
import { buildPeiDocument, formatDate } from './document-model.js';
import { renderDocx } from './render-docx.js';
import { renderPdf } from './render-pdf.js';

export const sampleStudent: Student = {
  id: 's1',
  fullName: 'Lucas Andrade Lima',
  birthDate: '2017-03-12',
  grade: '3º ano',
  classGroup: 'B',
  schoolName: null,
  conditions: ['TEA nível 1'],
  notes: null,
  guardians: [{ name: 'Marina Lima', relationship: 'Mãe' }],
  staff: [{ userId: 'u1', fullName: 'Bia Souza', email: 'bia@x.com', function: 'aee' }],
  activePeiId: 'p1',
  createdAt: '2026-03-01T00:00:00Z',
  updatedAt: '2026-03-01T00:00:00Z',
};

export const samplePei: Pei = {
  id: 'p1',
  studentId: 's1',
  student: { id: 's1', fullName: 'Lucas Andrade Lima' },
  schoolYear: 2026,
  version: 1,
  status: 'active',
  startDate: '2026-03-01',
  reviewDate: '2026-07-15',
  caseStudy: {
    reasonForReferral: 'Dificuldade em pedir ajuda',
    schoolHistory: '',
    familyContext: '',
    healthInfo: '',
    strengths: 'Memória visual',
    challenges: 'Transições entre atividades',
    interests: 'Dinossauros',
    communication: '',
    previousInterventions: '',
  },
  baseline: [{ area: 'comunicacao', currentPerformance: 'Pede ajuda com apoio verbal', evidence: '' }],
  adaptations: [{ category: 'material', description: 'Rotina visual na mesa' }],
  services: [
    { type: 'aee_sala_recursos', provider: 'Bia', frequency: '2x/semana', durationMinutes: 50, location: 'Sala de recursos' },
  ],
  goals: [
    {
      id: 'g1',
      peiId: 'p1',
      position: 0,
      area: 'comunicacao',
      description: 'Pedir ajuda usando o cartão de comunicação',
      successCriterion: 'Em 4 de 5 oportunidades',
      targetDate: '2026-06-30',
      bnccCode: 'EF01LP02',
      strategies: 'Modelagem e reforço positivo',
      responsible: 'Prof. AEE',
      measurementMethod: 'observacao',
      measurementFrequency: 'semanal',
      status: 'in_progress',
      lastProgress: null,
      progressCount: 0,
      updatedAt: '2026-03-01T00:00:00Z',
    },
  ],
  goalCount: 1,
  canEdit: true,
  createdAt: '2026-03-01T00:00:00Z',
  updatedAt: '2026-03-01T00:00:00Z',
};

const input = {
  pei: samplePei,
  student: sampleStudent,
  tenantName: 'Escola Aurora',
  generatedAt: new Date('2026-10-19T12:00:00Z'),
};

describe('buildPeiDocument', () => {
  it('monta as seções na ordem do PEI', () => {
    const model = buildPeiDocument(input);
    const headings = model.blocks.filter((b) => b.kind === 'heading').map((b) => b.text);
    expect(headings).toEqual([
      '1. Identificação',
      '2. Estudo de caso',
      '3. Linha de base (desempenho atual)',
      '4. Metas e medição',
      '5. Adaptações',
      '6. Serviços e atendimentos',
      '7. Assinaturas',
    ]);
  });

  it('inclui equipe, família e coordenação nas assinaturas', () => {
    const sig = buildPeiDocument(input).blocks.find((b) => b.kind === 'signatures');
    expect(sig?.kind === 'signatures' && sig.people.map((p) => p.role)).toEqual([
      'Professor(a) do AEE',
      'Responsável — Mãe',
      'Coordenação / Direção',
    ]);
  });

  it('usa o nome da conta como escola quando o aluno não tem escola informada', () => {
    const fields = buildPeiDocument(input).blocks.find((b) => b.kind === 'fields');
    expect(fields?.kind === 'fields' && fields.rows.find(([l]) => l === 'Escola')?.[1]).toBe(
      'Escola Aurora',
    );
  });

  it('formata datas no padrão brasileiro', () => {
    expect(formatDate('2026-06-30')).toBe('30/06/2026');
    expect(formatDate(null)).toBe('—');
  });
});

describe('renderização', () => {
  it('gera PDF válido', async () => {
    const pdf = await renderPdf(buildPeiDocument(input));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('gera DOCX válido', async () => {
    const docx = await renderDocx(buildPeiDocument(input));
    expect(docx.subarray(0, 2).toString()).toBe('PK');
  });
});
