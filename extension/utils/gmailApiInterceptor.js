/**
 * Gmail API Interceptor
 * Intercepts Gmail's internal API calls to get complete thread data
 * without relying on DOM expansion which is unreliable
 */

// Store intercepted API responses for later retrieval
let cachedThreadData = {};

/**
 * Initialize API interception by overriding fetch
 * This captures all API calls Gmail makes internally
 */
function initGmailApiInterception() {
  try {
    const originalFetch = window.fetch;
    
    window.fetch = function(...args) {
      const [resource, config] = args;
      const url = typeof resource === 'string' ? resource : resource.url;
      
      // Intercept Gmail's thread/message fetch calls
      if (url && (url.includes('/mail/') || url.includes('?action=') || url.includes('&t='))) {
        console.log('[Gmail Copilot] Intercepted API call:', url);
      }
      
      // Call original fetch and monitor response
      return originalFetch.apply(this, args).then(response => {
        // Only intercept successful responses
        if (!response.ok) return response;
        
        // Clone response to inspect without consuming it
        const clonedResponse = response.clone();
        
        // Try to parse as JSON for Gmail API responses
        clonedResponse.json().then(data => {
          // Look for Gmail message/thread data
          if (data && typeof data === 'object') {
            // Gmail API responses contain [header, [messages]] structure or similar
            // Store if it contains message-like data
            const threadId = extractThreadIdFromResponse(data);
            if (threadId) {
              cachedThreadData[threadId] = data;
              console.log('[Gmail Copilot] Cached thread data for:', threadId);
            }
          }
        }).catch(err => {
          // Not JSON, that's okay - might be other data
        });
        
        return response;
      }).catch(error => {
        console.error('[Gmail Copilot] Fetch error:', error);
        throw error;
      });
    };
    
    console.log('[Gmail Copilot] Gmail API interception initialized');
  } catch (error) {
    console.error('[Gmail Copilot] Failed to initialize API interception:', error);
  }
}

/**
 * Extract thread ID from Gmail API response
 * @param {*} data - The API response data
 * @returns {string|null} Thread ID if found
 */
function extractThreadIdFromResponse(data) {
  try {
    // Gmail API responses are complex - look for common patterns
    if (Array.isArray(data)) {
      // Check if array contains thread-like data
      const firstItem = data[0];
      if (firstItem && typeof firstItem === 'string' && firstItem.length > 10) {
        return firstItem; // Might be thread ID
      }
    }
    
    if (data && typeof data === 'object') {
      // Check for common field names
      if (data.threadId) return data.threadId;
      if (data.t) return data.t;
      if (data.id) return data.id;
      
      // Check nested structures
      for (const key of Object.keys(data)) {
        if (key.includes('thread') && typeof data[key] === 'string') {
          return data[key];
        }
      }
    }
  } catch (error) {
    // Silently fail - not all responses are thread data
  }
  return null;
}

/**
 * Fetch cached thread data
 * @param {string} threadId - The thread ID to retrieve
 * @returns {*} The cached data or null
 */
function getCachedThreadData(threadId) {
  return cachedThreadData[threadId] || null;
}

/**
 * Make a direct fetch request to Gmail's thread view
 * Uses the thread ID to fetch complete message data
 * @param {string} threadId - The Gmail thread ID
 * @returns {Promise<string>} Thread content or empty string if failed
 */
async function fetchThreadDirectly(threadId) {
  try {
    if (!threadId) {
      console.log('[Gmail Copilot] No thread ID provided');
      return '';
    }

    console.log('[Gmail Copilot] Attempting direct thread fetch for:', threadId);
    
    // Try Gmail's web interface endpoint
    // Format: https://mail.google.com/mail/u/0/?ui=2&view=cv&th=<threadId>
    // The response will be HTML, we need to extract message text
    
    // Alternative: Use the JSON API if available
    // Gmail has internal JSON endpoints for threads
    const urls = [
      // Try different possible endpoints
      `https://mail.google.com/mail/u/0/?ui=2&view=cv&th=${threadId}&json=1`,
      `/mail/u/0/?ui=2&view=cv&th=${threadId}&json=1`,
      `/mail/u/0/?t=${threadId}&json=1`,
    ];
    
    for (const url of urls) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          credentials: 'include', // Important for authenticated requests
        });
        
        if (response.ok) {
          const text = await response.text();
          if (text && text.length > 100) {
            console.log('[Gmail Copilot] Successfully fetched thread data');
            return text;
          }
        }
      } catch (err) {
        // Try next URL
        continue;
      }
    }
    
    console.log('[Gmail Copilot] Direct fetch failed, falling back to DOM');
    return '';
  } catch (error) {
    console.error('[Gmail Copilot] Error in fetchThreadDirectly:', error);
    return '';
  }
}

/**
 * Parse Gmail HTML response to extract message text
 * @param {string} html - HTML response from Gmail
 * @returns {string} Extracted message text
 */
function parseGmailHtmlResponse(html) {
  try {
    // Create a temporary DOM element to parse the HTML
    const temp = document.createElement('div');
    temp.innerHTML = html;
    
    // Look for message bodies - they're typically in .a3s elements
    const bodies = temp.querySelectorAll('.a3s');
    const messages = [];
    
    for (const body of bodies) {
      const text = body.innerText || body.textContent;
      if (text && text.trim().length > 0) {
        messages.push(text.trim());
      }
    }
    
    return messages.join('\n\n---\n\n');
  } catch (error) {
    console.error('[Gmail Copilot] Error parsing Gmail HTML:', error);
    return '';
  }
}

// Initialize interception when script loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGmailApiInterception);
} else {
  initGmailApiInterception();
}
