'use strict'

const { move: applyMove } = require('./game2048')

function log2(v) {
  return v > 0 ? Math.log2(v) : 0
}

function evaluateBoard(board2d) {
  let empty = 0
  for (const row of board2d) {
    for (const v of row) if (v === 0) empty++
  }

  let monotonicity = 0
  for (let r = 0; r < 4; r++) {
    let incr = 0
    let decr = 0
    for (let c = 0; c < 3; c++) {
      const a = log2(board2d[r][c])
      const b = log2(board2d[r][c + 1])
      if (a > b) decr += a - b
      else incr += b - a
    }
    monotonicity -= Math.min(incr, decr)
  }
  for (let c = 0; c < 4; c++) {
    let incr = 0
    let decr = 0
    for (let r = 0; r < 3; r++) {
      const a = log2(board2d[r][c])
      const b = log2(board2d[r + 1][c])
      if (a > b) decr += a - b
      else incr += b - a
    }
    monotonicity -= Math.min(incr, decr)
  }

  let smoothness = 0
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (board2d[r][c] === 0) continue
      const v = log2(board2d[r][c])
      if (c + 1 < 4 && board2d[r][c + 1] !== 0) smoothness -= Math.abs(v - log2(board2d[r][c + 1]))
      if (r + 1 < 4 && board2d[r + 1][c] !== 0) smoothness -= Math.abs(v - log2(board2d[r + 1][c]))
    }
  }

  let best = 0
  for (const row of board2d) for (const v of row) best = Math.max(best, v)
  const corners = [board2d[0][0], board2d[0][3], board2d[3][0], board2d[3][3]]
  const cornerBonus = best > 0 && corners.includes(best) ? log2(best) * 2 : 0

  return empty * 2.7 + monotonicity * 1.0 + smoothness * 0.1 + cornerBonus
}

const DIRS = ['UP', 'DOWN', 'LEFT', 'RIGHT']

function cloneBoard(b) {
  return [b[0].slice(), b[1].slice(), b[2].slice(), b[3].slice()]
}

function getEmpty(b) {
  let e = []
  for (let r=0; r<4; r++) for (let c=0; c<4; c++) if (b[r][c] === 0) e.push([r, c]);
  return e;
}

function expectimax(b, depth, isPlayer) {
  if (depth === 0) return evaluateBoard(b)

  if (isPlayer) {
    let best = -999999;
    for (let i = 0; i < 4; i++) {
      const next = applyMove(b, DIRS[i]);
      if (next.gained !== -1) {
        const score = expectimax(next.board, depth - 1, false);
        if (score > best) best = score;
      }
    }
    return best === -999999 ? 0 : best;
  } else {
    let score2 = 0;
    let score4 = 0;
    const empties = getEmpty(b);
    if (empties.length === 0) return 0;
    for (const [r, c] of empties) {
      const b2 = cloneBoard(b);
      b2[r][c] = 2;
      score2 += expectimax(b2, depth - 1, true);

      const b4 = cloneBoard(b);
      b4[r][c] = 4;
      score4 += expectimax(b4, depth - 1, true);
    }
    return (0.9 * score2 + 0.1 * score4) / empties.length;
  }
}

function planMoves(board2d, legalMoves) {
  if (legalMoves.length === 0) return { ranked: [], best: null, scores: {}, labels: {} };

  let empty = 0;
  for (let r=0; r<4; r++) {
    for (let c=0; c<4; c++) {
      if (board2d[r][c] === 0) empty++;
    }
  }

  // Adjust depth based on empty cells to maintain decent latency (~50-100ms)
  const depth = empty >= 8 ? 2 : (empty >= 4 ? 3 : 4);

  const scores = {}
  for (const dir of legalMoves) {
    const next = applyMove(board2d, dir);
    if (next.gained !== -1) {
      scores[dir] = expectimax(next.board, depth, false);
    } else {
      scores[dir] = -999999;
    }
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
