export type Accent = "amber" | "rose";
export type Weather = "sunny" | "partly" | "overcast" | "fog" | "rain" | "storm";
export type PulseKind = "thinking" | "miss" | "love" | "proud" | "hug" | "sorry";
export type Tier = "light" | "reflective" | "deep" | "spicy";
export type EntryKind =
  | "photo"
  | "note"
  | "appreciation"
  | "milestone"
  | "song"
  | "joke"
  | "place"
  | "voice";

export type GameKind = "connect4" | "reversi";
export type GameStatus = "active" | "won" | "draw" | "resigned";

export type Profile = {
  id: string;
  display_name: string;
  accent: Accent;
  avatar_path: string | null;
  timezone: string;
  created_at: string;
};

export type Settings = {
  id: boolean;
  anniversary: string | null;
  apart: boolean;
  reunion_at: string | null;
  reunion_label: string | null;
  enabled_tiers: Tier[];
  updated_at: string;
};

export type Presence = {
  user_id: string;
  weather: Weather;
  battery: number;
  activity: string;
  note: string | null;
  available_to_call: boolean;
  heading_home_at: string | null;
  updated_at: string;
};

export type Pulse = {
  id: string;
  from_user: string;
  to_user: string;
  kind: PulseKind;
  seen_at: string | null;
  created_at: string;
};

export type DailyQuestion = { id: string; day: string; prompt_id: string; created_at: string };
export type Prompt = { id: string; body: string; tier: Tier; active: boolean };
export type QuestionAnswer = {
  id: string;
  question_id: string;
  user_id: string;
  body: string;
  created_at: string;
};

export type KnowMeRound = {
  id: string;
  day: string;
  body: string;
  options: string[];
  created_at: string;
};
export type KnowMeResponse = {
  id: string;
  round_id: string;
  user_id: string;
  self_choice: number;
  prediction: number;
  created_at: string;
};
export type KnowMeScore = { user_id: string; correct: number; total: number };

export type TimelineEntry = {
  id: string;
  author_id: string;
  kind: EntryKind;
  title: string | null;
  body: string | null;
  media_path: string | null;
  link_url: string | null;
  place_name: string | null;
  lat: number | null;
  lng: number | null;
  occurred_on: string;
  pinned: boolean;
  created_at: string;
  /** Set on a scheduled voice note: hidden from them until this passes. */
  deliver_at: string | null;
  duration_ms: number | null;
};

export type Game = {
  id: string;
  kind: GameKind;
  state: Record<string, unknown>;
  turn: string | null;
  winner: string | null;
  status: GameStatus;
  started_by: string;
  move_count: number;
  last_move: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type GameRecord = { kind: GameKind; user_id: string; wins: number; draws: number };

export type NightlyCheckin = {
  id: string;
  user_id: string;
  day: string;
  high: string | null;
  low: string | null;
  appreciation: string | null;
  created_at: string;
};

export type JarQuestion = {
  id: string;
  from_user: string;
  to_user: string;
  body: string;
  answer: string | null;
  answered_at: string | null;
  created_at: string;
};

export type Capsule = {
  id: string;
  author_id: string;
  title: string | null;
  body: string;
  unlock_at: string;
  opened_at: string | null;
  created_at: string;
};

export type Goodnight = { day: string; user_id: string; pressed_at: string };

// ---------------------------------------------------------------------------
// Display metadata. Kept next to the types so labels and emoji stay in one
// place rather than drifting across components.
// ---------------------------------------------------------------------------
export const WEATHER: Record<Weather, { icon: string; label: string; hint: string }> = {
  sunny: { icon: "☀️", label: "Sunny", hint: "Genuinely good day" },
  partly: { icon: "⛅", label: "Partly cloudy", hint: "Mostly fine" },
  overcast: { icon: "☁️", label: "Overcast", hint: "Flat, not bad" },
  fog: { icon: "🌫️", label: "Fog", hint: "Can't think straight" },
  rain: { icon: "🌧️", label: "Rain", hint: "Sad, tender" },
  storm: { icon: "⛈️", label: "Storm", hint: "Hard day, be gentle" },
};

export const PULSES: Record<PulseKind, { icon: string; label: string }> = {
  thinking: { icon: "💭", label: "Thinking of you" },
  miss: { icon: "🌙", label: "Missing you" },
  love: { icon: "❤️", label: "Love you" },
  proud: { icon: "✨", label: "Proud of you" },
  hug: { icon: "🫂", label: "Sending a hug" },
  sorry: { icon: "🕊️", label: "I'm sorry" },
};

export const ACTIVITIES: { id: string; icon: string; label: string }[] = [
  { id: "unset", icon: "•", label: "Not saying" },
  { id: "working", icon: "💻", label: "Working" },
  { id: "meeting", icon: "🎧", label: "In a meeting" },
  { id: "commuting", icon: "🚃", label: "Commuting" },
  { id: "eating", icon: "🍽️", label: "Eating" },
  { id: "errands", icon: "🛒", label: "Errands" },
  { id: "moving", icon: "🏃", label: "Moving my body" },
  { id: "resting", icon: "🛋️", label: "Resting" },
  { id: "social", icon: "👥", label: "With people" },
  { id: "asleep", icon: "😴", label: "Asleep" },
  { id: "thinking_of_you", icon: "💗", label: "Thinking of you" },
];

export const ENTRY_KINDS: Record<EntryKind, { icon: string; label: string }> = {
  photo: { icon: "📷", label: "Photo" },
  note: { icon: "📝", label: "Note" },
  appreciation: { icon: "💛", label: "Appreciation" },
  milestone: { icon: "🎉", label: "Milestone" },
  song: { icon: "🎵", label: "Song" },
  joke: { icon: "😂", label: "Inside joke" },
  place: { icon: "📍", label: "Place" },
  voice: { icon: "🎙️", label: "Voice note" },
};

export const GAMES: Record<GameKind, { name: string; blurb: string; icon: string }> = {
  connect4: {
    name: "Four in a row",
    blurb: "Quick. One move each, whenever you pass your phone.",
    icon: "🔴",
  },
  reversi: {
    name: "Reversi",
    blurb: "Slower and meaner. The lead changes hands constantly.",
    icon: "⚫",
  },
};
