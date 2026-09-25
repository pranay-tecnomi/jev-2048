// Minimal client for the TypeSafe/Jev API — see https://docs.typesafe.ai/introduction
// No dependencies: uses Node's built-in https module directly.
'use strict'

const https = require('https')

const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone'

const DIRECTION_DESCRIPTIONS = {
  UP: 'Slide and merge tiles upward',
  DOWN: 'Slide and merge tiles downward',
  LEFT: 'Slide and merge tiles left',
  RIGHT: 'Slide and merge tiles right',
}

function buildDecideRequest(board, score, moves, legalMoves) {
  const criteria = {}
  for (const dir of legalMoves) {
    criteria[dir] = DIRECTION_DESCRIPTIONS[dir]
  }

  return {
    model: 'jev-latest',
    state: {
      game: '2048',
      board,
      score,
      moves,
      legalMoves,
    },
    questions: {
      direction: {
        type: 'choice',
        instructions:
          'You are playing 2048 on a 4x4 board (0 = empty cell). Choose the single best direction to move next to maximize long-term score and keep the board open. Only choose from the legal moves provided.',
        criteria,
      },
    },
  }
}

/**
 * Calls the Jev API to decide the next move.
 * Returns { choice, confidence, probabilities, latencyMs, usage }.
 * Throws an Error with a clean, non-secret-leaking message on failure.
 */
function decide(apiKey, board, score, moves, legalMoves) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(buildDecideRequest(board, score, moves, legalMoves))
    const url = new URL(JEV_ENDPOINT)
    const startedAt = Date.now()

    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 15000,
      },
      (res) => {
        let raw = ''
        res.on('data', (chunk) => {
          raw += chunk
        })
        res.on('end', () => {
          const latencyMs = Date.now() - startedAt
          let body
          try {
            body = JSON.parse(raw)
          } catch {
            reject(new Error('Jev API returned a non-JSON response (status ' + res.statusCode + ').'))
            return
          }

          if (res.statusCode < 200 || res.statusCode >= 300) {
            const message =
              (body && (body.error || (body.detail && body.detail.message))) ||
              'Jev API responded with status ' + res.statusCode
            reject(new Error(message))
            return
          }

          const answer = body.answers && body.answers.direction
          if (!answer || typeof answer.choice !== 'string') {
            reject(new Error('Jev response did not include a "direction" choice answer.'))
            return
          }

          resolve({
            choice: answer.choice,
            confidence: answer.confidence,
            probabilities: answer.probabilities || {},
            latencyMs,
            usage: body.usage,
          })
        })
      }
    )

    req.on('error', (err) => {
      reject(new Error('Failed to reach the Jev API: ' + err.message))
    })
    req.on('timeout', () => {
      req.destroy(new Error('Jev API request timed out.'))
    })

    req.write(payload)
    req.end()
  })
}

module.exports = { decide, JEV_ENDPOINT }
