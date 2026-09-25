// Local, offline decision engine for `--engine local`: spawns a persistent
// Python worker (local-engine/serve.py) that runs a Laya-CoreML model
// entirely on-device — no network, no API key. See local-engine/README.md.
//
// Laya (https://github.com/mizorewww/laya-coreml) is an unrelated,
// independently published model from Jev/TypeSafe; this file exists so the
// same 2048 game loop and UI can run against either one interchangeably.
'use strict'

const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const { planMoves } = require('./planner')

const LOCAL_ENGINE_DIR = path.join(__dirname, '..', 'local-engine')

// Mirrors laya-mlx's Snake planner (see lib/planner.js header comment): a
// classical one-ply simulation ranks and labels every legal move before the
// model is asked anything, so the model's job is closer to confirming an
// already-good plan than discovering strategy from a raw board alone.
function buildQuestions(legalMoves, plan) {
  return {
    direction: {
      type: 'choice',
      instructions:
        'You are playing 2048. A planner has already simulated each legal move and ranked them by resulting board strength (empty space, tile ordering, and keeping the highest tile cornered). Choose the move labeled "Best" unless you have strong reason to override it.',
      criteria: plan.labels,
    },
  }
}

function findVenvPython() {
  // JEV_2048_LOCAL_VENV lets you point at an existing venv that already has
  // laya-coreml installed (e.g. one you set up yourself) instead of the
  // bundled local-engine/.venv.
  const candidates = [
    process.env.JEV_2048_LOCAL_VENV && path.join(process.env.JEV_2048_LOCAL_VENV, 'bin', 'python'),
    path.join(LOCAL_ENGINE_DIR, '.venv', 'bin', 'python'),
  ].filter(Boolean)
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return null
}

function findDefaultModelDir() {
  // JEV_2048_LOCAL_MODEL lets you point directly at a model directory you
  // already downloaded elsewhere.
  const candidates = [
    process.env.JEV_2048_LOCAL_MODEL,
    path.join(LOCAL_ENGINE_DIR, 'models', 'general'),
    path.join(LOCAL_ENGINE_DIR, 'models', 'ane'),
  ].filter(Boolean)
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'coreml_config.json'))) return dir
  }
  return null
}

/**
 * Manages the persistent local-inference worker process.
 */
class LocalEngine {
  constructor(options) {
    options = options || {}
    this.pythonPath = options.pythonPath || findVenvPython() || 'python3'
    this.modelDir = options.modelDir || findDefaultModelDir()
    this.computeUnits = options.computeUnits || 'cpu_gpu'
    this.proc = null
    this.buffer = ''
    this.pending = []
    this.readyPromise = null
  }

  /**
   * Spawns the worker and resolves once the model has loaded and is ready
   * to answer requests. Rejects with a clean error message on failure
   * (missing venv, missing model directory, model load error, etc).
   */
  start() {
    if (this.readyPromise) return this.readyPromise

    this.readyPromise = new Promise((resolve, reject) => {
      if (!this.modelDir) {
        reject(
          new Error(
            'No local model found. Run the setup steps in local-engine/README.md ' +
              '(download a Laya-CoreML model into local-engine/models/general).'
          )
        )
        return
      }
      if (!fs.existsSync(this.pythonPath)) {
        reject(
          new Error(
            'Local engine virtualenv not found at ' +
              this.pythonPath +
              '. Run the setup steps in local-engine/README.md.'
          )
        )
        return
      }

      const serveScript = path.join(LOCAL_ENGINE_DIR, 'serve.py')
      this.proc = spawn(this.pythonPath, [serveScript, this.modelDir, this.computeUnits], {
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      let settled = false
      let stderrTail = ''

      this.proc.stderr.on('data', (chunk) => {
        stderrTail = (stderrTail + chunk.toString()).slice(-2000)
      })

      this.proc.on('error', (err) => {
        if (!settled) {
          settled = true
          reject(new Error('Failed to start local engine process: ' + err.message))
        }
      })

      this.proc.on('exit', (code) => {
        if (!settled) {
          settled = true
          reject(
            new Error(
              'Local engine process exited during startup (code ' +
                code +
                ').' +
                (stderrTail ? '\n' + stderrTail.trim().split('\n').slice(-5).join('\n') : '')
            )
          )
        }
        // Reject any requests still waiting on a reply.
        while (this.pending.length) {
          const { reject: rej } = this.pending.shift()
          rej(new Error('Local engine process exited unexpectedly.'))
        }
      })

      this.proc.stdout.on('data', (chunk) => {
        this.buffer += chunk.toString()
        let idx
        while ((idx = this.buffer.indexOf('\n')) >= 0) {
          const line = this.buffer.slice(0, idx).trim()
          this.buffer = this.buffer.slice(idx + 1)
          if (!line) continue

          let msg
          try {
            msg = JSON.parse(line)
          } catch {
            continue // ignore stray non-JSON output on stdout
          }

          if (!settled) {
            settled = true
            if (msg.ok && msg.ready) {
              resolve()
            } else {
              reject(new Error(msg.error || 'Local engine failed to start.'))
            }
            continue
          }

          const next = this.pending.shift()
          if (!next) continue
          if (msg.ok) {
            next.resolve(msg.result)
          } else {
            next.reject(new Error(msg.error || 'Local engine returned an error.'))
          }
        }
      })
    })

    return this.readyPromise
  }

  /**
   * Sends one decide request to the running worker. start() must have
   * resolved first.
   */
  request(state, questions) {
    return new Promise((resolve, reject) => {
      if (!this.proc || this.proc.exitCode !== null) {
        reject(new Error('Local engine is not running.'))
        return
      }
      this.pending.push({ resolve, reject })
      this.proc.stdin.write(JSON.stringify({ state, questions }) + '\n')
    })
  }

  stop() {
    if (this.proc && this.proc.exitCode === null) {
      this.proc.kill()
    }
  }
}

/**
 * Calls the local engine to decide the next move. Mirrors lib/jev.js's
 * decide() signature/shape so the CLI can switch between engines freely.
 * Returns { choice, confidence, probabilities, latencyMs }.
 */
async function decide(engine, board, score, moves, legalMoves) {
  const plan = planMoves(board, legalMoves)
  const questions = buildQuestions(legalMoves, plan)
  const state = { game: '2048', board, score, moves, legalMoves, plannerBest: plan.best, plannerRanking: plan.ranked }

  const startedAt = Date.now()
  const result = await engine.request(state, questions)
  const latencyMs = Date.now() - startedAt

  const answer = result && result.answers && result.answers.direction
  if (!answer || typeof answer.choice !== 'string') {
    throw new Error('Local engine response did not include a "direction" choice answer.')
  }

  return {
    choice: answer.choice,
    confidence: answer.confidence,
    probabilities: answer.probabilities || {},
    latencyMs,
  }
}

module.exports = { LocalEngine, decide, findVenvPython, findDefaultModelDir }
