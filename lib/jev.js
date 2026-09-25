// Minimal client for the TypeSafe/Jev API — see https://docs.typesafe.ai/introduction
// No dependencies: uses Node's built-in https module directly.
'use strict'

const https = require('https')
const { planMoves } = require('./planner')

const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone'

// Mirrors laya-mlx's Snake planner (see lib/planner.js header comment): a
// classical one-ply simulation ranks and labels every legal move before the
// model is asked anything, so the model's job is closer to confirming an
// already-good plan than discovering strategy from a raw board alone.
function buildDecideRequest(board, score, moves, legalMoves) {
  const plan = planMoves(board, legalMoves)

  return {
    model: 'jev-latest',
    state: {
      game: '2048',
      board,
      score,
      moves,
      legalMoves,
      plannerBest: plan.best,
      plannerRanking: plan.ranked,
    },
    questions: {
      direction: {
        type: 'choice',
        instructions:
          'You are playing 2048. A planner has already simulated each legal move and ranked them by resulting board strength (empty space, tile ordering, and keeping the highest tile cornered). Choose the move labeled "Best" unless you have strong reason to override it.',
        criteria: plan.labels,
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
