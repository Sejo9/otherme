"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { notifyPartner } from "@/lib/push";
import { localDay, prettyDay, ago } from "@/lib/day";
import type { Profile, QuestionAnswer, Tier } from "@/lib/types";
import { Button, Flash, useFlash } from "@/components/ui";

type Loaded = {
  questionId: string;
  body: string;
  tier: Tier;
  answers: QuestionAnswer[];
};

const TIER_LABEL: Record<Tier, string> = {
  light: "Light",
  reflective: "Reflective",
  deep: "Deep",
  spicy: "Just for us",
};

/**
 * The daily question, with mutual reveal.
 *
 * Their answer is not merely hidden in the UI — RLS on `question_answers`
 * refuses to return it until you have committed your own. There is nothing to
 * peek at.
 */
export default function DailyQuestion({
  me,
  partner,
}: {
  me: Profile;
  partner: Profile | null;
}) {
  const [data, setData] = useState<Loaded | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useFlash();
  const day = localDay();

  const load = useCallback(async () => {
    const sb = supabaseBrowser();

    const { data: question } = await sb
      .rpc("ensure_daily_question", { p_day: day })
      .single<{ id: string; prompt_id: string }>();
    if (!question) return;

    const [{ data: prompt }, { data: answers }] = await Promise.all([
      sb.from("prompts").select("body, tier").eq("id", question.prompt_id).single(),
      sb.from("question_answers").select("*").eq("question_id", question.id),
    ]);

    setData({
      questionId: question.id,
      body: prompt?.body ?? "",
      tier: (prompt?.tier ?? "light") as Tier,
      answers: (answers ?? []) as QuestionAnswer[],
    });
  }, [day]);

  useEffect(() => {
    load();

    const channel = supabaseBrowser()
      .channel("daily-question")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "question_answers" },
        () => load()
      )
      .subscribe();

    return () => {
      supabaseBrowser().removeChannel(channel);
    };
  }, [load]);

  async function submit() {
    if (!data || !draft.trim() || saving) return;
    setSaving(true);

    const { error } = await supabaseBrowser()
      .from("question_answers")
      .insert({ question_id: data.questionId, user_id: me.id, body: draft.trim() });

    setSaving(false);
    if (error) {
      setFlash("Could not save that");
      return;
    }

    setDraft("");
    notifyPartner({
      title: me.display_name,
      body: "answered today's question — yours unlocks it",
      url: "/question",
      tag: "question",
    });
    load();
  }

  if (!data) {
    return <div className="pt-20 text-center text-sm text-ink-faint">…</div>;
  }

  const mine = data.answers.find((a) => a.user_id === me.id) ?? null;
  const theirs = data.answers.find((a) => a.user_id !== me.id) ?? null;
  const revealed = !!mine && !!theirs;

  return (
    <>
      <header className="mb-6 pt-2">
        <div className="flex items-center justify-between">
          <p className="label">{prettyDay(day)}</p>
          <span className="pill text-ink-faint">{TIER_LABEL[data.tier]}</span>
        </div>
        <h1 className="mt-3 font-serif text-[1.6rem] leading-snug">{data.body}</h1>
      </header>

      {!mine ? (
        <div className="card p-4">
          <textarea
            rows={7}
            autoFocus
            placeholder="However long or short you like."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className={`accent-${me.accent}`}
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-[0.75rem] leading-snug text-ink-faint">
              {partner?.display_name ?? "Their"} answer unlocks the moment you send yours.
            </p>
            <Button onClick={submit} disabled={!draft.trim() || saving}>
              {saving ? "…" : "Send"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Answer profile={me} label="You" answer={mine} />

          {revealed ? (
            <Answer profile={partner} label={partner?.display_name ?? "Them"} answer={theirs} />
          ) : (
            <div className="card flex flex-col items-center gap-2 px-5 py-10 text-center">
              <span className="text-2xl">🔒</span>
              <p className="text-sm font-medium">Sealed</p>
              <p className="max-w-[22rem] text-[0.8125rem] leading-relaxed text-ink-soft">
                {partner?.display_name ?? "They"} hasn&apos;t answered yet. When they do, their
                answer appears here — and yours appears on their screen at the same moment.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="mt-8 text-center">
        <Link href="/question/history" className="text-sm text-ink-faint underline">
          Everything you&apos;ve both answered
        </Link>
      </div>

      <Flash>{flash}</Flash>
    </>
  );
}

function Answer({
  profile,
  label,
  answer,
}: {
  profile: Profile | null;
  label: string;
  answer: QuestionAnswer | null;
}) {
  if (!answer) return null;

  return (
    <div className={`card accent-${profile?.accent ?? "rose"} rise px-4 py-4`}>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-sm font-semibold" style={{ color: "var(--accent)" }}>
          {label}
        </p>
        <p className="text-[0.6875rem] text-ink-faint">{ago(answer.created_at)}</p>
      </div>
      <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed">{answer.body}</p>
    </div>
  );
}
