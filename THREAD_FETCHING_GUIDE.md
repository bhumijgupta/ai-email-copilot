# Complete Guide to Thread Fetching

## Overview

The extension now uses a **hybrid approach** to get email thread content:

1. **API Interception** (Preferred) - Captures Gmail's internal API calls
2. **DOM Expansion** (Fallback) - Clicks messages to expand them in the DOM

## How It Works

### Phase 1: API Interception (at document_start)
When you load Gmail:
1. `gmailApiInterceptor.js` runs FIRST (before other scripts)
2. It overrides the global `fetch` function
3. Monitors all API calls Gmail makes
4. Caches thread data when detected

### Phase 2: Thread Processing (when you click a button)
When you click Summarise/Reply:
1. `getEmailThread()` checks for cached API data first
2. If no cache, falls back to `expandAllMessages()`
3. Extracts text from message bodies (.a3s elements)

## Debugging: How to Monitor API Calls

### Step 1: Open DevTools Network Tab
```
1. Press F12 in Gmail
2. Click the "Network" tab
3. Filter by "Fetch/XHR"
```

### Step 2: Look for Thread Fetch Calls
When you open a thread, Gmail fetches messages. Look for requests like:
- `https://mail.google.com/mail/u/0/?...`
- Requests with parameters like `t=` or `th=` (thread ID)
- Responses with JSON or protobuf data

### Step 3: Inspect Request Details
```
Right-click the request → Copy as cURL to see the full URL and params
Common patterns:
- ?ui=2&view=cv&th=<threadId> - Fetch conversation view
- &t=<threadId> - Alternative thread parameter
- &json=1 - Request JSON format
```

### Step 4: Check Response Format
```
1. Click the request
2. Go to "Response" or "Preview" tab
3. Look for:
   - HTML containing message bodies (.a3s elements)
   - JSON with message objects
   - Protobuf binary data
```

## How to Improve API Data Extraction

### Find the Current API Format
1. **Open Network tab** and fetch a thread
2. **Right-click a message fetch request**
3. **Copy response** to see format
4. **Modify `parseGmailHtmlResponse()` or add JSON parser**

### Example: If API Returns JSON

If you see JSON like:
```json
{
  "thread": {
    "id": "...",
    "messages": [
      {
        "id": "...",
        "from": "...",
        "body": "..."
      }
    ]
  }
}
```

Update `gmailApiInterceptor.js`:
```javascript
function extractMessagesFromJson(data) {
  const messages = [];
  if (data.thread && data.thread.messages) {
    for (const msg of data.thread.messages) {
      if (msg.body) messages.push(msg.body);
    }
  }
  return messages.join('\n\n---\n\n');
}
```

### Example: If API Returns HTML with Base64

Gmail sometimes encodes message bodies. Look for:
```javascript
// In the HTML response, messages might be:
// <div class="a3s">encoded content</div>
// Or within a data attribute: data-message="..."
// Or base64 encoded in JS: var msg64 = "..."
```

## Console Commands for Testing

Run these in DevTools console while on Gmail:

```javascript
// Check interceptor is loaded
console.log(typeof getCachedThreadData)
// Should return: "function"

// Get current thread ID
console.log(getThreadIdFromUrl())
// Should return: long alphanumeric string

// Check cached data
const threadId = getThreadIdFromUrl();
console.log(getCachedThreadData(threadId))
// Will show cached API response or null

// Manually fetch a thread
const threadId = getThreadIdFromUrl();
console.log(await fetchThreadDirectly(threadId))
// Shows result of direct fetch attempt

// Trigger full expansion and extraction
console.log(await getEmailThread())
// Shows final extracted thread text
```

## Current Limitations & Next Steps

### Current Issues
- API format changes frequently with Gmail updates
- Direct API requests might fail due to authentication
- HTML parsing is fragile (depends on class names)

### Possible Solutions

#### Option 1: Parse Network Requests More Carefully
**Best approach:**
1. Enable Network tab filter
2. Find the exact request Gmail uses
3. Understand the response format
4. Implement proper parser
5. Add to `gmailApiInterceptor.js`

#### Option 2: Use Gmail's Own Message Rendering
Instead of parsing raw API data, let Gmail render it:
```javascript
// Don't try to parse API, just expand messages
// and read from DOM (.a3s elements)
// This is what we do now - it's simple and reliable
```

#### Option 3: Reverse Engineer Gmail's Protobuf
Gmail uses Protocol Buffers (binary format) for some APIs:
1. Decode protobuf messages
2. Extract actual message content
3. More complex but very reliable

## File Locations

- **API Interception**: `extension/utils/gmailApiInterceptor.js`
- **Message Extraction**: `extension/utils/gmailParser.js`
- **Thread Detection**: `getThreadIdFromUrl()` in gmailParser.js
- **Content Script Setup**: `extension/content.js`

## Recommended Debug Workflow

```
1. Open Gmail with a multi-message thread
2. Press F12 → Network tab
3. Click your button (Summarise, etc.)
4. In Console, check:
   getCachedThreadData(getThreadIdFromUrl())
5. In Network, look for thread fetch requests
6. Compare: What Gmail fetched vs. What we got
7. Update parsers if needed
```

## Quick Fixes to Try

### If Only Last Message Shows
1. Check if DOM expansion works
2. Console: `document.querySelectorAll('.a3s').length`
3. Click expand buttons manually
4. Console again: check if count increases

### If API Interception Works but Parsing Fails
1. Check what's cached: `getCachedThreadData(getThreadIdFromUrl())`
2. Log the structure: `console.log(JSON.stringify(data, null, 2))`
3. Look for message content patterns
4. Add parser for that format

### If Everything Fails
1. Fall back to manual DOM clicking
2. It's slower but works reliably
3. Or: Open Browser DevTools to inspect what Gmail fetches
