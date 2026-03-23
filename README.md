# AI Email Copilot - Chrome Extension

A Chrome Extension (Manifest V3) that enhances Gmail with AI-powered email analysis using **Ollama** running locally on your machine.

## Features

- **📋 Thread Summarization** — Extract TL;DR, key decisions, open questions, and action items
- **✏️ Reply Generation** — Auto-draft professional replies with tone control
- **🏷️ Categorization** — Classify emails (Bug, Vendor Query, Pricing, Onboarding, Internal, Other)
- **✓ Action Items** — Extract tasks with owner and priority levels
- **🧠 PM Brain** — Learn from your writing style to personalize replies (optional)

All AI processing runs **locally via Ollama** — no data sent to external APIs.

## Prerequisites

### 1. Install Ollama

Download and install Ollama from [ollama.ai](https://ollama.ai)

### 2. Start Ollama

Open a terminal and run:

```bash
ollama pull llama3        # For reply generation
ollama pull mistral       # For summarization, categorization, actions
ollama pull mixtral       # For PM Brain (optional)
```

Then start the Ollama server:

```bash
ollama serve
```

This runs Ollama on `http://localhost:11434` (required by the extension).

### 3. Install the Extension

1. Clone or download this repository
2. Go to `chrome://extensions`
3. Enable **Developer Mode** (top right toggle)
4. Click **Load Unpacked**
5. Select the `extension/` folder from this repo

You should see "AI Email Copilot" installed. The icon will appear in your Chrome toolbar.

## Usage

### Basic Workflow

1. Open any email thread in Gmail
2. Click the AI Copilot toolbar buttons:
   - **📋 Summarise** — Get thread summary
   - **✏️ Reply** — Generate reply draft
   - **🏷️ Categorise** — Auto-tag the email
   - **✓ Actions** — Extract action items

3. A side panel appears with the AI analysis
4. **Copy** results or **Insert into Reply** to auto-fill the compose box

### PM Brain (Optional)

Enable PM Brain in the extension popup to:
- Learn from your past emails
- Personalize AI replies to match your writing style
- Click "Improve with My Style" for style-matched replies

## Architecture

```
Gmail UI
    ↓
content.js (injects buttons & panel)
    ↓ (chrome.runtime.sendMessage)
background.js (routes requests)
    ↓ (HTTP POST)
Ollama (localhost:11434)
    ↓
Local AI Models (mistral, llama3, mixtral)
```

### File Structure

```
extension/
├── manifest.json                    # MV3 configuration
├── background.js                    # Service worker (message routing)
├── content.js                       # Gmail UI injection & panel rendering
├── popup/
│   ├── popup.html                   # Settings UI
│   ├── popup.js                     # Settings logic
│   └── popup.css                    # Settings styling
├── ui/
│   └── panel.css                    # Panel styles (included in content.js)
└── utils/
    ├── ollamaClient.js              # Ollama API client
    ├── promptBuilder.js             # AI prompt templates
    ├── gmailParser.js               # Gmail DOM parsing
    └── storage.js                   # PM Brain memory management
```

## Configuration

### Models

The extension uses these Ollama models by default:

| Task | Model | Why |
|------|-------|-----|
| Summarization | `mistral` | Fast, structured extraction |
| Replies | `llama3` | Natural conversational output |
| Categorization | `mistral` | Quick classification |
| Action Items | `mistral` | Structured extraction |
| PM Brain | `mixtral` | Best style matching |

### Change Models

Edit `MODELS` object in `extension/background.js`:

```javascript
const MODELS = {
  SUMMARY: "llama2",      // Change to another model
  REPLY: "neural-chat",
  // ... etc
};
```

Then reload the extension.

### Ollama Connection

The extension expects Ollama at `http://localhost:11434`. To use a different host:

Edit `OLLAMA_BASE_URL` in `extension/utils/ollamaClient.js`:

```javascript
const OLLAMA_BASE_URL = "http://your-custom-host:port";
```

## Troubleshooting

### "Ollama disconnected" in popup

**Fix:** Make sure Ollama is running:
```bash
ollama serve
```

The extension will auto-reconnect when Ollama is available.

### Model not found

**Fix:** Pull the model first:
```bash
ollama pull llama3
ollama pull mistral
ollama pull mixtral
```

### Panel doesn't appear

**Fix:** The panel only appears when viewing a Gmail thread. Make sure you:
1. Opened an email thread (not just the inbox)
2. Clicked one of the AI Copilot buttons
3. Ollama is running and connected

### Replies are too short/long

**Fix:** The tone setting in `content.js` is hard-coded to "professional". To change:

Edit `handleButtonClick()` in `extension/content.js`:

```javascript
chrome.runtime.sendMessage(
  {
    // ...
    tone: "casual"  // Change to: "casual", "brief", "detailed"
  },
  // ...
);
```

## Development

### Debugging

1. Go to `chrome://extensions`
2. Find "AI Email Copilot"
3. Click **"Inspect views" → "background.js"** to debug service worker
4. Open **Console** in the Gmail tab to see content script logs

### Testing Flow

1. Start Ollama: `ollama serve`
2. Reload extension (Extension Manager → refresh button)
3. Open a Gmail thread
4. Click a button and check the panel for results
5. Verify logs in browser console

### Modifying Prompts

All AI prompts are in `extension/utils/promptBuilder.js`. Edit the functions to customize:
- `buildSummaryPrompt()` — Summary format
- `buildReplyPrompt()` — Reply instructions
- `buildCategoryPrompt()` — Categories and confidence
- `buildActionPrompt()` — Action item format
- `buildPMBrainPrompt()` — Style personalization

## Privacy & Security

✅ **All processing is local** — no data sent to external APIs
✅ **Read-only Gmail access** — extension only reads email content
✅ **No authentication needed** — runs entirely on your machine
✅ **No storage** — analysis results are not saved (except PM Brain examples)

PM Brain stores:
- Your past sent emails (up to 50)
- User edits to AI responses (up to 30)

Clear anytime in extension popup → "Clear Memory"

## Known Limitations

- Response time depends on your CPU (local models are slower than cloud APIs)
- Requires Ollama models to be pre-downloaded
- Works best on Gmail threads with clear structure
- Panel is desktop-only (not mobile-responsive)

## Future Enhancements

- ✨ Slack integration
- 📊 Email analytics dashboard
- 🎯 Auto-tagging suggestions
- 🔄 Fine-tuned personal models
- 📱 Mobile-responsive panel

## Support

For issues:
1. Check that Ollama is running: `ollama serve`
2. Verify models are downloaded: `ollama pull <model>`
3. Reload the extension from chrome://extensions
4. Check browser console for error messages

## License

MIT

---

**Made with ❤️ for Gmail power users and PMs**
