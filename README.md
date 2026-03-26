# AI Email Copilot

A Chrome Extension that enhances Gmail with AI-powered email analysis — all running **locally via Ollama**. No data ever leaves your machine.

## Features

- **Thread Summarization** — TL;DR, key decisions, open questions, and action items
- **Reply Generation** — Draft replies with tone control and iterative refinement
- **Categorization** — Classify emails (Bug Report, Request, Action Required, Meeting, etc.)
- **Action Item Extraction** — Tasks with owner and priority levels
- **Your Brain** — Learns your writing style from real emails to personalize future replies
- **Train from Threads** — Feed existing Gmail threads into Your Brain to build your style profile
- **Auto-expand Threads** — Collapsed messages are expanded automatically so all emails in a thread are analyzed
- **User-aware Context** — Detects who you are in multi-user threads for accurate replies and summaries

## Prerequisites

### Install Ollama

Download from [ollama.ai](https://ollama.ai), then pull the required models:

```bash
ollama pull llama3.1:8b   # Reply generation + Your Brain
ollama pull gemma3:4b     # Summarization, categorization, actions
```

### Start Ollama with CORS enabled

Chrome extensions require Ollama to accept cross-origin requests:

```bash
OLLAMA_ORIGINS="*" ollama serve
```

To make this permanent on macOS:

```bash
launchctl setenv OLLAMA_ORIGINS "*"
```

## Install (Development)

1. Clone this repository
2. Go to `chrome://extensions`
3. Enable **Developer Mode** (top-right toggle)
4. Click **Load Unpacked** and select the `extension/` folder

## Install (From Zip)

1. Download the latest release zip
2. Go to `chrome://extensions`
3. Enable **Developer Mode**
4. Drag and drop the `.zip` file onto the page

## Usage

1. Open any email thread in Gmail
2. A floating action bar appears at the bottom of the screen:

   | Button | What it does |
   |--------|-------------|
   | **Summarise** | TL;DR, key decisions, open questions, action items |
   | **Reply** | AI-drafted reply with refinement options |
   | **Categorise** | Auto-classify the email with confidence score |
   | **Actions** | Extract action items with owner and priority |
   | **Your Brain** | Save your messages from this thread to train your style |

3. Results appear in a slide-out panel on the right
4. **Copy** results or **Insert into Reply** to paste directly into Gmail's compose box

### Refining Replies

After generating a reply, you can refine it:
- Type feedback in the input field (e.g., "make it shorter", "mention the Friday deadline")
- Or click a quick-refine chip (Shorter, More formal, More casual, etc.)
- Each refinement is saved to Your Brain to improve future suggestions

### Training Your Brain

Click **Your Brain** on any thread to:
1. See all messages split into "Your messages" and "Others"
2. Select which messages to save (your messages are pre-selected)
3. Click **Save to Your Brain** to store them as writing style examples

## Architecture

```
Gmail DOM
    ↓
content.js (floating bar + panel)
    ↓  chrome.runtime.sendMessage
background.js (message routing)
    ↓  HTTP POST
Ollama (localhost:11434)
    ↓
Local AI models
```

### File Structure

```
extension/
├── manifest.json               # Manifest V3 configuration
├── background.js               # Service worker (Ollama routing)
├── content.js                  # Gmail UI injection & panel
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── popup/
│   ├── popup.html              # Extension popup
│   ├── popup.js                # Settings logic
│   └── popup.css               # Popup styles
├── ui/
│   ├── panel.js                # Panel module
│   └── panel.css               # Panel styles
└── utils/
    ├── ollamaClient.js         # Ollama API client
    ├── promptBuilder.js        # AI prompt templates
    ├── gmailParser.js          # Gmail DOM parsing & thread expansion
    └── storage.js              # Your Brain storage

eval/
├── fixtures.json               # 10 synthetic Gmail threads (5 difficulty tiers)
├── runner.js                   # Evaluation orchestrator
├── scorer.js                   # Output scoring rubrics
├── report.js                   # Terminal report + JSON results
└── run.sh                      # One-command launcher
```

### Models

| Task | Model | Why |
|------|-------|-----|
| Summarization | `gemma3:4b` | Fast, strong structured output with native JSON mode |
| Replies | `llama3.1:8b` | Natural conversational tone, improved instruction following |
| Categorization | `gemma3:4b` | Quick classification with reliable JSON |
| Action Items | `gemma3:4b` | Structured extraction with minimal hallucination |
| Your Brain | `llama3.1:8b` | Reuses reply model, strong style adaptation |

To change models, edit `MODELS` in `extension/background.js`.

## Model Evaluation Judge

An automated evaluation harness that tests how well different Ollama models perform on each AI operation. It uses synthetic Gmail threads at varying difficulty levels, scores outputs against ground truth, and measures latency.

### Quick Start

```bash
# Make sure Ollama is running
OLLAMA_ORIGINS="*" ollama serve

# Run the full evaluation
./eval/run.sh

# Or test specific models
./eval/run.sh --models mistral,llama3

# Or test a single difficulty tier
./eval/run.sh --tier 3
```

### What It Evaluates

The judge tests all four core operations:

| Operation | Scoring Rubric |
|-----------|---|
| **Summarize** | Keyword coverage (40%), bullet count (15%), key decisions (15%), open questions (15%), action items (15%) |
| **Categorize** | Exact match (70%), acceptable alternatives (40%), confidence calibration (30%) |
| **Action Items** | Count accuracy (25%), task coverage (35%), owner accuracy (20%), priority accuracy (20%) |
| **Reply** | Addresses topics (40%), no forbidden content (20%), tone match (20%), length sanity (10%), valid JSON (10%) |

All scores are on a **0-100 scale**.

### Test Fixtures (10 total)

**Tier 1 — Simple single-sender**
- `t1_meeting_invite`: Clear meeting request with action item
- `t1_fyi_update`: FYI update, no action needed

**Tier 2 — Two-party conversation**
- `t2_project_handoff`: Task handoff with clarifying questions
- `t2_bug_report`: Bug report with reproduction requests

**Tier 3 — Multi-sender thread**
- `t3_planning_thread`: Project timeline with conflicting deadlines
- `t3_feedback_round`: Design review with multiple reviewers

**Tier 4 — Informal/messy**
- `t4_casual_slack_style`: Informal abbreviations, typos, emojis
- `t4_forwarded_chain`: Forwarded email with mixed action items

**Tier 5 — Long complex thread**
- `t5_exec_strategy`: C-suite budget discussion, conflicting priorities
- `t5_incident_response`: Incident thread with 5+ participants, status updates

### Output

The evaluation produces:

1. **Terminal Report** — Formatted table with scores, latencies, and leaderboard
2. **Recommended Models** — Best model per operation based on average scores
3. **Tier Analysis** — Performance breakdown by difficulty level
4. **JSON Results** — Full data saved to `eval/results.json` for analysis

### CLI Options

```bash
./eval/run.sh [options]

Options:
  --models <list>   Comma-separated models (default: mistral,llama3,gemma2,phi3)
  --tier <number>   Test only a specific difficulty tier (1-5)
```

### Example Output

```
╔════════════════════════════════════════════════════════════════╗
║  AI Email Copilot — Model Evaluation Report                  ║
╚════════════════════════════════════════════════════════════════╝

Model: mistral
────────────────────────────────────────────────────────────────
  Fixture               Operation     Score  Latency   Valid
────────────────────────────────────────────────────────────────
  t1_meeting_invite     summarize        85  1.2s        ✓
  t1_meeting_invite     categorize      100  0.8s        ✓
  ...
────────────────────────────────────────────────────────────────
  OVERALL AVG                           87    1.5s       100%

═══ Leaderboard (by overall average score) ═══
  1. mistral    87 avg   1.5s latency
  2. llama3     82 avg   2.1s latency
  
═══ Recommended Model Assignment ═══
  Summarize:    mistral  (scored 88 avg)
  Categorize:   mistral  (scored 92 avg)
  Reply:        llama3   (scored 85 avg)
```



```bash
./build.sh
```

This will:
1. Validate all required files exist
2. Copy the extension to `dist/`
3. Create `dist/ai-email-copilot-v<version>.zip`

Upload the zip at [Chrome Web Store Developer Console](https://chrome.google.com/webstore/devconsole).

### Bumping Version

Edit `version` in `extension/manifest.json`, then run `./build.sh` again:

```json
"version": "1.1.0"
```

## Privacy

- **All processing is local** — Ollama runs on your machine, nothing is sent to external servers
- **Read-only Gmail access** — The extension only reads email content from the DOM
- **No authentication** — No Google OAuth, no API keys, no accounts
- **No tracking** — Zero analytics, telemetry, or data collection
- **Your Brain is local** — Writing style examples stored in `chrome.storage.local` only
- **You control your data** — Clear Your Brain memory anytime from the extension popup

## Troubleshooting

### Ollama shows "Disconnected" in popup

Make sure Ollama is running with CORS enabled:

```bash
OLLAMA_ORIGINS="*" ollama serve
```

### 403 Forbidden errors

This means Ollama is running but blocking the extension. Restart with `OLLAMA_ORIGINS="*"`.

### Buttons don't appear in Gmail

The floating bar only shows when you open an email thread. If it still doesn't appear:
1. Reload the extension from `chrome://extensions`
2. Refresh the Gmail tab
3. Open any email thread

### "Extension was reloaded" error

After updating the extension, refresh the Gmail tab to load the new content script.

### Model not found

Pull the required model first:

```bash
ollama pull llama3
```

## Development

### Debugging

- **Service worker logs**: `chrome://extensions` → AI Email Copilot → "Inspect views: service worker"
- **Content script logs**: Open DevTools console on the Gmail tab (filter by `[Gmail Copilot]` for extension debug logs)
- **Popup logs**: Right-click the extension icon → Inspect

### Debug Mode (prompt/response logging)

A hidden debug mode logs every prompt sent to Ollama and every raw response received. Useful for diagnosing bad outputs.

**Activate from the Gmail tab console** (easiest):

```js
window.postMessage({ type: "__GMAIL_COPILOT_DEBUG", enabled: true })
```

**Activate from the service worker or popup console:**

```js
chrome.storage.local.set({ __debug_mode: true })
```

**View logs** — open the service worker console (`chrome://extensions` → Inspect service worker). Each AI call will show a collapsible group with the model, prompt, duration, raw response, and parsed JSON.

**Deactivate:**

```js
// Gmail tab console
window.postMessage({ type: "__GMAIL_COPILOT_DEBUG", enabled: false })

// Or from service worker / popup console
chrome.storage.local.set({ __debug_mode: false })
```

### Local testing without zip

```bash
./build.sh --dir
```

This copies files to `dist/extension/` without zipping — useful for testing the build output.

## License

MIT
