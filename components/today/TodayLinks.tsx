"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { notifyPartner } from "@/lib/push";
import { localDay } from "@/lib/day";
import type { Profile } from "@/lib/types";
import { Flash, useFlash } from "@/components/ui";

type Status = "loading" | "waiting-on-you" | "waiting-on-them" | "done";

const COPY: Record<Exclude<Status, "loading">, { note: string; cta: string }> = {
  "waiting-on-you": { note: "Your turn", cta: "Answer" },
  "waiting-on-them": { note: "Answered — waiting for them", cta: "Sealed" },
  done: { note: "Both in", cta: "Open" },
};

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
  const copy = status === "loading" ? null : COPY[status];

  return (
    <Link
      href={href}
      className="press flex items-center gap-3 border-b border-line px-4 py-3.5 last:border-b-0"
    >
      <span className="w-5 text-center text-base">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-[0.75rem] text-ink-faint">{copy?.note ?? "…"}</p>
      </div>
      <span
        className={`shrink-0 rounded-full px-2.5 py-1 text-[0.6875rem] font-medium ${
          status === "waiting-on-you"
            ? "bg-ink text-bg"
            : "border border-line text-ink-faint"
        }`}
      >
        {copy?.cta ?? "…"}
      </span>
    </Link>
  );
}

export default function TodayLinks({
  me,
  partner,
}: {
  me: Profile;
  partner: Profile | null;
}) {
  const [question, setQuestion] = useState<Status>("loading");
  const [knowMe, setKnowMe] = useState<Status>("loading");
  const [goodnight, setGoodnight] = useState<{ me: boolean; them: boolean }>({
    me: false,
    them: false,
  });
  const [flash, setFlash] = useFlash();
  const day = localDay();

  useEffect(() => {
    let cancelled = false;
    const sb = supabaseBrowser();

    async function load() {
      const [q, k, g] = await Promise.all([
        sb.rpc("ensure_daily_question", { p_day: day }).single(),
        sb.rpc("ensure_know_me_round", { p_day: day }).single(),
        sb.from("goodnights").select("*").eq("day", day),
      ]);
      if (cancelled) return;

      const qid = (q.data as { id?: string } | null)?.id;
      const kid = (k.data as { id?: string } | null)?.id;

      const [qa, kr] = await Promise.all([
        qid
          ? sb.from("question_answers").select("user_id").eq("question_id", qid)
          : Promise.resolve({ data: [] as { user_id: string }[] }),
        kid
          ? sb.from("know_me_responses").select("user_id").eq("round_id", kid)
          : Promise.resolve({ data: [] as { user_id: string }[] }),
      ]);
      if (cancelled) return;

      setQuestion(statusOf((qa.data ?? []).map((r) => r.user_id)));
      setKnowMe(statusOf((kr.data ?? []).map((r) => r.user_id)));

      const nights = (g.data ?? []) as { user_id: string }[];
      setGoodnight({
        me: nights.some((n) => n.user_id === me.id),
        them: nights.some((n) => n.user_id !== me.id),
      });
    }

    // RLS hides the partner's row until you have answered, so "did they
    // answer?" can only be inferred once you have. Before that it is honestly
    // unknown, which is the point.
    function statusOf(userIds: string[]): Status {
      const mine = userIds.includes(me.id);
      if (!mine) return "waiting-on-you";
      return userIds.length >= 2 ? "done" : "waiting-on-them";
    }

    load();

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
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "question_answers" }, () =>
        load()
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "know_me_responses" }, () =>
        load()
      )
      .subscribe();

    return () => {
      cancelled = true;
      sb.removeChannel(channel);
    };
  }, [me.id, day]);

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
        className={`press mt-3 w-full rounded-[1.25rem] border px-4 py-4 text-center transition-colors ${
          bothIn
            ? "border-transparent bg-sunken"
            : goodnight.me
              ? "border-line bg-raised"
              : "border-line bg-raised"
        }`}
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
