export type Message = {
  id: string;
  author_id: string;
  body: string | null;
  media_path: string | null;
  reply_to: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

export type ChatRead = { user_id: string; last_read_at: string };

/** Kept in step with the trigger in migration 0012. */
export const EDIT_WINDOW_MS = 5 * 60 * 1000;

/**
 * Whether the Edit action should be offered.
 *
 * Advisory only — the database enforces the same window, so a message that
 * ages out mid-edit is refused there with a readable message rather than
 * silently going through.
 */
export function canEdit(message: Message, meId: string): boolean {
  if (message.author_id !== meId) return false;
  if (message.deleted_at) return false;
  if (!message.body) return false; // nothing to retype on a bare photo
  return Date.now() - new Date(message.created_at).getTime() < EDIT_WINDOW_MS;
}

export function editTimeLeft(message: Message): number {
  const left = EDIT_WINDOW_MS - (Date.now() - new Date(message.created_at).getTime());
  return Math.max(0, left);
}

/** A day heading plus the messages under it. */
export type DayGroup = { day: string; messages: Message[] };

export function groupByDay(messages: Message[]): DayGroup[] {
  const groups: DayGroup[] = [];

  for (const message of messages) {
    const day = message.created_at.slice(0, 10);
    const last = groups[groups.length - 1];
    if (last?.day === day) last.messages.push(message);
    else groups.push({ day, messages: [message] });
  }

  return groups;
}

/**
 * Whether a message should be visually joined to the one before it — same
 * author, close in time. Keeps a burst of messages reading as one thought.
 */
export function isContinuation(current: Message, previous: Message | undefined): boolean {
  if (!previous) return false;
  if (previous.author_id !== current.author_id) return false;
  if (current.reply_to) return false;

  const gap =
    new Date(current.created_at).getTime() - new Date(previous.created_at).getTime();
  return gap < 4 * 60 * 1000;
}
