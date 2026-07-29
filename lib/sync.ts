"use client";

/**
 * The synchronisation maths, kept away from any particular player.
 *
 * A room stores one anchored fact — "at this server time, playback was here" —
 * and every client derives its own target from it. That means no heartbeat to
 * miss, and a client that backgrounds, drops its connection or joins late is
 * correct again the instant it reads the row.
 */
export type RoomTiming = {
  playing: boolean;
  position_ms: number;
  anchor_at: string;
};

/** Where playback *should* be right now, in milliseconds. */
export function targetPosition(
  room: RoomTiming,
  clockOffsetMs: number,
  durationMs?: number | null
): number {
  if (!room.playing) return room.position_ms;

  const serverNow = Date.now() + clockOffsetMs;
  const elapsed = serverNow - new Date(room.anchor_at).getTime();
  const position = room.position_ms + Math.max(0, elapsed);

  return durationMs ? Math.min(position, durationMs) : position;
}

/**
 * What to do about the gap between where we are and where we should be.
 *
 * The thresholds are generous on purpose. You are listening on separate
 * speakers in separate rooms, so nobody hears both streams at once and a
 * fraction of a second is imperceptible — unlike a shared room, where it would
 * phase horribly. Correcting more aggressively than this produces audible
 * stutter and buys nothing.
 */
export type Correction =
  | { kind: "none" }
  | { kind: "rate"; rate: number }
  | { kind: "seek"; to: number };

export type Tolerance = {
  /** Below this, do nothing at all. */
  inSyncMs: number;
  /** Between inSyncMs and this, close the gap by adjusting rate. Above, seek. */
  nudgeLimitMs: number;
};

/**
 * Music, listened to apart. Nobody hears both streams, so a fraction of a
 * second is genuinely imperceptible.
 */
export const AUDIO_TOLERANCE: Tolerance = { inSyncMs: 750, nudgeLimitMs: 3000 };

/**
 * Video is tighter — not because the pictures phase, but because the whole
 * point is reacting to the same moment. Half a second late on a punchline is
 * noticeable in a way half a second late in a song is not.
 */
export const VIDEO_TOLERANCE: Tolerance = { inSyncMs: 400, nudgeLimitMs: 2500 };

export function correctionFor(
  actualMs: number,
  targetMs: number,
  canNudge: boolean,
  tolerance: Tolerance = AUDIO_TOLERANCE
): Correction {
  const drift = targetMs - actualMs;
  const magnitude = Math.abs(drift);

  if (magnitude < tolerance.inSyncMs) return { kind: "none" };

  // A small, steady rate change closes a modest gap invisibly. A seek would
  // not be. Only HTML media can do this smoothly; YouTube's rates are coarse,
  // so it seeks instead.
  if (canNudge && magnitude < tolerance.nudgeLimitMs) {
    return { kind: "rate", rate: drift > 0 ? 1.04 : 0.96 };
  }

  return { kind: "seek", to: targetMs };
}

/**
 * How far this device's clock is from the server's.
 *
 * Measured the same way NTP does it in miniature: halve the round trip and
 * assume it was symmetric. Two phones are usually within a few tens of
 * milliseconds of each other, but "usually" is not something to build timing
 * on.
 */
export function measureClockOffset(
  serverNowIso: string,
  requestStartedAt: number,
  requestFinishedAt: number
): number {
  const roundTrip = requestFinishedAt - requestStartedAt;
  const localMidpoint = requestStartedAt + roundTrip / 2;
  return new Date(serverNowIso).getTime() - localMidpoint;
}

export function clock(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0:00";
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
