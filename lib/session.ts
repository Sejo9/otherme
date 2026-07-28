import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase/server";
import type { Profile, Settings } from "./types";

export type Session = {
  me: Profile;
  partner: Profile | null;
  settings: Settings;
};

/**
 * Every authenticated page starts here. Loads the signed-in profile, the other
 * profile, and the shared settings row in one round trip.
 */
export async function requireSession(): Promise<Session> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profiles }, { data: settings }] = await Promise.all([
    supabase.from("profiles").select("*"),
    supabase.from("settings").select("*").single(),
  ]);

  const list = (profiles ?? []) as Profile[];
  const me = list.find((p) => p.id === user.id);

  // Signed in but no profile row: the second account was created without being
  // finished off. Send them to onboarding rather than a broken page.
  if (!me) redirect("/welcome");

  return {
    me,
    partner: list.find((p) => p.id !== user.id) ?? null,
    settings: settings as Settings,
  };
}
