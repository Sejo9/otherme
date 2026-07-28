"use client";

import { useMemo } from "react";
import { C4_COLS, connect4Drop, connect4LegalMoves, type Board, type Seat } from "@/lib/games";
import type { BoardProps } from "../GameBoard";

export default function Connect4Board({
  game,
  mySeat,
  myTurn,
  colourOf,
  onMove,
}: BoardProps) {
  const state = game.state as unknown as { board: Board; seats: Record<string, string> };
  const board = state.board;

  const playable = useMemo(
    () => new Set(myTurn ? connect4LegalMoves(board) : []),
    [board, myTurn]
  );

  const highlight = new Set(
    ((game.last_move as { highlight?: [number, number][] } | null)?.highlight ?? []).map(
      ([r, c]) => `${r}-${c}`
    )
  );

  function drop(col: number) {
    const result = connect4Drop(board, col, mySeat);
    if (!result) return;

    onMove({
      state: { ...state, board: result.board },
      next: result.next,
      status: result.status,
      winner: result.winner,
      lastMove: { col, seat: mySeat, highlight: result.highlight },
    });
  }

  return (
    <div className="card p-2">
      {/* Aim at a column, not a cell — that is how the game is played. */}
      <div className="mb-1 grid grid-cols-7 gap-1">
        {Array.from({ length: C4_COLS }, (_, col) => (
          <button
            key={col}
            onClick={() => drop(col)}
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
              onClick={() => drop(c)}
              disabled={!playable.has(c)}
              className="aspect-square rounded-full border border-line bg-sunken transition-transform"
              style={
                cell !== 0
                  ? {
                      background: colourOf(cell as Seat),
                      borderColor: colourOf(cell as Seat),
                      transform: highlight.has(`${r}-${c}`) ? "scale(1.06)" : undefined,
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
