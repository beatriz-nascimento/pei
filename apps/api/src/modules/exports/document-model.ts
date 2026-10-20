import { LABELS, type Pei, type Student } from '@pei/shared';

/**
 * Modelo neutro do documento do PEI. O conteúdo é montado uma única vez aqui e
 * depois renderizado em PDF ou DOCX — assim os dois formatos nunca divergem.
 */
export type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string; muted?: boolean }
  | { kind: 'fields'; rows: Array<[label: string, value: string]> }
  | { kind: 'table'; header: string[]; rows: string[][]; widths: number[] }
  | { kind: 'signatures'; people: Array<{ name: string; role: string }> };

export interface DocModel {
  title: string;
  subtitle: string;
  footer: string;
  blocks: Block[];
}

export interface DocInput {
  pei: Pei;
  student: Student;
  tenantName: string;
  generatedAt: Date;
}

const dash = (v: string | null | undefined) => (v && v.trim() ? v.trim() : '—');

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function buildPeiDocument({ pei, student, tenantName, generatedAt }: DocInput): DocModel {
  const blocks: Block[] = [];
  const cs = pei.caseStudy;

  blocks.push(
    { kind: 'heading', text: '1. Identificação' },
    {
      kind: 'fields',
      rows: [
        ['Aluno(a)', student.fullName],
        ['Data de nascimento', formatDate(student.birthDate)],
        ['Escola', dash(student.schoolName ?? tenantName)],
        ['Ano/série · Turma', `${dash(student.grade)} · ${dash(student.classGroup)}`],
        ['Condições informadas', student.conditions.length ? student.conditions.join(', ') : '—'],
        ['Ano letivo · Versão', `${pei.schoolYear} · v${pei.version}`],
        ['Situação', LABELS.peiStatus[pei.status]],
        ['Vigência', `${formatDate(pei.startDate)} a ${formatDate(pei.reviewDate)}`],
        [
          'Responsáveis (família)',
          student.guardians.length
            ? student.guardians.map((g) => `${g.name} (${g.relationship})`).join('; ')
            : '—',
        ],
        [
          'Equipe',
          student.staff.length
            ? student.staff
                .map((s) => `${s.fullName ?? s.email} — ${LABELS.staffFunction[s.function]}`)
                .join('; ')
            : '—',
        ],
      ],
    },
  );

  blocks.push(
    { kind: 'heading', text: '2. Estudo de caso' },
    {
      kind: 'fields',
      rows: [
        ['Motivo do encaminhamento', dash(cs.reasonForReferral)],
        ['Histórico escolar', dash(cs.schoolHistory)],
        ['Contexto familiar', dash(cs.familyContext)],
        ['Informações de saúde', dash(cs.healthInfo)],
        ['Potencialidades', dash(cs.strengths)],
        ['Desafios', dash(cs.challenges)],
        ['Interesses', dash(cs.interests)],
        ['Comunicação', dash(cs.communication)],
        ['Intervenções anteriores', dash(cs.previousInterventions)],
      ],
    },
  );

  blocks.push({ kind: 'heading', text: '3. Linha de base (desempenho atual)' });
  if (pei.baseline.length) {
    blocks.push({
      kind: 'table',
      header: ['Área', 'Desempenho atual', 'Evidências'],
      rows: pei.baseline.map((b) => [
        LABELS.developmentArea[b.area],
        b.currentPerformance,
        dash(b.evidence),
      ]),
      widths: [20, 50, 30],
    });
  } else {
    blocks.push({ kind: 'paragraph', text: 'Nenhuma área registrada.', muted: true });
  }

  blocks.push({ kind: 'heading', text: '4. Metas e medição' });
  if (pei.goals.length) {
    blocks.push({
      kind: 'table',
      header: ['#', 'Área', 'Meta', 'Critério de sucesso', 'Prazo', 'Medição', 'Situação'],
      rows: pei.goals.map((g, i) => [
        String(i + 1),
        LABELS.developmentArea[g.area],
        g.bnccCode ? `${g.description} (BNCC ${g.bnccCode})` : g.description,
        g.successCriterion,
        formatDate(g.targetDate),
        `${LABELS.measurementMethod[g.measurementMethod]}, ${LABELS.measurementFrequency[
          g.measurementFrequency
        ].toLowerCase()}`,
        LABELS.goalStatus[g.status],
      ]),
      widths: [4, 13, 25, 19, 12, 15, 12],
    });
    const withStrategies = pei.goals
      .map((g, i) => ({ g, i }))
      .filter(({ g }) => g.strategies.trim() || g.responsible.trim());
    if (withStrategies.length) {
      blocks.push({
        kind: 'fields',
        rows: withStrategies.map(({ g, i }) => [
          `Meta ${i + 1} — estratégias`,
          [g.strategies.trim(), g.responsible.trim() && `Responsável: ${g.responsible.trim()}`]
            .filter(Boolean)
            .join(' · '),
        ]),
      });
    }
  } else {
    blocks.push({ kind: 'paragraph', text: 'Nenhuma meta cadastrada.', muted: true });
  }

  blocks.push({ kind: 'heading', text: '5. Adaptações' });
  if (pei.adaptations.length) {
    blocks.push({
      kind: 'table',
      header: ['Tipo', 'Descrição'],
      rows: pei.adaptations.map((a) => [LABELS.adaptationCategory[a.category], a.description]),
      widths: [25, 75],
    });
  } else {
    blocks.push({ kind: 'paragraph', text: 'Nenhuma adaptação registrada.', muted: true });
  }

  blocks.push({ kind: 'heading', text: '6. Serviços e atendimentos' });
  if (pei.services.length) {
    blocks.push({
      kind: 'table',
      header: ['Serviço', 'Profissional/instituição', 'Frequência', 'Duração', 'Local'],
      rows: pei.services.map((s) => [
        LABELS.serviceType[s.type],
        dash(s.provider),
        dash(s.frequency),
        s.durationMinutes ? `${s.durationMinutes} min` : '—',
        dash(s.location),
      ]),
      widths: [24, 26, 20, 12, 18],
    });
  } else {
    blocks.push({ kind: 'paragraph', text: 'Nenhum serviço registrado.', muted: true });
  }

  blocks.push(
    { kind: 'heading', text: '7. Assinaturas' },
    {
      kind: 'signatures',
      people: [
        ...student.staff.map((s) => ({
          name: s.fullName ?? s.email,
          role: LABELS.staffFunction[s.function],
        })),
        ...(student.guardians.length
          ? student.guardians.map((g) => ({
              name: g.name,
              role: `Responsável — ${g.relationship}`,
            }))
          : [{ name: '', role: 'Responsável legal' }]),
        { name: '', role: 'Coordenação / Direção' },
      ],
    },
  );

  return {
    title: 'Plano Educacional Individualizado (PEI)',
    subtitle: `${student.fullName} · ${tenantName} · ${pei.schoolYear} (v${pei.version})`,
    footer: `Documento gerado em ${generatedAt.toLocaleDateString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
    })} · Contém dados pessoais sensíveis de menor (LGPD). Uso restrito à equipe e à família.`,
    blocks,
  };
}
