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
 * Programmatically expand all collapsed messages in the thread
 * Clicks collapsed message headers to reveal full messages
 * Note: Does NOT expand "Show trimmed content" as trimmed content (quoted text)
 * can confuse AI models - we only need the actual message content
 * @returns {Promise<void>}
 */
async function expandAllMessages() {
  try {
    const startTime = Date.now();
    const maxWaitTime = 2000; // 2 second timeout
    let previousBodyCount = 0;
    let noChangeCount = 0;

    while (Date.now() - startTime < maxWaitTime) {
      // Click all collapsed message headers (data-message-id elements without visible .a3s)
      const messageHeaders = document.querySelectorAll('[role="main"] [data-message-id]');
      let clickedAny = false;

      for (const header of messageHeaders) {
        // Check if this message is collapsed (has data-message-id but no visible .a3s body)
        const isCollapsed = !header.querySelector('.a3s');
        if (isCollapsed) {
          // Find a clickable element within this message container to expand it
          const clickTarget = header.querySelector('[role="button"], .kv, .hX');
          if (clickTarget) {
            clickTarget.click();
            clickedAny = true;
          }
        }
      }

      // Check if new bodies have appeared
      const currentBodyCount = document.querySelectorAll('.a3s').length;
      if (currentBodyCount > previousBodyCount) {
        previousBodyCount = currentBodyCount;
        noChangeCount = 0;
      } else if (!clickedAny) {
        noChangeCount++;
        if (noChangeCount >= 2) {
          // No changes for 2 iterations and nothing was clicked, expansion complete
          break;
        }
      }

      // Small delay to allow Gmail DOM to update
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  } catch (error) {
    console.error("Error expanding messages:", error);
  }
}

/**
 * Extract full email thread text from Gmail DOM
 * Gmail message bodies are in divs with class .a3s
 * First expands all collapsed messages to ensure complete thread content
 * @returns {Promise<string>} Full thread text
 */
async function getEmailThread() {
  try {
    await expandAllMessages();
    
    const messageBodies = document.querySelectorAll(".a3s");
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
