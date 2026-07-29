export type ListenSource = "youtube" | "upload";

export type ListenRoom = {
  id: boolean;
  source: ListenSource | null;
  track_key: string | null;
  track_ref: string | null;
  title: string | null;
  added_by: string | null;
  note: string | null;
  duration_ms: number | null;
  playing: boolean;
  position_ms: number;
  anchor_at: string;
  controller: string | null;
  updated_at: string;
};

export type QueueItem = {
  id: string;
  added_by: string;
  source: ListenSource;
  track_key: string;
  track_ref: string;
  title: string | null;
  note: string | null;
  played_at: string | null;
  created_at: string;
};

export type Reaction = {
  id: string;
  track_key: string;
  author_id: string;
  position_ms: number;
  emoji: string | null;
  note: string | null;
  created_at: string;
};

export type ListenSnapshot = {
  server_now: string;
  room: ListenRoom;
  queue: QueueItem[];
  reactions: Reaction[];
};

export const REACTIONS = ["❤️", "🔥", "🥹", "😂", "🕺", "🎯"] as const;
