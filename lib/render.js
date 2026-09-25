// Terminal renderer for the Jev-plays-2048 CLI. ANSI colors only, no
// external dependencies — styled as a bordered dashboard panel.
'use strict'

const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'
const ORANGE = '\x1b[38;5;208m'
const AMBER = '\x1b[38;5;215m'
const GOLD = '\x1b[38;5;226m'
const WHITE = '\x1b[97m'
const GRAY = '\x1b[90m'
const DARK_GRAY = '\x1b[38;5;238m'
const RED = '\x1b[91m'
const GREEN = '\x1b[92m'

const ARROW = { UP: '↑', DOWN: '↓', LEFT: '←', RIGHT: '→' }

const TILE_COLORS = {
  0: DARK_GRAY,
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
  2048: GOLD,
}

function colorForTile(value) {
  return TILE_COLORS[value] || RED // beyond 2048
}

// --- low-level string helpers (ANSI-aware padding) ---

function visibleLength(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '').length
}

function padVisible(str, width) {
  const len = visibleLength(str)
  if (len > width) {
    // Strip ANSI codes before truncating so we never cut mid-escape-sequence;
    // overflow is rare (only very long error text) and losing color here is fine.
    return str.replace(/\x1b\[[0-9;]*m/g, '').slice(0, width)
  }
  return str + ' '.repeat(width - len)
}

function centerVisible(str, width) {
  const len = visibleLength(str)
  const left = Math.floor(Math.max(0, width - len) / 2)
  const right = Math.max(0, width - len - left)
  return ' '.repeat(left) + str + ' '.repeat(right)
}

// --- panel frame drawing ---

const PANEL_WIDTH = 84

function topBorder() {
  return GRAY + '╭' + '─'.repeat(PANEL_WIDTH - 2) + '╮' + RESET
}
function bottomBorder() {
  return GRAY + '╰' + '─'.repeat(PANEL_WIDTH - 2) + '╯' + RESET
}
function divider() {
  return GRAY + '├' + '─'.repeat(PANEL_WIDTH - 2) + '┤' + RESET
}
function row(content) {
  const inner = PANEL_WIDTH - 4
  return GRAY + '│ ' + RESET + padVisible(content, inner) + GRAY + ' │' + RESET
}
function blankRow() {
  return row('')
}

// --- content builders ---

function renderHeaderRow(status) {
  const title = BOLD + WHITE + 'JEV' + RESET + DIM + ' / ' + RESET + BOLD + 'PLAYS 2048' + RESET
  const statusPill =
    status === 'thinking'
      ? ORANGE + BOLD + '● THINKING' + RESET
      : status === 'paused'
        ? GRAY + BOLD + '● PAUSED' + RESET
        : status === 'won'
          ? GOLD + BOLD + '● WON' + RESET
          : status === 'lost'
            ? RED + BOLD + '● GAME OVER' + RESET
            : status === 'error'
              ? RED + BOLD + '● ERROR' + RESET
              : GREEN + BOLD + '● LIVE' + RESET
  const inner = PANEL_WIDTH - 4
  const leftLen = visibleLength(title)
  const rightLen = visibleLength(statusPill)
  const gap = Math.max(1, inner - leftLen - rightLen)
  return title + ' '.repeat(gap) + statusPill
}

function boardLines(board) {
  const cellWidth = 5
  const lines = []
  const hr = DARK_GRAY + '+' + Array(4).fill('-'.repeat(cellWidth)).join('+') + '+' + RESET

  lines.push(hr)
  for (const line of board) {
    let text = DARK_GRAY + '|' + RESET
    for (const value of line) {
      const t = value === 0 ? '' : String(value)
      const color = colorForTile(value)
      text += color + BOLD + centerVisible(t, cellWidth) + RESET + DARK_GRAY + '|' + RESET
    }
    lines.push(text)
    lines.push(hr)
  }
  return lines
}

function statLine(label, value, color) {
  return GRAY + label + ' ' + RESET + (color || WHITE) + BOLD + value + RESET
}

function probRows(probabilities, choice) {
  const dirs = ['UP', 'DOWN', 'LEFT', 'RIGHT']
  const barWidth = 18
  return dirs.map((dir) => {
    const p = probabilities[dir] || 0
    const filled = Math.round(p * barWidth)
    const isChoice = dir === choice
    const barColor = isChoice ? ORANGE : DARK_GRAY
    const bar = barColor + '█'.repeat(filled) + DARK_GRAY + '░'.repeat(barWidth - filled) + RESET
    const marker = isChoice ? ORANGE + BOLD + '›' + RESET : ' '
    const arrow = isChoice ? ORANGE + BOLD + ARROW[dir] + RESET : GRAY + ARROW[dir] + RESET
    const label = (isChoice ? WHITE + BOLD : GRAY) + dir.padEnd(6) + RESET
    const pct = (Math.round(p * 100) + '%').padStart(4)
    return marker + ' ' + arrow + ' ' + label + ' ' + bar + ' ' + (isChoice ? ORANGE + BOLD : GRAY) + pct + RESET
  })
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
    illegalCorrections,
    bestTile,
  } = state

  const lines = []
  lines.push('')
  lines.push(topBorder())
  lines.push(row(renderHeaderRow(status)))
  lines.push(row(DIM + GRAY + 'State → Jev → Decision → Action, live' + RESET))
  lines.push(divider())
  lines.push(blankRow())

  // Two-column body: board (left) | decision panel (right)
  const bLines = boardLines(board)
  const leftWidth = 26

  const rightHeader = [
    BOLD + WHITE + 'JEV DECISION' + RESET,
    GRAY + 'api.typesafe.ai' + RESET,
    '',
  ]

  // The right panel always renders the same fixed set of rows (a "NEXT MOVE"
  // header, four probability bars, and three meta lines) regardless of
  // status, so the box height — and everything below it — never shifts
  // between THINKING / LIVE / ERROR frames. Only the row contents change.
  let statusLine
  if (status === 'error') {
    statusLine = RED + BOLD + 'Request failed: ' + RESET + RED + String(errorMessage || '').slice(0, 46) + RESET
  } else if (status === 'thinking') {
    statusLine = ORANGE + 'Awaiting response' + RESET + GRAY + ' ...' + RESET
  } else if (!lastDecision) {
    statusLine = GRAY + 'Waiting for first decision...' + RESET
  } else {
    statusLine = ''
  }

  const showDecision = Boolean(lastDecision) && status !== 'error'
  const probabilities = showDecision ? lastDecision.probabilities : {}
  const choice = showDecision ? lastDecision.choice : null

  const rightBody = [
    statusLine || (GRAY + 'NEXT MOVE' + RESET),
    '',
    ...probRows(probabilities, choice),
    '',
    GRAY + 'EXECUTING   ' + RESET + (showDecision ? ORANGE + BOLD + choice + RESET : GRAY + '-' + RESET),
    GRAY + 'CONFIDENCE  ' + RESET + (showDecision && lastDecision.confidence != null ? WHITE + Math.round(lastDecision.confidence * 100) + '%' + RESET : GRAY + '-' + RESET),
    GRAY + 'LATENCY     ' + RESET + (showDecision ? WHITE + Math.round(lastDecision.latencyMs) + 'ms' + RESET : GRAY + '-' + RESET),
  ]

  const rightLines = rightHeader.concat(rightBody)
  const bodyRows = Math.max(bLines.length, rightLines.length)

  for (let i = 0; i < bodyRows; i++) {
    const left = padVisible(bLines[i] || '', leftWidth)
    const right = rightLines[i] || ''
    lines.push(row(left + '  ' + GRAY + '│' + RESET + '  ' + right))
  }

  lines.push(blankRow())
  lines.push(divider())

  // Metrics row
  const metrics =
    statLine('SCORE', score, ORANGE) +
    '    ' +
    statLine('MOVES', moves) +
    '    ' +
    statLine('DECISIONS', decisions) +
    '    ' +
    statLine('AVG LATENCY', avgLatencyMs != null ? Math.round(avgLatencyMs) + 'ms' : '-') +
    '    ' +
    statLine('BEST TILE', bestTile || '-')
  lines.push(row(metrics))
  lines.push(
    row(
      GRAY + 'Illegal-move corrections' + RESET +
        '  ' +
        (illegalCorrections > 0 ? AMBER + BOLD : GRAY) +
        String(illegalCorrections || 0).padStart(4, '0') +
        RESET
    )
  )
  lines.push(divider())

  if (status === 'won') {
    lines.push(row(GOLD + BOLD + 'REACHED 2048! Final score: ' + score + RESET + GRAY + '   R restart   Q quit' + RESET))
  } else if (status === 'lost') {
    lines.push(row(RED + BOLD + 'GAME OVER. Final score: ' + score + RESET + GRAY + '   R restart   Q quit' + RESET))
  } else {
    lines.push(row(GRAY + 'SPACE pause   R reset   Q quit' + RESET))
  }
  lines.push(bottomBorder())
  lines.push('')

  return lines.join('\n')
}

const ENTER_ALT_SCREEN = '\x1b[?1049h' + '\x1b[?25l' // alt buffer + hide cursor
const EXIT_ALT_SCREEN = '\x1b[?25h' + '\x1b[?1049l' // show cursor + main buffer
const CURSOR_HOME = '\x1b[H'

/**
 * Manages smooth, flicker-free repaints: switches to the terminal's
 * alternate screen buffer once, then on every frame moves the cursor back
 * to the top and overwrites in place — never clearing and redrawing the
 * whole screen — so there's no blank gap between frames.
 */
class Screen {
  constructor() {
    this.lastLineCount = 0
    this.active = false
  }

  open() {
    if (this.active) return
    process.stdout.write(ENTER_ALT_SCREEN)
    this.active = true
  }

  write(frame) {
    const lines = frame.split('\n')
    let out = CURSOR_HOME + frame
    // If the new frame is shorter than the last one, blank the leftover
    // trailing lines so no stale content lingers below the new frame.
    if (lines.length < this.lastLineCount) {
      out += '\n' + '\x1b[2K'.repeat(this.lastLineCount - lines.length)
    }
    process.stdout.write(out)
    this.lastLineCount = lines.length
  }

  close() {
    if (!this.active) return
    process.stdout.write(EXIT_ALT_SCREEN)
    this.active = false
  }
}

module.exports = { renderFrame, Screen }
