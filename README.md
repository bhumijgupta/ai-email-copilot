# AI Email Copilot

A Chrome Extension that enhances Gmail with AI-powered email analysis — all running **locally via Ollama**. No data ever leaves your machine.

## Features

- **Thread Summarization** — TL;DR, key decisions, open questions, and action items
- **Reply Generation** — Draft professional replies with tone control and iterative refinement
- **Categorization** — Classify emails (Bug, Vendor Query, Pricing, Onboarding, Internal, etc.)
- **Action Item Extraction** — Tasks with owner and priority levels
- **PM Brain** — Learns your writing style from real emails to personalize future replies
- **Train from Threads** — Feed existing Gmail threads into PM Brain to build your style profile

## Prerequisites

### Install Ollama

Download from [ollama.ai](https://ollama.ai), then pull the required models:

```bash
ollama pull llama3        # Reply generation
ollama pull mistral       # Summarization, categorization, actions
ollama pull mixtral       # PM Brain style matching (optional)
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
   | **Train Brain** | Save your messages from this thread to PM Brain |

3. Results appear in a slide-out panel on the right
4. **Copy** results or **Insert into Reply** to paste directly into Gmail's compose box

### Refining Replies

After generating a reply, you can refine it:
- Type feedback in the input field (e.g., "make it shorter", "mention the Friday deadline")
- Or click a quick-refine chip (Shorter, More formal, More casual, etc.)
- Each refinement is saved to PM Brain to improve future suggestions

### Training PM Brain

Click **Train Brain** on any thread to:
1. See all messages split into "Your messages" and "Others"
2. Select which messages to save (your messages are pre-selected)
3. Click **Save to PM Brain** to store them as writing style examples

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
    ├── gmailParser.js          # Gmail DOM parsing
    └── storage.js              # PM Brain storage
```

### Models

| Task | Model | Why |
|------|-------|-----|
| Summarization | `mistral` | Fast structured extraction |
| Replies | `llama3` | Natural conversational output |
| Categorization | `mistral` | Quick classification |
| Action Items | `mistral` | Structured extraction |
| PM Brain | `mixtral` | Best style matching |

To change models, edit `MODELS` in `extension/background.js`.

## Building for Chrome Web Store

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
- **PM Brain is local** — Writing style examples stored in `chrome.storage.local` only
- **You control your data** — Clear PM Brain memory anytime from the extension popup

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
- **Content script logs**: Open DevTools console on the Gmail tab
- **Popup logs**: Right-click the extension icon → Inspect

### Local testing without zip

```bash
./build.sh --dir
```

This copies files to `dist/extension/` without zipping — useful for testing the build output.

## License

MIT
