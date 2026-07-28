/**
 * Day handling.
 *
 * "Today" is deliberately the *viewer's* local date, not a UTC date. If you are
 * in different timezones for a stretch, whoever wakes up first opens the day
 * and the other joins it when their own date rolls over. Keying on a plain
 * `YYYY-MM-DD` string keeps the mutual-reveal join trivial.
 */
export function localDay(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** "Tuesday, 28 July" */
export function prettyDay(day: string): string {
  return parseDay(day).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** Relative, human, and short: "just now", "12m", "3h", "2d". */
export function ago(iso: string | null | undefined): string {
  if (!iso) return "—";
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 45) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  const days = Math.floor(secs / 86400);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export type Countdown = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  past: boolean;
};

export function countdown(toIso: string): Countdown {
  let ms = new Date(toIso).getTime() - Date.now();
  const past = ms <= 0;
  ms = Math.abs(ms);
  return {
    days: Math.floor(ms / 86400000),
    hours: Math.floor((ms % 86400000) / 3600000),
    minutes: Math.floor((ms % 3600000) / 60000),
    seconds: Math.floor((ms % 60000) / 1000),
    past,
  };
}

/** Whole days between an anniversary and today. */
export function daysSince(day: string): number {
  const then = parseDay(day).getTime();
  const now = parseDay(localDay()).getTime();
  return Math.round((now - then) / 86400000);
}

/**
 * The next few "round" day-counts and anniversaries worth celebrating, so the
 * app can surface one without anybody having to do arithmetic.
 */
export function nextMilestone(anniversary: string): { label: string; date: Date } | null {
  const start = parseDay(anniversary);
  const now = new Date();
  const candidates: { label: string; date: Date }[] = [];

  for (const n of [100, 500, 1000, 1500, 2000, 2500, 3000, 5000, 7500, 10000]) {
    const d = new Date(start.getTime() + n * 86400000);
    if (d > now) candidates.push({ label: `${n.toLocaleString()} days`, date: d });
  }
  for (let y = 1; y <= 60; y++) {
    const d = new Date(start);
    d.setFullYear(start.getFullYear() + y);
    if (d > now) candidates.push({ label: `${y} year${y > 1 ? "s" : ""}`, date: d });
  }

  candidates.sort((a, b) => a.date.getTime() - b.date.getTime());
  return candidates[0] ?? null;
}

/** Same month and day, any earlier year — powers "one year ago today". */
export function isSameMonthDay(day: string, ref: string): boolean {
  return day.slice(5) === ref.slice(5) && day.slice(0, 4) !== ref.slice(0, 4);
}
