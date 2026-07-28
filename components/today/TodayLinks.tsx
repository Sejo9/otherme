"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { notifyPartner } from "@/lib/push";
import { localDay } from "@/lib/day";
import type { Profile } from "@/lib/types";
import { Flash, useFlash } from "@/components/ui";
import { dayIsStale, type TodaySnapshot } from "./types";

type Status = "waiting-on-you" | "waiting-on-them" | "done";

const COPY: Record<Status, { note: string; cta: string }> = {
  "waiting-on-you": { note: "Your turn", cta: "Answer" },
  "waiting-on-them": { note: "Answered — waiting for them", cta: "Sealed" },
  done: { note: "Both in", cta: "Open" },
};

/** RLS only ever tells you whether *you* have gone; that is the point. */
function statusOf(mine: boolean, both: boolean): Status {
  if (!mine) return "waiting-on-you";
  return both ? "done" : "waiting-on-them";
}

function Row({
  href,
  icon,
  title,
  status,
}: {
  href: string;
  icon: string;
  title: string;
  status: Status;
}) {
  const copy = COPY[status];

  return (
    <Link
      href={href}
      prefetch
      className="press flex items-center gap-3 border-b border-line px-4 py-3.5 last:border-b-0"
    >
      <span className="w-5 text-center text-base">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-[0.75rem] text-ink-faint">{copy.note}</p>
      </div>
      <span
        className={`shrink-0 rounded-full px-2.5 py-1 text-[0.6875rem] font-medium ${
          status === "waiting-on-you"
            ? "bg-ink text-bg"
            : "border border-line text-ink-faint"
        }`}
      >
        {copy.cta}
      </span>
    </Link>
  );
}

export default function TodayLinks({
  me,
  partner,
  serverDay,
  snapshot,
}: {
  me: Profile;
  partner: Profile | null;
  serverDay: string;
  snapshot: TodaySnapshot | null;
}) {
  const [question, setQuestion] = useState<Status>(
    statusOf(snapshot?.question.mine ?? false, snapshot?.question.both ?? false)
  );
  const [knowMe, setKnowMe] = useState<Status>(
    statusOf(snapshot?.know_me.mine ?? false, snapshot?.know_me.both ?? false)
  );
  const [goodnight, setGoodnight] = useState(
    snapshot?.goodnight ?? { me: false, them: false }
  );
  const [flash, setFlash] = useFlash();

  // Only used if the server's idea of "today" turns out to be wrong.
  const [day, setDay] = useState(serverDay);

  const refresh = useCallback(async (forDay: string) => {
    const { data } = await supabaseBrowser().rpc("today_snapshot", { p_day: forDay });
    const fresh = data as TodaySnapshot | null;
    if (!fresh) return;

    setQuestion(statusOf(fresh.question.mine, fresh.question.both));
    setKnowMe(statusOf(fresh.know_me.mine, fresh.know_me.both));
    setGoodnight(fresh.goodnight);
  }, []);

  useEffect(() => {
    const clientDay = localDay();

    // The common path does nothing here: the server already rendered the right
    // day and the right statuses.
    if (dayIsStale(serverDay, clientDay)) {
      setDay(clientDay);
      refresh(clientDay);
    }
  }, [serverDay, refresh]);

  useEffect(() => {
    const sb = supabaseBrowser();

    const channel = sb
      .channel("today-links")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "goodnights" },
        ({ new: row }) => {
          const g = row as { day: string; user_id: string };
          if (g.day !== day) return;
          setGoodnight((prev) =>
            g.user_id === me.id ? { ...prev, me: true } : { ...prev, them: true }
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "question_answers" },
        () => refresh(day)
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "know_me_responses" },
        () => refresh(day)
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [me.id, day, refresh]);

  async function pressGoodnight() {
    if (goodnight.me) return;
    navigator.vibrate?.(20);
    setGoodnight((p) => ({ ...p, me: true }));

    await supabaseBrowser().from("goodnights").insert({ day, user_id: me.id });

    notifyPartner({
      title: me.display_name,
      body: goodnight.them ? "said goodnight too 🌙" : "said goodnight 🌙",
      url: "/",
      tag: "goodnight",
    });
    setFlash(goodnight.them ? "Goodnight 🌙" : "Waiting for them…");
  }

  const bothIn = goodnight.me && goodnight.them;

  return (
    <>
      <div className="card overflow-hidden">
        <Row href="/question" icon="✎" title="Today's question" status={question} />
        <Row href="/knowme" icon="◆" title="How well do you know me" status={knowMe} />
      </div>

      <button
        onClick={pressGoodnight}
        disabled={goodnight.me}
        className="press mt-3 w-full rounded-[1.25rem] border border-line bg-raised px-4 py-4 text-center"
      >
        <p className="text-sm font-medium">
          {bothIn
            ? "🌙 Goodnight, both of you"
            : goodnight.me
              ? `Waiting for ${partner?.display_name ?? "them"}…`
              : goodnight.them
                ? `${partner?.display_name ?? "They"} is waiting for you`
                : "Goodnight"}
        </p>
        <p className="mt-0.5 text-[0.75rem] text-ink-faint">
          {bothIn ? "That's the day closed." : "Both of you press it. It waits."}
        </p>
      </button>

      <Flash>{flash}</Flash>
    </>
  );
}
