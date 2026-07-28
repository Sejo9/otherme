import { cache } from "react";
import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase/server";
import type { Profile, Settings } from "./types";

export type Session = {
  me: Profile;
  partner: Profile | null;
  settings: Settings;
};

/**
 * Every authenticated page starts here.
 *
 * Wrapped in React `cache()`, so the layout and the page it renders share one
 * result instead of each paying for their own round trips. Without this, a
 * single navigation ran the identity check and both queries twice.
 *
 * Identity comes from `getClaims()`, which verifies the JWT locally against a
 * cached JWKS rather than asking the auth server on every request. See the
 * note in middleware.ts about asymmetric signing keys.
 */
export const requireSession = cache(async (): Promise<Session> => {
  const supabase = await supabaseServer();

  const { data: claimsResult } = await supabase.auth.getClaims();
  const userId = claimsResult?.claims?.sub;
  if (!userId) redirect("/login");

  const [{ data: profiles }, { data: settings }] = await Promise.all([
    supabase.from("profiles").select("*"),
    supabase.from("settings").select("*").single(),
  ]);

  const list = (profiles ?? []) as Profile[];
  const me = list.find((p) => p.id === userId);

  // Signed in but no profile row: the second account was created without being
  // finished off. Send them to onboarding rather than a broken page.
  if (!me) redirect("/welcome");

  return {
    me,
    partner: list.find((p) => p.id !== userId) ?? null,
    settings: settings as Settings,
  };
});
