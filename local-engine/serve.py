#!/usr/bin/env python3
"""
Persistent local-inference worker for jev-2048's --engine local mode.

Loads a Laya-CoreML model once (https://github.com/mizorewww/laya-coreml),
then reads one JSON request per line from stdin and writes one JSON response
per line to stdout, so the Node CLI can reuse a single warm process instead
of paying model-load cost on every decision.

Request:  {"state": <string|object>, "questions": {...}}
Response: {"ok": true, "result": {...}}  or  {"ok": false, "error": "..."}

This never contacts the network after the model is downloaded, and never
uses or needs a Jev API key — it runs a different, unrelated open-weight
model (Laya) entirely on-device.
"""
import json
import sys
import warnings

warnings.filterwarnings("ignore", category=RuntimeWarning)


def emit(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def main():
    if len(sys.argv) < 2:
        emit({"ok": False, "error": "Usage: serve.py <model_dir> [compute_units]"})
        sys.exit(1)

    model_dir = sys.argv[1]
    compute_units = sys.argv[2] if len(sys.argv) > 2 else "cpu_gpu"

    try:
        import laya_coreml as laya
    except ImportError as e:
        emit({"ok": False, "error": f"laya_coreml not installed: {e}"})
        sys.exit(1)

    try:
        agent = laya.load(model_dir, compute_units=compute_units)
    except Exception as e:  # noqa: BLE001 - report any load failure to the caller
        emit({"ok": False, "error": f"Failed to load model: {e}"})
        sys.exit(1)

    # Signal readiness once the model is warm.
    emit({"ok": True, "ready": True})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            state = req["state"]
            questions = req["questions"]
            if not isinstance(state, str):
                state = json.dumps(state)
            result = agent.predict(state, questions)
            emit({"ok": True, "result": result})
        except Exception as e:  # noqa: BLE001 - never crash the worker on a bad request
            emit({"ok": False, "error": str(e)})


if __name__ == "__main__":
    main()
