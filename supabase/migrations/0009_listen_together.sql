-- =============================================================================
-- 0009 — Listening together.
--
-- How the sync works
-- ------------------
-- Nothing is broadcast continuously. The room stores a single anchored fact:
--
--     at `anchor_at` (server clock), playback was at `position_ms`,
--     and it was `playing` or not.
--
-- Every client derives its own target position from that:
--
--     target = position_ms + (now - anchor_at)      when playing
--     target = position_ms                          when paused
--
-- So a write only happens when someone actually does something — play, pause,
-- seek, change track — and a client that joins late, backgrounds, or drops its
-- connection re-derives the correct position immediately from one row. There
-- is no heartbeat to miss.
--
-- The anchor is written by the database, never the client, so the two phones
-- do not have to agree about what time it is. `listen_snapshot` hands back the
-- server clock alongside the room, letting each client measure its own offset.
--
-- On sources: `track_ref` is a YouTube video id or a storage path today. The
-- column is deliberately source-agnostic so Spotify (or anything else that
-- exposes play/seek) can be added without touching this schema.
-- =============================================================================

create table if not exists public.listen_room (
  id          boolean primary key default true check (id),
  source      text check (source in ('youtube', 'upload')),
  track_key   text,        -- 'youtube:VIDEOID' — stable across sessions
  track_ref   text,        -- video id, or storage path
  title       text,
  added_by    uuid references public.profiles (id) on delete set null,
  note        text,        -- why this one, for them
  duration_ms int,
  playing     boolean     not null default false,
  position_ms int         not null default 0,
  anchor_at   timestamptz not null default now(),
  controller  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);

insert into public.listen_room (id) values (true) on conflict (id) do nothing;

create table if not exists public.listen_queue (
  id         uuid primary key default gen_random_uuid(),
  added_by   uuid not null references public.profiles (id) on delete cascade,
  source     text not null check (source in ('youtube', 'upload')),
  track_key  text not null,
  track_ref  text not null,
  title      text,
  note       text,
  played_at  timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists listen_queue_pending_idx
  on public.listen_queue (played_at nulls first, created_at);

-- Reactions are keyed to the *track* and its position, not to a session, so
-- they accumulate. Play a song again a year later and what you both said the
-- first time surfaces at the same moments.
create table if not exists public.listen_reactions (
  id          uuid primary key default gen_random_uuid(),
  track_key   text not null,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  position_ms int  not null,
  emoji       text,
  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists listen_reactions_track_idx
  on public.listen_reactions (track_key, position_ms);

alter table public.listen_room      enable row level security;
alter table public.listen_queue     enable row level security;
alter table public.listen_reactions enable row level security;

create policy shared_read  on public.listen_room      for select using (public.is_partner());
create policy shared_write on public.listen_room      for update using (public.is_partner());

create policy shared_read  on public.listen_queue     for select using (public.is_partner());
create policy own_add      on public.listen_queue     for insert with check (added_by = auth.uid());
create policy shared_mark  on public.listen_queue     for update using (public.is_partner());
create policy own_remove   on public.listen_queue     for delete using (public.is_partner());

create policy shared_read  on public.listen_reactions for select using (public.is_partner());
create policy own_react    on public.listen_reactions for insert with check (author_id = auth.uid());
create policy own_remove   on public.listen_reactions for delete using (author_id = auth.uid());

alter publication supabase_realtime add table public.listen_room;
alter publication supabase_realtime add table public.listen_queue;
alter publication supabase_realtime add table public.listen_reactions;

-- -----------------------------------------------------------------------------
-- Reading the room
--
-- Returns the server clock too, so each client can work out how far its own
-- clock is off and stop that error leaking into the position maths.
-- -----------------------------------------------------------------------------
create or replace function public.listen_snapshot()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_room public.listen_room;
begin
  if v_uid is null or not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'not one of the two people';
  end if;

  select * into v_room from public.listen_room where id;

  return jsonb_build_object(
    'server_now', now(),
    'room', to_jsonb(v_room),
    'queue', (
      select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at), '[]'::jsonb)
      from public.listen_queue q
      where q.played_at is null
    ),
    'reactions', (
      select coalesce(jsonb_agg(to_jsonb(r) order by r.position_ms), '[]'::jsonb)
      from public.listen_reactions r
      where r.track_key = v_room.track_key
    )
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Controlling playback
--
-- One entry point for play, pause and seek. `anchor_at` is stamped with the
-- server clock here and nowhere else.
-- -----------------------------------------------------------------------------
create or replace function public.listen_control(p_playing boolean, p_position_ms int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'not one of the two people';
  end if;

  update public.listen_room
  set playing     = p_playing,
      position_ms = greatest(0, p_position_ms),
      anchor_at   = now(),
      controller  = v_uid,
      updated_at  = now()
  where id;

  return public.listen_snapshot();
end;
$$;

-- Puts a track on and starts it from the beginning, paused.
create or replace function public.listen_set_track(
  p_source text,
  p_track_ref text,
  p_title text,
  p_note text,
  p_duration_ms int,
  p_queue_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'not one of the two people';
  end if;

  update public.listen_room
  set source      = p_source,
      track_key   = p_source || ':' || p_track_ref,
      track_ref   = p_track_ref,
      title       = p_title,
      note        = p_note,
      duration_ms = p_duration_ms,
      added_by    = v_uid,
      playing     = false,
      position_ms = 0,
      anchor_at   = now(),
      controller  = v_uid,
      updated_at  = now()
  where id;

  if p_queue_id is not null then
    update public.listen_queue set played_at = now() where id = p_queue_id;
  end if;

  return public.listen_snapshot();
end;
$$;

-- Takes the oldest unplayed queue entry and makes it current.
create or replace function public.listen_next()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_next public.listen_queue;
begin
  select * into v_next
  from public.listen_queue
  where played_at is null
  order by created_at
  limit 1;

  if v_next.id is null then
    -- Nothing queued: stop rather than loop.
    update public.listen_room
    set playing = false, position_ms = 0, anchor_at = now(), updated_at = now()
    where id;
    return public.listen_snapshot();
  end if;

  return public.listen_set_track(
    v_next.source, v_next.track_ref, v_next.title, v_next.note, null, v_next.id
  );
end;
$$;
