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

const TILE_THEME = {
  0:    { bg: '\x1b[48;5;234m', fg: GRAY },
  2:    { bg: '\x1b[48;5;236m', fg: WHITE },
  4:    { bg: '\x1b[48;5;237m', fg: WHITE },
  8:    { bg: '\x1b[48;5;239m', fg: WHITE },
  16:   { bg: '\x1b[48;5;241m', fg: WHITE },
  32:   { bg: '\x1b[48;5;243m', fg: WHITE },
  64:   { bg: '\x1b[48;5;245m', fg: '\x1b[30m' }, 
  128:  { bg: '\x1b[48;5;247m', fg: '\x1b[30m' },
  256:  { bg: '\x1b[48;5;249m', fg: '\x1b[30m' },
  512:  { bg: '\x1b[48;5;251m', fg: '\x1b[30m' },
  1024: { bg: '\x1b[48;5;208m', fg: '\x1b[30m' },
  2048: { bg: '\x1b[48;5;214m', fg: '\x1b[30m' },
  4096: { bg: '\x1b[48;5;196m', fg: WHITE },
  8192: { bg: '\x1b[48;5;160m', fg: WHITE },
  16384:{ bg: '\x1b[48;5;124m', fg: WHITE },
  32768:{ bg: '\x1b[48;5;88m', fg: WHITE },
  65536:{ bg: '\x1b[48;5;52m', fg: WHITE },
  131072:{ bg: '\x1b[48;5;53m', fg: WHITE },
}

function colorForTile(value) {
  return TILE_THEME[value] || { bg: '\x1b[48;5;226m', fg: '\x1b[30m' }
}

function visibleLength(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '').length
}

function padVisible(str, width) {
  const len = visibleLength(str)
  if (len > width) return str.replace(/\x1b\[[0-9;]*m/g, '').slice(0, width)
  return str + ' '.repeat(width - len)
}

function centerVisible(str, width) {
  const len = visibleLength(str)
  if (len >= width) return str.replace(/\x1b\[[0-9;]*m/g, '').slice(0, width)
  const left = Math.floor(Math.max(0, width - len) / 2)
  const right = Math.max(0, width - len - left)
  return ' '.repeat(left) + str + ' '.repeat(right)
}

function row(content) {
  return '  ' + content
}

function renderHeaderRow(status) {
  const title = BOLD + WHITE + 'JEV ' + RESET + GRAY + 'PLAYS 2048' + RESET
  const statusPill =
    status === 'thinking' ? ORANGE + BOLD + '● THINKING' + RESET :
    status === 'paused' ? GRAY + BOLD + '● PAUSED  ' + RESET :
    status === 'won' ? GOLD + BOLD + '● WON     ' + RESET :
    status === 'lost' ? RED + BOLD + '● OVER    ' + RESET :
    status === 'error' ? RED + BOLD + '● ERROR   ' + RESET :
    GREEN + BOLD + '● LIVE    ' + RESET
  return padVisible(title, 40) + statusPill
}

function boardLines(board) {
  const cellWidth = 7
  const lines = []
  
  for (const line of board) {
    let top = ''
    let mid = ''
    let bot = ''
    for (const value of line) {
      const t = value === 0 ? '' : String(value)
      const { bg, fg } = colorForTile(value)
      
      top += bg + ' '.repeat(cellWidth) + RESET + ' '
      mid += bg + fg + BOLD + centerVisible(t, cellWidth) + RESET + ' '
      bot += bg + ' '.repeat(cellWidth) + RESET + ' '
    }
    lines.push(top)
    lines.push(mid)
    lines.push(bot)
    lines.push('')
  }
  return lines
}

function statLine(label, value, color) {
  return GRAY + label + ' ' + RESET + (color || WHITE) + BOLD + padVisible(String(value), 6) + RESET
}

function probRows(probabilities, choice) {
  const dirs = ['UP', 'DOWN', 'LEFT', 'RIGHT']
  const barWidth = 16
  return dirs.map((dir) => {
    const p = probabilities[dir] || 0
    const filled = Math.round(p * barWidth)
    const isChoice = dir === choice
    const barColor = isChoice ? ORANGE : DARK_GRAY
    const bar = barColor + '█'.repeat(filled) + DARK_GRAY + '░'.repeat(barWidth - filled) + RESET
    const marker = isChoice ? ORANGE + BOLD + '>' + RESET : ' '
    const arrow = isChoice ? ORANGE + BOLD + ARROW[dir] + RESET : GRAY + ARROW[dir] + RESET
    const label = (isChoice ? WHITE + BOLD : GRAY) + dir.padEnd(5) + RESET
    const pct = (Math.round(p * 100) + '%').padStart(4)
    return marker + ' ' + arrow + ' ' + label + ' ' + bar + ' ' + (isChoice ? ORANGE + BOLD : GRAY) + pct + RESET
  })
}

const decisionStream = []

function renderFrame(state) {
  const { board, score, moves, decisions, avgLatencyMs, lastDecision, status, errorMessage, bestTile } = state
  const lines = []
  
  if (lastDecision && lastDecision.choice && status !== 'thinking') {
    const lastStream = decisionStream[decisionStream.length - 1]
    if (!lastStream || lastStream.moves !== moves) {
       decisionStream.push({ 
         choice: lastDecision.choice, 
         latencyMs: lastDecision.latencyMs,
         moves: moves,
         confidence: lastDecision.confidence
       })
       if (decisionStream.length > 5) decisionStream.shift()
    }
  }

  lines.push('')
  lines.push(row(renderHeaderRow(status)))
  lines.push(row(DIM + GRAY + 'State → Jev → Decision → Action, live' + RESET))
  lines.push('')

  const bLines = boardLines(board)
  const leftWidth = 34

  const rightHeader = [
    BOLD + WHITE + (state.engineTitle || 'JEV DECISION') + RESET,
    GRAY + (state.engineHost || 'api.typesafe.ai') + RESET,
    '',
  ]

  let statusLine = padVisible(GRAY + 'NEXT MOVE' + RESET, 40)
  if (status === 'error') statusLine = padVisible(RED + 'Failed: ' + String(errorMessage || '').slice(0, 30) + RESET, 40)
  else if (status === 'thinking') statusLine = padVisible(ORANGE + 'Awaiting response...' + RESET, 40)
  else if (!lastDecision) statusLine = padVisible(GRAY + 'Waiting for first decision...' + RESET, 40)

  const showDecision = Boolean(lastDecision) && status !== 'error'
  const probabilities = showDecision ? lastDecision.probabilities : {}
  const choice = showDecision ? lastDecision.choice : null

  const rightBody = [
    statusLine,
    '',
    ...probRows(probabilities, choice),
    '',
    padVisible(GRAY + 'EXECUTING   ' + RESET + (showDecision ? ORANGE + BOLD + choice + RESET : GRAY + '-' + RESET), 30),
    padVisible(GRAY + 'CONFIDENCE  ' + RESET + (showDecision && lastDecision.confidence != null ? WHITE + Math.round(lastDecision.confidence * 100) + '%' + RESET : GRAY + '-' + RESET), 30),
    padVisible(GRAY + 'LATENCY     ' + RESET + (showDecision ? WHITE + Math.round(lastDecision.latencyMs) + 'ms' + RESET : GRAY + '-' + RESET), 30),
    '',
    BOLD + WHITE + 'DECISION STREAM' + RESET,
  ]
  
  for (let i = 0; i < 5; i++) {
    const item = decisionStream[i]
    if (item) {
       const arrow = ORANGE + ARROW[item.choice] + RESET
       const choiceStr = WHITE + item.choice.padEnd(5) + RESET
       const lat = padVisible(GRAY + Math.round(item.latencyMs) + 'ms' + RESET, 6)
       const conf = padVisible(DIM + GRAY + Math.round(item.confidence * 100) + '%' + RESET, 6)
       rightBody.push(`  ${arrow}  ${choiceStr}   ${conf.padStart(15)}  ${lat.padStart(15)}`)
    } else {
       rightBody.push('')
    }
  }

  const rightLines = rightHeader.concat(rightBody)
  const bodyRows = Math.max(bLines.length, rightLines.length)

  for (let i = 0; i < bodyRows; i++) {
    const left = padVisible(bLines[i] || '', leftWidth)
    const right = rightLines[i] || ''
    lines.push(row(left + '    ' + GRAY + '│' + RESET + '    ' + right))
  }

  lines.push('')
  lines.push(row(GRAY + '─'.repeat(82) + RESET))
  lines.push('')

  const metrics =
    statLine('SCORE', score, ORANGE) + '   ' +
    statLine('MOVES', moves) + '   ' +
    statLine('DECISIONS', decisions) + '   ' +
    statLine('AVG LATENCY', avgLatencyMs != null ? Math.round(avgLatencyMs) + 'ms' : '-') + '   ' +
    statLine('BEST TILE', bestTile || '-')
  lines.push(row(metrics))
  
  lines.push('')
  if (status === 'won') lines.push(row(padVisible(GOLD + BOLD + 'REACHED 2048! ' + RESET + GRAY + '[SPACE] pause  [R] reset  [Q] quit' + RESET, 60)))
  else if (status === 'lost') lines.push(row(padVisible(RED + BOLD + 'GAME OVER. ' + RESET + GRAY + '[SPACE] pause  [R] reset  [Q] quit' + RESET, 60)))
  else lines.push(row(padVisible(GRAY + '[SPACE] pause   [R] reset   [Q] quit' + RESET, 60)))
  lines.push('')

  return lines.join('\n')
}

const ENTER_ALT_SCREEN = '\x1b[?1049h' + '\x1b[?25l' + '\x1b[2J\x1b[3J\x1b[H'
const EXIT_ALT_SCREEN = '\x1b[?25h' + '\x1b[?1049l'
const CURSOR_HOME = '\x1b[H'

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
    if (lines.length < this.lastLineCount) {
      out += ('\n' + '\x1b[2K').repeat(this.lastLineCount - lines.length)
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
