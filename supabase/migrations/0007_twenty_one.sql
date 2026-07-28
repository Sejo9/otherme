-- =============================================================================
-- 0007 — 21 Questions.
--
-- A session is 21 questions drawn from a couples-specific pool. Neither of you
-- sees the other's answer until you have both answered, as everywhere else in
-- this app.
--
-- Skipping is negotiated rather than unilateral. Proposing a skip does not
-- skip the question; it asks. The five states a question can be in:
--
--   1. nobody has responded            -> answer it, or propose a skip
--   2. one answered, other silent      -> sealed, waiting
--   3. both answered                   -> revealed
--   4. one proposed skip, other silent -> the other is asked to agree
--   5. one proposed skip, other ANSWERED -> the skip was declined; whoever
--      proposed it is now asked to answer after all, and the answer that is
--      already in stays sealed until they do
--
-- So a question is only ever skipped by agreement, and answering can never be
-- avoided as a way of reading the other person's answer without giving yours.
-- =============================================================================

create table if not exists public.q21_prompts (
  id       uuid primary key default gen_random_uuid(),
  body     text    not null unique,
  tier     text    not null default 'light'
             check (tier in ('light', 'reflective', 'deep', 'spicy')),
  active   boolean not null default true
);

create table if not exists public.q21_sessions (
  id           uuid primary key default gen_random_uuid(),
  started_by   uuid not null references public.profiles (id) on delete cascade,
  question_ids uuid[] not null,
  status       text not null default 'active' check (status in ('active', 'done')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.q21_responses (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.q21_sessions (id) on delete cascade,
  idx         int  not null check (idx between 0 and 20),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  body        text,
  skipped     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Either you said something or you proposed a skip. Never both, never neither.
  constraint q21_answer_or_skip check (
    (skipped and body is null) or (not skipped and body is not null)
  ),
  unique (session_id, idx, user_id)
);

create index if not exists q21_responses_session_idx
  on public.q21_responses (session_id, idx);

-- SECURITY DEFINER, so the policy below can consult the table it guards
-- without re-entering its own policy. See migration 0003 for what happens
-- otherwise.
create or replace function public.q21_revealed(p_session uuid, p_idx int)
returns boolean
language sql stable security definer set search_path = public as $$
  select count(*) >= 2
  from public.q21_responses r
  where r.session_id = p_session and r.idx = p_idx and not r.skipped;
$$;

alter table public.q21_prompts   enable row level security;
alter table public.q21_sessions  enable row level security;
alter table public.q21_responses enable row level security;

create policy shared_read on public.q21_prompts  for select using (public.is_partner());

create policy shared_read on public.q21_sessions for select using (public.is_partner());
create policy start      on public.q21_sessions for insert with check (started_by = auth.uid());
create policy advance    on public.q21_sessions for update using (public.is_partner());

-- Both must have answered. Two non-skipped rows means exactly that, since
-- there are only ever two people — so this also implies you answered.
create policy mutual_reveal on public.q21_responses for select using (
  user_id = auth.uid() or public.q21_revealed(session_id, idx)
);
create policy own_write  on public.q21_responses for insert with check (user_id = auth.uid());
-- Updatable so a declined skip can be turned into a real answer.
create policy own_modify on public.q21_responses for update using (user_id = auth.uid());

alter publication supabase_realtime add table public.q21_responses;
alter publication supabase_realtime add table public.q21_sessions;

-- -----------------------------------------------------------------------------
-- Starting a session
-- -----------------------------------------------------------------------------
create or replace function public.start_q21_session()
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_tiers text[];
  v_ids   uuid[];
  v_id    uuid;
begin
  if v_uid is null or not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'not one of the two people';
  end if;

  select enabled_tiers into v_tiers from public.settings where id;

  -- Least-used questions first, shuffled within that, so sessions do not
  -- repeat themselves until the pool is genuinely exhausted.
  select array_agg(s.id) into v_ids
  from (
    select p.id
    from public.q21_prompts p
    left join (
      select unnest(question_ids) as used_id from public.q21_sessions
    ) u on u.used_id = p.id
    where p.active and p.tier = any (v_tiers)
    group by p.id
    order by count(u.used_id) asc, random()
    limit 21
  ) s;

  if v_ids is null or array_length(v_ids, 1) < 21 then
    raise exception 'not enough questions available for the enabled tiers';
  end if;

  insert into public.q21_sessions (started_by, question_ids)
  values (v_uid, v_ids)
  returning id into v_id;

  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- The whole session in one call
--
-- SECURITY DEFINER, so it is careful: the partner's `body` is included only
-- once the question is revealed. Their *status* is always visible, because
-- that is what makes the skip negotiation and the waiting states legible.
-- -----------------------------------------------------------------------------
create or replace function public.q21_state(p_session uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_session public.q21_sessions;
  v_result  jsonb;
begin
  if v_uid is null or not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'not one of the two people';
  end if;

  select * into v_session from public.q21_sessions where id = p_session;
  if v_session.id is null then
    raise exception 'no such session';
  end if;

  select jsonb_build_object(
    'id', v_session.id,
    'status', v_session.status,
    'started_by', v_session.started_by,
    'created_at', v_session.created_at,
    'questions', coalesce(jsonb_agg(q.payload order by q.idx), '[]'::jsonb)
  ) into v_result
  from (
    select
      i.idx,
      jsonb_build_object(
        'idx',  i.idx,
        'body', p.body,
        'tier', p.tier,
        'me', jsonb_build_object(
          'responded', mine.id is not null,
          'skipped',   coalesce(mine.skipped, false),
          'body',      mine.body
        ),
        'them', jsonb_build_object(
          'responded', theirs.id is not null,
          'skipped',   coalesce(theirs.skipped, false),
          -- Withheld until you have both answered.
          'body', case
                    when public.q21_revealed(p_session, i.idx) then theirs.body
                    else null
                  end
        ),
        'revealed', public.q21_revealed(p_session, i.idx),
        'skipped_together', coalesce(mine.skipped, false) and coalesce(theirs.skipped, false)
      ) as payload
    from generate_series(0, 20) as i(idx)
    join public.q21_prompts p on p.id = v_session.question_ids[i.idx + 1]
    left join public.q21_responses mine
      on mine.session_id = p_session and mine.idx = i.idx and mine.user_id = v_uid
    left join public.q21_responses theirs
      on theirs.session_id = p_session and theirs.idx = i.idx and theirs.user_id <> v_uid
  ) q;

  return v_result;
end;
$$;

-- Marks a session finished once every question is settled — answered by both,
-- or skipped by both.
create or replace function public.q21_maybe_finish(p_session uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_settled int;
begin
  select count(*) into v_settled
  from generate_series(0, 20) as i(idx)
  where public.q21_revealed(p_session, i.idx)
     or (
       select count(*) = 2
       from public.q21_responses r
       where r.session_id = p_session and r.idx = i.idx and r.skipped
     );

  if v_settled = 21 then
    update public.q21_sessions
    set status = 'done', updated_at = now()
    where id = p_session and status <> 'done';
    return true;
  end if;

  return false;
end;
$$;
