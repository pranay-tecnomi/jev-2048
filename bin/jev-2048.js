#!/usr/bin/env node
'use strict'

const { newGame, move, spawnTile, legalMoves, isGameOver, hasWon } = require('../lib/game2048')
const { decide, JEV_ENDPOINT } = require('../lib/jev')
const { renderFrame, Screen } = require('../lib/render')

const DEFAULT_INTERVAL_MS = Number(process.env.JEV_2048_INTERVAL_MS) || 1200

function parseArgs(argv) {
  const args = { interval: DEFAULT_INTERVAL_MS }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--interval' && argv[i + 1]) {
      args.interval = Number(argv[++i]) || DEFAULT_INTERVAL_MS
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

Controls (while running):
  SPACE   pause / resume
  R       reset the game
  Q       quit
  Ctrl+C  quit

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

  // --- mutable game state ---
  let board = newGame()
  let score = 0
  let moves = 0
  let decisions = 0
  let illegalCorrections = 0
  const latencies = []
  let lastDecision = null
  let paused = false
  let quit = false
  let ticking = false // true while a decide() request is in flight
  let resetRequested = false

  const screen = new Screen()

  function draw(status, errorMessage) {
    const avgLatencyMs =
      latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null
    const bestTile = board.reduce((max, r) => Math.max(max, ...r), 0)
    screen.write(
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

  function resetGame() {
    board = newGame()
    score = 0
    moves = 0
    decisions = 0
    illegalCorrections = 0
    latencies.length = 0
    lastDecision = null
  }

  function currentStatus() {
    if (paused) return 'paused'
    if (ticking) return 'thinking'
    return 'idle'
  }

  function shutdown(message) {
    quit = true
    screen.close()
    if (message) console.log(message)
    process.exit(0)
  }

  // --- raw-mode keyboard handling: instant, non-blocking key reads ---
  const canReadKeys = Boolean(process.stdin.isTTY)
  if (canReadKeys) {
    const readline = require('readline')
    readline.emitKeypressEvents(process.stdin)
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.on('keypress', (str, key) => {
      if (key && key.ctrl && key.name === 'c') {
        shutdown('\nStopped. Final score: ' + score)
        return
      }
      const lower = (str || '').toLowerCase()
      if (lower === 'q') {
        shutdown('\nStopped. Final score: ' + score)
      } else if (str === ' ') {
        paused = !paused
        draw(currentStatus())
      } else if (lower === 'r') {
        resetGame()
        resetRequested = true
        draw(currentStatus())
      }
    })
  }

  process.on('SIGINT', () => shutdown('\nStopped. Final score: ' + score))

  screen.open()
  draw('idle')

  // --- main loop: never blocks key handling while "resting" between ticks ---
  while (!quit) {
    if (paused) {
      await sleep(50)
      continue
    }

    const legal = legalMoves(board)
    if (legal.length === 0) {
      draw(hasWon(board) ? 'won' : 'lost')
      await waitForResetOrQuit()
      continue
    }

    ticking = true
    draw('thinking')

    let result
    try {
      result = await decide(apiKey, board, score, moves, legal)
    } catch (err) {
      ticking = false
      draw('error', err.message)
      await waitForResetOrQuit()
      continue
    }
    ticking = false

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
    lastDecision = {
      choice: chosenDirection,
      confidence: result.confidence,
      probabilities: result.probabilities,
      latencyMs: result.latencyMs,
    }

    if (isGameOver(board)) {
      draw(hasWon(board) ? 'won' : 'lost')
      await waitForResetOrQuit()
      continue
    }

    draw(currentStatus())
    await sleepInterruptible(args.interval)
  }

  // Sleeps for `ms`, but wakes early (checked in 50ms slices) if the user
  // pauses, resets, or quits, so keys always feel instant.
  async function sleepInterruptible(ms) {
    const end = Date.now() + ms
    while (Date.now() < end && !quit && !paused) {
      await sleep(Math.min(50, end - Date.now()))
    }
  }

  // While game-over or on an error, keep the screen live and responsive to
  // R (reset) / Q (quit) without spinning a busy loop.
  async function waitForResetOrQuit() {
    while (!quit && !resetRequested) {
      await sleep(50)
    }
    resetRequested = false
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

main().catch((err) => {
  process.stdout.write('\x1b[?25h\x1b[?1049l') // best-effort: restore terminal
  console.error('\nUnexpected error: ' + err.message + '\n')
  process.exitCode = 1
})
