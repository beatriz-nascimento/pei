import { z } from 'zod';
import {
  AccountType,
  AdaptationCategory,
  DevelopmentArea,
  GoalStatus,
  MeasurementFrequency,
  MeasurementMethod,
  MemberRole,
  PeiStatus,
  ProgressLevel,
  ServiceType,
  StaffFunction,
  SupportType,
} from './enums.js';

const text = (max: number) => z.string().trim().max(max);
const requiredText = (max: number) => z.string().trim().min(1, 'Campo obrigatório').max(max);
const isoDate = z.iso.date();

/* -------------------------------------------------------------------------- */
/* Conta (tenant), membros e convites                                         */
/* -------------------------------------------------------------------------- */

export const CreateTenantInput = z.object({
  name: requiredText(160),
  type: AccountType,
  city: text(120).optional(),
  state: z
    .string()
    .trim()
    .length(2)
    .transform((s) => s.toUpperCase())
    .optional(),
});
export type CreateTenantInput = z.infer<typeof CreateTenantInput>;

export const UpdateTenantInput = CreateTenantInput.omit({ type: true }).partial();
export type UpdateTenantInput = z.infer<typeof UpdateTenantInput>;

export const CreateInvitationInput = z.object({
  email: z.email().transform((e) => e.toLowerCase()),
  role: MemberRole,
});
export type CreateInvitationInput = z.infer<typeof CreateInvitationInput>;

export const UpdateMemberInput = z.object({ role: MemberRole });
export type UpdateMemberInput = z.infer<typeof UpdateMemberInput>;

export const AcceptInvitationInput = z.object({ token: z.string().min(20).max(200) });
export type AcceptInvitationInput = z.infer<typeof AcceptInvitationInput>;

/* -------------------------------------------------------------------------- */
/* Alunos                                                                     */
/* -------------------------------------------------------------------------- */

export const GuardianInput = z.object({
  name: requiredText(160),
  relationship: requiredText(60),
  email: z.email().optional().or(z.literal('')),
  phone: text(30).optional(),
});
export type GuardianInput = z.infer<typeof GuardianInput>;

export const CreateStudentInput = z.object({
  fullName: requiredText(160),
  birthDate: isoDate.optional(),
  /** Escola de origem — relevante para contas Profissional, que atendem alunos de várias escolas. */
  schoolName: text(160).optional(),
  grade: text(60).optional(),
  classGroup: text(60).optional(),
  /** Condições informadas (ex.: TEA nível 2, TDAH). Dado de saúde: sensível sob a LGPD. */
  conditions: z.array(requiredText(80)).max(15).default([]),
  notes: text(4000).optional(),
  guardians: z.array(GuardianInput).max(5).default([]),
});
export type CreateStudentInput = z.input<typeof CreateStudentInput>;
export type CreateStudentData = z.output<typeof CreateStudentInput>;

export const UpdateStudentInput = CreateStudentInput.partial();
export type UpdateStudentInput = z.input<typeof UpdateStudentInput>;

export const AssignStaffInput = z.object({
  userId: z.uuid(),
  function: StaffFunction,
});
export type AssignStaffInput = z.infer<typeof AssignStaffInput>;

/* -------------------------------------------------------------------------- */
/* PEI e suas abas                                                            */
/* -------------------------------------------------------------------------- */

export const CaseStudy = z.object({
  reasonForReferral: text(4000).default(''),
  schoolHistory: text(4000).default(''),
  familyContext: text(4000).default(''),
  healthInfo: text(4000).default(''),
  strengths: text(4000).default(''),
  challenges: text(4000).default(''),
  interests: text(2000).default(''),
  communication: text(4000).default(''),
  previousInterventions: text(4000).default(''),
});
export type CaseStudy = z.infer<typeof CaseStudy>;

export const BaselineEntry = z.object({
  area: DevelopmentArea,
  currentPerformance: requiredText(4000),
  evidence: text(2000).default(''),
});
export type BaselineEntry = z.infer<typeof BaselineEntry>;

export const Adaptation = z.object({
  category: AdaptationCategory,
  description: requiredText(2000),
});
export type Adaptation = z.infer<typeof Adaptation>;

export const Service = z.object({
  type: ServiceType,
  provider: text(160).default(''),
  frequency: text(120).default(''),
  durationMinutes: z.number().int().min(0).max(600).optional(),
  location: text(160).default(''),
});
export type Service = z.infer<typeof Service>;

export const CreatePeiInput = z.object({
  schoolYear: z.number().int().min(2020).max(2100),
  startDate: isoDate.optional(),
  reviewDate: isoDate.optional(),
  /** Quando informado, copia as abas e metas de um PEI anterior do mesmo aluno (nova versão). */
  copyFromPeiId: z.uuid().optional(),
});
export type CreatePeiInput = z.infer<typeof CreatePeiInput>;

export const UpdatePeiInput = z
  .object({
    startDate: isoDate.nullable(),
    reviewDate: isoDate.nullable(),
    caseStudy: CaseStudy,
    baseline: z.array(BaselineEntry).max(20),
    adaptations: z.array(Adaptation).max(50),
    services: z.array(Service).max(20),
  })
  .partial();
export type UpdatePeiInput = z.input<typeof UpdatePeiInput>;

export const ChangePeiStatusInput = z.object({ status: PeiStatus });
export type ChangePeiStatusInput = z.infer<typeof ChangePeiStatusInput>;

/* -------------------------------------------------------------------------- */
/* Metas SMART e medição                                                      */
/* -------------------------------------------------------------------------- */

export const GoalInput = z.object({
  area: DevelopmentArea,
  /** S — específica: o que o aluno fará. */
  description: requiredText(1000),
  /** M — mensurável: critério de sucesso (ex.: "em 4 de 5 tentativas"). */
  successCriterion: requiredText(500),
  /** T — temporal: prazo para alcançar a meta. */
  targetDate: isoDate,
  bnccCode: z
    .string()
    .trim()
    .regex(
      /^(E[IF]\d{2}[A-Z]{2}\d{2}|EM\d{2}[A-Z]{3}\d{3})$/,
      'Código BNCC inválido (ex.: EF01LP02, EI03EO01, EM13LGG101)',
    )
    .optional()
    .or(z.literal('')),
  strategies: text(2000).default(''),
  responsible: text(160).default(''),
  measurementMethod: MeasurementMethod.default('observacao'),
  measurementFrequency: MeasurementFrequency.default('semanal'),
  status: GoalStatus.default('not_started'),
});
export type GoalInput = z.input<typeof GoalInput>;
export type GoalData = z.output<typeof GoalInput>;

export const UpdateGoalInput = GoalInput.partial();
export type UpdateGoalInput = z.input<typeof UpdateGoalInput>;

export const ReorderGoalsInput = z.object({ goalIds: z.array(z.uuid()).min(1).max(100) });
export type ReorderGoalsInput = z.infer<typeof ReorderGoalsInput>;

export const ProgressEntryInput = z.object({
  level: ProgressLevel,
  support: SupportType.optional(),
  note: text(1000).optional(),
  /** Padrão: agora. Permite registrar algo observado mais cedo. */
  observedAt: z.iso.datetime({ offset: true }).optional(),
});
export type ProgressEntryInput = z.infer<typeof ProgressEntryInput>;

/* -------------------------------------------------------------------------- */
/* Portal da família                                                          */
/* -------------------------------------------------------------------------- */

export const CreateFamilyLinkInput = z.object({
  /** Validade do link em dias. */
  expiresInDays: z.number().int().min(1).max(365).default(90),
  label: text(120).optional(),
});
export type CreateFamilyLinkInput = z.input<typeof CreateFamilyLinkInput>;

export const FamilyConsentInput = z.object({
  guardianName: requiredText(160),
  relationship: requiredText(60),
  accepted: z.literal(true, { error: 'É preciso aceitar o termo para continuar' }),
});
export type FamilyConsentInput = z.infer<typeof FamilyConsentInput>;

/** Versão vigente do termo de consentimento (LGPD art. 14). Mude ao alterar o texto do termo. */
export const CONSENT_TERMS_VERSION = '2026-10-v1';
