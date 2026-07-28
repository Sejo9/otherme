"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { notifyPartner } from "@/lib/push";
import { ago } from "@/lib/day";
import type { Profile } from "@/lib/types";
import { Button, Empty, Problem, Section, SubNav, useBackDismiss } from "@/components/ui";
import Session from "./Session";

type SessionRow = {
  id: string;
  started_by: string;
  status: "active" | "done";
  created_at: string;
  updated_at: string;
};

export default function TwentyOne({
  me,
  partner,
}: {
  me: Profile;
  partner: Profile | null;
}) {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabaseBrowser()
      .from("q21_sessions")
      .select("id, started_by, status, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) setProblem(error.message);
    setSessions((data ?? []) as SessionRow[]);
  }, []);

  useEffect(() => {
    load();
    const sb = supabaseBrowser();
    const channel = sb
      .channel("q21-sessions")
      .on("postgres_changes", { event: "*", schema: "public", table: "q21_sessions" }, () =>
        load()
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [load]);

  // Back should close the session, not leave the tab.
  useBackDismiss(!!openId, () => setOpenId(null));

  async function start() {
    if (starting) return;
    setStarting(true);
    setProblem(null);

    const { data, error } = await supabaseBrowser().rpc("start_q21_session");

    setStarting(false);
    if (error) {
      setProblem(error.message);
      return;
    }

    notifyPartner({
      title: me.display_name,
      body: "started a round of 21 questions",
      url: "/21",
      tag: "q21-new",
    });

    setOpenId(data as string);
    load();
  }

  if (openId) {
    return (
      <Session
        sessionId={openId}
        me={me}
        partner={partner}
        onExit={() => setOpenId(null)}
      />
    );
  }

  const active = sessions.filter((s) => s.status === "active");
  const done = sessions.filter((s) => s.status === "done");

  return (
    <>
      <SubNav
        current="/21"
        items={[
          { href: "/games", label: "Games" },
          { href: "/knowme", label: "Know me" },
          { href: "/words", label: "Word" },
          { href: "/21", label: "21" },
        ]}
      />

      <header className="mb-5">
        <p className="label">Twenty one of them</p>
        <h1 className="mt-0.5 font-serif text-[1.75rem]">21 Questions</h1>
        <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-soft">
          Neither of you sees an answer until you have both given one. Either of you can
          ask to skip a question — but it only gets skipped if the other agrees.
        </p>
      </header>

      {problem && <Problem message={problem} />}

      <Section>
        <Button onClick={start} disabled={!partner || starting} className="w-full py-3.5">
          {starting ? "…" : "Start a new round"}
        </Button>
      </Section>

      {active.length > 0 && (
        <Section title="In progress">
          <div className="card overflow-hidden">
            {active.map((s) => (
              <Row key={s.id} session={s} me={me} partner={partner} onOpen={() => setOpenId(s.id)} />
            ))}
          </div>
        </Section>
      )}

      <Section title="Finished">
        {done.length === 0 ? (
          <Empty>
            Nothing finished yet. A round stays open as long as you like — there is no
            clock on it.
          </Empty>
        ) : (
          <div className="card overflow-hidden">
            {done.map((s) => (
              <Row key={s.id} session={s} me={me} partner={partner} onOpen={() => setOpenId(s.id)} />
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

function Row({
  session,
  me,
  partner,
  onOpen,
}: {
  session: SessionRow;
  me: Profile;
  partner: Profile | null;
  onOpen: () => void;
}) {
  const startedByMe = session.started_by === me.id;

  return (
    <button
      onClick={onOpen}
      className="press flex w-full items-center gap-3 border-b border-line px-4 py-3.5 text-left last:border-b-0"
    >
      <span className="text-base">{session.status === "done" ? "✅" : "💬"}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {new Date(session.created_at).toLocaleDateString(undefined, {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
        <p className="text-[0.6875rem] text-ink-faint">
          started by {startedByMe ? "you" : (partner?.display_name ?? "them")} ·{" "}
          {ago(session.updated_at)}
        </p>
      </div>
      {session.status === "active" && (
        <span className="shrink-0 rounded-full bg-ink px-2.5 py-1 text-[0.6875rem] font-medium text-bg">
          Open
        </span>
      )}
    </button>
  );
}
