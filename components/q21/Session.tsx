"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { notifyPartner } from "@/lib/push";
import type { Profile } from "@/lib/types";
import { Button, Flash, Problem, useFlash } from "@/components/ui";
import {
  isSettled,
  needsYou,
  phaseOf,
  type Q21Question,
  type Q21State,
} from "./types";

export default function Session({
  sessionId,
  me,
  partner,
  onExit,
}: {
  sessionId: string;
  me: Profile;
  partner: Profile | null;
  onExit: () => void;
}) {
  const them = partner?.display_name ?? "They";

  const [state, setState] = useState<Q21State | null>(null);
  const [at, setAt] = useState(0);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [overrideAnswer, setOverrideAnswer] = useState(false);
  const [flash, setFlash] = useFlash();

  const load = useCallback(
    async (jumpToNext = false) => {
      const { data, error } = await supabaseBrowser().rpc("q21_state", {
        p_session: sessionId,
      });

      if (error) {
        setProblem(error.message);
        return;
      }

      const fresh = data as Q21State;
      setState(fresh);

      if (jumpToNext) {
        const next = fresh.questions.findIndex((q) => needsYou(q));
        setAt(next === -1 ? fresh.questions.length - 1 : next);
      }
    },
    [sessionId]
  );

  // Open on the first question that actually wants something from you.
  useEffect(() => {
    load(true);
  }, [load]);

  useEffect(() => {
    const sb = supabaseBrowser();
    const channel = sb
      .channel(`q21-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "q21_responses" },
        () => load()
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [sessionId, load]);

  const question: Q21Question | null = state?.questions[at] ?? null;
  const phase = question ? phaseOf(question) : "open";

  // A fresh question should never inherit the previous one's draft.
  useEffect(() => {
    setDraft("");
    setOverrideAnswer(false);
  }, [at]);

  const progress = useMemo(() => {
    if (!state) return { settled: 0, yours: 0 };
    return {
      settled: state.questions.filter(isSettled).length,
      yours: state.questions.filter(needsYou).length,
    };
  }, [state]);

  async function respond(payload: { body: string | null; skipped: boolean }) {
    if (!question || busy) return;
    setBusy(true);
    setProblem(null);

    const { error } = await supabaseBrowser().from("q21_responses").upsert(
      {
        session_id: sessionId,
        idx: question.idx,
        user_id: me.id,
        body: payload.body,
        skipped: payload.skipped,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "session_id,idx,user_id" }
    );

    setBusy(false);
    if (error) {
      setProblem(error.message);
      return;
    }

    setDraft("");
    setOverrideAnswer(false);

    notifyPartner({
      title: me.display_name,
      body: payload.skipped
        ? `would rather skip question ${question.idx + 1}`
        : `answered question ${question.idx + 1} of 21`,
      url: "/21",
      tag: `q21-${sessionId}`,
    });

    await supabaseBrowser().rpc("q21_maybe_finish", { p_session: sessionId });
    await load();
  }

  if (problem && !state) {
    return (
      <>
        <Problem message={problem} />
        <button onClick={onExit} className="text-sm text-ink-faint underline">
          ← Back
        </button>
      </>
    );
  }

  if (!state || !question) {
    return <div className="pt-20 text-center text-sm text-ink-faint">…</div>;
  }

  const showComposer =
    phase === "open" ||
    phase === "skip-declined" ||
    (phase === "skip-proposed-by-them" && overrideAnswer);

  return (
    <>
      <header className="mb-4">
        <div className="flex items-baseline justify-between">
          <p className="label">Question {question.idx + 1} of 21</p>
          <p className="text-[0.6875rem] text-ink-faint">
            {progress.settled} done
            {progress.yours > 0 && ` · ${progress.yours} need you`}
          </p>
        </div>

        <Dots
          questions={state.questions}
          at={at}
          onPick={setAt}
          accent={me.accent}
        />

        <h1 className="mt-4 font-serif text-[1.4rem] leading-snug">{question.body}</h1>
      </header>

      {problem && <Problem message={problem} />}

      {/* --- the negotiated skip ------------------------------------------- */}
      {phase === "skip-proposed-by-them" && !overrideAnswer && (
        <div className="card mb-3 px-4 py-4">
          <p className="text-sm font-medium">{them} would rather skip this one</p>
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-soft">
            It only gets skipped if you agree. If you would rather answer it, they will
            be asked to answer too.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              variant="quiet"
              className="flex-1"
              disabled={busy}
              onClick={() => respond({ body: null, skipped: true })}
            >
              Skip it too
            </Button>
            <Button className="flex-1" onClick={() => setOverrideAnswer(true)}>
              I would rather answer
            </Button>
          </div>
        </div>
      )}

      {phase === "skip-declined" && (
        <div className="card mb-3 px-4 py-4">
          <p className="text-sm font-medium">{them} would rather answer this one</p>
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-soft">
            You asked to skip and they did not agree, so their answer is waiting behind
            yours.
          </p>
        </div>
      )}

      {/* --- composing ----------------------------------------------------- */}
      {showComposer && (
        <div className="card p-4">
          <textarea
            rows={6}
            autoFocus
            placeholder="However long or short you like."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className={`accent-${me.accent}`}
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            {phase === "open" ? (
              <button
                onClick={() => respond({ body: null, skipped: true })}
                disabled={busy}
                className="text-[0.8125rem] text-ink-faint underline"
              >
                Ask to skip
              </button>
            ) : (
              <span className="text-[0.75rem] text-ink-faint">
                Their answer unlocks with yours.
              </span>
            )}
            <Button
              onClick={() => respond({ body: draft.trim(), skipped: false })}
              disabled={!draft.trim() || busy}
            >
              {busy ? "…" : "Send"}
            </Button>
          </div>
        </div>
      )}

      {/* --- waiting -------------------------------------------------------- */}
      {phase === "waiting-on-them" && (
        <>
          <Answer label="You" accent={me.accent} body={question.me.body} />
          <Sealed>
            {them} has not answered yet. When they do, their answer appears here — and
            yours appears on their screen at the same moment.
          </Sealed>
        </>
      )}

      {phase === "skip-waiting" && (
        <Sealed icon="⏭️">
          You asked to skip this one. It is up to {them} — if they would rather answer
          it, you will be asked to answer too.
        </Sealed>
      )}

      {/* --- settled -------------------------------------------------------- */}
      {phase === "revealed" && (
        <div className="flex flex-col gap-3">
          <Answer label="You" accent={me.accent} body={question.me.body} />
          <Answer
            label={partner?.display_name ?? "Them"}
            accent={partner?.accent ?? "rose"}
            body={question.them.body}
          />
        </div>
      )}

      {phase === "skipped" && (
        <Sealed icon="🤝">Skipped, by agreement. Nobody has to answer everything.</Sealed>
      )}

      <Nav
        at={at}
        total={state.questions.length}
        onGo={setAt}
        onExit={onExit}
        nextNeeding={() => {
          const next = state.questions.findIndex((q, i) => i > at && needsYou(q));
          if (next !== -1) setAt(next);
          else setFlash("Nothing else is waiting on you");
        }}
      />

      {state.status === "done" && (
        <p className="mt-5 text-center text-[0.8125rem] text-ink-soft">
          That is all 21. 🎉
        </p>
      )}

      <Flash>{flash}</Flash>
    </>
  );
}

function Answer({
  label,
  accent,
  body,
}: {
  label: string;
  accent: string;
  body: string | null;
}) {
  if (!body) return null;
  return (
    <div className={`card accent-${accent} rise px-4 py-4`}>
      <p className="label mb-1.5" style={{ color: "var(--accent)" }}>
        {label}
      </p>
      <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed">{body}</p>
    </div>
  );
}

function Sealed({
  children,
  icon = "🔒",
}: {
  children: React.ReactNode;
  icon?: string;
}) {
  return (
    <div className="card mt-3 flex flex-col items-center gap-2 px-5 py-9 text-center">
      <span className="text-2xl">{icon}</span>
      <p className="max-w-[22rem] text-[0.8125rem] leading-relaxed text-ink-soft">
        {children}
      </p>
    </div>
  );
}

/** 21 dots: filled when settled, ringed when waiting on you. */
function Dots({
  questions,
  at,
  onPick,
  accent,
}: {
  questions: Q21Question[];
  at: number;
  onPick: (i: number) => void;
  accent: string;
}) {
  return (
    <div className={`accent-${accent} mt-2.5 flex flex-wrap gap-1.5`}>
      {questions.map((q, i) => {
        const settled = isSettled(q);
        const wants = needsYou(q);
        return (
          <button
            key={q.idx}
            onClick={() => onPick(i)}
            aria-label={`Question ${i + 1}`}
            className="h-2.5 w-2.5 rounded-full transition-transform"
            style={{
              background: settled ? "var(--accent)" : "var(--bg-sunken)",
              border: wants ? "1.5px solid var(--accent)" : "1px solid var(--line)",
              transform: i === at ? "scale(1.5)" : undefined,
            }}
          />
        );
      })}
    </div>
  );
}

function Nav({
  at,
  total,
  onGo,
  onExit,
  nextNeeding,
}: {
  at: number;
  total: number;
  onGo: (i: number) => void;
  onExit: () => void;
  nextNeeding: () => void;
}) {
  return (
    <div className="mt-6 flex items-center justify-between gap-3">
      <button
        onClick={() => onGo(Math.max(0, at - 1))}
        disabled={at === 0}
        className="press rounded-full border border-line px-3.5 py-2 text-sm disabled:opacity-30"
      >
        ←
      </button>

      <button onClick={onExit} className="text-sm text-ink-faint underline">
        All sessions
      </button>

      <div className="flex gap-2">
        <button
          onClick={nextNeeding}
          className="press rounded-full border border-line px-3 py-2 text-[0.75rem] text-ink-soft"
        >
          Next waiting
        </button>
        <button
          onClick={() => onGo(Math.min(total - 1, at + 1))}
          disabled={at === total - 1}
          className="press rounded-full border border-line px-3.5 py-2 text-sm disabled:opacity-30"
        >
          →
        </button>
      </div>
    </div>
  );
}
