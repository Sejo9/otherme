-- =============================================================================
-- 0011 — Chat.
--
-- No mutual-reveal games here. This is the one place in the app where a
-- message should simply arrive: the whole point of everything else is delayed
-- or negotiated disclosure, and a couple still needs somewhere to just talk.
--
-- Deletes are soft, so a reply pointing at a removed message does not dangle
-- and the thread keeps its shape.
-- =============================================================================

create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references public.profiles (id) on delete cascade,
  body       text,
  media_path text,
  reply_to   uuid references public.messages (id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at  timestamptz,
  deleted_at timestamptz,
  constraint message_has_content check (
    deleted_at is not null or body is not null or media_path is not null
  )
);

create index if not exists messages_recent_idx on public.messages (created_at desc);

-- One row each. `last_read_at` is the entire read-receipt mechanism: anything
-- newer than the other person's marker is unread by them.
create table if not exists public.chat_reads (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now()
);

alter table public.messages    enable row level security;
alter table public.chat_reads  enable row level security;

create policy shared_read on public.messages for select using (public.is_partner());
create policy own_send    on public.messages for insert with check (author_id = auth.uid());
create policy own_edit    on public.messages for update using (author_id = auth.uid());

create policy shared_read on public.chat_reads for select using (public.is_partner());
create policy own_marker  on public.chat_reads for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.chat_reads;

-- How many of their messages you have not seen. Drives the tab badge, so it
-- has to be one cheap call.
create or replace function public.chat_unread()
returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int
  from public.messages m
  where m.author_id <> auth.uid()
    and m.deleted_at is null
    and m.created_at > coalesce(
      (select r.last_read_at from public.chat_reads r where r.user_id = auth.uid()),
      'epoch'::timestamptz
    );
$$;

-- Moves your marker to now. Separate from the table write so the client never
-- has to care whether its row already exists.
create or replace function public.chat_mark_read()
returns void
language sql security definer set search_path = public as $$
  insert into public.chat_reads (user_id, last_read_at)
  values (auth.uid(), now())
  on conflict (user_id) do update set last_read_at = now();
$$;
