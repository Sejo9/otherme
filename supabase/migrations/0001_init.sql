-- =============================================================================
-- OtherMe — schema for a two-person application.
--
-- Design notes
-- ------------
-- * There are exactly two accounts, created by hand. Public signup must be
--   disabled in the Supabase dashboard (Auth -> Providers -> Email ->
--   "Allow new users to sign up" = off). Every RLS policy therefore reduces to
--   "is the caller one of the two people with a profile row?".
-- * Mutual reveal is enforced in the DATABASE, not the UI. You physically
--   cannot read your partner's daily answer or their know-me guesses until you
--   have committed your own. See the policies on question_answers and
--   know_me_responses.
-- * Almost everything that accrues (photos, notes, appreciations, songs,
--   inside jokes, map pins, milestones) is one row in timeline_entries. The
--   timeline, the memory jar, the map and the appreciation ledger are all just
--   different filters over that table.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text        not null,
  accent       text        not null default 'amber' check (accent in ('amber', 'rose')),
  avatar_path  text,
  timezone     text        not null default 'UTC',
  created_at   timestamptz not null default now()
);

-- Is the caller one of the two people? Used by every policy below.
create or replace function public.is_partner()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid());
$$;

-- The *other* person's id.
create or replace function public.partner_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select p.id from public.profiles p where p.id <> auth.uid() limit 1;
$$;

-- Security definer so the profiles insert policy can count profiles without
-- re-entering RLS on profiles, which would recurse.
create or replace function public.profile_count()
returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.profiles;
$$;

-- ---------------------------------------------------------------------------
-- Shared settings (exactly one row)
-- ---------------------------------------------------------------------------
create table public.settings (
  id             boolean primary key default true check (id),
  anniversary    date,
  apart          boolean     not null default false,
  reunion_at     timestamptz,
  reunion_label  text,
  enabled_tiers  text[]      not null default array['light', 'reflective', 'deep'],
  updated_at     timestamptz not null default now()
);
insert into public.settings (id) values (true);

-- ---------------------------------------------------------------------------
-- Presence — "what is my day like right now"
-- ---------------------------------------------------------------------------
create table public.presence (
  user_id           uuid primary key references public.profiles (id) on delete cascade,
  weather           text    not null default 'partly'
                      check (weather in ('sunny','partly','overcast','fog','rain','storm')),
  battery           int     not null default 70 check (battery between 0 and 100),
  activity          text    not null default 'unset',
  note              text,
  available_to_call boolean not null default false,
  heading_home_at   timestamptz,
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Pulses — the wordless "thinking of you" tap
-- ---------------------------------------------------------------------------
create table public.pulses (
  id         uuid primary key default gen_random_uuid(),
  from_user  uuid not null references public.profiles (id) on delete cascade,
  to_user    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null default 'thinking'
               check (kind in ('thinking','miss','love','proud','hug','sorry')),
  seen_at    timestamptz,
  created_at timestamptz not null default now()
);
create index pulses_to_user_idx on public.pulses (to_user, created_at desc);

-- ---------------------------------------------------------------------------
-- Daily question — mutual reveal
-- ---------------------------------------------------------------------------
create table public.prompts (
  id     uuid primary key default gen_random_uuid(),
  body   text    not null unique,
  tier   text    not null default 'light'
           check (tier in ('light','reflective','deep','spicy')),
  active boolean not null default true
);

create table public.daily_questions (
  id         uuid primary key default gen_random_uuid(),
  day        date not null unique,
  prompt_id  uuid not null references public.prompts (id),
  created_at timestamptz not null default now()
);

create table public.question_answers (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.daily_questions (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now(),
  unique (question_id, user_id)
);

-- ---------------------------------------------------------------------------
-- How well do you know me
--
-- Each round asks one question. BOTH people answer it twice: once truthfully
-- for themselves, once as a prediction of what their partner picked. You score
-- a point when your prediction matches their real answer.
-- ---------------------------------------------------------------------------
create table public.know_me_rounds (
  id         uuid primary key default gen_random_uuid(),
  day        date  not null unique,
  body       text  not null,
  options    jsonb not null,
  created_at timestamptz not null default now()
);

create table public.know_me_questions (
  id      uuid primary key default gen_random_uuid(),
  body    text    not null unique,
  options jsonb   not null,
  active  boolean not null default true
);

create table public.know_me_responses (
  id         uuid primary key default gen_random_uuid(),
  round_id   uuid not null references public.know_me_rounds (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  self_choice int  not null,
  prediction  int  not null,
  created_at timestamptz not null default now(),
  unique (round_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Timeline / memory jar — photos, notes, appreciations, songs, jokes, places
-- ---------------------------------------------------------------------------
create table public.timeline_entries (
  id           uuid primary key default gen_random_uuid(),
  author_id    uuid not null references public.profiles (id) on delete cascade,
  kind         text not null default 'note'
                 check (kind in ('photo','note','appreciation','milestone','song','joke','place')),
  title        text,
  body         text,
  media_path   text,
  link_url     text,
  place_name   text,
  lat          double precision,
  lng          double precision,
  occurred_on  date not null default current_date,
  pinned       boolean not null default false,
  created_at   timestamptz not null default now()
);
create index timeline_occurred_idx on public.timeline_entries (occurred_on desc, created_at desc);
create index timeline_kind_idx on public.timeline_entries (kind, occurred_on desc);

-- "Photo of the day" is just a timeline photo. One per person per day is
-- enforced by replacing on upload rather than by a partial unique index, which
-- PostgREST cannot target with `on conflict`.
create index timeline_author_day_idx
  on public.timeline_entries (author_id, kind, occurred_on);

-- ---------------------------------------------------------------------------
-- Rituals
-- ---------------------------------------------------------------------------
create table public.nightly_checkins (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  day          date not null default current_date,
  high         text,
  low          text,
  appreciation text,
  created_at   timestamptz not null default now(),
  unique (user_id, day)
);

create table public.jar_questions (
  id          uuid primary key default gen_random_uuid(),
  from_user   uuid not null references public.profiles (id) on delete cascade,
  to_user     uuid not null references public.profiles (id) on delete cascade,
  body        text not null,
  answer      text,
  answered_at timestamptz,
  created_at  timestamptz not null default now()
);

create table public.capsules (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references public.profiles (id) on delete cascade,
  title      text,
  body       text not null,
  unlock_at  timestamptz not null,
  opened_at  timestamptz,
  created_at timestamptz not null default now()
);

create table public.goodnights (
  day        date not null default current_date,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  pressed_at timestamptz not null default now(),
  primary key (day, user_id)
);

-- ---------------------------------------------------------------------------
-- Web push
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

-- =============================================================================
-- Daily content selection
--
-- Both clients call these on load. `on conflict do nothing` makes the pick
-- atomic, so whoever gets there first decides the day and the other converges.
-- =============================================================================
create or replace function public.ensure_daily_question(p_day date)
returns public.daily_questions
language plpgsql security definer set search_path = public as $$
declare
  result public.daily_questions;
  chosen uuid;
  tiers  text[];
begin
  select enabled_tiers into tiers from public.settings where id;

  select id into chosen
  from public.prompts
  where active
    and tier = any (tiers)
    and id not in (select prompt_id from public.daily_questions)
  order by random()
  limit 1;

  -- Every prompt has been used at least once: allow repeats, oldest first.
  if chosen is null then
    select p.id into chosen
    from public.prompts p
    left join public.daily_questions d on d.prompt_id = p.id
    where p.active and p.tier = any (tiers)
    group by p.id
    order by max(d.day) nulls first, random()
    limit 1;
  end if;

  insert into public.daily_questions (day, prompt_id)
  values (p_day, chosen)
  on conflict (day) do nothing;

  select * into result from public.daily_questions where day = p_day;
  return result;
end;
$$;

create or replace function public.ensure_know_me_round(p_day date)
returns public.know_me_rounds
language plpgsql security definer set search_path = public as $$
declare
  result public.know_me_rounds;
  q      public.know_me_questions;
begin
  select * into q
  from public.know_me_questions
  where active
    and body not in (select body from public.know_me_rounds)
  order by random()
  limit 1;

  if q.id is null then
    select * into q from public.know_me_questions where active order by random() limit 1;
  end if;

  insert into public.know_me_rounds (day, body, options)
  values (p_day, q.body, q.options)
  on conflict (day) do nothing;

  select * into result from public.know_me_rounds where day = p_day;
  return result;
end;
$$;

-- A sealed capsule is invisible to its recipient — the whole row is hidden by
-- RLS, which is correct but removes the anticipation. This returns only the
-- fact that something is waiting and when it opens. No title, no body.
create or replace function public.waiting_capsules()
returns table (id uuid, unlock_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.unlock_at, c.created_at
  from public.capsules c
  where c.author_id <> auth.uid()
    and now() < c.unlock_at
    and exists (select 1 from public.profiles p where p.id = auth.uid());
$$;

-- Running know-me scoreboard: how often each person predicted the other right.
create or replace function public.know_me_scores()
returns table (user_id uuid, correct int, total int)
language sql stable security definer set search_path = public as $$
  select
    me.user_id,
    count(*) filter (where me.prediction = them.self_choice)::int as correct,
    count(*)::int as total
  from public.know_me_responses me
  join public.know_me_responses them
    on them.round_id = me.round_id and them.user_id <> me.user_id
  group by me.user_id;
$$;

-- =============================================================================
-- Row level security
-- =============================================================================
alter table public.profiles           enable row level security;
alter table public.settings           enable row level security;
alter table public.presence           enable row level security;
alter table public.pulses             enable row level security;
alter table public.prompts            enable row level security;
alter table public.daily_questions    enable row level security;
alter table public.question_answers   enable row level security;
alter table public.know_me_rounds     enable row level security;
alter table public.know_me_questions  enable row level security;
alter table public.know_me_responses  enable row level security;
alter table public.timeline_entries   enable row level security;
alter table public.nightly_checkins   enable row level security;
alter table public.jar_questions      enable row level security;
alter table public.capsules           enable row level security;
alter table public.goodnights         enable row level security;
alter table public.push_subscriptions enable row level security;

-- Shared-by-default tables: either partner may read and write.
-- Reading profiles cannot require *being* a partner, or the second person
-- could never see the first before creating their own row.
create policy shared_read   on public.profiles          for select using (auth.uid() is not null);
create policy own_update    on public.profiles          for update using (id = auth.uid());
-- Claim your own profile, once, and only while fewer than two exist. This is
-- what caps the whole application at two people.
create policy claim_self    on public.profiles          for insert
  with check (id = auth.uid() and public.profile_count() < 2);

create policy shared_read   on public.settings          for select using (public.is_partner());
create policy shared_write  on public.settings          for update using (public.is_partner());

create policy shared_read   on public.presence          for select using (public.is_partner());
create policy own_write     on public.presence          for insert with check (user_id = auth.uid());
create policy own_modify    on public.presence          for update using (user_id = auth.uid());

create policy shared_read   on public.pulses            for select using (public.is_partner());
create policy own_send      on public.pulses            for insert with check (from_user = auth.uid());
create policy mark_seen     on public.pulses            for update using (to_user = auth.uid());

create policy shared_read   on public.prompts           for select using (public.is_partner());
create policy shared_read   on public.daily_questions   for select using (public.is_partner());
create policy shared_read   on public.know_me_rounds    for select using (public.is_partner());
create policy shared_read   on public.know_me_questions for select using (public.is_partner());

create policy shared_read   on public.timeline_entries  for select using (public.is_partner());
create policy own_write     on public.timeline_entries  for insert with check (author_id = auth.uid());
create policy own_modify    on public.timeline_entries  for update using (public.is_partner());
create policy own_delete    on public.timeline_entries  for delete using (author_id = auth.uid());

create policy shared_read   on public.nightly_checkins  for select using (public.is_partner());
create policy own_write     on public.nightly_checkins  for insert with check (user_id = auth.uid());
create policy own_modify    on public.nightly_checkins  for update using (user_id = auth.uid());

create policy shared_read   on public.jar_questions     for select using (public.is_partner());
create policy own_ask       on public.jar_questions     for insert with check (from_user = auth.uid());
create policy own_answer    on public.jar_questions     for update using (to_user = auth.uid());

create policy shared_read   on public.goodnights        for select using (public.is_partner());
create policy own_press     on public.goodnights        for insert with check (user_id = auth.uid());

create policy own_push      on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- --- Mutual reveal, enforced by the database ---------------------------------
-- You may read an answer if it is your own, or if you have already answered
-- that same question. There is no client-side path around this.
create policy mutual_reveal on public.question_answers for select using (
  user_id = auth.uid()
  or exists (
    select 1 from public.question_answers mine
    where mine.question_id = question_answers.question_id
      and mine.user_id = auth.uid()
  )
);
create policy own_answer on public.question_answers for insert with check (user_id = auth.uid());

create policy mutual_reveal on public.know_me_responses for select using (
  user_id = auth.uid()
  or exists (
    select 1 from public.know_me_responses mine
    where mine.round_id = know_me_responses.round_id
      and mine.user_id = auth.uid()
  )
);
create policy own_response on public.know_me_responses for insert with check (user_id = auth.uid());

-- --- Capsules stay sealed until their unlock time ---------------------------
create policy sealed_until_unlock on public.capsules for select using (
  author_id = auth.uid() or now() >= unlock_at
);
create policy own_write  on public.capsules for insert with check (author_id = auth.uid());
create policy mark_open  on public.capsules for update using (public.is_partner());

-- =============================================================================
-- Realtime
-- =============================================================================
alter publication supabase_realtime add table public.presence;
alter publication supabase_realtime add table public.pulses;
alter publication supabase_realtime add table public.question_answers;
alter publication supabase_realtime add table public.know_me_responses;
alter publication supabase_realtime add table public.timeline_entries;
alter publication supabase_realtime add table public.goodnights;
alter publication supabase_realtime add table public.jar_questions;

-- =============================================================================
-- Storage — a single private bucket for photos and other media
-- =============================================================================
insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;

create policy "partners read media" on storage.objects
  for select using (bucket_id = 'media' and public.is_partner());
create policy "partners upload media" on storage.objects
  for insert with check (bucket_id = 'media' and public.is_partner());
create policy "partners delete own media" on storage.objects
  for delete using (bucket_id = 'media' and owner = auth.uid());
