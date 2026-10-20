import { z } from 'zod';

/** Tipo de conta escolhido ao assinar o plano (fluxograma: "Tipo de conta?"). */
export const AccountType = z.enum(['school', 'professional']);
export type AccountType = z.infer<typeof AccountType>;

/** Papéis dentro de uma conta: Admin · Edita PEI · Só leitura. */
export const MemberRole = z.enum(['admin', 'editor', 'viewer']);
export type MemberRole = z.infer<typeof MemberRole>;

/** Função do profissional responsável por um aluno. */
export const StaffFunction = z.enum(['regente', 'aee', 'apoio', 'terapeuta', 'coordenacao']);
export type StaffFunction = z.infer<typeof StaffFunction>;

export const PeiStatus = z.enum(['draft', 'active', 'archived']);
export type PeiStatus = z.infer<typeof PeiStatus>;

/** Áreas de desenvolvimento usadas na linha de base e nas metas. */
export const DevelopmentArea = z.enum([
  'academica',
  'comunicacao',
  'social_emocional',
  'comportamento',
  'autonomia',
  'motora',
  'sensorial',
]);
export type DevelopmentArea = z.infer<typeof DevelopmentArea>;

export const GoalStatus = z.enum(['not_started', 'in_progress', 'achieved', 'discontinued']);
export type GoalStatus = z.infer<typeof GoalStatus>;

/**
 * Nível registrado no acompanhamento rápido (botões coloridos no celular).
 * A ordem importa: é usada como escala nos gráficos.
 */
export const ProgressLevel = z.enum(['not_observed', 'emerging', 'developing', 'achieved']);
export type ProgressLevel = z.infer<typeof ProgressLevel>;

/** Tipo de apoio necessário quando o registro foi feito. */
export const SupportType = z.enum(['independent', 'verbal', 'visual', 'gestural', 'physical']);
export type SupportType = z.infer<typeof SupportType>;

export const MeasurementMethod = z.enum([
  'observacao',
  'registro_frequencia',
  'registro_tarefa',
  'portfolio',
  'avaliacao_adaptada',
  'checklist',
]);
export type MeasurementMethod = z.infer<typeof MeasurementMethod>;

export const MeasurementFrequency = z.enum([
  'diaria',
  'semanal',
  'quinzenal',
  'mensal',
  'bimestral',
]);
export type MeasurementFrequency = z.infer<typeof MeasurementFrequency>;

export const AdaptationCategory = z.enum([
  'curricular',
  'avaliacao',
  'material',
  'ambiente',
  'comunicacao',
  'tempo',
]);
export type AdaptationCategory = z.infer<typeof AdaptationCategory>;

export const ServiceType = z.enum([
  'aee_sala_recursos',
  'profissional_apoio',
  'psicopedagogia',
  'fonoaudiologia',
  'terapia_ocupacional',
  'psicologia',
  'outro',
]);
export type ServiceType = z.infer<typeof ServiceType>;

/** Rótulos em português para exibição (UI e documentos exportados). */
export const LABELS = {
  accountType: { school: 'Escola', professional: 'Profissional' },
  memberRole: { admin: 'Administrador', editor: 'Edita PEI', viewer: 'Só leitura' },
  staffFunction: {
    regente: 'Professor(a) regente',
    aee: 'Professor(a) do AEE',
    apoio: 'Profissional de apoio',
    terapeuta: 'Terapeuta',
    coordenacao: 'Coordenação pedagógica',
  },
  peiStatus: { draft: 'Rascunho', active: 'Em vigor', archived: 'Arquivado' },
  developmentArea: {
    academica: 'Acadêmica',
    comunicacao: 'Comunicação e linguagem',
    social_emocional: 'Social e emocional',
    comportamento: 'Comportamento',
    autonomia: 'Autonomia e vida diária',
    motora: 'Motora',
    sensorial: 'Sensorial',
  },
  goalStatus: {
    not_started: 'Não iniciada',
    in_progress: 'Em andamento',
    achieved: 'Alcançada',
    discontinued: 'Descontinuada',
  },
  progressLevel: {
    not_observed: 'Não observado',
    emerging: 'Emergente',
    developing: 'Em desenvolvimento',
    achieved: 'Alcançado',
  },
  supportType: {
    independent: 'Independente',
    verbal: 'Apoio verbal',
    visual: 'Apoio visual',
    gestural: 'Apoio gestual',
    physical: 'Apoio físico',
  },
  measurementMethod: {
    observacao: 'Observação direta',
    registro_frequencia: 'Registro de frequência',
    registro_tarefa: 'Registro por tarefa',
    portfolio: 'Portfólio de atividades',
    avaliacao_adaptada: 'Avaliação adaptada',
    checklist: 'Checklist',
  },
  measurementFrequency: {
    diaria: 'Diária',
    semanal: 'Semanal',
    quinzenal: 'Quinzenal',
    mensal: 'Mensal',
    bimestral: 'Bimestral',
  },
  adaptationCategory: {
    curricular: 'Curricular',
    avaliacao: 'Avaliação',
    material: 'Material didático',
    ambiente: 'Ambiente',
    comunicacao: 'Comunicação',
    tempo: 'Tempo',
  },
  serviceType: {
    aee_sala_recursos: 'AEE — Sala de recursos',
    profissional_apoio: 'Profissional de apoio escolar',
    psicopedagogia: 'Psicopedagogia',
    fonoaudiologia: 'Fonoaudiologia',
    terapia_ocupacional: 'Terapia ocupacional',
    psicologia: 'Psicologia',
    outro: 'Outro',
  },
} as const;
