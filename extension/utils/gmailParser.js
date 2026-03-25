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
 * Click the "show N hidden messages" button that Gmail displays when a long
 * thread has many messages collapsed into one row. This button is typically
 * a small element showing just a number (e.g. "4") between visible messages.
 * Must be clicked before individual messages can be expanded.
 * @param {HTMLElement} mainArea - The [role="main"] container
 */
async function expandHiddenMessagesButton(mainArea) {
  // Gmail renders the "N messages" expander in several ways:
  // 1. A <span> with class "adx" containing just a number
  // 2. A <div> with class "adS" that acts as the clickable row
  // 3. A <tr> or <div> with a data-collapsed attribute
  const selectors = [
    '.adS',                    // collapsed-messages row container
    '[data-collapsed]',        // explicit collapsed marker
    'span.adx',               // the number badge itself
  ];

  for (const selector of selectors) {
    const elements = mainArea.querySelectorAll(selector);
    for (const el of elements) {
      // Verify it looks like a hidden-messages button: contains a small
      // number, is visible, and doesn't already have expanded message bodies
      const text = (el.innerText || "").trim();
      const looksLikeCount = /^\d{1,3}$/.test(text) || el.classList.contains("adS") || el.hasAttribute("data-collapsed");
      if (!looksLikeCount) continue;
      if (el.querySelector('.a3s')) continue;
      if (el.offsetHeight === 0) continue;

      console.debug(`[Gmail Copilot] Found hidden-messages button ("${text}"), clicking...`);
      el.click();

      // Wait for Gmail to render the newly revealed messages
      await new Promise(r => setTimeout(r, 500));

      // Gmail may need a moment to finish DOM updates
      const beforeCount = mainArea.querySelectorAll('.gs, [data-message-id]').length;
      await new Promise(r => setTimeout(r, 300));
      const afterCount = mainArea.querySelectorAll('.gs, [data-message-id]').length;
      console.debug(`[Gmail Copilot] After expanding hidden messages: ${beforeCount} → ${afterCount} containers`);
    }
  }
}

/**
 * Programmatically expand all collapsed messages in the thread.
 * First clicks the "show N hidden messages" button if present, then
 * expands individual collapsed messages one by one.
 * Tracks which elements have already been clicked to avoid re-clicking
 * phantom elements (non-message containers that never gain .a3s).
 * @returns {Promise<void>}
 */
async function expandAllMessages() {
  try {
    const mainArea = document.querySelector('[role="main"]');
    if (!mainArea) {
      console.debug(`[Gmail Copilot] No [role="main"] found, skipping expansion`);
      return;
    }

    // Phase 0: Click the "show N hidden messages" button if present.
    // Gmail shows this as a clickable row with a number (e.g. "4") when
    // many messages in a thread are collapsed into a single element.
    await expandHiddenMessagesButton(mainArea);

    const clickedSet = new WeakSet();
    let previousBodyCount = document.querySelectorAll('.a3s').length;
    let stableRounds = 0;

    console.debug(`[Gmail Copilot] Starting per-message expansion (${previousBodyCount} already expanded)...`);

    for (let iteration = 1; iteration <= 6; iteration++) {
      const candidates = [
        ...mainArea.querySelectorAll('[data-message-id]'),
        ...mainArea.querySelectorAll('.kv'),
        ...mainArea.querySelectorAll('.gs'),
      ];

      // De-duplicate and filter: no .a3s inside, and not already clicked
      const fresh = [];
      const seen = new Set();
      for (const el of candidates) {
        if (seen.has(el) || clickedSet.has(el)) continue;
        seen.add(el);
        if (!el.querySelector('.a3s')) {
          fresh.push(el);
        }
      }

      if (fresh.length === 0) {
        console.debug(`[Gmail Copilot] No new collapsed messages to click. Done.`);
        break;
      }

      console.debug(`[Gmail Copilot] Iteration ${iteration}: ${fresh.length} collapsed candidate(s)`);

      // Click each fresh candidate once
      for (const element of fresh) {
        clickedSet.add(element);

        // Re-check — might have expanded as a side-effect of clicking a sibling
        if (element.querySelector('.a3s')) continue;

        const target =
          element.querySelector('.kv') ||
          element.querySelector('.hX') ||
          element;

        if (target && target.offsetHeight > 0) {
          target.click();
          // One short pause per click so Gmail can react
          await new Promise(r => setTimeout(r, 120));
        }
      }

      // Give Gmail time to render the expanded bodies
      await new Promise(r => setTimeout(r, 350));

      const currentBodyCount = document.querySelectorAll('.a3s').length;
      if (currentBodyCount > previousBodyCount) {
        console.debug(`[Gmail Copilot] Expanded ${previousBodyCount} → ${currentBodyCount} messages`);
        previousBodyCount = currentBodyCount;
        stableRounds = 0;
      } else {
        stableRounds++;
        if (stableRounds >= 2) {
          console.debug(`[Gmail Copilot] Message count stable at ${currentBodyCount}, stopping.`);
          break;
        }
      }
    }

    console.debug(`[Gmail Copilot] Expansion done. ${document.querySelectorAll('.a3s').length} messages available.`);
  } catch (error) {
    console.error("[Gmail Copilot] Error expanding messages:", error);
  }
}

/**
 * Extract full email thread text from Gmail DOM
 * Gmail message bodies are in divs with class .a3s
 * Expands all collapsed messages first to ensure complete thread content
 * @returns {Promise<string>} Full thread text
 */
async function getEmailThread() {
  try {
    const initialCount = document.querySelectorAll(".a3s").length;
    console.debug(`[Gmail Copilot] Initial state: ${initialCount} message(s) expanded`);
    
    await expandAllMessages();
    
    // Get all message bodies
    const messageBodies = document.querySelectorAll(".a3s");
    const finalCount = messageBodies.length;
    console.debug(`[Gmail Copilot] After expansion: ${finalCount} messages`);
    
    if (messageBodies.length === 0) {
      console.warn(`[Gmail Copilot] WARNING: No message bodies found after expansion!`);
      console.warn(`[Gmail Copilot] Available .a3s elements: ${document.querySelectorAll('.a3s').length}`);
      return "No email thread found";
    }

    const threadText = Array.from(messageBodies)
      .map((body, index) => {
        const text = body.innerText || "";
        return text.trim();
      })
      .filter(text => text.length > 0)
      .join("\n\n---\n\n");

    console.debug(`[Gmail Copilot] Extracted ${finalCount} messages, total length: ${threadText.length} characters`);
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
