"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { notifyPartner } from "@/lib/push";
import { localDay, prettyDay } from "@/lib/day";
import type { KnowMeResponse, KnowMeScore, Profile } from "@/lib/types";
import { Button, Flash, Problem, SubNav, useFlash } from "@/components/ui";

type Round = { id: string; body: string; options: string[] };

/**
 * How well do you know me.
 *
 * Both people answer the same question twice: once truthfully, once as a
 * prediction of the other. You score when your prediction matches their truth.
 * Like the daily question, the reveal is enforced by RLS.
 */
export default function KnowMe({
  me,
  partner,
}: {
  me: Profile;
  partner: Profile | null;
}) {
  const [round, setRound] = useState<Round | null>(null);
  const [responses, setResponses] = useState<KnowMeResponse[]>([]);
  const [scores, setScores] = useState<KnowMeScore[]>([]);
  const [self, setSelf] = useState<number | null>(null);
  const [prediction, setPrediction] = useState<number | null>(null);
  const [step, setStep] = useState<"self" | "predict">("self");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();
  const day = localDay();

  const load = useCallback(async () => {
    const sb = supabaseBrowser();

    const { data: r, error: roundError } = await sb
      .rpc("ensure_know_me_round", { p_day: day })
      .single<{ id: string; body: string; options: string[] }>();

    if (roundError || !r) {
      setProblem(roundError?.message ?? "Could not pick today's round.");
      return;
    }

    const [{ data: rows, error: rowsError }, { data: score }] = await Promise.all([
      sb.from("know_me_responses").select("*").eq("round_id", r.id),
      sb.rpc("know_me_scores"),
    ]);

    setProblem(rowsError?.message ?? null);

    setRound({ id: r.id, body: r.body, options: r.options });
    setResponses((rows ?? []) as KnowMeResponse[]);
    setScores((score ?? []) as KnowMeScore[]);
  }, [day]);

  useEffect(() => {
    load();
    const channel = supabaseBrowser()
      .channel("know-me")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "know_me_responses" },
        () => load()
      )
      .subscribe();
    return () => {
      supabaseBrowser().removeChannel(channel);
    };
  }, [load]);

  async function submit() {
    if (!round || self === null || prediction === null || saving) return;
    setSaving(true);

    const { error } = await supabaseBrowser().from("know_me_responses").insert({
      round_id: round.id,
      user_id: me.id,
      self_choice: self,
      prediction,
    });

    setSaving(false);
    if (error) {
      // Already locked in; only the read-back failed. Recover quietly.
      if (error.code === "23505") {
        load();
        return;
      }
      setProblem(error.message);
      return;
    }

    setProblem(null);
    notifyPartner({
      title: me.display_name,
      body: "made their guess — your turn",
      url: "/knowme",
      tag: "knowme",
    });
    load();
  }

  if (!round) {
    return (
      <div className="pt-20 text-center text-sm text-ink-faint">
        {problem ? <Problem message={problem} /> : "…"}
      </div>
    );
  }

  const mine = responses.find((r) => r.user_id === me.id) ?? null;
  const theirs = responses.find((r) => r.user_id !== me.id) ?? null;
  const revealed = !!mine && !!theirs;

  const myScore = scores.find((s) => s.user_id === me.id);
  const theirScore = scores.find((s) => s.user_id !== me.id);

  return (
    <>
      <SubNav
        current="/knowme"
        items={[
          { href: "/games", label: "Games" },
          { href: "/knowme", label: "Know me" },
          { href: "/words", label: "Word" },
        ]}
      />

      <header className="mb-5 pt-2">
        <div className="flex items-center justify-between">
          <p className="label">{prettyDay(day)}</p>
          <Scoreboard
            me={me}
            partner={partner}
            myScore={myScore}
            theirScore={theirScore}
          />
        </div>
        <h1 className="mt-3 font-serif text-[1.5rem] leading-snug">{round.body}</h1>
      </header>

      {problem && <Problem message={problem} />}

      {!mine ? (
        <>
          <div className="mb-3 flex gap-2">
            <StepDot active={step === "self"} done={self !== null} label="Your answer" />
            <StepDot
              active={step === "predict"}
              done={prediction !== null}
              label={`${partner?.display_name ?? "Their"} answer`}
            />
          </div>

          {step === "self" ? (
            <Choices
              accent={me.accent}
              hint="Answer honestly, for yourself."
              options={round.options}
              value={self}
              onChange={(i) => {
                setSelf(i);
                setTimeout(() => setStep("predict"), 220);
              }}
            />
          ) : (
            <>
              <Choices
                accent={partner?.accent ?? "rose"}
                hint={`Now guess what ${partner?.display_name ?? "they"} picked.`}
                options={round.options}
                value={prediction}
                onChange={setPrediction}
              />
              <div className="mt-4 flex items-center justify-between gap-3">
                <button
                  onClick={() => setStep("self")}
                  className="text-sm text-ink-faint underline"
                >
                  Back
                </button>
                <Button onClick={submit} disabled={prediction === null || saving}>
                  {saving ? "…" : "Lock it in"}
                </Button>
              </div>
            </>
          )}
        </>
      ) : revealed ? (
        <Reveal
          me={me}
          partner={partner}
          options={round.options}
          mine={mine}
          theirs={theirs}
        />
      ) : (
        <div className="card flex flex-col items-center gap-2 px-5 py-10 text-center">
          <span className="text-2xl">🔒</span>
          <p className="text-sm font-medium">Locked in</p>
          <p className="max-w-[22rem] text-[0.8125rem] leading-relaxed text-ink-soft">
            You said <strong>{round.options[mine.self_choice]}</strong> and guessed they&apos;d
            say <strong>{round.options[mine.prediction]}</strong>. It opens when{" "}
            {partner?.display_name ?? "they"} plays.
          </p>
        </div>
      )}

      <Flash>{flash}</Flash>
    </>
  );
}

function StepDot({
  active,
  done,
  label,
}: {
  active: boolean;
  done: boolean;
  label: string;
}) {
  return (
    <div
      className={`flex-1 rounded-full border px-3 py-1.5 text-center text-[0.6875rem] font-medium transition-colors ${
        active
          ? "border-ink bg-ink text-bg"
          : done
            ? "border-line bg-sunken text-ink-soft"
            : "border-line text-ink-faint"
      }`}
    >
      {label}
    </div>
  );
}

function Choices({
  options,
  value,
  onChange,
  hint,
  accent,
}: {
  options: string[];
  value: number | null;
  onChange: (i: number) => void;
  hint: string;
  accent: string;
}) {
  return (
    <div className={`accent-${accent}`}>
      <p className="mb-2 px-1 text-[0.8125rem] text-ink-soft">{hint}</p>
      <div className="flex flex-col gap-2">
        {options.map((option, i) => (
          <button
            key={option}
            onClick={() => onChange(i)}
            className="press rounded-2xl border px-4 py-3.5 text-left text-[0.9375rem] transition-colors"
            style={
              value === i
                ? { borderColor: "var(--accent)", background: "var(--accent-soft)" }
                : { borderColor: "var(--line)", background: "var(--bg-raised)" }
            }
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function Reveal({
  me,
  partner,
  options,
  mine,
  theirs,
}: {
  me: Profile;
  partner: Profile | null;
  options: string[];
  mine: KnowMeResponse;
  theirs: KnowMeResponse;
}) {
  const iGotThemRight = mine.prediction === theirs.self_choice;
  const theyGotMeRight = theirs.prediction === mine.self_choice;
  const both = iGotThemRight && theyGotMeRight;

  return (
    <div className="rise flex flex-col gap-3">
      <div className="card px-4 py-4 text-center">
        <p className="text-3xl">{both ? "🎯" : iGotThemRight || theyGotMeRight ? "🙂" : "🫠"}</p>
        <p className="mt-1.5 text-sm font-medium">
          {both
            ? "You both read each other exactly right."
            : iGotThemRight
              ? `You called it. ${partner?.display_name ?? "They"} didn't.`
              : theyGotMeRight
                ? `${partner?.display_name ?? "They"} called it. You didn't.`
                : "Neither of you saw that coming."}
        </p>
      </div>

      <Line
        accent={me.accent}
        who="You"
        truth={options[mine.self_choice]}
        guessLabel={`${partner?.display_name ?? "They"} guessed`}
        guess={options[theirs.prediction]}
        correct={theyGotMeRight}
      />
      <Line
        accent={partner?.accent ?? "rose"}
        who={partner?.display_name ?? "Them"}
        truth={options[theirs.self_choice]}
        guessLabel="You guessed"
        guess={options[mine.prediction]}
        correct={iGotThemRight}
      />
    </div>
  );
}

function Line({
  accent,
  who,
  truth,
  guessLabel,
  guess,
  correct,
}: {
  accent: string;
  who: string;
  truth: string;
  guessLabel: string;
  guess: string;
  correct: boolean;
}) {
  return (
    <div className={`card accent-${accent} px-4 py-4`}>
      <p className="label mb-2" style={{ color: "var(--accent)" }}>
        {who} actually said
      </p>
      <p className="text-[0.9375rem] font-medium">{truth}</p>

      <div className="mt-3 flex items-start gap-2 border-t border-line pt-3">
        <span className="text-sm">{correct ? "✓" : "✕"}</span>
        <p className="text-[0.8125rem] text-ink-soft">
          {guessLabel} <span className="text-ink">{guess}</span>
        </p>
      </div>
    </div>
  );
}

function Scoreboard({
  me,
  partner,
  myScore,
  theirScore,
}: {
  me: Profile;
  partner: Profile | null;
  myScore?: KnowMeScore;
  theirScore?: KnowMeScore;
}) {
  if (!myScore && !theirScore) return null;

  const pct = (s?: KnowMeScore) =>
    s && s.total > 0 ? Math.round((s.correct / s.total) * 100) : null;

  return (
    <div className="flex items-center gap-3 text-[0.6875rem] tabular-nums">
      <span className={`accent-${me.accent}`}>
        <span className="font-semibold" style={{ color: "var(--accent)" }}>
          You
        </span>{" "}
        {pct(myScore) ?? "–"}%
      </span>
      <span className={`accent-${partner?.accent ?? "rose"}`}>
        <span className="font-semibold" style={{ color: "var(--accent)" }}>
          {partner?.display_name ?? "Them"}
        </span>{" "}
        {pct(theirScore) ?? "–"}%
      </span>
    </div>
  );
}
