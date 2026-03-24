/**
 * Gmail DOM parsing utilities
 */

// Session-level cache for current user email to avoid repeated DOM queries
let cachedCurrentUserEmail = null;

/**
 * Detect and cache the current Gmail user's email address
 * Uses multiple heuristics: sender name "me" in thread, or account button aria-label
 * @returns {string} Current user's email or "Unknown"
 */
function getCurrentUserEmail() {
  if (cachedCurrentUserEmail) {
    return cachedCurrentUserEmail;
  }

  try {
    // Heuristic 1: Find a message where sender is "me" and extract email attribute
    const messageContainers = document.querySelectorAll('[role="main"] .gs');
    for (const container of messageContainers) {
      const senderSpan = container.querySelector(".gD, [email]");
      if (senderSpan) {
        const senderName = (senderSpan.getAttribute("name") || senderSpan.innerText || "").trim();
        const isMe = senderName.toLowerCase() === "me" || container.querySelector('.ip') !== null;
        
        if (isMe) {
          const email = senderSpan.getAttribute("email");
          if (email) {
            cachedCurrentUserEmail = email.trim();
            return cachedCurrentUserEmail;
          }
        }
      }
    }

    // Heuristic 2: Parse Gmail account button aria-label (usually on top-right)
    // Format: "Google Account: Name (email@example.com)"
    const accountButtons = document.querySelectorAll('[aria-label*="Google Account"]');
    for (const btn of accountButtons) {
      const ariaLabel = btn.getAttribute("aria-label") || "";
      const emailMatch = ariaLabel.match(/\(([^)]+@[^)]+)\)/);
      if (emailMatch && emailMatch[1]) {
        cachedCurrentUserEmail = emailMatch[1].trim();
        return cachedCurrentUserEmail;
      }
    }

    // Heuristic 3: Fall back to first sender email if nothing else works
    const senderElements = document.querySelectorAll('[email]');
    if (senderElements.length > 0) {
      const email = senderElements[0].getAttribute("email");
      if (email) {
        cachedCurrentUserEmail = email.trim();
        return cachedCurrentUserEmail;
      }
    }
  } catch (error) {
    console.error("Error detecting current user email:", error);
  }

  cachedCurrentUserEmail = "Unknown";
  return cachedCurrentUserEmail;
}

/**
 * Extract thread ID from the current Gmail URL
 * URLs look like: https://mail.google.com/mail/u/0/#inbox/FMfcgz...
 * @returns {string|null} The thread ID or null if not found
 */
function getThreadIdFromUrl() {
  try {
    const url = window.location.href;
    // Match thread ID from URL hash (after the last /)
    const match = url.match(/[#/]([a-zA-Z0-9]+)(?:[?#]|$)/);
    if (match && match[1] && match[1].length > 10) {
      return match[1];
    }
  } catch (error) {
    console.error("Error extracting thread ID:", error);
  }
  return null;
}

/**
 * Attempt to fetch all messages from Gmail's internal API
 * This is more reliable than DOM clicking since it gets complete thread data
 * @param {string} threadId - The Gmail thread ID
 * @returns {Promise<Array>} Array of message objects or empty array if failed
 */
async function fetchThreadViaGmailApi(threadId) {
  try {
    // Gmail's internal API endpoint for fetching thread data
    // This uses the same endpoint the web interface uses
    const url = `https://mail.google.com/mail/u/0/?ui=2&ik=${getGmailIk()}&view=cv&th=${threadId}&attid=0&disp=safe&realattid=msg-f%3A${threadId}`;
    
    // Try alternative: Make a fetch request to Gmail's API
    // Gmail might have a JSON API endpoint
    const apiUrl = `https://mail.google.com/mail/u/0/inbox?ui=2&jsver=current&srv=&ik=${getGmailIk()}&t=${threadId}&view=cv&search=inbox`;
    
    // Note: Direct API requests may fail due to CORS or authentication
    // For now, return empty to fall back to DOM parsing
    return [];
  } catch (error) {
    console.error("Error fetching thread via API:", error);
    return [];
  }
}

/**
 * Extract Gmail "ik" parameter needed for API calls
 * The "ik" is included in Gmail's initialization
 * @returns {string} The ik value or empty string
 */
function getGmailIk() {
  try {
    // Try to find ik in Gmail's page data
    // Gmail stores it in various places; try to extract from page state
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      if (script.textContent.includes('"ik":"')) {
        const match = script.textContent.match(/"ik":"([^"]+)"/);
        if (match) return match[1];
      }
    }
  } catch (error) {
    console.error("Error extracting Gmail ik:", error);
  }
  return "";
}

/**
 * Programmatically expand all collapsed messages in the thread
 * Uses DOM clicking as it's more reliable for content scripts
 * @returns {Promise<void>}
 */
async function expandAllMessages() {
  try {
    const startTime = Date.now();
    const maxWaitTime = 3000; // 3 second timeout
    let previousBodyCount = 0;
    let noChangeCount = 0;
    let clickIterations = 0;
    const maxClickIterations = 5; // Prevent infinite loops

    // First, try to collect all message IDs visible in the thread
    const getAllMessageIds = () => {
      const ids = [];
      const messageHeaders = document.querySelectorAll('[role="main"] [data-message-id]');
      for (const header of messageHeaders) {
        const id = header.getAttribute('data-message-id');
        if (id) ids.push({ element: header, id });
      }
      return ids;
    };

    while (Date.now() - startTime < maxWaitTime && clickIterations < maxClickIterations) {
      clickIterations++;
      const messageData = getAllMessageIds();
      let clickedAny = false;

      // Click collapsed message headers
      for (const { element } of messageData) {
        const isCollapsed = !element.querySelector('.a3s');
        if (isCollapsed) {
          // Try multiple selectors to find the clickable area
          const clickTarget = 
            element.querySelector('.hX') || // Common Gmail message header class
            element.querySelector('[role="button"]') ||
            element.querySelector('.kv') ||
            element; // Fall back to clicking the element itself
          
          if (clickTarget && clickTarget.offsetHeight > 0) { // Only click visible elements
            clickTarget.click();
            clickedAny = true;
            // Small delay between clicks
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      }

      // Check if new bodies appeared
      const currentBodyCount = document.querySelectorAll('.a3s').length;
      if (currentBodyCount > previousBodyCount) {
        previousBodyCount = currentBodyCount;
        noChangeCount = 0;
        console.log(`[Gmail Copilot] Expanded to ${currentBodyCount} messages`);
      } else if (!clickedAny) {
        noChangeCount++;
        if (noChangeCount >= 2) {
          console.log(`[Gmail Copilot] Expansion complete: ${currentBodyCount} messages found`);
          break;
        }
      } else {
        noChangeCount = 0;
      }

      // Wait for DOM to update
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  } catch (error) {
    console.error("Error expanding messages:", error);
  }
}

/**
 * Extract full email thread text from Gmail DOM
 * Gmail message bodies are in divs with class .a3s
 * First tries to get complete thread via API interception, then falls back to expansion
 * @returns {Promise<string>} Full thread text
 */
async function getEmailThread() {
  try {
    // Log initial state
    const initialCount = document.querySelectorAll(".a3s").length;
    console.log(`[Gmail Copilot] Initial message count: ${initialCount}`);
    
    // Try to use API interceptor if available
    const threadId = getThreadIdFromUrl();
    if (threadId && typeof getCachedThreadData === 'function') {
      const cachedData = getCachedThreadData(threadId);
      if (cachedData) {
        console.log(`[Gmail Copilot] Using cached thread data from API interception`);
        // Parse cached data to extract message text
        // This is a fallback - implementation depends on Gmail API response format
      }
    }
    
    // Fall back to DOM expansion
    await expandAllMessages();
    
    // Get all message bodies
    const messageBodies = document.querySelectorAll(".a3s");
    const finalCount = messageBodies.length;
    console.log(`[Gmail Copilot] Final message count: ${finalCount}`);
    
    if (messageBodies.length === 0) {
      return "No email thread found";
    }

    const threadText = Array.from(messageBodies)
      .map((body, index) => {
        const text = body.innerText || "";
        return text.trim();
      })
      .filter(text => text.length > 0)
      .join("\n\n---\n\n");

    console.log(`[Gmail Copilot] Extracted thread text length: ${threadText.length} characters`);
    return threadText;
  } catch (error) {
    console.error("Error extracting email thread:", error);
    return "";
  }
}

/**
 * Extract email metadata (subject, sender, recipients, current user)
 * @returns {object} Email metadata including currentUser
 */
function getEmailMetadata() {
  try {
    // Gmail subject is typically in h2 with data-subject-threading attribute
    const subjectElement = document.querySelector('h2[data-subject-threading]');
    const subject = subjectElement ? subjectElement.innerText : "No subject";

    // Get current user email
    const currentUser = getCurrentUserEmail();

    // Collect all participant emails from thread
    const senderElements = document.querySelectorAll('[email]');
    const senders = Array.from(senderElements)
      .map(el => el.getAttribute("email"))
      .filter(Boolean)
      .filter((email, index, arr) => arr.indexOf(email) === index); // Deduplicate

    // Separate current user from other participants
    const participants = senders.filter(email => email !== currentUser);
    const from = senders[0] || "Unknown sender";
    const to = participants;

    return {
      subject,
      currentUser,
      from,
      to,
      participants: senders,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("Error extracting email metadata:", error);
    return {
      subject: "Unknown",
      currentUser: "Unknown",
      from: "Unknown",
      to: [],
      participants: [],
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Find Gmail compose box and insert text
 * @param {string} text - Text to insert
 * @returns {boolean} True if insertion successful
 */
function insertIntoReply(text) {
  try {
    // Gmail compose box is typically a contenteditable div
    const composeBox = document.querySelector('[role="textbox"][aria-label*="Message"]');

    if (!composeBox) {
      console.warn("Could not find compose box");
      return false;
    }

    // Insert text with cursor at beginning
    const selection = window.getSelection();
    const range = document.createRange();

    range.selectNodeContents(composeBox);
    range.collapse(false); // Move to end

    selection.removeAllRanges();
    selection.addRange(range);

    document.execCommand("insertText", false, text);

    return true;
  } catch (error) {
    console.error("Error inserting text into reply:", error);
    return false;
  }
}

/**
 * Extract individual messages from the thread with sender info.
 * Returns an array of { sender, senderEmail, body, isMe } objects.
 * First expands all collapsed messages to ensure all thread content is available.
 *
 * Gmail marks the logged-in user's messages with data-message-id and
 * shows "me" or the user's own address in the header.
 */
async function getIndividualMessages() {
  const results = [];

  try {
    await expandAllMessages();
    
    const currentUser = getCurrentUserEmail();

    // Each top-level message container in a thread
    // Gmail wraps each message in a div with class "gs"
    const messageContainers = document.querySelectorAll('[role="main"] .gs');

    // Fallback: just pair up headers and bodies if .gs doesn't match
    const bodies = document.querySelectorAll(".a3s");
    if (messageContainers.length === 0 && bodies.length === 0) return results;

    if (messageContainers.length > 0) {
      messageContainers.forEach(container => {
        const body = container.querySelector(".a3s");
        if (!body) return;

        const bodyText = (body.innerText || "").trim();
        if (!bodyText) return;

        // Sender name — Gmail uses .gD for the sender name span
        const senderSpan = container.querySelector(".gD, [email]");
        const senderName = senderSpan
          ? (senderSpan.getAttribute("name") || senderSpan.innerText || "").trim()
          : "Unknown";
        const senderEmail = senderSpan
          ? (senderSpan.getAttribute("email") || "").trim()
          : "";

        // Determine if this message is from the current user using email comparison
        const isMe = senderEmail && currentUser && senderEmail.toLowerCase() === currentUser.toLowerCase();

        results.push({ sender: senderName, senderEmail, body: bodyText, isMe });
      });
    } else {
      // Simpler fallback: just get bodies, no sender detection
      bodies.forEach(body => {
        const text = (body.innerText || "").trim();
        if (text) {
          results.push({ sender: "Unknown", senderEmail: "", body: text, isMe: false });
        }
      });
    }
  } catch (error) {
    console.error("Error extracting individual messages:", error);
  }

  return results;
}

/**
 * Find the Gmail toolbar to inject buttons
 * @returns {HTMLElement|null} The toolbar element
 */
function getGmailToolbar() {
  try {
    // Gmail toolbar has attribute gh='mtb' in older versions
    let toolbar = document.querySelector("div[gh='mtb']");

    // Try alternative selectors for different Gmail layouts
    if (!toolbar) {
      toolbar = document.querySelector('[role="toolbar"]');
    }

    if (!toolbar) {
      // Look for the action buttons area in thread view
      toolbar = document.querySelector(".afJ");
    }

    return toolbar;
  } catch (error) {
    console.error("Error finding Gmail toolbar:", error);
    return null;
  }
}

/**
 * Check if we're currently viewing an email thread
 * @returns {boolean} True if in thread view
 */
function isInThreadView() {
  try {
    // In thread view, there should be message bodies
    const hasMessages = document.querySelectorAll(".a3s").length > 0;

    // And a subject heading
    const hasSubject = document.querySelector("h2[data-subject-threading]") !== null;

    return hasMessages && hasSubject;
  } catch (error) {
    return false;
  }
}

/**
 * Get the current thread ID from URL
 * @returns {string|null} The thread ID
 */
function getThreadId() {
  try {
    const url = window.location.href;
    const match = url.match(/[#/]([a-f0-9]+)(?:[?#]|$)/);
    return match ? match[1] : null;
  } catch (error) {
    return null;
  }
}
