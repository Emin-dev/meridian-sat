-- Review and apply to a synthetic/staging database before application rollout.
-- This file is a proposal; it has not been applied to any hosted database.
begin;

alter table public.students add column if not exists tags text[] default '{}';
create table if not exists public.ui_media (
  id uuid primary key default gen_random_uuid(),
  media_key text not null,
  scope text not null check (scope in ('global', 'student')),
  student_id uuid references public.students(id) on delete cascade,
  hidden boolean not null default false,
  updated_at timestamptz not null default now(),
  check ((scope = 'global' and student_id is null) or (scope = 'student' and student_id is not null))
);
create unique index if not exists ui_media_global_key on public.ui_media(media_key) where scope = 'global';
create unique index if not exists ui_media_student_key on public.ui_media(student_id, media_key) where scope = 'student';

create table if not exists public.login_attempts (
  kind text primary key check (kind in ('admin', 'student')),
  started_at timestamptz not null,
  attempts integer not null
);

-- Durable, deployment-wide bounds. No caller-controlled IP headers or credentials
-- are stored. All attempts count; a trusted edge limiter can add finer IP controls.
create or replace function public.consume_login_attempt(p_kind text)
returns boolean language plpgsql set search_path = pg_catalog, public as $$
declare amount integer;
begin
  insert into public.login_attempts as a (kind, started_at, attempts)
  values (p_kind, now(), 1)
  on conflict (kind) do update set
    attempts = case when a.started_at <= now() - interval '15 minutes' then 1 else a.attempts + 1 end,
    started_at = case when a.started_at <= now() - interval '15 minutes' then now() else a.started_at end
  returning attempts into amount;
  return amount <= case when p_kind = 'admin' then 20 else 300 end;
end;
$$;

-- Serialize consumption on the unique student/day row. No lost increments or
-- ignored database errors, even across serverless instances.
create or replace function public.consume_ai_usage(p_student_id uuid, p_commit boolean default true)
returns jsonb language plpgsql set search_path = pg_catalog, public as $$
declare r public.ai_usage%rowtype; permitted boolean;
begin
  insert into public.ai_usage(student_id, day)
  values (p_student_id, (now() at time zone 'UTC')::date)
  on conflict (student_id, day) do nothing;
  select * into r from public.ai_usage
    where student_id = p_student_id and day = (now() at time zone 'UTC')::date for update;
  permitted := not (
    coalesce(r.blocked_until > now(), false) or r.count >= 200 + r.bonus or
    (r.count >= 100 + r.bonus and coalesce(r.last_request_at > now() - interval '4 minutes', false))
  );
  if permitted and p_commit then
    update public.ai_usage set count = count + 1, last_request_at = now(), blocked_until = null
      where id = r.id returning * into r;
  elsif not permitted and r.count >= 200 + r.bonus and p_commit then
    update public.ai_usage set blocked_until = coalesce(greatest(blocked_until, now()), now()) + interval '12 hours'
      where id = r.id and (blocked_until is null or blocked_until <= now()) returning * into r;
    -- No update when an existing block is active; preserve its current row.
    if not found then select * into r from public.ai_usage where student_id = p_student_id and day = (now() at time zone 'UTC')::date; end if;
  end if;
  return to_jsonb(r) || jsonb_build_object('allowed', permitted);
end;
$$;

create or replace function public.grant_ai_bonus(p_student_id uuid, p_amount integer)
returns void language plpgsql set search_path = pg_catalog, public as $$
begin
  if p_amount < 1 or p_amount > 1000 then raise exception 'Invalid bonus'; end if;
  insert into public.ai_usage as a (student_id, day, bonus)
  values (p_student_id, (now() at time zone 'UTC')::date, p_amount)
  on conflict (student_id, day) do update set bonus = a.bonus + excluded.bonus, blocked_until = null;
end;
$$;

-- Claim onboarding once and file a usable fallback in the same transaction.
-- A failed insert rolls back the state transition; retries remain safe.
create or replace function public.begin_student_onboarding(p_student_id uuid, p_answers jsonb, p_fallback jsonb)
returns jsonb language plpgsql set search_path = pg_catalog, public as $$
declare student public.students%rowtype; request_id uuid;
begin
  update public.students set onboarded = true, status = 'preparing', survey = p_answers
    where id = p_student_id and onboarded = false and status = 'new' returning * into student;
  if not found then
    select * into student from public.students where id = p_student_id;
    if not found then raise exception 'Student not found'; end if;
    return jsonb_build_object('student', to_jsonb(student), 'created', false);
  end if;
  insert into public.lesson_requests(student_id, status, study_plan, ai_summary, lessons, notes, version, feedback, discussion)
    values (p_student_id, 'pending', coalesce(p_fallback->>'study_plan', ''),
      coalesce(p_fallback->>'ai_summary', ''), coalesce(p_fallback->'lessons', '[]'::jsonb),
      coalesce(p_fallback->>'notes', ''), 1, '', '[]'::jsonb) returning id into request_id;
  return jsonb_build_object('student', to_jsonb(student), 'created', true, 'request_id', request_id, 'request_version', 1);
end;
$$;
revoke all on function public.begin_student_onboarding(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.begin_student_onboarding(uuid, jsonb, jsonb) to service_role;

-- Apply generation only to its unchanged pending draft. Preserve any teacher
-- edits to the profile made while the provider request was in flight.
create or replace function public.finish_student_onboarding(p_request_id uuid, p_request_version integer, p_package jsonb, p_previous_profile jsonb)
returns boolean language plpgsql set search_path = pg_catalog, public as $$
declare student_id uuid;
begin
  update public.lesson_requests set study_plan = coalesce(p_package->>'study_plan', ''),
    ai_summary = coalesce(p_package->>'ai_summary', ''), lessons = p_package->'lessons',
    notes = coalesce(p_package->>'notes', ''), version = version + 1
    where id = p_request_id and status = 'pending' and version = p_request_version
    returning lesson_requests.student_id into student_id;
  if not found then return false; end if;
  update public.students as s set
    weak_areas = case when to_jsonb(s.weak_areas) is not distinct from p_previous_profile->'weak_areas'
      and jsonb_typeof(p_package->'weak_areas') = 'array' then
        case when jsonb_array_length(p_package->'weak_areas') > 0
          then array(select jsonb_array_elements_text(p_package->'weak_areas')) else s.weak_areas end
      else s.weak_areas end,
    target_score = case when to_jsonb(s.target_score) is not distinct from p_previous_profile->'target_score'
      and jsonb_typeof(p_package->'target_score') = 'number' then
        case when (p_package->>'target_score')::numeric between 400 and 1600
          then (p_package->>'target_score')::numeric::integer else s.target_score end
      else s.target_score end
    where s.id = student_id and s.status = 'preparing';
  return true;
end;
$$;
revoke all on function public.finish_student_onboarding(uuid, integer, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.finish_student_onboarding(uuid, integer, jsonb, jsonb) to service_role;

-- Approval locks the same request row as generation/edit CAS and publishes one
-- consistent reviewed revision. Repeated or stale approvals cannot duplicate it.
create or replace function public.approve_lesson_request(p_request_id uuid, p_request_version integer)
returns jsonb language plpgsql set search_path = pg_catalog, public as $$
declare r public.lesson_requests%rowtype; published integer;
begin
  select * into r from public.lesson_requests where id = p_request_id for update;
  if not found or r.status <> 'pending' or r.version <> p_request_version then
    return jsonb_build_object('conflict', true);
  end if;
  insert into public.lessons(student_id, title, section, topic, difficulty, content, questions, study_plan, status)
    select r.student_id, coalesce(nullif(item->>'title', ''), 'Lesson'),
      coalesce(nullif(item->>'section', ''), 'Math'), coalesce(item->>'topic', ''),
      coalesce(nullif(item->>'difficulty', ''), 'Medium'), coalesce(item->>'content', ''),
      coalesce(item->'questions', '[]'::jsonb), coalesce(item->>'study_plan', ''), 'published'
    from jsonb_array_elements(coalesce(r.lessons, '[]'::jsonb)) as item;
  get diagnostics published = row_count;
  update public.students as s set status = 'active', study_plan = coalesce(r.study_plan, ''),
    ai_summary = coalesce(r.ai_summary, ''), notes = coalesce(nullif(r.notes, ''), s.notes, '')
    where id = r.student_id;
  update public.lesson_requests set status = 'approved', reviewed_at = now(), version = version + 1
    where id = r.id returning * into r;
  return jsonb_build_object('request', to_jsonb(r), 'published', published);
end;
$$;
revoke all on function public.approve_lesson_request(uuid, integer) from public, anon, authenticated;
grant execute on function public.approve_lesson_request(uuid, integer) to service_role;

-- Browser clients do not use Supabase Auth. No anon/authenticated table policies
-- are appropriate here: application API routes use the server service-role key.
do $$
declare table_name text;
begin
  foreach table_name in array array['students','lessons','progress','prompts','settings','events',
    'lesson_requests','student_tools','ai_usage','media_assets','media_requests','ui_media','login_attempts'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on public.%I to service_role', table_name);
  end loop;
end $$;
revoke all on function public.consume_login_attempt(text) from public, anon, authenticated;
revoke all on function public.consume_ai_usage(uuid, boolean) from public, anon, authenticated;
revoke all on function public.grant_ai_bonus(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_login_attempt(text) to service_role;
grant execute on function public.consume_ai_usage(uuid, boolean) to service_role;
grant execute on function public.grant_ai_bonus(uuid, integer) to service_role;
commit;
