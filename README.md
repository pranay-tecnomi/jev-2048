# jev-2048

Watch [Jev](https://docs.typesafe.ai/introduction) — TypeSafe's System One decision
model — play 2048 live in your terminal. Every move is a real API call: the board
state and legal moves are sent to Jev as a single `choice` question
(`UP` / `DOWN` / `LEFT` / `RIGHT`), and the model's answer is applied directly to
the board. Nothing is scripted or simulated.

```
╭──────────────────────────────────────────────────────────────────────────────────╮
│ JEV / PLAYS 2048                                                          ● LIVE │
│ State → Jev → Decision → Action, live                                            │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│ +-----+-----+-----+-----+   │  JEV DECISION                                      │
│ |     |     |  2  |  4  |   │  api.typesafe.ai                                   │
│ +-----+-----+-----+-----+   │                                                    │
│ |  8  |     |     |     |   │  NEXT MOVE                                         │
│ +-----+-----+-----+-----+   │                                                    │
│ |     |     |  2  |     |   │    ↑ UP     ██░░░░░░░░░░░░░░░░  12%                │
│ +-----+-----+-----+-----+   │    ↓ DOWN   ███░░░░░░░░░░░░░░░  15%                │
│ |     |     |  4  |  4  |   │  › ← LEFT   ███████████░░░░░░░  62%                │
│ +-----+-----+-----+-----+   │    → RIGHT  ██░░░░░░░░░░░░░░░░  11%                │
│                             │                                                    │
│                             │  EXECUTING   LEFT                                  │
│                             │  CONFIDENCE  62%                                   │
│                             │  LATENCY     312ms                                 │
│                                                                                  │
├──────────────────────────────────────────────────────────────────────────────────┤
│ SCORE 24    MOVES 9    DECISIONS 9    AVG LATENCY 340ms    BEST TILE 8           │
│ Illegal-move corrections  0000                                                   │
├──────────────────────────────────────────────────────────────────────────────────┤
│ Ctrl+C quit                                                                      │
╰──────────────────────────────────────────────────────────────────────────────────╯
```

(rendered in full color in a real terminal — orange/amber tile shading by value, a live "● LIVE / ● THINKING" status pill, and animated probability bars)

## Install & run

```bash
npx jev-2048
```

or install it globally:

```bash
npm install -g jev-2048
jev-2048
```

## Requirements

You need your own Jev API key. Get one from the
[TypeSafe console](https://console.typesafe.ai/keys), then set it as an
environment variable before running:

```bash
export JEV_API_KEY=jv_live_...
npx jev-2048
```

The key is read only from your local environment and sent directly from your
machine to the official Jev API (`https://api.typesafe.ai/v1/systemone`) — this
tool has no server component and never sees or stores your key anywhere else.

## Options

```
jev-2048 [--interval <ms>]

  --interval <ms>   Milliseconds between decisions (default: 1200)
  -v, --version     Print the version and exit
  -h, --help        Show help and exit
```

## How it works

On every tick, the current 4×4 board, score, move count, and the list of
currently legal moves are sent to Jev as a `choice` question:

```json
{
  "model": "jev-latest",
  "state": { "game": "2048", "board": [[0,2,4,0], ...], "score": 24, "moves": 9 },
  "questions": {
    "direction": {
      "type": "choice",
      "instructions": "Choose the single best direction to move next...",
      "criteria": { "UP": "...", "DOWN": "...", "LEFT": "...", "RIGHT": "..." }
    }
  }
}
```

Jev responds with a probability distribution over the legal directions; the
highest-probability legal choice is applied to the board, a new tile spawns,
and the loop repeats. If Jev ever returns a direction that isn't currently
legal, the tool falls back to the best legal option in its response rather
than applying an illegal move.

## Local development

```bash
git clone https://github.com/pranay-tecnomi/jev-2048.git
cd jev-2048
export JEV_API_KEY=jv_live_...
node bin/jev-2048.js
```

No dependencies — the whole tool is plain Node.js (`https`, `process`) so
`npx` installs are instant.

## License

MIT
