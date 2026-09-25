// Headless benchmark: plays N full games against the local Laya engine
// (no terminal rendering) and reports score/move/max-tile stats, to check
// whether a prompt change actually helps on average rather than eyeballing
// single runs (which have high variance).
'use strict'

const path = require('path')
const { newGame, move, spawnTile, legalMoves, isGameOver, hasWon } = require('../lib/game2048')
const { LocalEngine, decide } = require('../lib/localEngine')

const TRIALS = Number(process.argv[2]) || 5
const MAX_MOVES = 400

async function playOneGame(engine) {
  let board = newGame()
  let score = 0
  let moves = 0
  while (moves < MAX_MOVES) {
    const legal = legalMoves(board)
    if (legal.length === 0) break
    const result = await decide(engine, board, score, moves, legal)
    let dir = result.choice
    if (!legal.includes(dir)) {
      dir = legal.slice().sort((a, b) => (result.probabilities[b] || 0) - (result.probabilities[a] || 0))[0]
    }
    const r = move(board, dir)
    board = spawnTile(r.board)
    score += r.gained
    moves += 1
    if (isGameOver(board)) break
  }
  const maxTile = board.reduce((m, row) => Math.max(m, ...row), 0)
  return { score, moves, maxTile, won: hasWon(board) }
}

async function main() {
  const engine = new LocalEngine({
    pythonPath: process.env.JEV_2048_LOCAL_VENV
      ? path.join(process.env.JEV_2048_LOCAL_VENV, 'bin', 'python')
      : undefined,
    modelDir: process.env.JEV_2048_LOCAL_MODEL,
  })
  console.log('Loading model...')
  await engine.start()
  console.log(`Playing ${TRIALS} games...\n`)

  const results = []
  for (let i = 0; i < TRIALS; i++) {
    const r = await playOneGame(engine)
    results.push(r)
    console.log(`game ${i + 1}: score=${r.score} moves=${r.moves} maxTile=${r.maxTile}`)
  }

  engine.stop()

  const avg = (key) => results.reduce((s, r) => s + r[key], 0) / results.length
  const max = (key) => Math.max(...results.map((r) => r[key]))
  console.log('\n--- summary ---')
  console.log('avg score:', avg('score').toFixed(1))
  console.log('avg moves:', avg('moves').toFixed(1))
  console.log('avg maxTile:', avg('maxTile').toFixed(1))
  console.log('best maxTile:', max('maxTile'))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
