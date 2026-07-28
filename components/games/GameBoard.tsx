"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { notifyPartner } from "@/lib/push";
import type { Seat } from "@/lib/games";
import { GAMES, type Game, type Profile } from "@/lib/types";
import { Button, Problem } from "@/components/ui";
import Connect4Board from "./boards/Connect4Board";
import ReversiBoard from "./boards/ReversiBoard";
import CheckersBoardView from "./boards/CheckersBoard";
import ChessBoardView from "./boards/ChessBoard";

/** What a board component hands back after a legal move. */
export type Outcome = {
  state: Record<string, unknown>;
  next: Seat | null;
  status: "active" | "won" | "draw";
  winner: Seat | null;
  lastMove: Record<string, unknown>;
  /** Short human description, used for the push notification. */
  note?: string;
};

export type BoardProps = {
  game: Game;
  mySeat: Seat;
  myTurn: boolean;
  colourOf: (seat: Seat) => string;
  onMove: (outcome: Outcome) => void;
};

type Props = { game: Game; me: Profile; partner: Profile | null; onExit: () => void };

/**
 * Owns everything common to all games: whose turn it is, writing the move,
 * resigning, and the status line. The per-game components are pure board UI
 * and hand back an Outcome.
 */
export default function GameBoard({ game: initial, me, partner, onExit }: Props) {
  const router = useRouter();
  const [game, setGame] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const seats = (game.state as { seats: Record<string, string> }).seats;
  const mySeat: Seat = seats["1"] === me.id ? 1 : 2;
  const myTurn = game.turn === me.id && game.status === "active";

  useEffect(() => {
    const channel = supabaseBrowser()
      .channel(`game-${initial.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${initial.id}` },
        ({ new: row }) => setGame(row as Game)
      )
      .subscribe();

    return () => {
      supabaseBrowser().removeChannel(channel);
    };
  }, [initial.id]);

  const onMove = useCallback(
    async (outcome: Outcome) => {
      if (!myTurn || busy) return;

      setBusy(true);
      setProblem(null);

      const previous = game;
      const nextTurn = outcome.next === null ? null : seats[String(outcome.next)];
      const winnerId = outcome.winner === null ? null : seats[String(outcome.winner)];

      // Move under the finger, reconcile over realtime.
      const optimistic: Game = {
        ...game,
        state: outcome.state,
        turn: nextTurn,
        status: outcome.status,
        winner: winnerId,
        move_count: game.move_count + 1,
        last_move: outcome.lastMove,
      };
      setGame(optimistic);

      const { error } = await supabaseBrowser()
        .from("games")
        .update({
          state: outcome.state,
          turn: nextTurn,
          status: outcome.status,
          winner: winnerId,
          move_count: optimistic.move_count,
          last_move: outcome.lastMove,
          updated_at: new Date().toISOString(),
        })
        .eq("id", game.id);

      setBusy(false);

      if (error) {
        setGame(previous);
        setProblem(error.message);
        return;
      }

      const name = GAMES[game.kind].name.toLowerCase();
      notifyPartner({
        title: me.display_name,
        body:
          outcome.status === "won"
            ? `won at ${name}`
            : outcome.status === "draw"
              ? `drew with you at ${name}`
              : outcome.next === mySeat
                ? "is still moving"
                : (outcome.note ?? "played their move — you're up"),
        url: "/games",
        tag: `game-${game.id}`,
      });

      if (outcome.status !== "active") router.refresh();
    },
    [busy, myTurn, game, seats, mySeat, me.display_name, router]
  );

  async function resign() {
    if (game.status !== "active") return;

    const { error } = await supabaseBrowser()
      .from("games")
      .update({
        status: "resigned",
        winner: partner?.id ?? null,
        turn: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", game.id);

    if (error) setProblem(error.message);
    else router.refresh();
  }

  const colourOf = (seat: Seat) =>
    seats[String(seat)] === me.id
      ? `var(--${me.accent})`
      : `var(--${partner?.accent ?? "rose"})`;

  const boardProps: BoardProps = { game, mySeat, myTurn, colourOf, onMove };

  return (
    <div className="flex flex-col gap-4">
      <StatusBar game={game} me={me} partner={partner} myTurn={myTurn} />

      {problem && <Problem message={problem} />}

      {game.kind === "connect4" && <Connect4Board {...boardProps} />}
      {game.kind === "reversi" && <ReversiBoard {...boardProps} />}
      {game.kind === "checkers" && <CheckersBoardView {...boardProps} />}
      {game.kind === "chess" && <ChessBoardView {...boardProps} />}

      <div className="flex items-center justify-between gap-3">
        <button onClick={onExit} className="text-sm text-ink-faint underline">
          ← All games
        </button>
        {game.status === "active" && (
          <Button variant="ghost" onClick={resign}>
            Resign
          </Button>
        )}
      </div>
    </div>
  );
}

function StatusBar({
  game,
  me,
  partner,
  myTurn,
}: {
  game: Game;
  me: Profile;
  partner: Profile | null;
  myTurn: boolean;
}) {
  const theirName = partner?.display_name ?? "Them";
  const note = (game.last_move as { note?: string } | null)?.note;

  let line: string;
  if (game.status === "won") {
    line = game.winner === me.id ? "You won 🎉" : `${theirName} won`;
  } else if (game.status === "draw") {
    line = "A draw";
  } else if (game.status === "resigned") {
    line = game.winner === me.id ? `${theirName} resigned` : "You resigned";
  } else {
    line = myTurn ? "Your move" : `Waiting on ${theirName}`;
  }

  return (
    <div className="card flex items-center justify-between gap-3 px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{line}</p>
        <p className="text-[0.6875rem] text-ink-faint">
          {GAMES[game.kind].name} · move {game.move_count}
          {note && game.status === "active" && ` · ${note}`}
        </p>
      </div>
    </div>
  );
}

/** Shared by the games that show a piece count. */
export function ScorePips({
  mine,
  theirs,
  myColour,
  theirColour,
  theirName,
}: {
  mine: number;
  theirs: number;
  myColour: string;
  theirColour: string;
  theirName: string;
}) {
  return (
    <div className="flex items-center justify-center gap-4 text-sm tabular-nums">
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-full" style={{ background: myColour }} />
        <span className="font-semibold">{mine}</span>
        <span className="text-[0.6875rem] text-ink-faint">You</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-full" style={{ background: theirColour }} />
        <span className="font-semibold">{theirs}</span>
        <span className="text-[0.6875rem] text-ink-faint">{theirName}</span>
      </span>
    </div>
  );
}
