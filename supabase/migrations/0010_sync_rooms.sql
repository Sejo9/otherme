-- =============================================================================
-- 0010 — Watching together, and one room model for both.
--
-- Watching is the same problem as listening: an anchored position, a queue,
-- and reactions pinned to a point in the media. Rather than a parallel set of
-- `watch_*` tables, the listen tables are generalised into `sync_*` keyed by
-- `kind`, so both share one engine and can be in use at the same time.
--
-- Everything already in the listen tables is carried across. The steps are
-- guarded, so this runs cleanly whether or not 0009 was applied first.
--
-- On what cannot be done: Netflix, Disney+, HBO and Prime protect their
-- players with DRM and expose no scriptable playback position, so there is
-- nothing to synchronise against and no honest way to build it. The watchlist
-- below exists partly because of that — it will happily hold a title you can
-- only watch on Netflix, so deciding *what* to watch together still lives
-- here even when the playing does not.
-- =============================================================================

create table if not exists public.sync_rooms (
  kind        text primary key check (kind in ('listen', 'watch')),
  source      text check (source in ('youtube', 'upload')),
  track_key   text,
  track_ref   text,
  title       text,
  added_by    uuid references public.profiles (id) on delete set null,
  note        text,
  duration_ms int,
  playing     boolean     not null default false,
  position_ms int         not null default 0,
  anchor_at   timestamptz not null default now(),
  controller  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);

insert into public.sync_rooms (kind) values ('listen'), ('watch')
on conflict (kind) do nothing;

create table if not exists public.sync_queue (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('listen', 'watch')),
  added_by   uuid not null references public.profiles (id) on delete cascade,
  source     text not null check (source in ('youtube', 'upload')),
  track_key  text not null,
  track_ref  text not null,
  title      text,
  note       text,
  played_at  timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists sync_queue_pending_idx
  on public.sync_queue (kind, played_at nulls first, created_at);

create table if not exists public.sync_reactions (
  id          uuid primary key default gen_random_uuid(),
  track_key   text not null,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  position_ms int  not null,
  emoji       text,
  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists sync_reactions_track_idx
  on public.sync_reactions (track_key, position_ms);

-- --- carry across anything from 0009 ----------------------------------------
do $$
begin
  if to_regclass('public.listen_room') is not null then
    update public.sync_rooms s
    set source = l.source, track_key = l.track_key, track_ref = l.track_ref,
        title = l.title, added_by = l.added_by, note = l.note,
        duration_ms = l.duration_ms, playing = l.playing,
        position_ms = l.position_ms, anchor_at = l.anchor_at,
        controller = l.controller, updated_at = l.updated_at
    from public.listen_room l
    where s.kind = 'listen';
  end if;

  if to_regclass('public.listen_queue') is not null then
    insert into public.sync_queue
      (id, kind, added_by, source, track_key, track_ref, title, note, played_at, created_at)
    select id, 'listen', added_by, source, track_key, track_ref, title, note, played_at, created_at
    from public.listen_queue
    on conflict (id) do nothing;
  end if;

  if to_regclass('public.listen_reactions') is not null then
    insert into public.sync_reactions
      (id, track_key, author_id, position_ms, emoji, note, created_at)
    select id, track_key, author_id, position_ms, emoji, note, created_at
    from public.listen_reactions
    on conflict (id) do nothing;
  end if;
end $$;

drop function if exists public.listen_snapshot();
drop function if exists public.listen_control(boolean, int);
drop function if exists public.listen_set_track(text, text, text, text, int, uuid);
drop function if exists public.listen_next();

drop table if exists public.listen_reactions;
drop table if exists public.listen_queue;
drop table if exists public.listen_room;

-- --- the watchlist ----------------------------------------------------------
-- Deliberately accepts things this app cannot play. `source` is null for those
-- and `where_to_watch` carries the service name, so the list stays useful for
-- everything you actually watch, not just what happens to be embeddable.
create table if not exists public.watch_list (
  id             uuid primary key default gen_random_uuid(),
  added_by       uuid not null references public.profiles (id) on delete cascade,
  title          text not null,
  source         text check (source in ('youtube', 'upload')),
  track_ref      text,
  where_to_watch text,
  url            text,
  note           text,
  status         text not null default 'want' check (status in ('want', 'watching', 'watched')),
  watched_at     timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists watch_list_status_idx on public.watch_list (status, created_at desc);

create table if not exists public.watch_ratings (
  item_id    uuid not null references public.watch_list (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  stars      int  not null check (stars between 1 and 5),
  note       text,
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);

alter table public.sync_rooms     enable row level security;
alter table public.sync_queue     enable row level security;
alter table public.sync_reactions enable row level security;
alter table public.watch_list     enable row level security;
alter table public.watch_ratings  enable row level security;

create policy shared_read  on public.sync_rooms     for select using (public.is_partner());
create policy shared_write on public.sync_rooms     for update using (public.is_partner());

create policy shared_read  on public.sync_queue     for select using (public.is_partner());
create policy own_add      on public.sync_queue     for insert with check (added_by = auth.uid());
create policy shared_mark  on public.sync_queue     for update using (public.is_partner());
create policy shared_remove on public.sync_queue    for delete using (public.is_partner());

create policy shared_read  on public.sync_reactions for select using (public.is_partner());
create policy own_react    on public.sync_reactions for insert with check (author_id = auth.uid());
create policy own_remove   on public.sync_reactions for delete using (author_id = auth.uid());

create policy shared_read  on public.watch_list     for select using (public.is_partner());
create policy own_add      on public.watch_list     for insert with check (added_by = auth.uid());
create policy shared_edit  on public.watch_list     for update using (public.is_partner());
create policy shared_drop  on public.watch_list     for delete using (public.is_partner());

create policy shared_read  on public.watch_ratings  for select using (public.is_partner());
create policy own_rate     on public.watch_ratings  for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter publication supabase_realtime add table public.sync_rooms;
alter publication supabase_realtime add table public.sync_queue;
alter publication supabase_realtime add table public.sync_reactions;
alter publication supabase_realtime add table public.watch_list;

-- =============================================================================
-- Room control. Same four verbs as before, now taking a kind.
-- =============================================================================
create or replace function public.sync_snapshot(p_kind text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_room public.sync_rooms;
begin
  if v_uid is null or not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'not one of the two people';
  end if;

  select * into v_room from public.sync_rooms where kind = p_kind;

  return jsonb_build_object(
    'server_now', now(),
    'room', to_jsonb(v_room),
    'queue', (
      select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at), '[]'::jsonb)
      from public.sync_queue q
      where q.kind = p_kind and q.played_at is null
    ),
    'reactions', (
      select coalesce(jsonb_agg(to_jsonb(r) order by r.position_ms), '[]'::jsonb)
      from public.sync_reactions r
      where r.track_key = v_room.track_key
    )
  );
end;
$$;

create or replace function public.sync_control(
  p_kind text,
  p_playing boolean,
  p_position_ms int
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'not one of the two people';
  end if;

  update public.sync_rooms
  set playing     = p_playing,
      position_ms = greatest(0, p_position_ms),
      anchor_at   = now(),
      controller  = v_uid,
      updated_at  = now()
  where kind = p_kind;

  return public.sync_snapshot(p_kind);
end;
$$;

create or replace function public.sync_set_track(
  p_kind text,
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

  update public.sync_rooms
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
  where kind = p_kind;

  if p_queue_id is not null then
    update public.sync_queue set played_at = now() where id = p_queue_id;
  end if;

  return public.sync_snapshot(p_kind);
end;
$$;

create or replace function public.sync_next(p_kind text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_next public.sync_queue;
begin
  select * into v_next
  from public.sync_queue
  where kind = p_kind and played_at is null
  order by created_at
  limit 1;

  if v_next.id is null then
    update public.sync_rooms
    set playing = false, position_ms = 0, anchor_at = now(), updated_at = now()
    where kind = p_kind;
    return public.sync_snapshot(p_kind);
  end if;

  return public.sync_set_track(
    p_kind, v_next.source, v_next.track_ref, v_next.title, v_next.note, null, v_next.id
  );
end;
$$;
