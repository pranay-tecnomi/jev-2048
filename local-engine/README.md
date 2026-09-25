# Local engine setup (`--engine local`)

This lets `jev-2048` play fully offline, with **no API key and no network
calls at inference time**, using [Laya-CoreML](https://github.com/mizorewww/laya-coreml)
— a separate, independently published open-weight model that runs on-device
via Apple's Core ML / Neural Engine. It is **not** Jev or TypeSafe; it just
happens to answer the same `choice` / `score` / `noul` question shapes, which
is why the same 2048 game loop and dashboard can drive either one.

Requirements: Apple Silicon Mac, macOS 15+, Python 3.11–3.13 (not 3.14).

## One-time setup

From this directory (`local-engine/`):

```bash
# 1. Create an isolated virtualenv with a compatible Python version.
#    (laya-coreml requires Python <3.14; use whichever of these you have.)
python3.13 -m venv .venv    # or python3.12 / python3.11
source .venv/bin/activate

# 2. Install laya-coreml into the venv.
pip install --upgrade pip
pip install laya-coreml

# 3. Download a model checkpoint from Hugging Face.
#    "general" (1024-token) is the default jev-2048 looks for and comfortably
#    fits the 2048 board + instructions payload (~80-180 tokens).
mkdir -p models
hf download aac6fef/laya-multilingual-coreml --local-dir models/general
```

That's it. `jev-2048 --engine local` will find `local-engine/.venv` and
`local-engine/models/general` automatically.

## Run it

From the repo root:

```bash
jev-2048 --engine local
```

The first request after startup includes model load time (a few seconds);
after that, decisions typically land in well under 500ms on Apple Silicon.

## Optional: the faster ANE checkpoint

There's also a smaller, faster ANE-optimized checkpoint, but it has a **hard
96-token limit** per request — too small for 2048's full board-state payload
in this CLI's current encoding, so it's not the default. If you want to
experiment with it anyway:

```bash
hf download aac6fef/laya-multilingual-coreml-ane --local-dir models/ane
```

`lib/localEngine.js` will prefer `models/general` if both exist. To force the
ANE model you'd need to point `LocalEngine` at `models/ane` directly (not
currently exposed as a CLI flag).

## How it works

`local-engine/serve.py` is a small persistent worker: it loads the Core ML
model once, then reads one JSON request per line from stdin and writes one
JSON response per line to stdout. `lib/localEngine.js` spawns this process
and keeps it warm for the whole game, so you only pay model-load cost once
per session instead of once per move.

Nothing here uses or requires `JEV_API_KEY` — the two engines are completely
independent and interchangeable from the game's point of view.
