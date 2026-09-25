// Pure 2048 engine: 4x4 board, no I/O or terminal dependencies.
// Board is a 4x4 array of numbers (0 = empty).
'use strict'

const SIZE = 4
const DIRECTIONS = ['UP', 'DOWN', 'LEFT', 'RIGHT']

function emptyBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0))
}

function cloneBoard(board) {
  return board.map((row) => row.slice())
}

function emptyCells(board) {
  const cells = []
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] === 0) cells.push([r, c])
    }
  }
  return cells
}

function spawnTile(board, rng) {
  rng = rng || Math.random
  const cells = emptyCells(board)
  if (cells.length === 0) return board
  const [r, c] = cells[Math.floor(rng() * cells.length)]
  const next = cloneBoard(board)
  next[r][c] = rng() < 0.9 ? 2 : 4
  return next
}

function newGame(rng) {
  let board = emptyBoard()
  board = spawnTile(board, rng)
  board = spawnTile(board, rng)
  return board
}

// Slides + merges one row to the left. Returns { row, gained, moved }.
function slideRowLeft(row) {
  const values = row.filter((v) => v !== 0)
  const result = []
  let gained = 0
  let moved = false

  for (let i = 0; i < values.length; i++) {
    if (i < values.length - 1 && values[i] === values[i + 1]) {
      const merged = values[i] * 2
      result.push(merged)
      gained += merged
      i++
    } else {
      result.push(values[i])
    }
  }
  while (result.length < SIZE) result.push(0)

  for (let i = 0; i < SIZE; i++) {
    if (row[i] !== result[i]) moved = true
  }

  return { row: result, gained, moved }
}

function rotationsForDirection(direction) {
  switch (direction) {
    case 'LEFT':
      return 0
    case 'RIGHT':
      return 2
    case 'UP':
      return 3 // rotate so "up" becomes "left"
    case 'DOWN':
      return 1
    default:
      throw new Error('Unknown direction: ' + direction)
  }
}

function rotateCW(board) {
  const next = emptyBoard()
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      next[c][SIZE - 1 - r] = board[r][c]
    }
  }
  return next
}

function rotateBoardTimes(board, times) {
  let b = board
  for (let i = 0; i < times; i++) b = rotateCW(b)
  return b
}

/**
 * Applies a move in the given direction.
 * Returns { board, gained, moved } — `moved` is false if the move is illegal
 * (no tiles shifted or merged), in which case `board` is unchanged.
 */
function move(board, direction) {
  const rotations = rotationsForDirection(direction)
  const rotated = rotateBoardTimes(board, rotations)

  let gained = 0
  let moved = false
  const resultRows = rotated.map((row) => {
    const r = slideRowLeft(row)
    gained += r.gained
    if (r.moved) moved = true
    return r.row
  })

  const restored = rotateBoardTimes(resultRows, (SIZE - rotations) % SIZE)

  return { board: moved ? restored : board, gained, moved }
}

function legalMoves(board) {
  return DIRECTIONS.filter((dir) => move(board, dir).moved)
}

function isGameOver(board) {
  return legalMoves(board).length === 0
}

function hasWon(board) {
  return board.some((row) => row.some((v) => v >= 2048))
}

module.exports = {
  SIZE,
  DIRECTIONS,
  emptyBoard,
  spawnTile,
  newGame,
  move,
  legalMoves,
  isGameOver,
  hasWon,
}
