-- =============================================================================
-- Trilha de auditoria (LGPD)
--
-- Tabela append-only: um trigger bloqueia UPDATE e DELETE, inclusive para o
-- dono do banco em operações comuns. Registra quem fez o quê, em qual
-- registro e QUAIS campos mudaram — mas não os valores, para não duplicar
-- dados de saúde de menores fora das tabelas de origem.
-- =============================================================================

create table public.audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  -- Sem FK de propósito: o histórico sobrevive à exclusão da conta.
  tenant_id uuid,
  actor_id uuid,
  action text not null,
  table_name text,
  record_id text,
  changed_fields text[],
  context jsonb not null default '{}',
  -- Base legal do tratamento. Preencher conforme parecer jurídico (ver docs/lgpd.md).
  legal_basis text
);

create index audit_log_tenant_idx on public.audit_log (tenant_id, occurred_at desc);
create index audit_log_record_idx on public.audit_log (table_name, record_id);

create or replace function private.audit_log_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log é somente inclusão' using errcode = '42501';
end;
$$;

create trigger audit_log_no_update_delete
  before update or delete on public.audit_log
  for each row execute function private.audit_log_immutable();

create or replace function private.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_changed text[];
  v_record text;
begin
  if tg_op = 'UPDATE' then
    select array_agg(key order by key) into v_changed
    from jsonb_each(v_new) n
    where key not in ('updated_at') and n.value is distinct from v_old -> key;
    if v_changed is null then
      return null; -- nada mudou de fato
    end if;
  end if;

  v_record := coalesce(
    v_row ->> 'id',
    concat_ws(':', v_row ->> 'tenant_id', v_row ->> 'student_id', v_row ->> 'user_id')
  );

  insert into public.audit_log (tenant_id, actor_id, action, table_name, record_id, changed_fields)
  values (
    case when tg_table_name = 'tenants' then (v_row ->> 'id')::uuid
         else (v_row ->> 'tenant_id')::uuid end,
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    v_record,
    v_changed
  );
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'tenants', 'memberships', 'invitations', 'students', 'student_staff',
    'peis', 'pei_goals', 'progress_entries', 'family_links', 'family_consents'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I
         for each row execute function private.audit_row()',
      t || '_audit', t
    );
  end loop;
end;
$$;

-- Eventos que não são escrita em tabela (ex.: exportação de documento) -------------
create or replace function private.log_event(
  p_tenant uuid,
  p_action text,
  p_table text default null,
  p_record text default null,
  p_context jsonb default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_tenant not in (select private.my_tenant_ids()) then
    raise exception 'Sem acesso a esta conta' using errcode = '42501';
  end if;
  insert into public.audit_log (tenant_id, actor_id, action, table_name, record_id, context)
  values (p_tenant, (select auth.uid()), p_action, p_table, p_record, coalesce(p_context, '{}'));
end;
$$;

revoke all on function private.log_event(uuid, text, text, text, jsonb) from public;
grant execute on function private.log_event(uuid, text, text, text, jsonb) to authenticated;

alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

create policy audit_log_admin_select on public.audit_log for select to authenticated
  using (tenant_id in (select private.my_admin_tenant_ids()));
