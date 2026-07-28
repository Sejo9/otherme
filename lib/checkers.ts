/**
 * English draughts.
 *
 * Encoded as numbers so the board stays small in jsonb:
 *   0 empty · 1 seat-1 man · 2 seat-2 man · 3 seat-1 king · 4 seat-2 king
 *
 * Seat 1 starts at the bottom and moves up the board (decreasing row).
 *
 * Captures are mandatory, as in the real game — if any jump exists you must
 * take one. That single rule is what makes draughts a game rather than a
 * shuffle, so it is enforced rather than left to good manners.
 */
import type { Seat } from "./games";

export type Piece = 0 | 1 | 2 | 3 | 4;
export type CheckersBoard = Piece[][];

export const SIZE = 8;

export type CheckersState = {
  board: CheckersBoard;
  seats: Record<string, string>;
  /** Set mid-multi-jump: this piece must keep jumping and no other may move. */
  chain: [number, number] | null;
};

export type Move = {
  from: [number, number];
  to: [number, number];
  captured: [number, number] | null;
};

export const seatOf = (p: Piece): Seat | null =>
  p === 1 || p === 3 ? 1 : p === 2 || p === 4 ? 2 : null;

export const isKing = (p: Piece): boolean => p === 3 || p === 4;

/** Dark squares only — the playable ones. */
export const isPlayable = (r: number, c: number): boolean => (r + c) % 2 === 1;

export function checkersInitial(): CheckersBoard {
  const board: CheckersBoard = Array.from({ length: SIZE }, () =>
    Array<Piece>(SIZE).fill(0)
  );

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!isPlayable(r, c)) continue;
      if (r < 3) board[r][c] = 2; // seat 2 across the top
      else if (r > 4) board[r][c] = 1; // seat 1 along the bottom
    }
  }

  return board;
}

const inBounds = (r: number, c: number) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

/** Directions a piece may travel: kings both ways, men forward only. */
function directions(piece: Piece): [number, number][] {
  const seat = seatOf(piece);
  if (isKing(piece)) {
    return [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];
  }
  // Seat 1 moves up the board, seat 2 moves down.
  const dr = seat === 1 ? -1 : 1;
  return [
    [dr, -1],
    [dr, 1],
  ];
}

export function jumpsFrom(board: CheckersBoard, r: number, c: number): Move[] {
  const piece = board[r][c];
  const seat = seatOf(piece);
  if (!seat) return [];

  const moves: Move[] = [];

  for (const [dr, dc] of directions(piece)) {
    const midR = r + dr;
    const midC = c + dc;
    const toR = r + dr * 2;
    const toC = c + dc * 2;

    if (!inBounds(toR, toC)) continue;
    if (board[toR][toC] !== 0) continue;

    const midSeat = seatOf(board[midR][midC]);
    if (midSeat && midSeat !== seat) {
      moves.push({ from: [r, c], to: [toR, toC], captured: [midR, midC] });
    }
  }

  return moves;
}

function stepsFrom(board: CheckersBoard, r: number, c: number): Move[] {
  const piece = board[r][c];
  if (!seatOf(piece)) return [];

  const moves: Move[] = [];
  for (const [dr, dc] of directions(piece)) {
    const toR = r + dr;
    const toC = c + dc;
    if (inBounds(toR, toC) && board[toR][toC] === 0) {
      moves.push({ from: [r, c], to: [toR, toC], captured: null });
    }
  }
  return moves;
}

/**
 * Every move the seat may legally make.
 *
 * Mid-chain, only the jumping piece may continue. Otherwise, if any jump
 * exists anywhere, only jumps are returned.
 */
export function legalMoves(
  board: CheckersBoard,
  seat: Seat,
  chain: [number, number] | null
): Move[] {
  if (chain) {
    return jumpsFrom(board, chain[0], chain[1]);
  }

  const jumps: Move[] = [];
  const steps: Move[] = [];

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (seatOf(board[r][c]) !== seat) continue;
      jumps.push(...jumpsFrom(board, r, c));
      steps.push(...stepsFrom(board, r, c));
    }
  }

  return jumps.length > 0 ? jumps : steps;
}

export type CheckersResult = {
  board: CheckersBoard;
  chain: [number, number] | null;
  next: Seat | null;
  status: "active" | "won" | "draw";
  winner: Seat | null;
  crowned: boolean;
  highlight: [number, number][];
};

export function applyMove(
  board: CheckersBoard,
  move: Move,
  seat: Seat
): CheckersResult {
  const next = board.map((row) => [...row]) as CheckersBoard;
  const [fr, fc] = move.from;
  const [tr, tc] = move.to;

  let piece = next[fr][fc];
  next[fr][fc] = 0;
  if (move.captured) next[move.captured[0]][move.captured[1]] = 0;

  // Crowning ends the turn even if another jump would have been available.
  const backRow = seat === 1 ? 0 : SIZE - 1;
  let crowned = false;
  if (!isKing(piece) && tr === backRow) {
    piece = seat === 1 ? 3 : 4;
    crowned = true;
  }
  next[tr][tc] = piece;

  const highlight: [number, number][] = [move.from, move.to];
  if (move.captured) highlight.push(move.captured);

  // Multi-jump: same piece, same player, if it can take again.
  const canContinue =
    !!move.captured && !crowned && jumpsFrom(next, tr, tc).length > 0;

  if (canContinue) {
    return {
      board: next,
      chain: [tr, tc],
      next: seat,
      status: "active",
      winner: null,
      crowned,
      highlight,
    };
  }

  const opponent: Seat = seat === 1 ? 2 : 1;
  const opponentMoves = legalMoves(next, opponent, null);

  if (opponentMoves.length === 0) {
    // No pieces or no moves: you lose in English draughts either way.
    return {
      board: next,
      chain: null,
      next: null,
      status: "won",
      winner: seat,
      crowned,
      highlight,
    };
  }

  return {
    board: next,
    chain: null,
    next: opponent,
    status: "active",
    winner: null,
    crowned,
    highlight,
  };
}

export function count(board: CheckersBoard): { 1: number; 2: number } {
  let one = 0;
  let two = 0;
  for (const row of board) {
    for (const cell of row) {
      const seat = seatOf(cell);
      if (seat === 1) one++;
      else if (seat === 2) two++;
    }
  }
  return { 1: one, 2: two };
}
