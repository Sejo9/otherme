/**
 * Game rules, as pure functions.
 *
 * Board state is stored as jsonb and rewritten whole on each move. That is
 * fine at two players and a handful of moves per day, and it means the client
 * never has to replay a move log to know where it stands.
 *
 * Cells hold 0 (empty), 1 (the player who started) or 2 (the other one).
 */
export type Cell = 0 | 1 | 2;
export type Seat = 1 | 2;
export type Board = Cell[][];

export type GameState = {
  board: Board;
  /** Seat -> profile id, fixed when the game is created. */
  seats: Record<Seat, string>;
};

export type MoveResult = {
  board: Board;
  /** Whose turn it is next, as a seat. Null when the game is over. */
  next: Seat | null;
  status: "active" | "won" | "draw";
  winner: Seat | null;
  /** Cells to highlight — the winning line, or the discs just flipped. */
  highlight: [number, number][];
};

export const other = (seat: Seat): Seat => (seat === 1 ? 2 : 1);

function empty(rows: number, cols: number): Board {
  return Array.from({ length: rows }, () => Array<Cell>(cols).fill(0));
}

// ===========================================================================
// Four in a row — 7 wide, 6 tall, gravity.
// ===========================================================================
export const C4_ROWS = 6;
export const C4_COLS = 7;

export function connect4Initial(): Board {
  return empty(C4_ROWS, C4_COLS);
}

export function connect4Drop(board: Board, col: number, seat: Seat): MoveResult | null {
  if (col < 0 || col >= C4_COLS) return null;

  // Fall to the lowest empty cell in the column.
  let row = -1;
  for (let r = C4_ROWS - 1; r >= 0; r--) {
    if (board[r][col] === 0) {
      row = r;
      break;
    }
  }
  if (row === -1) return null; // column full

  const next = board.map((r) => [...r]) as Board;
  next[row][col] = seat;

  const line = connect4Line(next, row, col, seat);
  if (line) {
    return { board: next, next: null, status: "won", winner: seat, highlight: line };
  }

  const full = next[0].every((c) => c !== 0);
  if (full) {
    return { board: next, next: null, status: "draw", winner: null, highlight: [] };
  }

  return { board: next, next: other(seat), status: "active", winner: null, highlight: [[row, col]] };
}

/** The four-in-a-row through (row, col), if there is one. */
function connect4Line(board: Board, row: number, col: number, seat: Seat): [number, number][] | null {
  const directions: [number, number][] = [
    [0, 1], // horizontal
    [1, 0], // vertical
    [1, 1], // diagonal down-right
    [1, -1], // diagonal down-left
  ];

  for (const [dr, dc] of directions) {
    const cells: [number, number][] = [[row, col]];

    for (const sign of [1, -1]) {
      let r = row + dr * sign;
      let c = col + dc * sign;
      while (r >= 0 && r < C4_ROWS && c >= 0 && c < C4_COLS && board[r][c] === seat) {
        cells.push([r, c]);
        r += dr * sign;
        c += dc * sign;
      }
    }

    if (cells.length >= 4) return cells;
  }

  return null;
}

export function connect4LegalMoves(board: Board): number[] {
  return Array.from({ length: C4_COLS }, (_, c) => c).filter((c) => board[0][c] === 0);
}

// ===========================================================================
// Reversi — 8x8, flip everything you bracket.
// ===========================================================================
export const R_SIZE = 8;

export function reversiInitial(): Board {
  const board = empty(R_SIZE, R_SIZE);
  const mid = R_SIZE / 2;
  board[mid - 1][mid - 1] = 2;
  board[mid - 1][mid] = 1;
  board[mid][mid - 1] = 1;
  board[mid][mid] = 2;
  return board;
}

const DIRECTIONS: [number, number][] = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];

/** Discs that placing at (row, col) would flip. Empty means illegal. */
export function reversiFlips(board: Board, row: number, col: number, seat: Seat): [number, number][] {
  if (board[row]?.[col] !== 0) return [];

  const flips: [number, number][] = [];

  for (const [dr, dc] of DIRECTIONS) {
    const run: [number, number][] = [];
    let r = row + dr;
    let c = col + dc;

    while (r >= 0 && r < R_SIZE && c >= 0 && c < R_SIZE && board[r][c] === other(seat)) {
      run.push([r, c]);
      r += dr;
      c += dc;
    }

    // Only counts if the run is closed off by one of your own.
    if (run.length > 0 && r >= 0 && r < R_SIZE && c >= 0 && c < R_SIZE && board[r][c] === seat) {
      flips.push(...run);
    }
  }

  return flips;
}

export function reversiLegalMoves(board: Board, seat: Seat): [number, number][] {
  const moves: [number, number][] = [];
  for (let r = 0; r < R_SIZE; r++) {
    for (let c = 0; c < R_SIZE; c++) {
      if (reversiFlips(board, r, c, seat).length > 0) moves.push([r, c]);
    }
  }
  return moves;
}

export function reversiCount(board: Board): { 1: number; 2: number } {
  let one = 0;
  let two = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell === 1) one++;
      else if (cell === 2) two++;
    }
  }
  return { 1: one, 2: two };
}

export function reversiPlay(board: Board, row: number, col: number, seat: Seat): MoveResult | null {
  const flips = reversiFlips(board, row, col, seat);
  if (flips.length === 0) return null;

  const next = board.map((r) => [...r]) as Board;
  next[row][col] = seat;
  for (const [r, c] of flips) next[r][c] = seat;

  // Turn passes back to you if your opponent has nothing legal to play.
  const opponent = other(seat);
  let turn: Seat | null = opponent;
  if (reversiLegalMoves(next, opponent).length === 0) {
    turn = reversiLegalMoves(next, seat).length > 0 ? seat : null;
  }

  if (turn === null) {
    const count = reversiCount(next);
    return {
      board: next,
      next: null,
      status: count[1] === count[2] ? "draw" : "won",
      winner: count[1] === count[2] ? null : count[1] > count[2] ? 1 : 2,
      highlight: [[row, col], ...flips],
    };
  }

  return {
    board: next,
    next: turn,
    status: "active",
    winner: null,
    highlight: [[row, col], ...flips],
  };
}
