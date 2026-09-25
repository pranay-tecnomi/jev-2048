// Terminal renderer for the Jev-plays-2048 CLI. ANSI colors only, no
// external dependencies — works in any standard terminal.
'use strict'

const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'
const ORANGE = '\x1b[38;5;208m'
const AMBER = '\x1b[38;5;215m'
const WHITE = '\x1b[97m'
const GRAY = '\x1b[90m'
const BLACK_BG = '\x1b[40m'

const TILE_COLORS = {
  0: GRAY,
  2: WHITE,
  4: WHITE,
  8: ORANGE,
  16: ORANGE,
  32: ORANGE,
  64: ORANGE,
  128: AMBER,
  256: AMBER,
  512: AMBER,
  1024: AMBER,
  2048: '\x1b[38;5;226m', // gold
}

const ARROW = { UP: '↑', DOWN: '↓', LEFT: '←', RIGHT: '→' }

function colorForTile(value) {
  return TILE_COLORS[value] || '\x1b[38;5;196m' // beyond 2048: red
}

function pad(str, width) {
  str = String(str)
  const left = Math.floor((width - str.length) / 2)
  const right = width - str.length - left
  return ' '.repeat(Math.max(0, left)) + str + ' '.repeat(Math.max(0, right))
}

function renderBoard(board) {
  const cellWidth = 6
  const lines = []
  const hr = GRAY + '+' + Array(4).fill('-'.repeat(cellWidth)).join('+') + '+' + RESET

  lines.push(hr)
  for (const row of board) {
    let line = GRAY + '|' + RESET
    for (const value of row) {
      const text = value === 0 ? '' : String(value)
      const color = colorForTile(value)
      line += color + BOLD + pad(text, cellWidth) + RESET + GRAY + '|' + RESET
    }
    lines.push(line)
    lines.push(hr)
  }
  return lines.join('\n')
}

function renderProbabilities(probabilities, choice) {
  const dirs = ['UP', 'DOWN', 'LEFT', 'RIGHT']
  const barWidth = 24
  return dirs
    .map((dir) => {
      const p = probabilities[dir] || 0
      const filled = Math.round(p * barWidth)
      const bar = ORANGE + '█'.repeat(filled) + GRAY + '░'.repeat(barWidth - filled) + RESET
      const marker = dir === choice ? ORANGE + BOLD + '>' + RESET : ' '
      const label = (ARROW[dir] + ' ' + dir).padEnd(8)
      const pct = Math.round(p * 100) + '%'
      return '  ' + marker + ' ' + label + ' ' + bar + ' ' + pct.padStart(4)
    })
    .join('\n')
}

function renderFrame(state) {
  const {
    board,
    score,
    moves,
    decisions,
    avgLatencyMs,
    lastDecision,
    status, // 'thinking' | 'idle' | 'won' | 'lost' | 'error'
    errorMessage,
  } = state

  const out = []
  out.push('')
  out.push(BOLD + ORANGE + '  JEV PLAYS 2048' + RESET + DIM + '  —  terminal edition' + RESET)
  out.push(GRAY + '  State → Jev → Decision → Action, live' + RESET)
  out.push('')
  out.push(renderBoard(board))
  out.push('')
  out.push(
    '  ' +
      BOLD + 'SCORE ' + RESET + ORANGE + BOLD + score + RESET +
      GRAY + '    MOVES ' + RESET + WHITE + moves + RESET +
      GRAY + '    DECISIONS ' + RESET + WHITE + decisions + RESET +
      GRAY + '    AVG LATENCY ' + RESET + WHITE + (avgLatencyMs != null ? Math.round(avgLatencyMs) + 'ms' : '-') + RESET
  )
  out.push('')

  if (status === 'thinking') {
    out.push('  ' + ORANGE + BOLD + 'JEV' + RESET + GRAY + ' is deciding...' + RESET)
  } else if (status === 'error') {
    out.push('  ' + '\x1b[91m' + BOLD + 'Error: ' + RESET + '\x1b[91m' + errorMessage + RESET)
  } else if (lastDecision) {
    out.push(
      '  ' + ORANGE + BOLD + 'JEV' + RESET + '  chose  ' +
        ORANGE + BOLD + ARROW[lastDecision.choice] + ' ' + lastDecision.choice + RESET +
        GRAY + '   (' + Math.round(lastDecision.latencyMs) + 'ms)' + RESET
    )
    out.push('')
    out.push(renderProbabilities(lastDecision.probabilities, lastDecision.choice))
  } else {
    out.push(GRAY + '  Waiting for first decision...' + RESET)
  }

  out.push('')
  if (status === 'won') {
    out.push('  ' + BOLD + ORANGE + 'REACHED 2048! Final score: ' + score + RESET)
  } else if (status === 'lost') {
    out.push('  ' + BOLD + '\x1b[91mGAME OVER. Final score: ' + score + RESET)
  } else {
    out.push(GRAY + '  Press Ctrl+C to quit.' + RESET)
  }
  out.push('')

  return out.join('\n')
}

function clearScreen() {
  process.stdout.write('\x1b[2J\x1b[H')
}

module.exports = { renderFrame, clearScreen, BLACK_BG, RESET }
