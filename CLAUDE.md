# CLAUDE.md — AI Agent Instructions

This file provides guidance for AI coding agents (Claude Code, Cursor, etc.)
working on the **AI Email Copilot** Chrome extension.

## Project Overview

A Chrome Extension (Manifest V3) that adds AI-powered email analysis to Gmail
using **Ollama** running locally. No data leaves the user's machine.

**Stack:** Vanilla JS, Chrome Extension APIs, Ollama REST API
**Runtime:** Content scripts injected into `mail.google.com`

## Repository Layout

```
extension/
  manifest.json          # MV3 config, permissions, content script registration
  background.js          # Service worker — routes messages, calls Ollama
  content.js             # Injected into Gmail — UI, panel, styles, event handlers
  popup/                 # Extension popup (settings, Your Brain toggle)
  utils/
    gmailParser.js       # DOM scraping: thread expansion, metadata, user detection
    promptBuilder.js     # All AI prompt templates (summary, reply, categorize, etc.)
    ollamaClient.js      # HTTP client for Ollama API
    storage.js           # chrome.storage.local wrapper (Your Brain data)
  ui/                    # Panel module + styles
style-guide.md           # UI design tokens and component specs — READ THIS before UI work
```

## Key Architecture Rules

1. **Content scripts run in Chrome's isolated world.** They can read/modify the
   Gmail DOM but cannot access Gmail's own JS globals or intercept its network
   requests. Never attempt `window.fetch` overrides for Gmail API interception.

2. **All AI calls go through `background.js`.** Content script sends a message
   via `chrome.runtime.sendMessage`, background.js calls Ollama, returns the
   result. Never call Ollama directly from content scripts.

3. **All prompts live in `promptBuilder.js`.** Every prompt must include
   `SYSTEM_PERSONA` and `JSON_MANDATE` constants. Responses from the model are
   always expected in JSON format.

4. **Gmail DOM is unstable.** Selectors in `gmailParser.js` use heuristics
   (`.a3s`, `.gD`, `[data-message-id]`, etc.) that may break across Gmail
   updates. Always use multiple fallback selectors and guard with null checks.

5. **Styles are injected via `content.js`.** All CSS lives inside the
   `injectStyles()` function as a template literal. There is no separate CSS
   file for the floating bar or side panel.

## Coding Conventions

- **No build step.** All JS is vanilla, loaded directly by the browser.
- **Use `console.debug`** for extension logging, never `console.log`.
  Prefix all messages with `[Gmail Copilot]` or `[AI Copilot]`.
- **Async/await** for anything that touches the DOM expansion flow or
  chrome.runtime messaging.
- **No external dependencies.** No npm, no bundler, no frameworks.
- **`chrome.storage.local`** for persistence. Storage keys use `your_brain_*`
  prefix for the writing-style feature.

## UI / Styling Rules

**Always read `style-guide.md` before any UI changes.**

Key constraints:
- Match Gmail's visual language: Google Blue (`#1a73e8`), 8px card radius,
  Material elevation shadows, `Google Sans` / `Roboto` font stack.
- No emojis in the UI. Use SVG icons or plain text.
- No colored gradients. Header is white with a subtle bottom border.
- Cards use elevation (shadow), not visible borders.
- Labels are sentence case, never UPPERCASE.
- Buttons follow Google Material: filled (blue), outlined (blue border),
  or ghost (text-only).

## Documentation — Keep It In Sync

After any meaningful change, check whether these docs need updating:

| Doc | What to update | When |
|---|---|---|
| `README.md` | Features list, usage table, architecture diagram, file structure, model table, troubleshooting | New feature, renamed feature, new file, changed model, new prerequisite |
| `docs/privacy.html` | Permissions, data stored locally, processing flow | New permission in manifest, new storage keys, new network calls, changed data flow |
| `style-guide.md` | Tokens, component specs, do's/don'ts | New UI component, changed design language, new color/spacing tokens |
| `eval/fixtures.json` | Fixture `metadata`, `structuredThread`, `expected` fields | Changed prompt signatures, thread data shape, metadata shape, new quality dimensions |
| `eval/runner.js` | `OPERATIONS` prompt builder calls | Changed prompt builder function signatures |
| `eval/scorer.js` | Scoring rubrics and point allocation | New quality dimensions (e.g., anti-mimicry), changed evaluation criteria |

**Rules:**
- Update docs in the **same changeset** as the code change, not as a follow-up.
- `README.md`: Keep the features list, usage table, and file structure accurate. If you add a button, add it to the usage table. If you add a file, add it to the file structure.
- `docs/privacy.html`: If you add a new Chrome permission, a new `chrome.storage` key, or any network call, update the relevant sections. Keep the "Last updated" date current.
- `style-guide.md`: If you introduce a new component or change a design token, document it here first.
- Never let feature names in docs diverge from the code (e.g., if a feature is renamed in code, rename it in all docs too).
- **Eval framework:** When changing prompt templates, thread extraction, metadata shape, or response parsing, update `eval/fixtures.json`, `eval/runner.js`, and `eval/scorer.js` in the same changeset. Fixture data shapes must mirror what the production prompt builders expect.

## Common Tasks

### Adding a new AI feature

1. Add the prompt template in `promptBuilder.js` (include `SYSTEM_PERSONA` +
   `JSON_MANDATE`).
2. Add a message handler in `background.js` that calls Ollama and parses the
   JSON response.
3. Add a button to the floating action bar in `content.js` (`injectActionBar`).
4. Add a render function in `content.js` for the panel output.
5. Add styles inside `injectStyles()` following the style guide.

### Modifying Gmail DOM parsing

- Edit `gmailParser.js`. Use `document.querySelectorAll` with fallback
  selectors.
- The `expandAllMessages()` function uses a `WeakSet` to track clicked
  elements and a stability counter to avoid infinite loops.
- Always test with single-message threads AND multi-message threads.

### Changing models

- Edit the `MODELS` object at the top of `background.js`.
- Available models depend on what the user has pulled via `ollama pull`.

## Testing

No automated test suite. Manual testing:
1. Load unpacked from `extension/` in `chrome://extensions`
2. Open Gmail, navigate to an email thread
3. Verify the floating bar appears and each button works
4. Check DevTools console (filter `[Gmail Copilot]`) for debug output

## Don'ts

- Don't add npm/node dependencies or a build system.
- Don't use `console.log` (use `console.debug`).
- Don't put emojis in the UI.
- Don't add gradients, purple/indigo colors, or non-Google-Blue accents.
- Don't create new CSS files — all panel/bar styles are in `content.js`.
- Don't attempt to intercept Gmail's internal API requests.
- Don't commit `.env` or credential files.
