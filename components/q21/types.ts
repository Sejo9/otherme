import type { Tier } from "@/lib/types";

export type Side = { responded: boolean; skipped: boolean; body: string | null };

export type Q21Question = {
  idx: number;
  body: string;
  tier: Tier;
  me: Side;
  them: Side;
  revealed: boolean;
  skipped_together: boolean;
};

export type Q21State = {
  id: string;
  status: "active" | "done";
  started_by: string;
  created_at: string;
  questions: Q21Question[];
};

/**
 * The five states a question can be in. Derived rather than stored, so the
 * database only ever holds what each person actually did.
 */
export type QuestionPhase =
  | "open" // nobody has responded, or you have not
  | "skip-proposed-by-them" // they asked to skip; you have not responded
  | "waiting-on-them" // you answered, they have not
  | "skip-waiting" // you proposed a skip, they have not responded
  | "skip-declined" // you proposed a skip, they answered anyway
  | "revealed" // both answered
  | "skipped"; // both agreed to skip

export function phaseOf(q: Q21Question): QuestionPhase {
  if (q.revealed) return "revealed";
  if (q.skipped_together) return "skipped";

  if (q.me.skipped) {
    // They answered rather than agreeing, so the skip did not carry.
    return q.them.responded && !q.them.skipped ? "skip-declined" : "skip-waiting";
  }

  if (q.me.responded) return "waiting-on-them";
  if (q.them.skipped) return "skip-proposed-by-them";
  return "open";
}

/** A question needs something from you in all of these. */
export function needsYou(q: Q21Question): boolean {
  const phase = phaseOf(q);
  return phase === "open" || phase === "skip-proposed-by-them" || phase === "skip-declined";
}

export function isSettled(q: Q21Question): boolean {
  return q.revealed || q.skipped_together;
}
