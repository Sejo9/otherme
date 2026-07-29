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
