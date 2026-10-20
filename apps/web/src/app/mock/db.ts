import type {
  AccountType,
  Adaptation,
  BaselineEntry,
  CaseStudy,
  DevelopmentArea,
  GoalStatus,
  GuardianInput,
  MeasurementFrequency,
  MeasurementMethod,
  MemberRole,
  PeiStatus,
  ProgressLevel,
  Service,
  StaffFunction,
  SupportType,
} from '@pei/shared';
import { createSeed } from './seed';

/* Tabelas do banco simulado — espelham supabase/migrations, com datas em ISO 8601. */

export interface MockUser {
  id: string;
  email: string;
  fullName: string | null;
}

export interface MockTenant {
  id: string;
  name: string;
  type: AccountType;
  city: string | null;
  state: string | null;
  createdAt: string;
}

export interface MockMembership {
  tenantId: string;
  userId: string;
  role: MemberRole;
  joinedAt: string;
}

export interface MockInvitation {
  id: string;
  tenantId: string;
  token: string;
  email: string;
  role: MemberRole;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

export interface MockStudent {
  id: string;
  tenantId: string;
  fullName: string;
  birthDate: string | null;
  schoolName: string | null;
  grade: string | null;
  classGroup: string | null;
  conditions: string[];
  notes: string | null;
  guardians: GuardianInput[];
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MockStaff {
  studentId: string;
  userId: string;
  function: StaffFunction;
}

export interface MockPei {
  id: string;
  tenantId: string;
  studentId: string;
  schoolYear: number;
  version: number;
  status: PeiStatus;
  startDate: string | null;
  reviewDate: string | null;
  caseStudy: CaseStudy;
  baseline: BaselineEntry[];
  adaptations: Adaptation[];
  services: Service[];
  createdAt: string;
  updatedAt: string;
}

export interface MockGoal {
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
  updatedAt: string;
}

export interface MockProgress {
  id: string;
  goalId: string;
  level: ProgressLevel;
  support: SupportType | null;
  note: string | null;
  observedAt: string;
  recordedBy: string;
}

export interface MockFamilyLink {
  id: string;
  tenantId: string;
  studentId: string;
  token: string;
  label: string | null;
  expiresAt: string;
  revokedAt: string | null;
  accessCount: number;
  lastAccessAt: string | null;
  createdAt: string;
  /** Versões do termo aceitas por este link. */
  consents: string[];
}

export interface MockData {
  users: MockUser[];
  tenants: MockTenant[];
  memberships: MockMembership[];
  invitations: MockInvitation[];
  students: MockStudent[];
  staff: MockStaff[];
  peis: MockPei[];
  goals: MockGoal[];
  progress: MockProgress[];
  familyLinks: MockFamilyLink[];
}

const STORAGE_KEY = 'pei.mock.db';
/** Mude ao alterar o formato de MockData ou o seed: descarta dados antigos salvos. */
const SCHEMA_VERSION = 1;

/** Banco em memória, salvo no localStorage para sobreviver a recarregamentos da página. */
export class MockDb {
  data: MockData = this.load();

  save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: SCHEMA_VERSION, data: this.data }));
    } catch {
      /* armazenamento indisponível: os dados ficam só em memória */
    }
  }

  /** Volta aos dados de exemplo. */
  reset(): void {
    this.data = createSeed();
    this.save();
  }

  private load(): MockData {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const saved = raw ? (JSON.parse(raw) as { v: number; data: MockData }) : null;
      if (saved?.v === SCHEMA_VERSION) return saved.data;
    } catch {
      /* dados corrompidos ou armazenamento indisponível: recomeça do seed */
    }
    const seed = createSeed();
    this.data = seed;
    this.save();
    return seed;
  }
}

export function uuid(): string {
  return crypto.randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}

/** Token aleatório para links de convite e da família. */
export function linkToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
