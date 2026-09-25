#!/usr/bin/env node
'use strict'

const { newGame, move, spawnTile, legalMoves, isGameOver, hasWon } = require('../lib/game2048')
const { decide, JEV_ENDPOINT } = require('../lib/jev')
const { renderFrame, clearScreen } = require('../lib/render')

const DECISION_INTERVAL_MS = Number(process.env.JEV_2048_INTERVAL_MS) || 1200

function parseArgs(argv) {
  const args = { interval: DECISION_INTERVAL_MS }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--interval' && argv[i + 1]) {
      args.interval = Number(argv[++i]) || DECISION_INTERVAL_MS
    } else if (a === '--help' || a === '-h') {
      args.help = true
    } else if (a === '--version' || a === '-v') {
      args.version = true
    }
  }
  return args
}

function printHelp() {
  console.log(`
jev-2048 — watch the Jev decision model play 2048 live in your terminal.

Usage:
  jev-2048 [--interval <ms>]

Options:
  --interval <ms>   Milliseconds between decisions (default: 1200)
  -v, --version     Print the version and exit
  -h, --help        Show this help and exit

Requires a Jev API key from https://console.typesafe.ai/keys, set as:
  export JEV_API_KEY=jv_live_...

Every move is decided by a real call to ${JEV_ENDPOINT} using your own key —
nothing is simulated and no key is sent anywhere but the official Jev API.
`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.help) {
    printHelp()
    return
  }
  if (args.version) {
    console.log(require('../package.json').version)
    return
  }

  const apiKey = process.env.JEV_API_KEY
  if (!apiKey) {
    console.error('\nMissing JEV_API_KEY environment variable.')
    console.error('Get a key from https://console.typesafe.ai/keys, then run:')
    console.error('  export JEV_API_KEY=jv_live_...\n')
    process.exitCode = 1
    return
  }

  let board = newGame()
  let score = 0
  let moves = 0
  let decisions = 0
  let illegalCorrections = 0
  const latencies = []
  let lastDecision = null
  let running = true

  function draw(status, errorMessage) {
    clearScreen()
    const avgLatencyMs =
      latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null
    const bestTile = board.reduce((max, r) => Math.max(max, ...r), 0)
    process.stdout.write(
      renderFrame({
        board,
        score,
        moves,
        decisions,
        avgLatencyMs,
        lastDecision,
        status,
        errorMessage,
        illegalCorrections,
        bestTile,
      })
    )
  }

  process.on('SIGINT', () => {
    running = false
    clearScreen()
    console.log('Stopped. Final score: ' + score + '\n')
    process.exit(0)
  })

  draw('idle')

  while (running) {
    const legal = legalMoves(board)
    if (legal.length === 0) {
      draw(hasWon(board) ? 'won' : 'lost')
      break
    }

    draw('thinking')

    let result
    try {
      result = await decide(apiKey, board, score, moves, legal)
    } catch (err) {
      draw('error', err.message)
      break
    }

    let chosenDirection = result.choice
    if (!legal.includes(chosenDirection)) {
      // Safety net: never apply an illegal move — fall back to the
      // highest-probability legal direction Jev actually offered.
      const ranked = legal
        .slice()
        .sort((a, b) => (result.probabilities[b] || 0) - (result.probabilities[a] || 0))
      chosenDirection = ranked[0]
      illegalCorrections += 1
    }

    const moveResult = move(board, chosenDirection)
    board = spawnTile(moveResult.board)
    score += moveResult.gained
    moves += 1
    decisions += 1
    latencies.push(result.latencyMs)
    lastDecision = { choice: chosenDirection, confidence: result.confidence, probabilities: result.probabilities, latencyMs: result.latencyMs }

    if (isGameOver(board)) {
      draw(hasWon(board) ? 'won' : 'lost')
      break
    }

    draw('idle')
    await new Promise((resolve) => setTimeout(resolve, args.interval))
  }
}

main().catch((err) => {
  console.error('\nUnexpected error: ' + err.message + '\n')
  process.exitCode = 1
})
