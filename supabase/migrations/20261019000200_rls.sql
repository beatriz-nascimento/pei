-- =============================================================================
-- Row-Level Security
--
-- Regras de acesso (fluxograma "Cadastra responsáveis e permissões"):
--   admin  → tudo dentro da própria conta.
--   editor → lê e edita PEIs dos alunos aos quais está vinculado.
--   viewer → só lê os alunos aos quais está vinculado.
--
-- As funções auxiliares retornam conjuntos (setof uuid) e são chamadas como
-- "x in (select private.fn())". Assim o Postgres as executa uma vez por
-- consulta (InitPlan), e não uma vez por linha.
-- =============================================================================

create or replace function private.my_tenant_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select tenant_id from public.memberships where user_id = (select auth.uid());
$$;

create or replace function private.my_admin_tenant_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select tenant_id from public.memberships
  where user_id = (select auth.uid()) and role = 'admin';
$$;

create or replace function private.readable_student_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select s.id from public.students s
  where s.tenant_id in (
    select tenant_id from public.memberships
    where user_id = (select auth.uid()) and role = 'admin'
  )
  union
  select ss.student_id from public.student_staff ss
  join public.memberships m on m.tenant_id = ss.tenant_id and m.user_id = ss.user_id
  where ss.user_id = (select auth.uid());
$$;

create or replace function private.editable_student_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select s.id from public.students s
  where s.tenant_id in (
    select tenant_id from public.memberships
    where user_id = (select auth.uid()) and role = 'admin'
  )
  union
  select ss.student_id from public.student_staff ss
  join public.memberships m on m.tenant_id = ss.tenant_id and m.user_id = ss.user_id
  where ss.user_id = (select auth.uid()) and m.role = 'editor';
$$;

revoke all on function private.my_tenant_ids() from public;
revoke all on function private.my_admin_tenant_ids() from public;
revoke all on function private.readable_student_ids() from public;
revoke all on function private.editable_student_ids() from public;
grant execute on function private.my_tenant_ids() to authenticated;
grant execute on function private.my_admin_tenant_ids() to authenticated;
grant execute on function private.readable_student_ids() to authenticated;
grant execute on function private.editable_student_ids() to authenticated;

-- Privilégios de tabela: anon não acessa nada diretamente ------------------------
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;

grant select, update on public.profiles to authenticated;
grant select, update on public.tenants to authenticated;
grant select, update, delete on public.memberships to authenticated;
grant select, insert, delete on public.invitations to authenticated;
grant select, insert, update, delete on public.students to authenticated;
grant select, insert, update, delete on public.student_staff to authenticated;
grant select, insert, update, delete on public.peis to authenticated;
grant select, insert, update, delete on public.pei_goals to authenticated;
grant select, insert, delete on public.progress_entries to authenticated;
grant select, insert, update on public.family_links to authenticated;
grant select on public.family_access_log to authenticated;
grant select on public.family_consents to authenticated;

alter table public.profiles enable row level security;
alter table public.tenants enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.students enable row level security;
alter table public.student_staff enable row level security;
alter table public.peis enable row level security;
alter table public.pei_goals enable row level security;
alter table public.progress_entries enable row level security;
alter table public.family_links enable row level security;
alter table public.family_access_log enable row level security;
alter table public.family_consents enable row level security;

-- Perfis: o próprio usuário e colegas de conta --------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or id in (
      select m.user_id from public.memberships m
      where m.tenant_id in (select private.my_tenant_ids())
    )
  );

create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Contas ------------------------------------------------------------------------------
create policy tenants_select on public.tenants for select to authenticated
  using (id in (select private.my_tenant_ids()));

create policy tenants_update on public.tenants for update to authenticated
  using (id in (select private.my_admin_tenant_ids()))
  with check (id in (select private.my_admin_tenant_ids()));

-- Membros ----------------------------------------------------------------------------
create policy memberships_select on public.memberships for select to authenticated
  using (tenant_id in (select private.my_tenant_ids()));

create policy memberships_update on public.memberships for update to authenticated
  using (tenant_id in (select private.my_admin_tenant_ids()))
  with check (tenant_id in (select private.my_admin_tenant_ids()));

-- Admin remove membros; qualquer um pode sair da conta.
create policy memberships_delete on public.memberships for delete to authenticated
  using (
    tenant_id in (select private.my_admin_tenant_ids())
    or user_id = (select auth.uid())
  );

-- Impede que a conta fique sem administrador.
create or replace function private.ensure_admin_remains()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'admin' and (tg_op = 'DELETE' or new.role <> 'admin') then
    if not exists (
      select 1 from public.memberships
      where tenant_id = old.tenant_id and role = 'admin' and user_id <> old.user_id
    ) and exists (select 1 from public.tenants where id = old.tenant_id) then
      raise exception 'A conta precisa de pelo menos um administrador'
        using errcode = 'P0001', hint = 'last_admin';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger memberships_keep_admin
  before update of role or delete on public.memberships
  for each row execute function private.ensure_admin_remains();

-- Convites ------------------------------------------------------------------------------
create policy invitations_admin on public.invitations for all to authenticated
  using (tenant_id in (select private.my_admin_tenant_ids()))
  with check (
    tenant_id in (select private.my_admin_tenant_ids())
    and invited_by = (select auth.uid())
  );

-- Alunos --------------------------------------------------------------------------------
-- Admin é checado pela coluna tenant_id da própria linha (e não pela função), para
-- que INSERT ... RETURNING enxergue o aluno recém-criado no mesmo comando.
create policy students_select on public.students for select to authenticated
  using (
    tenant_id in (select private.my_admin_tenant_ids())
    or id in (select private.readable_student_ids())
  );

create policy students_insert on public.students for insert to authenticated
  with check (
    tenant_id in (select private.my_admin_tenant_ids())
    and created_by = (select auth.uid())
  );

create policy students_update on public.students for update to authenticated
  using (id in (select private.editable_student_ids()))
  with check (id in (select private.editable_student_ids()));

create policy students_delete on public.students for delete to authenticated
  using (tenant_id in (select private.my_admin_tenant_ids()));

-- Vínculo aluno ↔ profissional ------------------------------------------------------------
create policy student_staff_select on public.student_staff for select to authenticated
  using (student_id in (select private.readable_student_ids()));

create policy student_staff_insert on public.student_staff for insert to authenticated
  with check (tenant_id in (select private.my_admin_tenant_ids()));

create policy student_staff_update on public.student_staff for update to authenticated
  using (tenant_id in (select private.my_admin_tenant_ids()))
  with check (tenant_id in (select private.my_admin_tenant_ids()));

create policy student_staff_delete on public.student_staff for delete to authenticated
  using (tenant_id in (select private.my_admin_tenant_ids()));

-- PEI ------------------------------------------------------------------------------------
create policy peis_select on public.peis for select to authenticated
  using (student_id in (select private.readable_student_ids()));

create policy peis_insert on public.peis for insert to authenticated
  with check (
    student_id in (select private.editable_student_ids())
    and created_by = (select auth.uid())
  );

create policy peis_update on public.peis for update to authenticated
  using (student_id in (select private.editable_student_ids()))
  with check (student_id in (select private.editable_student_ids()));

-- Só rascunhos podem ser apagados; PEIs em vigor ou arquivados são registro histórico.
create policy peis_delete on public.peis for delete to authenticated
  using (status = 'draft' and student_id in (select private.editable_student_ids()));

-- Metas ------------------------------------------------------------------------------------
create policy pei_goals_select on public.pei_goals for select to authenticated
  using (student_id in (select private.readable_student_ids()));

create policy pei_goals_write on public.pei_goals for all to authenticated
  using (student_id in (select private.editable_student_ids()))
  with check (student_id in (select private.editable_student_ids()));

-- Progresso ---------------------------------------------------------------------------------
create policy progress_select on public.progress_entries for select to authenticated
  using (student_id in (select private.readable_student_ids()));

create policy progress_insert on public.progress_entries for insert to authenticated
  with check (
    student_id in (select private.editable_student_ids())
    and recorded_by = (select auth.uid())
  );

-- Quem registrou pode apagar o próprio registro; admin apaga qualquer um.
create policy progress_delete on public.progress_entries for delete to authenticated
  using (
    (recorded_by = (select auth.uid()) and student_id in (select private.editable_student_ids()))
    or tenant_id in (select private.my_admin_tenant_ids())
  );

-- Portal da família ---------------------------------------------------------------------------
create policy family_links_select on public.family_links for select to authenticated
  using (student_id in (select private.readable_student_ids()));

create policy family_links_insert on public.family_links for insert to authenticated
  with check (
    student_id in (select private.editable_student_ids())
    and created_by = (select auth.uid())
  );

create policy family_links_update on public.family_links for update to authenticated
  using (student_id in (select private.editable_student_ids()))
  with check (student_id in (select private.editable_student_ids()));

create policy family_access_log_select on public.family_access_log for select to authenticated
  using (
    link_id in (
      select id from public.family_links
      where student_id in (select private.readable_student_ids())
    )
  );

create policy family_consents_select on public.family_consents for select to authenticated
  using (student_id in (select private.readable_student_ids()));
