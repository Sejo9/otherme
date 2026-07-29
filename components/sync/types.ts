import { AUDIO_TOLERANCE, VIDEO_TOLERANCE, type Tolerance } from "@/lib/sync";

export type SyncKind = "listen" | "watch";
export type SyncSource = "youtube" | "upload";

export type SyncRoom = {
  kind: SyncKind;
  source: SyncSource | null;
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
  kind: SyncKind;
  added_by: string;
  source: SyncSource;
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

export type SyncSnapshot = {
  server_now: string;
  room: SyncRoom;
  queue: QueueItem[];
  reactions: Reaction[];
};

/**
 * Everything that differs between listening and watching. The room engine
 * itself is identical, so the differences live here rather than in a fork.
 */
export type KindConfig = {
  heading: string;
  emptyTitle: string;
  emptyBody: string;
  /** Video fills the screen; audio hides the frame entirely. */
  showsPicture: boolean;
  tolerance: Tolerance;
  reactions: readonly string[];
  addPlaceholder: string;
  acceptFile: string;
  queueLabel: string;
};

export const KINDS: Record<SyncKind, KindConfig> = {
  listen: {
    heading: "Listening together",
    emptyTitle: "Nothing playing",
    emptyBody:
      "Put a song on and it starts on both your phones at the same moment. Whoever is not here yet will land in the right place when they open it.",
    showsPicture: false,
    tolerance: AUDIO_TOLERANCE,
    reactions: ["❤️", "🔥", "🥹", "😂", "🕺", "🎯"],
    addPlaceholder: "Paste a YouTube link",
    acceptFile: "audio/*",
    queueLabel: "Up next",
  },
  watch: {
    heading: "Watching together",
    emptyTitle: "Nothing on",
    emptyBody:
      "Queue something and press play — it starts on both screens at once. Anything you can only stream elsewhere still belongs on the watchlist below.",
    showsPicture: true,
    tolerance: VIDEO_TOLERANCE,
    reactions: ["😂", "😱", "❤️", "👀", "🤯", "😴"],
    addPlaceholder: "Paste a YouTube link",
    acceptFile: "video/*",
    queueLabel: "Up next",
  },
};
