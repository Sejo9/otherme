"use client";

import { useMemo, useState } from "react";
import { Chess, type Square } from "chess.js";
import type { Seat } from "@/lib/games";
import type { BoardProps } from "../GameBoard";
import { Sheet } from "@/components/ui";

type State = { fen: string; seats: Record<string, string>; history: string[] };

/**
 * Unicode piece glyphs. Both colours use the *solid* glyphs and are separated
 * by fill colour instead — the outline glyphs are close to invisible on a dark
 * background, which is the usual mistake here.
 */
const GLYPH: Record<string, string> = {
  p: "♟",
  n: "♞",
  b: "♝",
  r: "♜",
  q: "♛",
  k: "♚",
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const PROMOTIONS: { piece: "q" | "r" | "b" | "n"; label: string }[] = [
  { piece: "q", label: "Queen" },
  { piece: "r", label: "Rook" },
  { piece: "b", label: "Bishop" },
  { piece: "n", label: "Knight" },
];

export default function ChessBoardView({
  game,
  mySeat,
  myTurn,
  colourOf,
  onMove,
}: BoardProps) {
  const state = game.state as unknown as State;
  const [from, setFrom] = useState<Square | null>(null);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);

  // Seat 1 is white. chess.js is the single source of truth for legality.
  const chess = useMemo(() => new Chess(state.fen), [state.fen]);
  const myColour = mySeat === 1 ? "w" : "b";

  const legal = useMemo(() => {
    if (!myTurn || !from) return new Map<string, { promotion: boolean }>();
    const map = new Map<string, { promotion: boolean }>();
    for (const m of chess.moves({ square: from, verbose: true })) {
      map.set(m.to, { promotion: !!m.promotion });
    }
    return map;
  }, [chess, from, myTurn]);

  const movable = useMemo(() => {
    if (!myTurn) return new Set<string>();
    return new Set(chess.moves({ verbose: true }).map((m) => m.from));
  }, [chess, myTurn]);

  const lastMove = game.last_move as { from?: string; to?: string } | null;

  function commit(fromSquare: Square, toSquare: Square, promote?: "q" | "r" | "b" | "n") {
    const next = new Chess(state.fen);
    const move = next.move({ from: fromSquare, to: toSquare, promotion: promote ?? "q" });
    if (!move) return;

    setFrom(null);
    setPromotion(null);

    const theirSeat: Seat = mySeat === 1 ? 2 : 1;
    let status: "active" | "won" | "draw" = "active";
    let winner: Seat | null = null;
    let note: string | undefined;

    if (next.isCheckmate()) {
      status = "won";
      winner = mySeat;
      note = "checkmate";
    } else if (next.isStalemate()) {
      status = "draw";
      note = "stalemate";
    } else if (next.isDraw()) {
      status = "draw";
      note = next.isThreefoldRepetition() ? "threefold repetition" : "draw";
    } else if (next.isCheck()) {
      note = "check";
    }

    onMove({
      state: { ...state, fen: next.fen(), history: [...(state.history ?? []), move.san] },
      next: status === "active" ? theirSeat : null,
      status,
      winner,
      lastMove: { from: fromSquare, to: toSquare, san: move.san, note },
      note: note === "check" ? "check — you're up" : note,
    });
  }

  function tap(square: Square, hasOwnPiece: boolean) {
    if (!myTurn) return;

    if (from && legal.has(square)) {
      if (legal.get(square)!.promotion) setPromotion({ from, to: square });
      else commit(from, square);
      return;
    }

    setFrom(hasOwnPiece && movable.has(square) ? square : null);
  }

  // chess.js always returns rank 8 first; flip the whole thing for black.
  const grid = chess.board();
  const rows = myColour === "b" ? [...grid].reverse() : grid;

  const captured = capturedBy(chess);

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1 text-sm">
          <Captured pieces={captured[myColour === "w" ? "b" : "w"]} label="You took" />
          {chess.isCheck() && (
            <span className="rounded-full bg-rose-soft px-2.5 py-1 text-[0.6875rem] font-semibold text-rose">
              Check
            </span>
          )}
          <Captured pieces={captured[myColour]} label="They took" />
        </div>

        <div className="card p-2">
          <div className="grid grid-cols-8 overflow-hidden rounded-lg">
            {rows.flatMap((row, ri) => {
              const cells = myColour === "b" ? [...row].reverse() : row;
              const rank = myColour === "b" ? ri + 1 : 8 - ri;

              return cells.map((piece, ci) => {
                const file = myColour === "b" ? FILES[7 - ci] : FILES[ci];
                const square = `${file}${rank}` as Square;
                const dark = (ri + ci) % 2 === 1;
                const mine = piece?.color === myColour;
                const isTarget = legal.has(square);
                const isFrom = from === square;
                const wasLast = lastMove?.from === square || lastMove?.to === square;

                return (
                  <button
                    key={square}
                    onClick={() => tap(square, !!mine)}
                    disabled={!myTurn}
                    aria-label={square}
                    className="relative flex aspect-square items-center justify-center text-[7vw] leading-none sm:text-[2rem]"
                    style={{
                      background: isFrom
                        ? "var(--accent-soft)"
                        : wasLast
                          ? "color-mix(in srgb, var(--amber) 22%, transparent)"
                          : dark
                            ? "var(--bg-sunken)"
                            : "var(--bg-raised)",
                    }}
                  >
                    {piece && (
                      <span
                        style={{
                          color: colourOf(piece.color === "w" ? 1 : 2),
                          // A thin outline keeps both colours legible on either
                          // square shade without resorting to outline glyphs.
                          WebkitTextStroke: "0.6px var(--ink)",
                        }}
                      >
                        {GLYPH[piece.type]}
                      </span>
                    )}

                    {isTarget && (
                      <span
                        className="pointer-events-none absolute rounded-full opacity-55"
                        style={{
                          background: colourOf(mySeat),
                          height: piece ? "88%" : "26%",
                          width: piece ? "88%" : "26%",
                          border: piece ? `3px solid ${colourOf(mySeat)}` : undefined,
                          backgroundColor: piece ? "transparent" : colourOf(mySeat),
                        }}
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
            {from ? "Tap a dot to move." : "Tap one of your pieces."}
          </p>
        )}

        {(state.history?.length ?? 0) > 0 && <MoveList history={state.history} />}
      </div>

      <Sheet
        open={!!promotion}
        onClose={() => setPromotion(null)}
        title="Promote your pawn"
      >
        <div className="grid grid-cols-2 gap-2 pb-2">
          {PROMOTIONS.map((p) => (
            <button
              key={p.piece}
              onClick={() => promotion && commit(promotion.from, promotion.to, p.piece)}
              className="press flex items-center gap-3 rounded-2xl border border-line bg-sunken px-4 py-3.5"
            >
              <span className="text-2xl" style={{ color: colourOf(mySeat) }}>
                {GLYPH[p.piece]}
              </span>
              <span className="text-sm font-medium">{p.label}</span>
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}

function Captured({ pieces, label }: { pieces: string[]; label: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1" title={label}>
      {pieces.length === 0 ? (
        <span className="text-[0.6875rem] text-ink-faint">—</span>
      ) : (
        pieces.map((p, i) => (
          <span key={i} className="text-sm text-ink-faint">
            {GLYPH[p]}
          </span>
        ))
      )}
    </span>
  );
}

/** What is missing from the board, per colour. */
function capturedBy(chess: Chess): { w: string[]; b: string[] } {
  const full: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
  const alive = { w: { ...full }, b: { ...full } } as Record<string, Record<string, number>>;

  for (const key of Object.keys(alive.w)) {
    alive.w[key] = 0;
    alive.b[key] = 0;
  }

  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell) alive[cell.color][cell.type]++;
    }
  }

  const result: { w: string[]; b: string[] } = { w: [], b: [] };
  for (const colour of ["w", "b"] as const) {
    for (const [type, total] of Object.entries(full)) {
      for (let i = alive[colour][type]; i < total; i++) result[colour].push(type);
    }
  }
  return result;
}

function MoveList({ history }: { history: string[] }) {
  const pairs: [string, string | undefined][] = [];
  for (let i = 0; i < history.length; i += 2) {
    pairs.push([history[i], history[i + 1]]);
  }

  return (
    <div className="card max-h-32 overflow-y-auto px-4 py-3">
      <p className="label mb-1.5">Moves</p>
      <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 font-mono text-[0.75rem] tabular-nums">
        {pairs.map(([white, black], i) => (
          <span key={i} className="text-ink-soft">
            <span className="text-ink-faint">{i + 1}.</span> {white} {black ?? ""}
          </span>
        ))}
      </div>
    </div>
  );
}
