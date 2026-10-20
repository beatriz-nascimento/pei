import type {
  AccountType,
  GoalStatus,
  MeasurementFrequency,
  MeasurementMethod,
  MemberRole,
  PeiStatus,
  ProgressLevel,
  StaffFunction,
  SupportType,
  DevelopmentArea,
} from './enums.js';
import type { Adaptation, BaselineEntry, CaseStudy, GuardianInput, Service } from './schemas.js';

/** Respostas da API. Datas trafegam como string ISO 8601. */

export interface Me {
  id: string;
  email: string;
  fullName: string | null;
  memberships: Array<{
    tenantId: string;
    tenantName: string;
    tenantType: AccountType;
    role: MemberRole;
  }>;
}

export interface Tenant {
  id: string;
  name: string;
  type: AccountType;
  city: string | null;
  state: string | null;
  createdAt: string;
}

export interface Member {
  userId: string;
  email: string;
  fullName: string | null;
  role: MemberRole;
  joinedAt: string;
}

export interface Invitation {
  id: string;
  email: string;
  role: MemberRole;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
  /** Presente apenas na resposta de criação: o token não é guardado em texto puro. */
  acceptUrl?: string;
}

export interface StudentStaff {
  userId: string;
  fullName: string | null;
  email: string;
  function: StaffFunction;
}

export interface StudentSummary {
  id: string;
  fullName: string;
  grade: string | null;
  classGroup: string | null;
  schoolName: string | null;
  conditions: string[];
  activePeiId: string | null;
  updatedAt: string;
}

export interface Student extends StudentSummary {
  birthDate: string | null;
  notes: string | null;
  guardians: GuardianInput[];
  staff: StudentStaff[];
  archivedAt: string | null;
  createdAt: string;
}

export interface PeiSummary {
  id: string;
  studentId: string;
  schoolYear: number;
  version: number;
  status: PeiStatus;
  startDate: string | null;
  reviewDate: string | null;
  goalCount: number;
  updatedAt: string;
}

export interface Goal {
  id: string;
  peiId: string;
  position: number;
  area: DevelopmentArea;
  description: string;
  successCriterion: string;
  targetDate: string;
  bnccCode: string | null;
  strategies: string;
  responsible: string;
  measurementMethod: MeasurementMethod;
  measurementFrequency: MeasurementFrequency;
  status: GoalStatus;
  lastProgress: { level: ProgressLevel; observedAt: string } | null;
  progressCount: number;
  updatedAt: string;
}

export interface Pei extends PeiSummary {
  student: { id: string; fullName: string };
  caseStudy: CaseStudy;
  baseline: BaselineEntry[];
  adaptations: Adaptation[];
  services: Service[];
  goals: Goal[];
  createdAt: string;
  /** O usuário atual pode editar este PEI? Calculado no servidor a partir do papel e vínculo. */
  canEdit: boolean;
}

export interface ProgressEntry {
  id: string;
  goalId: string;
  level: ProgressLevel;
  support: SupportType | null;
  note: string | null;
  observedAt: string;
  recordedBy: { userId: string; fullName: string | null };
}

export interface FamilyLink {
  id: string;
  studentId: string;
  label: string | null;
  expiresAt: string;
  revokedAt: string | null;
  accessCount: number;
  lastAccessAt: string | null;
  createdAt: string;
  /** Presente apenas na resposta de criação. */
  url?: string;
}

/** O que a família vê no portal: somente leitura, sem dados clínicos detalhados. */
export interface FamilyPortalView {
  student: { firstName: string; grade: string | null; schoolName: string | null };
  tenantName: string;
  consent: { required: boolean; termsVersion: string };
  peis: Array<{
    id: string;
    schoolYear: number;
    version: number;
    status: PeiStatus;
    startDate: string | null;
    reviewDate: string | null;
    adaptations: Adaptation[];
    services: Service[];
    goals: Array<{
      id: string;
      area: DevelopmentArea;
      description: string;
      successCriterion: string;
      targetDate: string;
      status: GoalStatus;
      progress: Array<{ level: ProgressLevel; observedAt: string }>;
    }>;
  }>;
}

export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string;
  issues?: Array<{ path: string; message: string }>;
}

export interface Page<T> {
  items: T[];
  total: number;
}

/** Meta de um PEI em vigor, para a tela de registro rápido de progresso. */
export interface ActiveGoal {
  studentId: string;
  studentName: string;
  peiId: string;
  canEdit: boolean;
  goal: Goal;
}
