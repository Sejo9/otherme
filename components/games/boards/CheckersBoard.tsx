"use client";

import { useMemo, useState } from "react";
import {
  SIZE,
  applyMove,
  count,
  isKing,
  isPlayable,
  legalMoves,
  seatOf,
  type CheckersBoard,
  type Move,
} from "@/lib/checkers";
import type { Seat } from "@/lib/games";
import type { BoardProps } from "../GameBoard";
import { ScorePips } from "../GameBoard";

type State = {
  board: CheckersBoard;
  seats: Record<string, string>;
  chain: [number, number] | null;
};

export default function CheckersBoardView({
  game,
  mySeat,
  myTurn,
  colourOf,
  onMove,
}: BoardProps) {
  const state = game.state as unknown as State;
  const board = state.board;
  const chain = state.chain ?? null;
  const theirSeat: Seat = mySeat === 1 ? 2 : 1;
  const pieces = count(board);

  // Mid-chain the piece is locked, so pre-select it rather than making them
  // tap a square they have no choice about.
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const active = chain ?? selected;

  const moves = useMemo(
    () => (myTurn ? legalMoves(board, mySeat, chain) : []),
    [board, mySeat, myTurn, chain]
  );

  const sources = useMemo(
    () => new Set(moves.map((m) => `${m.from[0]}-${m.from[1]}`)),
    [moves]
  );

  const targets = useMemo(() => {
    if (!active) return new Map<string, Move>();
    const map = new Map<string, Move>();
    for (const m of moves) {
      if (m.from[0] === active[0] && m.from[1] === active[1]) {
        map.set(`${m.to[0]}-${m.to[1]}`, m);
      }
    }
    return map;
  }, [moves, active]);

  const highlight = new Set(
    ((game.last_move as { highlight?: [number, number][] } | null)?.highlight ?? []).map(
      ([r, c]) => `${r}-${c}`
    )
  );

  const mustJump = moves.some((m) => m.captured);

  function tap(r: number, c: number) {
    if (!myTurn) return;

    const move = targets.get(`${r}-${c}`);
    if (move) {
      const result = applyMove(board, move, mySeat);
      setSelected(result.chain);
      onMove({
        state: { ...state, board: result.board, chain: result.chain },
        next: result.next,
        status: result.status,
        winner: result.winner,
        lastMove: {
          from: move.from,
          to: move.to,
          highlight: result.highlight,
          note: result.crowned ? "crowned a king" : result.chain ? "still jumping" : undefined,
        },
        note: result.crowned ? "crowned a king" : undefined,
      });
      return;
    }

    if (chain) return; // locked to the jumping piece
    if (sources.has(`${r}-${c}`)) setSelected([r, c]);
    else setSelected(null);
  }

  // Seat 2 sits at the top of the stored board, so flip it for them.
  const rows = mySeat === 2 ? [...board].reverse() : board;
  const rowIndex = (i: number) => (mySeat === 2 ? SIZE - 1 - i : i);
  const colIndex = (i: number) => (mySeat === 2 ? SIZE - 1 - i : i);

  return (
    <div className="flex flex-col gap-3">
      <ScorePips
        mine={pieces[mySeat]}
        theirs={pieces[theirSeat]}
        myColour={colourOf(mySeat)}
        theirColour={colourOf(theirSeat)}
        theirName="Them"
      />

      <div className="card overflow-hidden p-2">
        <div className="grid grid-cols-8 gap-0 overflow-hidden rounded-lg">
          {rows.flatMap((row, ri) => {
            const r = rowIndex(ri);
            const cells = mySeat === 2 ? [...row].reverse() : row;

            return cells.map((piece, ci) => {
              const c = colIndex(ci);
              const dark = isPlayable(r, c);
              const key = `${r}-${c}`;
              const isTarget = targets.has(key);
              const isSelected = active?.[0] === r && active?.[1] === c;
              const seat = seatOf(piece);

              return (
                <button
                  key={key}
                  onClick={() => dark && tap(r, c)}
                  disabled={!dark || !myTurn}
                  aria-label={`Row ${r + 1}, column ${c + 1}`}
                  className="relative flex aspect-square items-center justify-center"
                  style={{
                    background: dark ? "var(--bg-sunken)" : "var(--bg-raised)",
                    outline: highlight.has(key) ? "2px solid var(--accent)" : undefined,
                    outlineOffset: "-2px",
                  }}
                >
                  {seat && (
                    <span
                      className="flex h-[76%] w-[76%] items-center justify-center rounded-full text-[0.6875rem] font-bold transition-transform"
                      style={{
                        background: colourOf(seat),
                        color: "var(--bg)",
                        transform: isSelected ? "scale(1.1)" : undefined,
                        boxShadow: isSelected ? "0 0 0 2px var(--ink)" : undefined,
                      }}
                    >
                      {isKing(piece) ? "♔" : ""}
                    </span>
                  )}

                  {isTarget && !seat && (
                    <span
                      className="h-[32%] w-[32%] rounded-full opacity-60"
                      style={{ background: colourOf(mySeat) }}
                    />
                  )}
                </button>
              );
            });
          })}
        </div>
      </div>

      {myTurn && (
        <p className="text-center text-[0.6875rem] text-ink-faint">
          {chain
            ? "You must keep jumping with that piece."
            : mustJump
              ? "A capture is available — captures are compulsory."
              : active
                ? "Tap a dot to move."
                : "Tap one of your pieces."}
        </p>
      )}
    </div>
  );
}
