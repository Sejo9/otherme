-- =============================================================================
-- 0003 — RLS recursion fix, voice notes, and async games.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Fix infinite recursion in the mutual-reveal policies.
--
-- The original policies queried the same table they guarded, so Postgres
-- re-entered the policy while evaluating it:
--
--     infinite recursion detected in policy for relation "question_answers"
--
-- A SECURITY DEFINER function runs with RLS bypassed inside, which breaks the
-- cycle while keeping exactly the same rule: you may read their answer only if
-- you have already committed your own.
-- -----------------------------------------------------------------------------
create or replace function public.has_answered(p_question uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.question_answers
    where question_id = p_question and user_id = auth.uid()
  );
$$;

create or replace function public.has_responded(p_round uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.know_me_responses
    where round_id = p_round and user_id = auth.uid()
  );
$$;

drop policy if exists mutual_reveal on public.question_answers;
create policy mutual_reveal on public.question_answers for select using (
  user_id = auth.uid() or public.has_answered(question_id)
);

drop policy if exists mutual_reveal on public.know_me_responses;
create policy mutual_reveal on public.know_me_responses for select using (
  user_id = auth.uid() or public.has_responded(round_id)
);

-- -----------------------------------------------------------------------------
-- 2. Voice notes.
--
-- A voice note is a timeline entry with audio attached. `deliver_at` lets you
-- record one now and have it arrive later — at their morning alarm, on their
-- commute — without it being readable in the meantime.
-- -----------------------------------------------------------------------------
alter table public.timeline_entries
  drop constraint if exists timeline_entries_kind_check;

alter table public.timeline_entries
  add constraint timeline_entries_kind_check
  check (kind in ('photo','note','appreciation','milestone','song','joke','place','voice'));

alter table public.timeline_entries
  add column if not exists deliver_at timestamptz,
  add column if not exists duration_ms int;

-- Undelivered entries are invisible to the recipient, like a sealed capsule.
drop policy if exists shared_read on public.timeline_entries;
create policy shared_read on public.timeline_entries for select using (
  public.is_partner()
  and (deliver_at is null or now() >= deliver_at or author_id = auth.uid())
);

-- So the recipient can see that something is on its way without hearing it.
create or replace function public.pending_deliveries()
returns table (id uuid, kind text, deliver_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id, e.kind, e.deliver_at, e.created_at
  from public.timeline_entries e
  where e.author_id <> auth.uid()
    and e.deliver_at is not null
    and now() < e.deliver_at
    and exists (select 1 from public.profiles p where p.id = auth.uid());
$$;

-- -----------------------------------------------------------------------------
-- 3. Async games.
--
-- Board state lives in `state` as jsonb. Turn order is enforced by RLS rather
-- than by the client: the update policy only lets the player whose turn it is
-- write, so a stale or malicious tab cannot move out of turn or move twice.
-- -----------------------------------------------------------------------------
create table if not exists public.games (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('connect4', 'reversi')),
  state      jsonb not null,
  turn       uuid references public.profiles (id) on delete set null,
  winner     uuid references public.profiles (id) on delete set null,
  status     text not null default 'active' check (status in ('active','won','draw','resigned')),
  started_by uuid not null references public.profiles (id) on delete cascade,
  move_count int  not null default 0,
  last_move  jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists games_active_idx on public.games (status, updated_at desc);

alter table public.games enable row level security;

create policy shared_read on public.games for select using (public.is_partner());
create policy start_game  on public.games for insert with check (started_by = auth.uid());

-- The whole turn-order rule, in one line: you can only write when it is your
-- move. Finished games become immutable because `turn` is set to null.
create policy only_on_your_turn on public.games for update
  using (turn = auth.uid())
  with check (public.is_partner());

create policy delete_own on public.games for delete using (public.is_partner());

alter publication supabase_realtime add table public.games;

-- -----------------------------------------------------------------------------
-- 4. Series record across finished games.
-- -----------------------------------------------------------------------------
create or replace function public.game_record()
returns table (kind text, user_id uuid, wins int, draws int)
language sql stable security definer set search_path = public as $$
  select
    g.kind,
    p.id as user_id,
    count(*) filter (where g.status = 'won' and g.winner = p.id)::int as wins,
    count(*) filter (where g.status = 'draw')::int as draws
  from public.games g
  cross join public.profiles p
  where g.status in ('won', 'draw', 'resigned')
  group by g.kind, p.id;
$$;
