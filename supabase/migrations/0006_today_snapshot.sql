-- =============================================================================
-- 0006 — one call for the whole Today screen.
--
-- Today used to assemble itself from five client-side requests in two
-- waterfalls: pick the day's question, pick the know-me round, read the
-- goodnights, then go back for the answers and responses. Every one of those
-- was a separate round trip after the page had already rendered, which is why
-- the screen flashed skeletons even when navigation itself was instant.
--
-- This returns the lot in a single call, made server-side during the render.
--
-- On leaking: the function is SECURITY DEFINER and therefore bypasses RLS, so
-- it deliberately returns only *booleans* about the partner's progress, never
-- their content. `both` is computed as "mine AND theirs", so it cannot even
-- reveal that they have answered before you have — exactly what the mutual
-- reveal policy allows, and nothing more.
-- =============================================================================

create or replace function public.today_snapshot(p_day date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_q      public.daily_questions;
  v_round  public.know_me_rounds;
  v_prompt public.prompts;
  q_mine   boolean;
  q_both   boolean;
  k_mine   boolean;
  k_both   boolean;
  gn_me    boolean;
  gn_them  boolean;
begin
  if v_uid is null or not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'not one of the two people';
  end if;

  v_q := public.ensure_daily_question(p_day);
  v_round := public.ensure_know_me_round(p_day);

  select * into v_prompt from public.prompts where id = v_q.prompt_id;

  select exists (
    select 1 from public.question_answers a
    where a.question_id = v_q.id and a.user_id = v_uid
  ) into q_mine;

  select q_mine and exists (
    select 1 from public.question_answers a
    where a.question_id = v_q.id and a.user_id <> v_uid
  ) into q_both;

  select exists (
    select 1 from public.know_me_responses r
    where r.round_id = v_round.id and r.user_id = v_uid
  ) into k_mine;

  select k_mine and exists (
    select 1 from public.know_me_responses r
    where r.round_id = v_round.id and r.user_id <> v_uid
  ) into k_both;

  select exists (
    select 1 from public.goodnights g where g.day = p_day and g.user_id = v_uid
  ) into gn_me;

  select exists (
    select 1 from public.goodnights g where g.day = p_day and g.user_id <> v_uid
  ) into gn_them;

  return jsonb_build_object(
    'day', p_day,
    'question', jsonb_build_object(
      'id',   v_q.id,
      'body', v_prompt.body,
      'tier', v_prompt.tier,
      'mine', q_mine,
      'both', q_both
    ),
    'know_me', jsonb_build_object(
      'id',   v_round.id,
      'mine', k_mine,
      'both', k_both
    ),
    'goodnight', jsonb_build_object('me', gn_me, 'them', gn_them),
    'photos', (
      select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb)
      from public.timeline_entries e
      where e.kind = 'photo' and e.occurred_on = p_day
    ),
    -- Previously the client downloaded every entry from every earlier year and
    -- filtered in JavaScript. The comparison belongs here.
    'on_this_day', (
      select coalesce(jsonb_agg(to_jsonb(e) order by e.occurred_on desc), '[]'::jsonb)
      from public.timeline_entries e
      where to_char(e.occurred_on, 'MM-DD') = to_char(p_day, 'MM-DD')
        and e.occurred_on < date_trunc('year', p_day)
        and (e.deliver_at is null or now() >= e.deliver_at or e.author_id = v_uid)
    )
  );
end;
$$;
