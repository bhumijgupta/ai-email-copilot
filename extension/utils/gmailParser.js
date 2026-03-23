/**
 * Gmail DOM parsing utilities
 */

/**
 * Extract full email thread text from Gmail DOM
 * Gmail message bodies are in divs with class .a3s
 * @returns {string} Full thread text
 */
function getEmailThread() {
  try {
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
 * Extract email metadata (subject, sender, recipients)
 * @returns {object} Email metadata
 */
function getEmailMetadata() {
  try {
    // Gmail subject is typically in h2 with data-subject-threading attribute
    const subjectElement = document.querySelector('h2[data-subject-threading]');
    const subject = subjectElement ? subjectElement.innerText : "No subject";

    // Sender info is in the email header
    const senderElements = document.querySelectorAll('[email]');
    const senders = Array.from(senderElements)
      .map(el => el.getAttribute("email"))
      .filter(Boolean);

    const from = senders[0] || "Unknown sender";
    const to = senders.slice(1) || [];

    return {
      subject,
      from,
      to,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("Error extracting email metadata:", error);
    return {
      subject: "Unknown",
      from: "Unknown",
      to: [],
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
