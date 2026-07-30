/**
 * Rules tests for the draughts engine.
 *
 *   node scripts/checkers.test.mts
 *
 * Node strips the types itself; no build step and no test framework.
 *
 * Every piece below sits on a dark square — (row + col) must be odd — because
 * the engine only ever moves along dark diagonals. Two of these tests failed
 * on first writing purely because the fixtures broke that, which is a good
 * argument for keeping the boards drawn out as pictures.
 */
import {
  DEFAULT_RULES,
  SIZE,
  applyMove,
  count,
  isPlayable,
  jumpsFrom,
  legalMoves,
  seatOf,
  type CheckersBoard,
  type CheckersRules,
  type Piece,
} from "../lib/checkers.ts";

let failures = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** `.` empty, `a`/`A` seat 1 man/king, `b`/`B` seat 2 man/king. */
function board(rows: string[]): CheckersBoard {
  const map: Record<string, Piece> = { ".": 0, a: 1, b: 2, A: 3, B: 4 };
  const grid = rows.map((row) => [...row.replace(/\s/g, "")].map((ch) => map[ch]));

  // Guard the fixtures themselves.
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c] !== 0 && !isPlayable(r, c)) {
        throw new Error(`fixture puts a piece on a light square at ${r},${c}`);
      }
    }
  }
  return grid;
}

function show(b: CheckersBoard): string {
  const glyph = [".", "a", "b", "A", "B"];
  return b.map((row) => row.map((c) => glyph[c]).join("")).join("\n");
}

const ENGLISH: CheckersRules = { backwardCaptures: false };

// ---------------------------------------------------------------------------
console.log("\nboard setup");
{
  const b = board([
    ".b.b.b.b",
    "b.b.b.b.",
    ".b.b.b.b",
    "........",
    "........",
    "a.a.a.a.",
    ".a.a.a.a",
    "a.a.a.a.",
  ]);
  const c = count(b);
  check("twelve each", c[1] === 12 && c[2] === 12, `got ${c[1]}/${c[2]}`);
  check("eight rows", b.length === SIZE);
  check("seat 1 along the bottom", seatOf(b[7][0]) === 1);
  check("seat 2 across the top", seatOf(b[0][1]) === 2);
}

// ---------------------------------------------------------------------------
console.log("\nforward multi-jump — the chain machinery itself");
{
  // Seat 1 at 5,0 takes 4,1 landing 3,2, then takes 2,3 landing 1,4.
  // The spare enemy at 0,7 exists so the game does not simply end.
  const b = board([
    ".......b",
    "........",
    "...b....",
    "........",
    ".b......",
    "a.......",
    "........",
    "........",
  ]);

  const first = jumpsFrom(b, 5, 0);
  check("first jump found", first.length === 1, `got ${first.length}`);

  const step1 = applyMove(b, first[0], 1);
  check("landed on 3,2", step1.board[3][2] === 1, `\n${show(step1.board)}`);
  check("victim removed", step1.board[4][1] === 0);
  check("chain continues", step1.chain !== null, `chain=${JSON.stringify(step1.chain)}`);
  check("still seat 1 to move", step1.next === 1, `next=${step1.next}`);

  const second = legalMoves(step1.board, 1, step1.chain);
  check("only the chained piece may move", second.length === 1, `got ${second.length}`);

  const step2 = applyMove(step1.board, second[0], 1);
  check("second victim removed", step2.board[2][3] === 0);
  check("landed on 1,4", step2.board[1][4] === 1, `\n${show(step2.board)}`);
  check("chain ends", step2.chain === null);
  check("turn passes", step2.next === 2, `next=${step2.next}`);
  check("two taken in one turn", count(step2.board)[2] === 1, `${count(step2.board)[2]} left`);
}

// ---------------------------------------------------------------------------
console.log("\nbackward capture");
{
  // Seat 1 man at 4,3; an enemy behind it at 5,4; empty landing at 6,5.
  const b = board([
    "........",
    "........",
    "........",
    "........",
    "...a....",
    "....b...",
    "........",
    "........",
  ]);

  check("allowed by default", jumpsFrom(b, 4, 3, DEFAULT_RULES).length === 1);
  check("refused under English rules", jumpsFrom(b, 4, 3, ENGLISH).length === 0);

  const result = applyMove(b, jumpsFrom(b, 4, 3)[0], 1);
  check("lands behind itself", result.board[6][5] === 1, `\n${show(result.board)}`);
  check("does not crown on the way", result.crowned === false);
}

// ---------------------------------------------------------------------------
console.log("\na man may still only *move* forwards");
{
  const b = board([
    "........",
    "........",
    "........",
    "........",
    "...a....",
    "........",
    "........",
    "........",
  ]);

  const moves = legalMoves(b, 1, null);
  check("two quiet moves", moves.length === 2, `got ${moves.length}`);
  check("both go up the board", moves.every((m) => m.to[0] === 3), JSON.stringify(moves));
}

// ---------------------------------------------------------------------------
console.log("\nchain that turns backwards — the reported bug");
{
  // Enemies fore and aft of a seat 1 man: both legs should be on offer, and
  // English rules should offer only the forward one.
  const zig = board([
    "........",
    "........",
    ".....b..",
    "....a...",
    ".....b..",
    "........",
    "........",
    "........",
  ]);

  check("both directions offered", jumpsFrom(zig, 3, 4, DEFAULT_RULES).length === 2);
  check("English offers one", jumpsFrom(zig, 3, 4, ENGLISH).length === 1);

  // And the chain must survive a change of direction: take forwards, then
  // backwards, in a single turn.
  const chain = board([
    "........",
    "........",
    "...b....",
    "........",
    "...b....",
    "..a.....",
    "........",
    "........",
  ]);

  const opening = jumpsFrom(chain, 5, 2).find((m) => m.to[0] === 3 && m.to[1] === 4);
  check("forward leg available", !!opening);

  const first = applyMove(chain, opening!, 1);
  check("landed 3,4", first.board[3][4] === 1, `\n${show(first.board)}`);
  check(
    "chain continues over 2,3 backwards-capable piece",
    first.chain !== null,
    `chain=${JSON.stringify(first.chain)}`
  );

  const legs = legalMoves(first.board, 1, first.chain);
  check("a continuation exists", legs.length >= 1, `got ${legs.length}`);

  const second = applyMove(first.board, legs[0], 1);
  check("both enemies gone", count(second.board)[2] === 0, `\n${show(second.board)}`);
  check("seat 1 wins by clearing the board", second.status === "won" && second.winner === 1);
}

// ---------------------------------------------------------------------------
console.log("\ncaptures are compulsory");
{
  const b = board([
    "........",
    "........",
    "........",
    "........",
    ".b......",
    "a.....a.",
    "........",
    "........",
  ]);

  const moves = legalMoves(b, 1, null);
  check("only jumps offered", moves.every((m) => m.captured !== null));
  check("the idle man may not stroll", moves.length === 1, `got ${moves.length}`);
}

// ---------------------------------------------------------------------------
console.log("\ncrowning");
{
  // Spare enemy at 5,0 so the game continues and the turn can pass.
  const b = board([
    "........",
    "..a.....",
    "........",
    "........",
    "........",
    "b.......",
    "........",
    "........",
  ]);

  const step = applyMove(b, { from: [1, 2], to: [0, 1], captured: null }, 1);
  check("crowned on the far row", step.crowned && step.board[0][1] === 3, `\n${show(step.board)}`);
  check("crowning ends the turn", step.chain === null && step.next === 2, `next=${step.next}`);
}

// ---------------------------------------------------------------------------
console.log("\nkings move and capture in every direction");
{
  const b = board([
    "........",
    "........",
    "........",
    "....b...",
    "...A....",
    "....b...",
    "........",
    "........",
  ]);

  check("king sees both jumps", jumpsFrom(b, 4, 3, ENGLISH).length === 2);
}

// ---------------------------------------------------------------------------
console.log("\nrunning out of pieces loses");
{
  const b = board([
    "........",
    "........",
    "........",
    "........",
    "...b....",
    "..a.....",
    "........",
    "........",
  ]);

  const jump = jumpsFrom(b, 5, 2).find((m) => m.captured);
  check("a capture is available", !!jump);

  const step = applyMove(b, jump!, 1);
  check("seat 1 wins", step.status === "won" && step.winner === 1, `status=${step.status}`);
}

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} failed.\n`);

// Setting the code rather than calling process.exit avoids tearing down stdout
// mid-flush, which trips a libuv assertion on Windows.
process.exitCode = failures === 0 ? 0 : 1;
