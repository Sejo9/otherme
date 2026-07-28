"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { notifyPartner } from "@/lib/push";
import { localDay, prettyDay } from "@/lib/day";
import {
  MAX_GUESSES,
  isWord,
  keyboardState,
  score,
  wordForDay,
  type Mark,
} from "@/lib/words";
import type { Profile } from "@/lib/types";
import { Flash, Problem, SubNav, useFlash } from "@/components/ui";

type Row = {
  round_id: string;
  user_id: string;
  guesses: string[];
  solved: boolean;
  finished: boolean;
};

const KEYS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

/**
 * The daily word duel.
 *
 * Both of you attack the same hidden word independently — it is not
 * turn-based, so it lives outside the `games` table. Their board is withheld
 * by RLS until you have finished your own, which is the same mutual-reveal
 * shape as the daily question.
 */
export default function WordDuel({
  me,
  partner,
}: {
  me: Profile;
  partner: Profile | null;
}) {
  const day = localDay();
  const answer = wordForDay(day);

  const [roundId, setRoundId] = useState<string | null>(null);
  const [mine, setMine] = useState<Row | null>(null);
  const [theirs, setTheirs] = useState<Row | null>(null);
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [flash, setFlash] = useFlash();

  const load = useCallback(async () => {
    const sb = supabaseBrowser();

    // Both clients derive the same answer from the date, so whichever gets
    // here first creates the round and the other simply joins it. The function
    // returns a bare uuid — see migration 0005 for why it is not a row.
    const { data: id, error } = await sb.rpc("ensure_word_round", {
      p_day: day,
      p_answer: answer,
    });

    if (error || !id) {
      setProblem(error?.message ?? "Could not start today's round.");
      return;
    }

    const round = id as string;
    setRoundId(round);

    const { data: rows } = await sb
      .from("word_guesses")
      .select("round_id, user_id, guesses, solved, finished")
      .eq("round_id", round);

    const list = (rows ?? []) as Row[];
    setMine(list.find((r) => r.user_id === me.id) ?? null);
    setTheirs(list.find((r) => r.user_id !== me.id) ?? null);
  }, [day, answer, me.id]);

  useEffect(() => {
    load();
    const channel = supabaseBrowser()
      .channel("word-duel")
      .on("postgres_changes", { event: "*", schema: "public", table: "word_guesses" }, () =>
        load()
      )
      .subscribe();
    return () => {
      supabaseBrowser().removeChannel(channel);
    };
  }, [load]);

  const guesses = mine?.guesses ?? [];
  const done = mine?.finished ?? false;

  async function submit() {
    if (!roundId || done) return;
    const guess = draft.toLowerCase();

    if (guess.length !== 5) return;
    if (!isWord(guess)) {
      setShake(true);
      setTimeout(() => setShake(false), 420);
      setFlash("Not in the word list");
      return;
    }

    const next = [...guesses, guess];
    const solved = guess === answer;
    const finished = solved || next.length >= MAX_GUESSES;

    setDraft("");
    setMine({ round_id: roundId, user_id: me.id, guesses: next, solved, finished });

    const { error } = await supabaseBrowser().from("word_guesses").upsert(
      {
        round_id: roundId,
        user_id: me.id,
        guesses: next,
        solved,
        finished,
        finished_at: finished ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "round_id,user_id" }
    );

    if (error) {
      setProblem(error.message);
      return;
    }

    if (finished) {
      notifyPartner({
        title: me.display_name,
        body: solved ? `got today's word in ${next.length}` : "finished today's word",
        url: "/words",
        tag: "words",
      });
      load();
    }
  }

  function type(letter: string) {
    if (done || draft.length >= 5) return;
    setDraft(draft + letter);
  }

  const keyState = keyboardState(guesses, answer);
  const revealed = done && !!theirs?.finished;

  return (
    <>
      <SubNav
        current="/words"
        items={[
          { href: "/games", label: "Games" },
          { href: "/knowme", label: "Know me" },
          { href: "/words", label: "Word" },
        ]}
      />

      <header className="mb-4">
        <div className="flex items-baseline justify-between">
          <p className="label">{prettyDay(day)}</p>
          {theirs && (
            <p className="text-[0.6875rem] text-ink-faint">
              {theirs.finished
                ? `${partner?.display_name ?? "They"} finished`
                : `${partner?.display_name ?? "They"} is on ${theirs.guesses.length}`}
            </p>
          )}
        </div>
        <h1 className="mt-1 font-serif text-[1.5rem]">Word duel</h1>
      </header>

      {problem && <Problem message={problem} />}

      <div className={shake ? "shake" : undefined}>
        <Grid guesses={guesses} draft={draft} answer={answer} accent={me.accent} />
      </div>

      {done ? (
        <Finished
          mine={mine}
          theirs={theirs}
          answer={answer}
          me={me}
          partner={partner}
          revealed={revealed}
        />
      ) : (
        <Keyboard
          keyState={keyState}
          onKey={type}
          onDelete={() => setDraft(draft.slice(0, -1))}
          onEnter={submit}
          canSubmit={draft.length === 5}
        />
      )}

      <Flash>{flash}</Flash>
    </>
  );
}

function Grid({
  guesses,
  draft,
  answer,
  accent,
}: {
  guesses: string[];
  draft: string;
  answer: string;
  accent: string;
}) {
  const rows: { letters: string; marks: Mark[] | null }[] = [];

  for (const guess of guesses) rows.push({ letters: guess, marks: score(guess, answer) });
  if (rows.length < MAX_GUESSES) rows.push({ letters: draft.padEnd(5), marks: null });
  while (rows.length < MAX_GUESSES) rows.push({ letters: "     ", marks: null });

  return (
    <div className={`accent-${accent} mb-5 flex flex-col gap-1.5`}>
      {rows.map((row, r) => (
        <div key={r} className="grid grid-cols-5 gap-1.5">
          {Array.from({ length: 5 }, (_, i) => (
            <Tile key={i} letter={row.letters[i] ?? " "} mark={row.marks?.[i] ?? null} />
          ))}
        </div>
      ))}
    </div>
  );
}

function Tile({ letter, mark }: { letter: string; mark: Mark | null }) {
  const filled = letter.trim().length > 0;

  const background =
    mark === "g"
      ? "var(--accent)"
      : mark === "y"
        ? "color-mix(in srgb, var(--accent) 38%, transparent)"
        : mark === "."
          ? "var(--bg-sunken)"
          : "transparent";

  return (
    <div
      className="flex aspect-square items-center justify-center rounded-lg border text-xl font-bold uppercase transition-colors"
      style={{
        background,
        borderColor: mark ? "transparent" : filled ? "var(--ink-faint)" : "var(--line)",
        color: mark === "g" ? "var(--bg)" : "var(--ink)",
      }}
    >
      {letter}
    </div>
  );
}

function Keyboard({
  keyState,
  onKey,
  onDelete,
  onEnter,
  canSubmit,
}: {
  keyState: Record<string, Mark>;
  onKey: (letter: string) => void;
  onDelete: () => void;
  onEnter: () => void;
  canSubmit: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {KEYS.map((row, i) => (
        <div key={i} className="flex justify-center gap-1">
          {i === 2 && (
            <button
              onClick={onEnter}
              disabled={!canSubmit}
              className="press flex-[1.6] rounded-lg bg-ink px-1 py-3 text-[0.6875rem] font-semibold uppercase text-bg disabled:opacity-30"
            >
              Enter
            </button>
          )}
          {row.split("").map((letter) => {
            const mark = keyState[letter];
            return (
              <button
                key={letter}
                onClick={() => onKey(letter)}
                className="press flex-1 rounded-lg py-3 text-sm font-semibold uppercase transition-colors"
                style={{
                  background:
                    mark === "g"
                      ? "var(--amber)"
                      : mark === "y"
                        ? "color-mix(in srgb, var(--amber) 38%, transparent)"
                        : mark === "."
                          ? "var(--bg-sunken)"
                          : "var(--bg-raised)",
                  color: mark === "g" ? "var(--bg)" : mark === "." ? "var(--ink-faint)" : "var(--ink)",
                  border: "1px solid var(--line)",
                }}
              >
                {letter}
              </button>
            );
          })}
          {i === 2 && (
            <button
              onClick={onDelete}
              className="press flex-[1.6] rounded-lg border border-line py-3 text-sm"
            >
              ⌫
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function Finished({
  mine,
  theirs,
  answer,
  me,
  partner,
  revealed,
}: {
  mine: Row | null;
  theirs: Row | null;
  answer: string;
  me: Profile;
  partner: Profile | null;
  revealed: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="card px-4 py-4 text-center">
        <p className="text-2xl">{mine?.solved ? "🎯" : "🫠"}</p>
        <p className="mt-1.5 text-sm font-medium">
          {mine?.solved
            ? `Got it in ${mine.guesses.length}`
            : `It was ${answer.toUpperCase()}`}
        </p>
      </div>

      {revealed && theirs ? (
        <div className={`accent-${partner?.accent ?? "rose"} card rise px-4 py-4`}>
          <p className="label mb-2" style={{ color: "var(--accent)" }}>
            {partner?.display_name ?? "Them"} ·{" "}
            {theirs.solved ? `solved in ${theirs.guesses.length}` : "did not get it"}
          </p>
          <div className="flex flex-col gap-1">
            {theirs.guesses.map((guess, i) => (
              <div key={i} className="flex gap-1">
                {score(guess, answer).map((mark, j) => (
                  <span
                    key={j}
                    className="flex h-7 w-7 items-center justify-center rounded text-[0.6875rem] font-bold uppercase"
                    style={{
                      background:
                        mark === "g"
                          ? "var(--accent)"
                          : mark === "y"
                            ? "color-mix(in srgb, var(--accent) 38%, transparent)"
                            : "var(--bg-sunken)",
                      color: mark === "g" ? "var(--bg)" : "var(--ink)",
                    }}
                  >
                    {guess[j]}
                  </span>
                ))}
              </div>
            ))}
          </div>

          <p className="mt-3 border-t border-line pt-3 text-[0.8125rem] text-ink-soft">
            {verdict(mine, theirs, me, partner)}
          </p>
        </div>
      ) : (
        <div className="card px-5 py-8 text-center">
          <p className="text-sm font-medium">🔒 Their board is sealed</p>
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-soft">
            It opens when {partner?.display_name ?? "they"} have finished today&apos;s word.
          </p>
        </div>
      )}
    </div>
  );
}

function verdict(
  mine: Row | null,
  theirs: Row,
  me: Profile,
  partner: Profile | null
): string {
  const them = partner?.display_name ?? "They";
  if (!mine) return "";

  if (mine.solved && !theirs.solved) return `You got it and ${them} didn't.`;
  if (!mine.solved && theirs.solved) return `${them} got it and you didn't.`;
  if (!mine.solved && !theirs.solved) return "Neither of you got it. Brutal word.";

  if (mine.guesses.length < theirs.guesses.length) {
    return `You got there ${theirs.guesses.length - mine.guesses.length} guess${
      theirs.guesses.length - mine.guesses.length === 1 ? "" : "es"
    } quicker.`;
  }
  if (mine.guesses.length > theirs.guesses.length) {
    return `${them} got there ${mine.guesses.length - theirs.guesses.length} guess${
      mine.guesses.length - theirs.guesses.length === 1 ? "" : "es"
    } quicker.`;
  }
  return "Dead heat — same number of guesses.";
}
