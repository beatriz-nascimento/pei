import { CaseStudy, type ProgressLevel, type SupportType } from '@pei/shared';
import type { MockData, MockGoal, MockProgress } from './db';

/* Usuários de demonstração: entre com qualquer senha. */
export const DEMO_USERS = {
  ana: { id: '00000000-0000-4000-8000-000000000001', email: 'ana@demo.pei' },
  bruno: { id: '00000000-0000-4000-8000-000000000002', email: 'bruno@demo.pei' },
  carla: { id: '00000000-0000-4000-8000-000000000003', email: 'carla@demo.pei' },
} as const;

/** Token fixo do link da família do Lucas: /familia/demo-familia-lucas-0123456789 */
export const DEMO_FAMILY_TOKEN = 'demo-familia-lucas-0123456789';

const T_SCHOOL = '10000000-0000-4000-8000-000000000001';
const T_PRO = '10000000-0000-4000-8000-000000000002';

const S_LUCAS = '20000000-0000-4000-8000-000000000001';
const S_MARIA = '20000000-0000-4000-8000-000000000002';
const S_PEDRO = '20000000-0000-4000-8000-000000000003';
const S_SOFIA = '20000000-0000-4000-8000-000000000004';
const S_GABRIEL = '20000000-0000-4000-8000-000000000005';

const P_LUCAS_2025 = '30000000-0000-4000-8000-000000000001';
const P_LUCAS_2026 = '30000000-0000-4000-8000-000000000002';
const P_MARIA_2026 = '30000000-0000-4000-8000-000000000003';
const P_GABRIEL_2026 = '30000000-0000-4000-8000-000000000004';

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}
function dateIn(days: number): string {
  return daysAgo(-days).slice(0, 10);
}

export function createSeed(): MockData {
  const year = new Date().getFullYear();
  const { ana, bruno, carla } = DEMO_USERS;

  const goals: MockGoal[] = [];
  const progress: MockProgress[] = [];
  let goalSeq = 0;
  let progressSeq = 0;

  /** Cria uma meta e, opcionalmente, um histórico de registros (um a cada 7 dias). */
  function goal(
    peiId: string,
    g: Pick<MockGoal, 'area' | 'description' | 'successCriterion'> & Partial<MockGoal>,
    history: Array<[ProgressLevel, SupportType | null, string | null]> = [],
    recordedBy: string = bruno.id,
  ): void {
    const id = `40000000-0000-4000-8000-${String(++goalSeq).padStart(12, '0')}`;
    goals.push({
      id,
      peiId,
      position: goals.filter((x) => x.peiId === peiId).length,
      targetDate: dateIn(120),
      bnccCode: null,
      strategies: '',
      responsible: '',
      measurementMethod: 'observacao',
      measurementFrequency: 'semanal',
      status: history.length > 0 ? 'in_progress' : 'not_started',
      updatedAt: daysAgo(3),
      ...g,
    });
    history.forEach(([level, support, note], i) => {
      progress.push({
        id: `50000000-0000-4000-8000-${String(++progressSeq).padStart(12, '0')}`,
        goalId: id,
        level,
        support,
        note,
        observedAt: daysAgo((history.length - i) * 7),
        recordedBy,
      });
    });
  }

  /* Lucas — PEI em vigor com histórico de progresso */
  goal(
    P_LUCAS_2026,
    {
      area: 'comunicacao',
      description:
        'Pedir ajuda verbalmente ou com cartão de comunicação quando não entender a tarefa',
      successCriterion: 'Em 4 de 5 oportunidades observadas',
      strategies:
        'Cartões de "preciso de ajuda" na mesa; modelagem pelo professor; reforço positivo',
      responsible: 'Bruno (AEE) e Carla (regente)',
      measurementMethod: 'registro_frequencia',
    },
    [
      ['not_observed', 'physical', 'Não pediu ajuda; ficou parado diante da tarefa.'],
      ['emerging', 'gestural', 'Apontou para o cartão após dica gestual.'],
      ['emerging', 'visual', null],
      ['developing', 'visual', 'Usou o cartão sozinho duas vezes.'],
      ['developing', 'verbal', 'Falou "ajuda" após lembrete verbal.'],
      ['achieved', 'independent', 'Pediu ajuda sem dica em 4 de 5 situações.'],
    ],
  );
  goal(
    P_LUCAS_2026,
    {
      area: 'academica',
      description: 'Ler e compreender pequenos textos com apoio de imagens',
      successCriterion: 'Responder corretamente 3 de 4 perguntas sobre o texto',
      targetDate: dateIn(150),
      bnccCode: 'EF03LP01',
      strategies:
        'Textos curtos com pictogramas; leitura compartilhada; perguntas com alternativas',
      responsible: 'Carla (regente)',
      measurementMethod: 'avaliacao_adaptada',
      measurementFrequency: 'quinzenal',
    },
    [
      ['emerging', 'visual', null],
      ['emerging', 'verbal', 'Acertou 2 de 4 com imagens.'],
      ['developing', 'visual', null],
    ],
    carla.id,
  );
  goal(P_LUCAS_2026, {
    area: 'social_emocional',
    description: 'Participar de brincadeiras em grupo no recreio por pelo menos 10 minutos',
    successCriterion: 'Em 3 recreios por semana, durante 4 semanas seguidas',
    strategies: 'Mediação do profissional de apoio; jogos com regras simples e visuais',
    responsible: 'Profissional de apoio',
  });

  /* Lucas — PEI do ano anterior (histórico) */
  goal(
    P_LUCAS_2025,
    {
      area: 'autonomia',
      description: 'Organizar o próprio material ao chegar na sala',
      successCriterion: 'Em 5 de 5 dias da semana, sem ajuda',
      targetDate: `${year - 1}-11-30`,
      status: 'achieved',
    },
    [
      ['developing', 'verbal', null],
      ['achieved', 'independent', null],
    ],
  );

  /* Maria — rascunho */
  goal(P_MARIA_2026, {
    area: 'comportamento',
    description: 'Permanecer na atividade proposta por 15 minutos com pausas programadas',
    successCriterion: 'Em 4 de 5 aulas observadas',
    strategies: 'Timer visual; pausas ativas a cada 15 minutos; tarefas divididas em etapas',
    responsible: 'Carla (regente)',
  });

  /* Gabriel — conta Profissional */
  goal(
    P_GABRIEL_2026,
    {
      area: 'motora',
      description: 'Recortar formas simples seguindo a linha',
      successCriterion: 'Desviar no máximo 0,5 cm da linha em 3 de 4 tentativas',
      strategies: 'Tesoura adaptada; linhas grossas que vão afinando ao longo das sessões',
      responsible: 'Ana (terapeuta)',
      measurementMethod: 'portfolio',
    },
    [
      ['emerging', 'physical', null],
      ['developing', 'gestural', 'Melhorou a preensão.'],
    ],
    ana.id,
  );

  const emptyCase = CaseStudy.parse({});

  return {
    users: [
      { id: ana.id, email: ana.email, fullName: 'Ana Souza' },
      { id: bruno.id, email: bruno.email, fullName: 'Bruno Lima' },
      { id: carla.id, email: carla.email, fullName: 'Carla Mendes' },
    ],
    tenants: [
      {
        id: T_SCHOOL,
        name: 'Escola Municipal Monteiro Lobato',
        type: 'school',
        city: 'Curitiba',
        state: 'PR',
        createdAt: daysAgo(400),
      },
      {
        id: T_PRO,
        name: 'Consultório Ana Souza',
        type: 'professional',
        city: 'Curitiba',
        state: 'PR',
        createdAt: daysAgo(200),
      },
    ],
    memberships: [
      { tenantId: T_SCHOOL, userId: ana.id, role: 'admin', joinedAt: daysAgo(400) },
      { tenantId: T_SCHOOL, userId: bruno.id, role: 'editor', joinedAt: daysAgo(380) },
      { tenantId: T_SCHOOL, userId: carla.id, role: 'viewer', joinedAt: daysAgo(300) },
      { tenantId: T_PRO, userId: ana.id, role: 'admin', joinedAt: daysAgo(200) },
    ],
    invitations: [
      {
        id: '60000000-0000-4000-8000-000000000001',
        tenantId: T_SCHOOL,
        token: 'demo-convite-diego-0123456789',
        email: 'diego@demo.pei',
        role: 'editor',
        expiresAt: daysAgo(-5),
        acceptedAt: null,
        createdAt: daysAgo(2),
      },
    ],
    students: [
      {
        id: S_LUCAS,
        tenantId: T_SCHOOL,
        fullName: 'Lucas Oliveira Santos',
        birthDate: `${year - 9}-04-12`,
        schoolName: null,
        grade: '3º ano',
        classGroup: 'B',
        conditions: ['TEA nível 1'],
        notes: 'Sensível a barulho: preferir lugar longe da porta.',
        guardians: [
          {
            name: 'Juliana Oliveira',
            relationship: 'Mãe',
            email: 'juliana@example.com',
            phone: '(41) 99999-0001',
          },
        ],
        archivedAt: null,
        createdAt: daysAgo(390),
        updatedAt: daysAgo(3),
      },
      {
        id: S_MARIA,
        tenantId: T_SCHOOL,
        fullName: 'Maria Eduarda Costa',
        birthDate: `${year - 11}-09-03`,
        schoolName: null,
        grade: '5º ano',
        classGroup: 'A',
        conditions: ['TDAH'],
        notes: null,
        guardians: [{ name: 'Roberto Costa', relationship: 'Pai', email: '', phone: '' }],
        archivedAt: null,
        createdAt: daysAgo(60),
        updatedAt: daysAgo(10),
      },
      {
        id: S_PEDRO,
        tenantId: T_SCHOOL,
        fullName: 'Pedro Henrique Alves',
        birthDate: `${year - 7}-01-22`,
        schoolName: null,
        grade: '1º ano',
        classGroup: 'C',
        conditions: ['Síndrome de Down'],
        notes: null,
        guardians: [],
        archivedAt: null,
        createdAt: daysAgo(20),
        updatedAt: daysAgo(20),
      },
      {
        id: S_SOFIA,
        tenantId: T_SCHOOL,
        fullName: 'Sofia Ribeiro',
        birthDate: null,
        schoolName: null,
        grade: '4º ano',
        classGroup: 'A',
        conditions: ['Dislexia'],
        notes: 'Transferida para outra escola.',
        guardians: [],
        archivedAt: daysAgo(90),
        createdAt: daysAgo(500),
        updatedAt: daysAgo(90),
      },
      {
        id: S_GABRIEL,
        tenantId: T_PRO,
        fullName: 'Gabriel Martins',
        birthDate: `${year - 6}-07-30`,
        schoolName: 'Colégio Estadual Santos Dumont',
        grade: 'Pré II',
        classGroup: null,
        conditions: ['Dispraxia'],
        notes: null,
        guardians: [{ name: 'Patrícia Martins', relationship: 'Mãe', email: '', phone: '' }],
        archivedAt: null,
        createdAt: daysAgo(150),
        updatedAt: daysAgo(7),
      },
    ],
    staff: [
      { studentId: S_LUCAS, userId: bruno.id, function: 'aee' },
      { studentId: S_LUCAS, userId: carla.id, function: 'regente' },
      { studentId: S_MARIA, userId: carla.id, function: 'regente' },
    ],
    peis: [
      {
        id: P_LUCAS_2025,
        tenantId: T_SCHOOL,
        studentId: S_LUCAS,
        schoolYear: year - 1,
        version: 1,
        status: 'archived',
        startDate: `${year - 1}-02-10`,
        reviewDate: `${year - 1}-07-15`,
        caseStudy: {
          ...emptyCase,
          reasonForReferral: 'Dificuldade de adaptação à rotina escolar.',
        },
        baseline: [],
        adaptations: [{ category: 'ambiente', description: 'Rotina visual fixada na mesa.' }],
        services: [],
        createdAt: daysAgo(380),
        updatedAt: daysAgo(250),
      },
      {
        id: P_LUCAS_2026,
        tenantId: T_SCHOOL,
        studentId: S_LUCAS,
        schoolYear: year,
        version: 1,
        status: 'active',
        startDate: `${year}-02-09`,
        reviewDate: dateIn(60),
        caseStudy: {
          ...emptyCase,
          reasonForReferral:
            'Encaminhado pela professora regente por dificuldade de comunicação em sala e de interação com os colegas.',
          schoolHistory:
            'Na escola desde a Educação Infantil. Acompanhado pelo AEE desde o 1º ano.',
          familyContext: 'Mora com a mãe e a avó. Família participativa nas reuniões.',
          healthInfo:
            'Diagnóstico de TEA nível 1 (laudo de 2022). Acompanhamento com fonoaudióloga.',
          strengths: 'Ótima memória visual, gosta de números e de seguir rotinas.',
          challenges: 'Pedir ajuda, lidar com mudanças inesperadas e ambientes barulhentos.',
          interests: 'Dinossauros, trens e jogos de montar.',
          communication: 'Fala frases curtas; usa cartões de comunicação em momentos de tensão.',
          previousInterventions: 'Rotina visual e antecipação de mudanças (PEI do ano anterior).',
        },
        baseline: [
          {
            area: 'comunicacao',
            currentPerformance:
              'Raramente pede ajuda; fica parado diante de tarefas que não entende.',
            evidence: 'Observação em sala durante 2 semanas.',
          },
          {
            area: 'academica',
            currentPerformance:
              'Lê palavras simples; ainda não compreende textos curtos sem apoio.',
            evidence: 'Avaliação diagnóstica de leitura.',
          },
        ],
        adaptations: [
          {
            category: 'avaliacao',
            description: 'Provas com enunciados curtos e apoio de imagens.',
          },
          { category: 'tempo', description: 'Tempo adicional de 30% nas avaliações.' },
          { category: 'ambiente', description: 'Lugar longe da porta e da janela.' },
        ],
        services: [
          {
            type: 'aee_sala_recursos',
            provider: 'Bruno Lima',
            frequency: '2x por semana',
            durationMinutes: 50,
            location: 'Sala de recursos',
          },
          {
            type: 'fonoaudiologia',
            provider: 'Clínica Fala Bem',
            frequency: 'Semanal',
            durationMinutes: 45,
            location: 'Externo',
          },
        ],
        createdAt: daysAgo(250),
        updatedAt: daysAgo(3),
      },
      {
        id: P_MARIA_2026,
        tenantId: T_SCHOOL,
        studentId: S_MARIA,
        schoolYear: year,
        version: 1,
        status: 'draft',
        startDate: null,
        reviewDate: null,
        caseStudy: {
          ...emptyCase,
          reasonForReferral: 'Dificuldade de atenção e de concluir tarefas.',
        },
        baseline: [],
        adaptations: [],
        services: [],
        createdAt: daysAgo(15),
        updatedAt: daysAgo(10),
      },
      {
        id: P_GABRIEL_2026,
        tenantId: T_PRO,
        studentId: S_GABRIEL,
        schoolYear: year,
        version: 1,
        status: 'active',
        startDate: `${year}-03-01`,
        reviewDate: dateIn(90),
        caseStudy: { ...emptyCase, reasonForReferral: 'Dificuldade de coordenação motora fina.' },
        baseline: [],
        adaptations: [{ category: 'material', description: 'Tesoura e lápis adaptados.' }],
        services: [
          {
            type: 'terapia_ocupacional',
            provider: 'Ana Souza',
            frequency: 'Semanal',
            durationMinutes: 50,
            location: 'Consultório',
          },
        ],
        createdAt: daysAgo(140),
        updatedAt: daysAgo(7),
      },
    ],
    goals,
    progress,
    familyLinks: [
      {
        id: '70000000-0000-4000-8000-000000000001',
        tenantId: T_SCHOOL,
        studentId: S_LUCAS,
        token: DEMO_FAMILY_TOKEN,
        label: 'Mãe (Juliana)',
        expiresAt: daysAgo(-60),
        revokedAt: null,
        accessCount: 4,
        lastAccessAt: daysAgo(5),
        createdAt: daysAgo(30),
        consents: [],
      },
    ],
  };
}
