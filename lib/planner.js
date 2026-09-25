// 2048 move planner — the game-logic equivalent of laya-mlx's Snake planner
// (see laya_mlx/snake/policy.py: game.moves() + game.food_reachability()).
//
// Snake's approach: classical game logic computes which moves are safe
// (won't trap the snake) and which is best (most progress toward food),
// then the model is asked to choose among options that are *already
// pre-labeled* with that verdict ("Safe. Eat food now. Best." / "Unsafe.
// Traps the snake."). The model's job becomes picking the labeled-best
// option, not discovering strategy from a raw board dump — and a safety
// shield forces the executed move back into the safe set regardless of
// what the model answers.
//
// This does the same thing for 2048: simulates every legal move one ply
// ahead (game2048.move() is pure and cheap), scores the resulting boards
// with the standard monotonicity/smoothness/empty-cells/corner heuristic
// real 2048 bots use, ranks them, and produces per-direction labels the
// model can act on almost by just reading them.
'use strict'

const { move: applyMove, SIZE } = require('./game2048')

function log2(v) {
  return v > 0 ? Math.log2(v) : 0
}

// Higher is better. Combines four standard 2048 heuristics:
//  - empty cells: more open space is safer
//  - monotonicity: rows/cols trending consistently in value (supports a
//    stable merge order instead of a jumbled board)
//  - smoothness: neighboring tiles close in value merge more easily
//  - corner bonus: reward the max tile sitting in a corner
function evaluateBoard(board) {
  let empty = 0
  for (const row of board) {
    for (const v of row) if (v === 0) empty++
  }

  // Monotonicity: for each row and each column, measure how far it is from
  // being sorted (in the better of increasing/decreasing order), in log2
  // space so tile magnitude differences matter proportionally.
  let monotonicity = 0
  for (let r = 0; r < SIZE; r++) {
    let incr = 0
    let decr = 0
    for (let c = 0; c < SIZE - 1; c++) {
      const a = log2(board[r][c])
      const b = log2(board[r][c + 1])
      if (a > b) decr += a - b
      else incr += b - a
    }
    monotonicity -= Math.min(incr, decr)
  }
  for (let c = 0; c < SIZE; c++) {
    let incr = 0
    let decr = 0
    for (let r = 0; r < SIZE - 1; r++) {
      const a = log2(board[r][c])
      const b = log2(board[r + 1][c])
      if (a > b) decr += a - b
      else incr += b - a
    }
    monotonicity -= Math.min(incr, decr)
  }

  // Smoothness: penalize large log2 differences between horizontal/vertical
  // neighbors — smooth boards merge more readily.
  let smoothness = 0
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] === 0) continue
      const v = log2(board[r][c])
      if (c + 1 < SIZE && board[r][c + 1] !== 0) smoothness -= Math.abs(v - log2(board[r][c + 1]))
      if (r + 1 < SIZE && board[r + 1][c] !== 0) smoothness -= Math.abs(v - log2(board[r + 1][c]))
    }
  }

  // Corner bonus: reward the max tile being in any of the four corners.
  let best = 0
  for (const row of board) for (const v of row) best = Math.max(best, v)
  const corners = [board[0][0], board[0][SIZE - 1], board[SIZE - 1][0], board[SIZE - 1][SIZE - 1]]
  const cornerBonus = best > 0 && corners.includes(best) ? log2(best) * 2 : 0

  return empty * 2.7 + monotonicity * 1.0 + smoothness * 0.1 + cornerBonus
}

/**
 * Simulates every legal move one ply ahead and returns a ranked plan:
 * {
 *   ranked: ['LEFT', 'DOWN', ...],       // best first, by heuristic score
 *   best: 'LEFT',
 *   scores: { LEFT: 12.3, DOWN: 9.1, ... },
 *   labels: { LEFT: 'Best. ...', DOWN: 'Safe but slower. ...', ... }
 * }
 *
 * Mirrors Snake's per-direction `descriptions` dict: each legal direction
 * gets a short, decisive label a classifier can act on directly, instead of
 * having to infer strategy from the raw board alone.
 */
function planMoves(board, legalMoves) {
  const scores = {}
  for (const dir of legalMoves) {
    const result = applyMove(board, dir)
    // Small tie-break bonus for immediate merge gain, but the positional
    // heuristic dominates — chasing raw merge score alone is exactly the
    // greedy trap that leads to a stuck board.
    scores[dir] = evaluateBoard(result.board) + Math.log2(result.gained + 1) * 0.5
  }

  const ranked = legalMoves.slice().sort((a, b) => scores[b] - scores[a])
  const best = ranked[0]

  const labels = {}
  ranked.forEach((dir, i) => {
    if (dir === best) {
      labels[dir] = 'Best move: strongest resulting board position.'
    } else if (i === ranked.length - 1 && ranked.length > 1) {
      labels[dir] = 'Weakest option: worsens board position the most.'
    } else {
      labels[dir] = 'Legal but weaker than the best move.'
    }
  })

  return { ranked, best, scores, labels }
}

module.exports = { evaluateBoard, planMoves }
