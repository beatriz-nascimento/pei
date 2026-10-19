-- =============================================================================
-- Operações que precisam passar por cima do RLS de forma controlada.
-- Todas são SECURITY DEFINER, com search_path vazio, e validam o chamador.
-- =============================================================================

-- Cria a conta (Escola ou Profissional) e torna o criador administrador --------------
create or replace function private.create_tenant(
  p_name text,
  p_type text,
  p_city text default null,
  p_state text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_tenant uuid;
begin
  if v_user is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;

  insert into public.tenants (name, type, city, state, created_by)
  values (trim(p_name), p_type, nullif(trim(p_city), ''), upper(nullif(trim(p_state), '')), v_user)
  returning id into v_tenant;

  insert into public.memberships (tenant_id, user_id, role) values (v_tenant, v_user, 'admin');

  return v_tenant;
end;
$$;

-- Aceita convite: o e-mail do usuário logado precisa ser o mesmo do convite ----------
create or replace function private.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_email text := lower((select auth.jwt()) ->> 'email');
  v_inv public.invitations%rowtype;
begin
  if v_user is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;

  select * into v_inv from public.invitations
  where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  for update;

  if not found or v_inv.accepted_at is not null or v_inv.expires_at < now() then
    raise exception 'Convite inválido ou expirado' using errcode = 'P0002', hint = 'invitation_invalid';
  end if;

  if v_inv.email <> v_email then
    raise exception 'Este convite foi enviado para outro e-mail'
      using errcode = '42501', hint = 'invitation_email_mismatch';
  end if;

  insert into public.memberships (tenant_id, user_id, role)
  values (v_inv.tenant_id, v_user, v_inv.role)
  on conflict (tenant_id, user_id) do nothing;

  update public.invitations
  set accepted_at = now(), accepted_by = v_user
  where id = v_inv.id;

  return v_inv.tenant_id;
end;
$$;

-- Portal da família ---------------------------------------------------------------------
-- Valida o link, conta o acesso e devolve somente o que a família pode ver:
-- primeiro nome do aluno, PEIs publicados (em vigor ou arquivados), metas e níveis
-- de progresso. Não expõe condições clínicas, estudo de caso nem anotações internas.
create or replace function private.family_portal(
  p_token text,
  p_terms_version text,
  p_ip_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.family_links%rowtype;
  v_consented boolean;
  v_result jsonb;
begin
  select * into v_link from public.family_links
  where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');

  if not found or v_link.revoked_at is not null or v_link.expires_at < now() then
    return null;
  end if;

  update public.family_links
  set access_count = access_count + 1, last_access_at = now()
  where id = v_link.id;

  insert into public.family_access_log (link_id, tenant_id, ip_hash)
  values (v_link.id, v_link.tenant_id, p_ip_hash);

  select exists (
    select 1 from public.family_consents
    where link_id = v_link.id and terms_version = p_terms_version
  ) into v_consented;

  select jsonb_build_object(
    'student', jsonb_build_object(
      'firstName', split_part(trim(s.full_name), ' ', 1),
      'grade', s.grade,
      'schoolName', coalesce(s.school_name, case when t.type = 'school' then t.name end)
    ),
    'tenantName', t.name,
    'consent', jsonb_build_object('required', not v_consented, 'termsVersion', p_terms_version),
    'peis', case when not v_consented then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'schoolYear', p.school_year,
        'version', p.version,
        'status', p.status,
        'startDate', p.start_date,
        'reviewDate', p.review_date,
        'adaptations', p.adaptations,
        'services', p.services,
        'goals', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', g.id,
            'area', g.area,
            'description', g.description,
            'successCriterion', g.success_criterion,
            'targetDate', g.target_date,
            'status', g.status,
            'progress', coalesce((
              select jsonb_agg(jsonb_build_object('level', e.level, 'observedAt', e.observed_at)
                               order by e.observed_at)
              from public.progress_entries e where e.goal_id = g.id
            ), '[]'::jsonb)
          ) order by g.position, g.created_at)
          from public.pei_goals g where g.pei_id = p.id
        ), '[]'::jsonb)
      ) order by p.school_year desc, p.version desc)
      from public.peis p
      where p.student_id = s.id and p.status in ('active', 'archived')
    ), '[]'::jsonb) end
  ) into v_result
  from public.students s
  join public.tenants t on t.id = s.tenant_id
  where s.id = v_link.student_id;

  return v_result;
end;
$$;

create or replace function private.family_consent(
  p_token text,
  p_guardian_name text,
  p_relationship text,
  p_terms_version text,
  p_ip_hash text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.family_links%rowtype;
begin
  select * into v_link from public.family_links
  where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');

  if not found or v_link.revoked_at is not null or v_link.expires_at < now() then
    return false;
  end if;

  insert into public.family_consents
    (tenant_id, link_id, student_id, guardian_name, relationship, terms_version, ip_hash)
  values (
    v_link.tenant_id, v_link.id, v_link.student_id,
    left(trim(p_guardian_name), 160), left(trim(p_relationship), 60), p_terms_version, p_ip_hash
  );

  return true;
end;
$$;

revoke all on function private.create_tenant(text, text, text, text) from public;
revoke all on function private.accept_invitation(text) from public;
revoke all on function private.family_portal(text, text, text) from public;
revoke all on function private.family_consent(text, text, text, text, text) from public;

grant execute on function private.create_tenant(text, text, text, text) to authenticated;
grant execute on function private.accept_invitation(text) to authenticated;
-- O portal da família é público (sem login): a API chama estas funções como "anon".
grant execute on function private.family_portal(text, text, text) to anon;
grant execute on function private.family_consent(text, text, text, text, text) to anon;
