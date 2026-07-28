"use client";

import { reversiCount, reversiFlips, reversiPlay, type Board, type Seat } from "@/lib/games";
import type { BoardProps } from "../GameBoard";
import { ScorePips } from "../GameBoard";

export default function ReversiBoard({
  game,
  mySeat,
  myTurn,
  colourOf,
  onMove,
}: BoardProps) {
  const state = game.state as unknown as { board: Board; seats: Record<string, string> };
  const board = state.board;
  const score = reversiCount(board);
  const theirSeat: Seat = mySeat === 1 ? 2 : 1;

  const highlight = new Set(
    ((game.last_move as { highlight?: [number, number][] } | null)?.highlight ?? []).map(
      ([r, c]) => `${r}-${c}`
    )
  );

  function play(row: number, col: number) {
    const result = reversiPlay(board, row, col, mySeat);
    if (!result) return;

    onMove({
      state: { ...state, board: result.board },
      next: result.next,
      status: result.status,
      winner: result.winner,
      lastMove: { row, col, seat: mySeat, highlight: result.highlight },
      note: result.next === mySeat ? "you go again" : undefined,
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <ScorePips
        mine={score[mySeat]}
        theirs={score[theirSeat]}
        myColour={colourOf(mySeat)}
        theirColour={colourOf(theirSeat)}
        theirName="Them"
      />

      <div className="card p-2">
        <div className="grid grid-cols-8 gap-[2px]">
          {board.flatMap((row, r) =>
            row.map((cell, c) => {
              const flips =
                myTurn && cell === 0 ? reversiFlips(board, r, c, mySeat).length : 0;
              return (
                <button
                  key={`${r}-${c}`}
                  onClick={() => flips > 0 && play(r, c)}
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
          <p className="mt-2 text-center text-[0.6875rem] text-ink-faint">
            Dots are legal moves.
          </p>
        )}
      </div>
    </div>
  );
}
