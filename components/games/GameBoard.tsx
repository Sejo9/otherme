"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { notifyPartner } from "@/lib/push";
import {
  C4_COLS,
  R_SIZE,
  connect4Drop,
  connect4LegalMoves,
  reversiCount,
  reversiFlips,
  reversiLegalMoves,
  reversiPlay,
  type Board,
  type Seat,
} from "@/lib/games";
import { GAMES, type Game, type Profile } from "@/lib/types";
import { Button, Problem } from "@/components/ui";

type Props = { game: Game; me: Profile; partner: Profile | null; onExit: () => void };

export default function GameBoard({ game: initial, me, partner, onExit }: Props) {
  const router = useRouter();
  const [game, setGame] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const seats = (game.state as { seats: Record<string, string> }).seats;
  const board = (game.state as unknown as { board: Board }).board;
  const mySeat: Seat = seats["1"] === me.id ? 1 : 2;
  const myTurn = game.turn === me.id && game.status === "active";

  // The other tab's move should just appear.
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

  const legal = useMemo(() => {
    if (!myTurn) return [] as [number, number][];
    return game.kind === "connect4"
      ? connect4LegalMoves(board).map((c) => [0, c] as [number, number])
      : reversiLegalMoves(board, mySeat);
  }, [game.kind, board, mySeat, myTurn]);

  const commit = useCallback(
    async (row: number, col: number) => {
      if (!myTurn || busy) return;

      const result =
        game.kind === "connect4"
          ? connect4Drop(board, col, mySeat)
          : reversiPlay(board, row, col, mySeat);

      if (!result) return;

      setBusy(true);
      setProblem(null);

      const nextTurn = result.next === null ? null : seats[String(result.next)];
      const winnerId = result.winner === null ? null : seats[String(result.winner)];

      // Optimistic: the board should move under your finger, not after a
      // round trip. The realtime UPDATE reconciles it either way.
      const optimistic: Game = {
        ...game,
        state: { ...game.state, board: result.board },
        turn: nextTurn,
        status: result.status,
        winner: winnerId,
        move_count: game.move_count + 1,
        last_move: { row, col, seat: mySeat, highlight: result.highlight },
      };
      setGame(optimistic);

      const { error } = await supabaseBrowser()
        .from("games")
        .update({
          state: optimistic.state,
          turn: nextTurn,
          status: result.status,
          winner: winnerId,
          move_count: optimistic.move_count,
          last_move: optimistic.last_move,
          updated_at: new Date().toISOString(),
        })
        .eq("id", game.id);

      setBusy(false);

      if (error) {
        setGame(game); // roll back
        setProblem(error.message);
        return;
      }

      notifyPartner({
        title: me.display_name,
        body:
          result.status === "won"
            ? `won at ${GAMES[game.kind].name.toLowerCase()}`
            : result.status === "draw"
              ? `drew with you at ${GAMES[game.kind].name.toLowerCase()}`
              : "played their move — you're up",
        url: "/games",
        tag: `game-${game.id}`,
      });

      if (result.status !== "active") router.refresh();
    },
    [busy, myTurn, game, board, mySeat, seats, me.display_name, router]
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

  const highlight = new Set(
    ((game.last_move as { highlight?: [number, number][] } | null)?.highlight ?? []).map(
      ([r, c]) => `${r}-${c}`
    )
  );

  return (
    <div className="flex flex-col gap-4">
      <Status
        game={game}
        me={me}
        partner={partner}
        mySeat={mySeat}
        myTurn={myTurn}
        board={board}
      />

      {problem && <Problem message={problem} />}

      {game.kind === "connect4" ? (
        <Connect4
          board={board}
          legal={legal}
          onPlay={(col) => commit(0, col)}
          colourOf={colourOf}
          highlight={highlight}
        />
      ) : (
        <Reversi
          board={board}
          mySeat={mySeat}
          myTurn={myTurn}
          onPlay={(r, c) => commit(r, c)}
          colourOf={colourOf}
          highlight={highlight}
        />
      )}

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

function Status({
  game,
  me,
  partner,
  mySeat,
  myTurn,
  board,
}: {
  game: Game;
  me: Profile;
  partner: Profile | null;
  mySeat: Seat;
  myTurn: boolean;
  board: Board;
}) {
  const theirName = partner?.display_name ?? "Them";

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

  const score = game.kind === "reversi" ? reversiCount(board) : null;

  return (
    <div className="card flex items-center justify-between px-4 py-3.5">
      <div>
        <p className="text-sm font-semibold">{line}</p>
        <p className="text-[0.6875rem] text-ink-faint">
          {GAMES[game.kind].name} · move {game.move_count}
        </p>
      </div>

      {score && (
        <div className="flex items-center gap-3 text-sm tabular-nums">
          <Pip colour={`var(--${me.accent})`} value={score[mySeat]} label="You" />
          <Pip
            colour={`var(--${partner?.accent ?? "rose"})`}
            value={score[mySeat === 1 ? 2 : 1]}
            label={theirName}
          />
        </div>
      )}
    </div>
  );
}

function Pip({ colour, value, label }: { colour: string; value: number; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-3 w-3 rounded-full" style={{ background: colour }} />
      <span className="font-semibold">{value}</span>
      <span className="text-[0.6875rem] text-ink-faint">{label}</span>
    </span>
  );
}

function Connect4({
  board,
  legal,
  onPlay,
  colourOf,
  highlight,
}: {
  board: Board;
  legal: [number, number][];
  onPlay: (col: number) => void;
  colourOf: (seat: Seat) => string;
  highlight: Set<string>;
}) {
  const playable = new Set(legal.map(([, c]) => c));

  return (
    <div className="card p-2">
      {/* One button per column: on a phone you aim at a column, not a cell. */}
      <div className="mb-1 grid grid-cols-7 gap-1">
        {Array.from({ length: C4_COLS }, (_, col) => (
          <button
            key={col}
            onClick={() => onPlay(col)}
            disabled={!playable.has(col)}
            aria-label={`Drop in column ${col + 1}`}
            className="press rounded-lg py-1 text-[0.6875rem] text-ink-faint disabled:opacity-20"
          >
            ▾
          </button>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {board.flatMap((row, r) =>
          row.map((cell, c) => (
            <button
              key={`${r}-${c}`}
              onClick={() => onPlay(c)}
              disabled={!playable.has(c)}
              className="aspect-square rounded-full border border-line bg-sunken transition-transform"
              style={
                cell !== 0
                  ? {
                      background: colourOf(cell as Seat),
                      borderColor: colourOf(cell as Seat),
                      transform: highlight.has(`${r}-${c}`) ? "scale(1.06)" : undefined,
                      boxShadow: highlight.has(`${r}-${c}`)
                        ? "0 0 0 2px var(--bg), 0 0 0 4px currentColor"
                        : undefined,
                    }
                  : undefined
              }
            />
          ))
        )}
      </div>
    </div>
  );
}

function Reversi({
  board,
  mySeat,
  myTurn,
  onPlay,
  colourOf,
  highlight,
}: {
  board: Board;
  mySeat: Seat;
  myTurn: boolean;
  onPlay: (row: number, col: number) => void;
  colourOf: (seat: Seat) => string;
  highlight: Set<string>;
}) {
  return (
    <div className="card p-2">
      <div className="grid grid-cols-8 gap-[2px]">
        {board.flatMap((row, r) =>
          row.map((cell, c) => {
            const flips = myTurn && cell === 0 ? reversiFlips(board, r, c, mySeat).length : 0;
            return (
              <button
                key={`${r}-${c}`}
                onClick={() => flips > 0 && onPlay(r, c)}
                disabled={flips === 0}
                aria-label={`Row ${r + 1}, column ${c + 1}`}
                className="relative flex aspect-square items-center justify-center rounded-[4px] bg-sunken"
              >
                {cell !== 0 ? (
                  <span
                    className="h-[78%] w-[78%] rounded-full transition-transform"
                    style={{
                      background: colourOf(cell as Seat),
                      transform: highlight.has(`${r}-${c}`) ? "scale(1.12)" : undefined,
                    }}
                  />
                ) : flips > 0 ? (
                  <span
                    className="h-[30%] w-[30%] rounded-full opacity-45"
                    style={{ background: colourOf(mySeat) }}
                  />
                ) : null}
              </button>
            );
          })
        )}
      </div>
      {myTurn && (
        <p className="mt-2 px-1 text-center text-[0.6875rem] text-ink-faint">
          Dots are legal moves.
        </p>
      )}
    </div>
  );
}
