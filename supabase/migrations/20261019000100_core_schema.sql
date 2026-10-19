-- =============================================================================
-- Esquema principal do SaaS de PEI
--
-- Convenções:
--   * Toda tabela de negócio tem tenant_id (escola ou profissional = inquilino).
--   * Chaves estrangeiras compostas (id, tenant_id) impedem que um registro
--     aponte para dados de outro inquilino, mesmo com bug na aplicação.
--   * Enumerações usam CHECK em vez de tipos ENUM: são mais fáceis de evoluir.
--   * Funções auxiliares ficam no schema "private", que não é exposto pela
--     API REST automática do Supabase.
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

-- Atualiza updated_at automaticamente --------------------------------------------
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Perfis (espelho de auth.users) ---------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

create or replace function private.handle_auth_user_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    lower(new.email),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), '')
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.profiles.full_name);
  return new;
end;
$$;

create trigger on_auth_user_change
  after insert or update of email, raw_user_meta_data on auth.users
  for each row execute function private.handle_auth_user_change();

-- Contas (inquilinos) ------------------------------------------------------------
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 160),
  type text not null check (type in ('school', 'professional')),
  city text,
  state char(2),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger tenants_touch before update on public.tenants
  for each row execute function private.touch_updated_at();

-- Membros e papéis --------------------------------------------------------------
create table public.memberships (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create index memberships_user_idx on public.memberships (user_id);

create trigger memberships_touch before update on public.memberships
  for each row execute function private.touch_updated_at();

-- Convites para a equipe ----------------------------------------------------------
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  email text not null check (email = lower(email)),
  role text not null check (role in ('admin', 'editor', 'viewer')),
  -- Guardamos só o hash SHA-256 do token; o token em si vai apenas no link.
  token_hash text not null unique,
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index invitations_tenant_idx on public.invitations (tenant_id);

-- Alunos -------------------------------------------------------------------------
create table public.students (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 1 and 160),
  birth_date date,
  school_name text,
  grade text,
  class_group text,
  -- Condições informadas (TEA, TDAH, ...): dado de saúde, sensível (LGPD art. 11).
  conditions text[] not null default '{}',
  notes text,
  guardians jsonb not null default '[]' check (jsonb_typeof(guardians) = 'array'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, tenant_id)
);

create index students_tenant_idx on public.students (tenant_id) where archived_at is null;

create trigger students_touch before update on public.students
  for each row execute function private.touch_updated_at();

-- Responsáveis (profissionais) por aluno -----------------------------------------
create table public.student_staff (
  student_id uuid not null,
  tenant_id uuid not null,
  user_id uuid not null,
  function text not null
    check (function in ('regente', 'aee', 'apoio', 'terapeuta', 'coordenacao')),
  created_at timestamptz not null default now(),
  primary key (student_id, user_id),
  foreign key (student_id, tenant_id) references public.students (id, tenant_id) on delete cascade,
  -- Só membros da própria conta podem ser responsáveis; sai junto com o membro.
  foreign key (tenant_id, user_id) references public.memberships (tenant_id, user_id) on delete cascade
);

create index student_staff_user_idx on public.student_staff (user_id, tenant_id);

-- PEI ----------------------------------------------------------------------------
create table public.peis (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  student_id uuid not null,
  school_year int not null check (school_year between 2020 and 2100),
  version int not null default 1 check (version >= 1),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  start_date date,
  review_date date,
  -- Abas do PEI. A estrutura é validada na API (esquemas zod em @pei/shared).
  case_study jsonb not null default '{}' check (jsonb_typeof(case_study) = 'object'),
  baseline jsonb not null default '[]' check (jsonb_typeof(baseline) = 'array'),
  adaptations jsonb not null default '[]' check (jsonb_typeof(adaptations) = 'array'),
  services jsonb not null default '[]' check (jsonb_typeof(services) = 'array'),
  created_by uuid references auth.users (id) on delete set null,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (student_id, tenant_id) references public.students (id, tenant_id) on delete cascade,
  unique (student_id, school_year, version),
  unique (id, tenant_id, student_id),
  check (review_date is null or start_date is null or review_date >= start_date)
);

-- Um único PEI em vigor por aluno.
create unique index peis_one_active_per_student on public.peis (student_id) where status = 'active';
create index peis_tenant_idx on public.peis (tenant_id);

create trigger peis_touch before update on public.peis
  for each row execute function private.touch_updated_at();

-- Metas SMART ---------------------------------------------------------------------
create table public.pei_goals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  student_id uuid not null,
  pei_id uuid not null,
  position int not null default 0,
  area text not null check (area in (
    'academica', 'comunicacao', 'social_emocional', 'comportamento',
    'autonomia', 'motora', 'sensorial'
  )),
  description text not null check (length(trim(description)) between 1 and 1000),
  success_criterion text not null check (length(trim(success_criterion)) between 1 and 500),
  target_date date not null,
  bncc_code text,
  strategies text not null default '',
  responsible text not null default '',
  measurement_method text not null default 'observacao' check (measurement_method in (
    'observacao', 'registro_frequencia', 'registro_tarefa', 'portfolio',
    'avaliacao_adaptada', 'checklist'
  )),
  measurement_frequency text not null default 'semanal' check (measurement_frequency in (
    'diaria', 'semanal', 'quinzenal', 'mensal', 'bimestral'
  )),
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'achieved', 'discontinued')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (pei_id, tenant_id, student_id)
    references public.peis (id, tenant_id, student_id) on delete cascade,
  unique (id, tenant_id, student_id)
);

create index pei_goals_pei_idx on public.pei_goals (pei_id, position);

create trigger pei_goals_touch before update on public.pei_goals
  for each row execute function private.touch_updated_at();

-- Registro de progresso -----------------------------------------------------------
create table public.progress_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  student_id uuid not null,
  goal_id uuid not null,
  level text not null check (level in ('not_observed', 'emerging', 'developing', 'achieved')),
  support text check (support in ('independent', 'verbal', 'visual', 'gestural', 'physical')),
  note text check (length(note) <= 1000),
  observed_at timestamptz not null default now(),
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (goal_id, tenant_id, student_id)
    references public.pei_goals (id, tenant_id, student_id) on delete cascade
);

create index progress_entries_goal_idx on public.progress_entries (goal_id, observed_at);

-- Portal da família ---------------------------------------------------------------
create table public.family_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  student_id uuid not null,
  label text,
  token_hash text not null unique,
  created_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  access_count int not null default 0,
  last_access_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (student_id, tenant_id) references public.students (id, tenant_id) on delete cascade
);

create index family_links_student_idx on public.family_links (student_id);

create table public.family_access_log (
  id bigint generated always as identity primary key,
  link_id uuid not null references public.family_links (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  accessed_at timestamptz not null default now(),
  -- Hash do IP (com sal da aplicação): permite detectar abuso sem guardar o IP.
  ip_hash text
);

create index family_access_log_link_idx on public.family_access_log (link_id, accessed_at desc);

create table public.family_consents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  link_id uuid not null references public.family_links (id) on delete cascade,
  student_id uuid not null,
  guardian_name text not null,
  relationship text not null,
  terms_version text not null,
  accepted_at timestamptz not null default now(),
  ip_hash text,
  foreign key (student_id, tenant_id) references public.students (id, tenant_id) on delete cascade
);

create index family_consents_link_idx on public.family_consents (link_id, terms_version);
