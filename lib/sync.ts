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

export const IN_SYNC_MS = 750;
export const NUDGE_LIMIT_MS = 3000;

export function correctionFor(
  actualMs: number,
  targetMs: number,
  canNudge: boolean
): Correction {
  const drift = targetMs - actualMs;
  const magnitude = Math.abs(drift);

  if (magnitude < IN_SYNC_MS) return { kind: "none" };

  // A small, steady rate change closes a modest gap invisibly. A seek would be
  // audible. Only HTML audio can do this smoothly; YouTube's rates are coarse,
  // so it seeks instead.
  if (canNudge && magnitude < NUDGE_LIMIT_MS) {
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
