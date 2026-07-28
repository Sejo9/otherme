import { NextResponse } from "next/server";
import webpush from "web-push";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

/**
 * Delivers a push to the *other* person.
 *
 * The caller never names a recipient — the server derives it from the session,
 * so this endpoint cannot be used to send a notification anywhere else. It also
 * cannot be called at all without a valid session.
 */
export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  const { VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  if (!publicKey || !VAPID_PRIVATE_KEY) {
    // Push is optional: the app works without it, so this is not an error.
    return NextResponse.json({ sent: 0, reason: "push not configured" });
  }

  webpush.setVapidDetails(VAPID_SUBJECT || "mailto:hello@example.com", publicKey, VAPID_PRIVATE_KEY);

  const { title, body, url, tag } = (await request.json()) as {
    title?: string;
    body?: string;
    url?: string;
    tag?: string;
  };

  const admin = supabaseAdmin();

  // The partner is the other profile. Reading their subscriptions requires the
  // service role: RLS deliberately keeps push endpoints private to their owner.
  const { data: profiles } = await admin.from("profiles").select("id");
  const partnerId = (profiles ?? []).find((p) => p.id !== user.id)?.id;
  if (!partnerId) return NextResponse.json({ sent: 0, reason: "no partner yet" });

  const { data: subscriptions } = await admin
    .from("push_subscriptions")
    .select("*")
    .eq("user_id", partnerId);

  if (!subscriptions?.length) return NextResponse.json({ sent: 0, reason: "not subscribed" });

  const payload = JSON.stringify({
    title: title ?? "OtherMe",
    body: body ?? "",
    url: url ?? "/",
    tag,
  });

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        { TTL: 3600, urgency: "normal" }
      )
    )
  );

  // Prune endpoints the push service has retired, so they don't accumulate.
  const dead = results.flatMap((result, i) =>
    result.status === "rejected" &&
    [404, 410].includes((result.reason as { statusCode?: number })?.statusCode ?? 0)
      ? [subscriptions[i].endpoint]
      : []
  );
  if (dead.length) {
    await admin.from("push_subscriptions").delete().in("endpoint", dead);
  }

  return NextResponse.json({
    sent: results.filter((r) => r.status === "fulfilled").length,
    pruned: dead.length,
  });
}
