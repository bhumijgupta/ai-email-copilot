# Ollama Performance Recommendations

Practical tips to get the fastest experience with AI Email Copilot.

## The Problem

Ollama unloads models from memory after 5 minutes of inactivity by default. Reloading a model from disk takes **15–45 seconds**, which makes the extension feel sluggish when switching between tasks (e.g. summarise with `mistral`, then reply with `llama3`).

## Recommended Startup Command

```bash
OLLAMA_ORIGINS="*" OLLAMA_KEEP_ALIVE=-1 OLLAMA_MAX_LOADED_MODELS=2 ollama serve
```

This single command solves the three most common performance issues:

| Variable | Value | What it does |
|----------|-------|-------------|
| `OLLAMA_ORIGINS` | `"*"` | Allows the Chrome extension to connect (required) |
| `OLLAMA_KEEP_ALIVE` | `-1` | Never unload models from memory — eliminates cold starts |
| `OLLAMA_MAX_LOADED_MODELS` | `2` | Keep both `mistral` and `llama3` loaded simultaneously |

## Optimization Guide

### 1. Keep Models Loaded (biggest win)

By default, Ollama evicts models after 5 minutes of inactivity, causing 15–45 second reload delays.

**Fix — keep models loaded indefinitely:**

```bash
OLLAMA_KEEP_ALIVE=-1 ollama serve
```

Other useful values:
- `-1` — never unload (recommended for dedicated use)
- `1h` — keep for 1 hour after last request
- `30m` — keep for 30 minutes
- `0` — unload immediately after each request (saves memory)

You can also set `keep_alive` per request in the API:

```json
{
  "model": "llama3",
  "prompt": "hello",
  "keep_alive": -1
}
```

### 2. Load Multiple Models at Once

By default, Ollama may only keep 1 model in memory. Since the extension uses both `mistral` and `llama3`, allow 2:

```bash
OLLAMA_MAX_LOADED_MODELS=2 ollama serve
```

This eliminates all model-switching time. Both models stay in RAM and respond instantly.

**Memory requirement:** Each 7–8B model needs ~5GB RAM. Running 2 models needs ~10GB free.

### 3. Pre-warm Models on Startup

After starting Ollama, send a quick request to each model so they're ready before you open Gmail:

```bash
# Pre-warm both models (takes ~10s each on first load)
curl http://localhost:11434/api/generate -d '{"model":"llama3","prompt":"hi","stream":false}' > /dev/null 2>&1 &
curl http://localhost:11434/api/generate -d '{"model":"mistral","prompt":"hi","stream":false}' > /dev/null 2>&1 &
wait
echo "Models loaded and ready"
```

Or create a simple startup script:

```bash
#!/bin/bash
# start-ollama.sh — start Ollama with optimal settings and pre-warm models

OLLAMA_ORIGINS="*" OLLAMA_KEEP_ALIVE=-1 OLLAMA_MAX_LOADED_MODELS=2 ollama serve &
OLLAMA_PID=$!

# Wait for Ollama to start
sleep 3

# Pre-warm models
echo "Loading llama3..."
curl -s http://localhost:11434/api/generate -d '{"model":"llama3","prompt":"hi","stream":false}' > /dev/null
echo "Loading mistral..."
curl -s http://localhost:11434/api/generate -d '{"model":"mistral","prompt":"hi","stream":false}' > /dev/null

echo "Ready! Ollama PID: $OLLAMA_PID"
wait $OLLAMA_PID
```

### 4. Use a Single Model (simplest option)

If memory is tight or you want zero switching overhead, use `llama3` for everything. Edit `MODELS` in `extension/background.js`:

```javascript
const MODELS = {
  SUMMARY: "llama3",
  REPLY: "llama3",
  CATEGORY: "llama3",
  ACTIONS: "llama3",
  PM_BRAIN: "llama3"
};
```

**Trade-off:** `mistral` is slightly faster for structured tasks (summarisation, categorisation), but `llama3` handles them well enough. The benefit is only one model in memory (~5GB instead of ~10GB) and zero switching time.

### 5. Make Settings Permanent

**macOS (launchd):**

```bash
launchctl setenv OLLAMA_ORIGINS "*"
launchctl setenv OLLAMA_KEEP_ALIVE "-1"
launchctl setenv OLLAMA_MAX_LOADED_MODELS "2"
```

These persist across terminal sessions. Restart Ollama after setting them.

**Linux (systemd):**

```bash
sudo systemctl edit ollama.service
```

Add:

```ini
[Service]
Environment="OLLAMA_ORIGINS=*"
Environment="OLLAMA_KEEP_ALIVE=-1"
Environment="OLLAMA_MAX_LOADED_MODELS=2"
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl restart ollama
```

## Hardware Guidelines

| Component | Recommendation | Impact |
|-----------|---------------|--------|
| **RAM** | 16GB minimum for 2 models | Each 7–8B model needs ~5GB |
| **Storage** | SSD strongly recommended | Cold load: 15s (SSD) vs 45s+ (HDD) |
| **GPU** | Discrete GPU (optional) | 5–10x faster inference vs CPU-only |
| **CPU** | Modern multi-core | CPU inference works but is slower |

### Checking What's Loaded

See which models are currently in memory:

```bash
curl http://localhost:11434/api/ps
```

### Checking Available Models

```bash
ollama list
```

## Quick Reference

| What you want | Command |
|--------------|---------|
| Start with optimal settings | `OLLAMA_ORIGINS="*" OLLAMA_KEEP_ALIVE=-1 OLLAMA_MAX_LOADED_MODELS=2 ollama serve` |
| Check which models are loaded | `curl http://localhost:11434/api/ps` |
| Pre-warm a model | `curl http://localhost:11434/api/generate -d '{"model":"llama3","prompt":"hi","stream":false}'` |
| List installed models | `ollama list` |
| Pull a new model | `ollama pull llama3` |
| Check Ollama version | `ollama --version` |
