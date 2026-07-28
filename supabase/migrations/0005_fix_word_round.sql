-- =============================================================================
-- 0005 — fix `column reference "day" is ambiguous` in ensure_word_round.
--
-- The cause
-- ---------
-- The function was declared `returns table (id uuid, day date, ...)`. In
-- PL/pgSQL those output columns are in scope as *variables*, so `on conflict
-- (day)` had two candidate meanings — the output parameter and the real
-- column — and Postgres refused to guess.
--
-- Note this only bites PL/pgSQL. The other `returns table` functions in this
-- schema are `language sql`, which performs no variable substitution, so they
-- were never at risk.
--
-- The fix
-- -------
-- Return a bare uuid. No output parameters, no shadowing, nothing to be
-- ambiguous about.
--
-- While here, `score_word_guess` is dropped. The client derives the day's word
-- itself (`wordForDay` in lib/words.ts) and scores guesses locally, so the
-- server never scored anything and the answer was never actually hidden from
-- the browser. Keeping a function that implies otherwise is worse than not
-- having it: see the README for why that tradeoff is deliberate.
-- =============================================================================

-- The return type changes, so it must be dropped rather than replaced.
drop function if exists public.ensure_word_round(date, text);
drop function if exists public.score_word_guess(uuid, text);

create function public.ensure_word_round(p_day date, p_answer text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  -- Both clients derive the same word from the date, so whoever arrives first
  -- creates the round and the other simply joins it.
  insert into public.word_rounds (day, answer)
  values (p_day, lower(p_answer))
  on conflict (day) do nothing;

  select r.id into v_id from public.word_rounds r where r.day = p_day;
  return v_id;
end;
$$;
