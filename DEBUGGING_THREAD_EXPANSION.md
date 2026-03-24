# Debugging Thread Expansion Issues

## Problem
The extension was only processing the last message in a collapsed thread instead of expanding and processing all messages.

## Solution Implemented

### 1. Improved DOM-Based Expansion (`expandAllMessages()`)
The function now:
- **Iterates smarter**: Loops up to 5 times (instead of polling indefinitely)
- **Tracks progress**: Logs message counts to console for debugging
- **Better selectors**: Tries multiple selectors (.hX, [role="button"], .kv) to find clickable areas
- **Visibility check**: Only clicks elements that are actually visible (`offsetHeight > 0`)
- **Delayed clicks**: Adds 100ms delay between clicks to let Gmail's DOM update
- **Extended timeout**: Increased to 3 seconds to allow more time for message loading

### 2. Enhanced Logging
The extension now logs to browser console:
```
[Gmail Copilot] Initial message count: 3
[Gmail Copilot] Expanded to 5 messages
[Gmail Copilot] Expansion complete: 7 messages found
[Gmail Copilot] Extracted thread text length: 5432 characters
```

### 3. Infrastructure for Gmail API
Added helper functions (for future use):
- `getThreadIdFromUrl()` - Extracts thread ID from Gmail URL
- `getGmailIk()` - Attempts to extract Gmail's internal `ik` parameter
- `fetchThreadViaGmailApi()` - Placeholder for direct API requests

## How to Debug

### Step 1: Enable DevTools Logging
1. Open Gmail in Chrome
2. Press `F12` to open DevTools
3. Go to the **Console** tab
4. Look for messages starting with `[Gmail Copilot]`

### Step 2: Test Thread Expansion
1. Open an email thread with multiple collapsed messages (Gmail defaults to showing last few)
2. Click any button (Summarise, Reply, etc.)
3. Watch the console for:
   - Initial message count
   - Expansion progress messages
   - Final message count
   - Extracted text length

### Step 3: Check What's Happening
If you see:
```
[Gmail Copilot] Initial message count: 3
[Gmail Copilot] Final message count: 3
```
This means messages weren't expanding. Check:
1. Are there actually collapsed messages? (Gray message headers without blue "Summarise" bar)
2. Is the selector `.hX` still valid in current Gmail version?
3. Try inspecting one of those headers in DevTools to find the correct clickable element class

### Step 4: Inspect Gmail's DOM
1. Right-click a collapsed message header
2. Click "Inspect"
3. Look for these classes/attributes:
   - `.hX` - Message header
   - `.kv` - Alternative header class
   - `data-message-id` - Message identifier
   - `.a3s` - Message body (should appear after expand)

## Known Limitations

### Current Approach (DOM-based)
- **Pro**: Works within content script sandbox without special permissions
- **Con**: Depends on Gmail's undocumented class names that may change
- **Con**: Slower than API approach (needs to wait for DOM updates)

### Alternative Approach (Gmail API)
- Would require directly calling Gmail's internal API endpoints
- Better reliability but might violate Gmail's Terms of Service
- Would need additional permissions or workarounds
- Not currently implemented to avoid potential issues

## Next Steps if Issues Persist

1. **Check Gmail Version**: Gmail frequently updates. The DOM structure may have changed.
   - Open DevTools Console
   - Type: `Object.keys(window.gapi)` to check if Gmail API is available
   - Inspect message headers to see current class names

2. **Enable Content Script Debugging**:
   - Go to `chrome://extensions`
   - Find "AI Email Copilot"
   - Click "Inspect views: service worker"
   - Check for error messages

3. **Monitor Network Calls**:
   - In DevTools, go to Network tab
   - Filter by "fetch" to see API calls Gmail makes
   - Look for endpoints that fetch message threads
   - Could potentially intercept these calls instead of clicking

## Code Location
All expansion logic is in: `extension/utils/gmailParser.js`
- `expandAllMessages()` - Main expansion logic
- `getEmailThread()` - Entry point with logging
- `getThreadIdFromUrl()` - Thread ID extraction
- `getGmailIk()` - Gmail internal parameter extraction

## Console Commands for Manual Testing

Run these in the DevTools console while viewing a Gmail thread:

```javascript
// Check visible messages
console.log(document.querySelectorAll('.a3s').length)

// Check collapsed messages
console.log(document.querySelectorAll('[data-message-id]').length)

// Manually trigger expansion
await expandAllMessages()

// Check result
console.log('After expansion:', document.querySelectorAll('.a3s').length)

// Get thread ID
console.log(getThreadIdFromUrl())

// Get current user
console.log(getCurrentUserEmail())
```
