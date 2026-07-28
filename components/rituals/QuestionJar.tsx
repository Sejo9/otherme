"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { notifyPartner } from "@/lib/push";
import { ago } from "@/lib/day";
import type { JarQuestion, Profile } from "@/lib/types";
import { Button, Flash, Sheet, useFlash } from "@/components/ui";

/**
 * The jar: either of you can drop a question in for the other, answerable
 * whenever. No deadline, no nudging — the absence of pressure is the feature.
 */
export default function QuestionJar({
  me,
  partner,
}: {
  me: Profile;
  partner: Profile | null;
}) {
  const [items, setItems] = useState<JarQuestion[]>([]);
  const [asking, setAsking] = useState(false);
  const [draft, setDraft] = useState("");
  const [answering, setAnswering] = useState<JarQuestion | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useFlash();

  async function load() {
    const { data } = await supabaseBrowser()
      .from("jar_questions")
      .select("*")
      .order("created_at", { ascending: false });
    setItems((data ?? []) as JarQuestion[]);
  }

  useEffect(() => {
    load();
    const channel = supabaseBrowser()
      .channel("jar")
      .on("postgres_changes", { event: "*", schema: "public", table: "jar_questions" }, () =>
        load()
      )
      .subscribe();
    return () => {
      supabaseBrowser().removeChannel(channel);
    };
  }, []);

  async function ask() {
    if (!partner || !draft.trim() || busy) return;
    setBusy(true);

    await supabaseBrowser()
      .from("jar_questions")
      .insert({ from_user: me.id, to_user: partner.id, body: draft.trim() });

    setBusy(false);
    setDraft("");
    setAsking(false);
    notifyPartner({
      title: me.display_name,
      body: "put a question in your jar",
      url: "/rituals",
      tag: "jar",
    });
    setFlash("In the jar");
    load();
  }

  async function submitAnswer() {
    if (!answering || !answer.trim() || busy) return;
    setBusy(true);

    await supabaseBrowser()
      .from("jar_questions")
      .update({ answer: answer.trim(), answered_at: new Date().toISOString() })
      .eq("id", answering.id);

    setBusy(false);
    setAnswering(null);
    setAnswer("");
    notifyPartner({
      title: me.display_name,
      body: "answered your question",
      url: "/rituals",
      tag: "jar",
    });
    load();
  }

  const waitingOnMe = items.filter((q) => q.to_user === me.id && !q.answer);
  const answered = items.filter((q) => q.answer);

  return (
    <>
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3.5">
          <div>
            <p className="text-sm font-medium">The jar</p>
            <p className="text-[0.75rem] text-ink-faint">
              {waitingOnMe.length > 0
                ? `${waitingOnMe.length} waiting for you`
                : "Ask them anything. No deadline."}
            </p>
          </div>
          <Button variant="quiet" onClick={() => setAsking(true)} disabled={!partner}>
            Ask
          </Button>
        </div>

        {waitingOnMe.map((q) => (
          <button
            key={q.id}
            onClick={() => {
              setAnswering(q);
              setAnswer("");
            }}
            className={`press accent-${partner?.accent ?? "rose"} flex w-full items-center gap-3 border-t border-line px-4 py-3.5 text-left`}
          >
            <span className="text-base">🫙</span>
            <div className="min-w-0 flex-1">
              <p className="text-[0.875rem] leading-snug">{q.body}</p>
              <p className="mt-0.5 text-[0.6875rem] text-ink-faint">{ago(q.created_at)}</p>
            </div>
            <span className="shrink-0 rounded-full bg-ink px-2.5 py-1 text-[0.6875rem] font-medium text-bg">
              Answer
            </span>
          </button>
        ))}

        {answered.slice(0, 6).map((q) => {
          const askedByMe = q.from_user === me.id;
          return (
            <div key={q.id} className="border-t border-line px-4 py-3.5">
              <p className="text-[0.875rem] leading-snug text-ink-soft">{q.body}</p>
              <p
                className={`accent-${askedByMe ? (partner?.accent ?? "rose") : me.accent} mt-1.5 text-[0.875rem] leading-relaxed`}
              >
                <span className="font-medium" style={{ color: "var(--accent)" }}>
                  {askedByMe ? (partner?.display_name ?? "Them") : "You"}:
                </span>{" "}
                {q.answer}
              </p>
            </div>
          );
        })}
      </div>

      <Sheet open={asking} onClose={() => setAsking(false)} title="Into the jar">
        <div className={`accent-${me.accent} flex flex-col gap-3 pb-2`}>
          <p className="text-[0.8125rem] leading-relaxed text-ink-soft">
            Something you have been curious about. They&apos;ll answer whenever they feel
            like it — there is no reminder and no expiry.
          </p>
          <textarea
            rows={3}
            autoFocus
            placeholder="What do you want to know?"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <Button onClick={ask} disabled={!draft.trim() || busy} className="w-full py-3">
            {busy ? "…" : "Drop it in"}
          </Button>
        </div>
      </Sheet>

      <Sheet open={!!answering} onClose={() => setAnswering(null)} title="From the jar">
        <div className={`accent-${me.accent} flex flex-col gap-3 pb-2`}>
          <p className="font-serif text-[1.125rem] leading-snug">{answering?.body}</p>
          <textarea
            rows={5}
            autoFocus
            placeholder="Take your time."
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
          <Button
            onClick={submitAnswer}
            disabled={!answer.trim() || busy}
            className="w-full py-3"
          >
            {busy ? "…" : "Send it back"}
          </Button>
        </div>
      </Sheet>

      <Flash>{flash}</Flash>
    </>
  );
}
