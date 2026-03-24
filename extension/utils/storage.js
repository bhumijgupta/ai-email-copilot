/**
 * Chrome storage wrapper for Your Brain (user's writing style memory)
 */

const STORAGE_KEYS = {
  PAST_EMAILS: "your_brain_past_emails",
  EDITED_RESPONSES: "your_brain_edited_responses",
  MEMORY_ENABLED: "your_brain_enabled"
};

/**
 * Save a past sent email to storage
 * @param {object} email - Email object { from, to, subject, body, date }
 * @returns {Promise<void>}
 */
async function savePastEmail(email) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([STORAGE_KEYS.PAST_EMAILS], (result) => {
      const emails = result[STORAGE_KEYS.PAST_EMAILS] || [];

      // Keep only last 50 emails to avoid storage limits
      emails.unshift({
        ...email,
        savedAt: new Date().toISOString()
      });

      if (emails.length > 50) {
        emails.pop();
      }

      chrome.storage.local.set(
        { [STORAGE_KEYS.PAST_EMAILS]: emails },
        () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        }
      );
    });
  });
}

/**
 * Save user's edit to an AI response (to learn from corrections)
 * @param {string} original - Original AI response
 * @param {string} edited - User's edited version
 * @returns {Promise<void>}
 */
async function saveEditedResponse(original, edited) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([STORAGE_KEYS.EDITED_RESPONSES], (result) => {
      const responses = result[STORAGE_KEYS.EDITED_RESPONSES] || [];

      responses.unshift({
        original,
        edited,
        savedAt: new Date().toISOString()
      });

      // Keep only last 30 edited responses
      if (responses.length > 30) {
        responses.pop();
      }

      chrome.storage.local.set(
        { [STORAGE_KEYS.EDITED_RESPONSES]: responses },
        () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        }
      );
    });
  });
}

/**
 * Get similar past emails based on keywords
 * Simple v1: keyword matching
 * @param {string} context - Email context or keywords
 * @returns {Promise<array>} Array of similar past emails
 */
async function getSimilarEmails(context) {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEYS.PAST_EMAILS], (result) => {
      const pastEmails = result[STORAGE_KEYS.PAST_EMAILS] || [];

      // Simple keyword extraction from context
      const keywords = context
        .toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 3);

      // Score emails by keyword matches
      const scored = pastEmails
        .map(email => {
          const emailText = `${email.subject} ${email.body}`.toLowerCase();
          const matches = keywords.filter(kw => emailText.includes(kw)).length;
          return { email, score: matches };
        })
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(item => item.email);

      resolve(scored);
    });
  });
}

/**
 * Get Your Brain memory statistics
 * @returns {Promise<object>} Stats about stored memory
 */
async function getMemoryStats() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      [STORAGE_KEYS.PAST_EMAILS, STORAGE_KEYS.EDITED_RESPONSES, STORAGE_KEYS.MEMORY_ENABLED],
      (result) => {
        resolve({
          emailsStored: (result[STORAGE_KEYS.PAST_EMAILS] || []).length,
          editsStored: (result[STORAGE_KEYS.EDITED_RESPONSES] || []).length,
          enabled: result[STORAGE_KEYS.MEMORY_ENABLED] !== false
        });
      }
    );
  });
}

/**
 * Get examples for Your Brain prompt.
 * Combines past emails (writing samples) with edited responses
 * (style corrections the user made to AI drafts).
 * @returns {Promise<string>} Formatted examples of user's writing
 */
async function getYourBrainExamples() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      [STORAGE_KEYS.PAST_EMAILS, STORAGE_KEYS.EDITED_RESPONSES],
      (result) => {
        const emails = result[STORAGE_KEYS.PAST_EMAILS] || [];
        const edits = result[STORAGE_KEYS.EDITED_RESPONSES] || [];

        const parts = [];

        const emailExamples = emails.slice(0, 8);
        if (emailExamples.length > 0) {
          parts.push("=== Writing samples ===");
          emailExamples.forEach(email => {
            parts.push(`Subject: ${email.subject}\n${email.body}`);
          });
        }

        const editExamples = edits.slice(0, 5);
        if (editExamples.length > 0) {
          parts.push("=== Style corrections (user preferred the revised version) ===");
          editExamples.forEach(edit => {
            parts.push(`Draft: ${edit.original}\nPreferred: ${edit.edited}`);
          });
        }

        resolve(parts.length > 0 ? parts.join("\n\n---\n\n") : "No past emails found.");
      }
    );
  });
}

/**
 * Toggle Your Brain on/off
 * @param {boolean} enabled - Whether to enable Your Brain
 * @returns {Promise<void>}
 */
async function setYourBrainEnabled(enabled) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEYS.MEMORY_ENABLED]: enabled }, resolve);
  });
}

/**
 * Check if Your Brain is enabled
 * @returns {Promise<boolean>} True if enabled
 */
async function isYourBrainEnabled() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEYS.MEMORY_ENABLED], (result) => {
      resolve(result[STORAGE_KEYS.MEMORY_ENABLED] !== false);
    });
  });
}

/**
 * Clear all Your Brain memory
 * @returns {Promise<void>}
 */
async function clearMemory() {
  return new Promise((resolve) => {
    chrome.storage.local.remove(
      [STORAGE_KEYS.PAST_EMAILS, STORAGE_KEYS.EDITED_RESPONSES],
      resolve
    );
  });
}
