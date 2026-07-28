-- =============================================================================
-- 0004 — chess, checkers, and the daily word duel.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Two more turn-based games.
--
-- Nothing else changes: `state` is jsonb, so chess stores a FEN string and
-- checkers stores a grid, and the existing `only_on_your_turn` policy keeps
-- enforcing turn order for both.
-- -----------------------------------------------------------------------------
alter table public.games drop constraint if exists games_kind_check;

alter table public.games
  add constraint games_kind_check
  check (kind in ('connect4', 'reversi', 'chess', 'checkers'));

-- -----------------------------------------------------------------------------
-- 2. Word duel.
--
-- Not turn-based: you both attack the same hidden word independently and the
-- boards unlock when you have both finished. That is the same mutual-reveal
-- shape as the daily question, so it gets its own tables rather than being
-- forced into `games`, whose whole model is "exactly one of you may write".
-- -----------------------------------------------------------------------------
create table if not exists public.word_rounds (
  id         uuid primary key default gen_random_uuid(),
  day        date not null unique,
  answer     text not null check (char_length(answer) = 5),
  created_at timestamptz not null default now()
);

create table if not exists public.word_guesses (
  id          uuid primary key default gen_random_uuid(),
  round_id    uuid not null references public.word_rounds (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  guesses     jsonb not null default '[]'::jsonb,
  solved      boolean not null default false,
  finished    boolean not null default false,
  finished_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (round_id, user_id)
);

alter table public.word_rounds  enable row level security;
alter table public.word_guesses enable row level security;

-- The answer must stay hidden until you are done, or the game is pointless.
-- This returns the round without its answer while you are still playing.
create or replace function public.ensure_word_round(p_day date, p_answer text)
returns table (id uuid, day date, revealed_answer text)
language plpgsql security definer set search_path = public as $$
declare
  round public.word_rounds;
  done  boolean;
begin
  insert into public.word_rounds (day, answer)
  values (p_day, lower(p_answer))
  on conflict (day) do nothing;

  select * into round from public.word_rounds r where r.day = p_day;

  select coalesce(g.finished, false) into done
  from public.word_guesses g
  where g.round_id = round.id and g.user_id = auth.uid();

  return query select
    round.id,
    round.day,
    case when coalesce(done, false) then round.answer else null end;
end;
$$;

-- Checking a guess without handing over the answer.
create or replace function public.score_word_guess(p_round uuid, p_guess text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  answer   text;
  guess    text := lower(p_guess);
  result   text := '';
  pool     text := '';
  i        int;
  ch       text;
begin
  select r.answer into answer from public.word_rounds r where r.id = p_round;
  if answer is null then
    raise exception 'no such round';
  end if;

  -- Greens first, so a repeated letter cannot be marked yellow twice.
  for i in 1..5 loop
    if substr(guess, i, 1) = substr(answer, i, 1) then
      result := result || 'g';
    else
      result := result || '.';
      pool := pool || substr(answer, i, 1);
    end if;
  end loop;

  for i in 1..5 loop
    if substr(result, i, 1) = '.' then
      ch := substr(guess, i, 1);
      if position(ch in pool) > 0 then
        result := overlay(result placing 'y' from i for 1);
        pool := overlay(pool placing '' from position(ch in pool) for 1);
      end if;
    end if;
  end loop;

  return result;
end;
$$;

create or replace function public.word_duel_finished(p_round uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.word_guesses
    where round_id = p_round and user_id = auth.uid() and finished
  );
$$;

-- Rounds are readable; the answer column never travels except through
-- ensure_word_round, which withholds it until you are done.
create policy shared_read on public.word_rounds for select using (public.is_partner());

-- Their board unlocks only once you have finished your own.
create policy mutual_reveal on public.word_guesses for select using (
  user_id = auth.uid() or public.word_duel_finished(round_id)
);
create policy own_write  on public.word_guesses for insert with check (user_id = auth.uid());
create policy own_modify on public.word_guesses for update using (user_id = auth.uid());

create or replace function public.word_duel_record()
returns table (user_id uuid, solved int, played int, total_guesses int)
language sql stable security definer set search_path = public as $$
  select
    g.user_id,
    count(*) filter (where g.solved)::int as solved,
    count(*)::int as played,
    coalesce(sum(jsonb_array_length(g.guesses)), 0)::int as total_guesses
  from public.word_guesses g
  where g.finished
  group by g.user_id;
$$;

alter publication supabase_realtime add table public.word_guesses;
