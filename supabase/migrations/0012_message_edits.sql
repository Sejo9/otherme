-- =============================================================================
-- 0012 — A five minute window to fix what you just said.
--
-- The window is enforced by a trigger rather than by the UI, because a rule
-- that only exists in the client is not a rule. It also cannot be expressed as
-- an RLS policy: policies see the whole row, not which columns changed, and
-- removing a message must stay possible forever — only changing the *words* is
-- time-limited.
--
-- `edited_at` is stamped here too, so the client cannot forget to set it or
-- claim a message was never edited.
-- =============================================================================

create or replace function public.enforce_message_edit_window()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Only interested in the body changing.
  if new.body is not distinct from old.body then
    return new;
  end if;

  -- Removing a message clears its body and is allowed at any age.
  if new.deleted_at is not null then
    return new;
  end if;

  if old.deleted_at is not null then
    raise exception 'that message was removed';
  end if;

  if old.created_at < now() - interval '5 minutes' then
    raise exception 'messages can only be edited for five minutes after sending';
  end if;

  if new.body is null or length(btrim(new.body)) = 0 then
    raise exception 'an edited message cannot be empty';
  end if;

  new.edited_at := now();
  return new;
end;
$$;

drop trigger if exists message_edit_window on public.messages;

create trigger message_edit_window
  before update on public.messages
  for each row
  execute function public.enforce_message_edit_window();
