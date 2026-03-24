/**
 * Service Worker (Background Script) for Chrome Extension
 * Handles message routing and Ollama API calls
 */

importScripts(
  "utils/ollamaClient.js",
  "utils/promptBuilder.js",
  "utils/storage.js"
);

// Model configuration
const MODELS = {
  SUMMARY: "mistral",
  REPLY: "llama3",
  CATEGORY: "mistral",
  ACTIONS: "mistral",
  YOUR_BRAIN: "llama3"
};

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request, sender, sendResponse);
  return true; // Keep channel open for async response
});

/**
 * Route incoming messages to appropriate handler
 */
async function handleMessage(request, sender, sendResponse) {
  try {
    switch (request.action) {
      case "SUMMARISE":
        await handleSummarize(request, sendResponse);
        break;

      case "REPLY":
        await handleReply(request, sendResponse);
        break;

      case "CATEGORISE":
        await handleCategorize(request, sendResponse);
        break;

      case "ACTION_ITEMS":
        await handleActionItems(request, sendResponse);
        break;

      case "YOUR_BRAIN_REPLY":
        await handleYourBrainReply(request, sendResponse);
        break;

      case "REFINE_REPLY":
        await handleRefineReply(request, sendResponse);
        break;

      case "TRAIN_BRAIN":
        await handleTrainBrain(request, sendResponse);
        break;

      case "CHECK_OLLAMA":
        await handleCheckOllama(sendResponse);
        break;

      case "GET_MEMORY_STATS":
        await handleGetMemoryStats(sendResponse);
        break;

      default:
        sendResponse({ error: `Unknown action: ${request.action}` });
    }
  } catch (error) {
    console.error("Error handling message:", error);
    sendResponse({ error: error.message });
  }
}

/**
 * Handle thread summarization
 */
async function handleSummarize(request, sendResponse) {
  try {
    const prompt = buildSummaryPrompt(request.thread, request.currentUser);
    const response = await callOllama(prompt, MODELS.SUMMARY);

    const parsed = parseJsonResponse(response);
    if (!parsed) {
      sendResponse({
        success: false,
        error: "Failed to parse summary response"
      });
      return;
    }

    sendResponse({
      success: true,
      summary: parsed
    });
  } catch (error) {
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * Handle reply generation.
 * Automatically uses Your Brain style if enabled and has training data.
 */
async function handleReply(request, sendResponse) {
  try {
    const brainEnabled = await isYourBrainEnabled();
    const examples = brainEnabled ? await getYourBrainExamples() : "";
    const hasExamples = examples && examples !== "No past emails found.";

    let response;
    if (hasExamples) {
      const prompt = buildYourBrainPrompt(examples, request.summary);
      response = await callOllama(prompt, MODELS.YOUR_BRAIN);
    } else {
      const prompt = buildReplyPrompt(request.summary, request.tone || "professional", request.currentUser);
      response = await callOllama(prompt, MODELS.REPLY);
    }

    const parsed = parseJsonResponse(response);
    const reply = parsed?.reply || response.trim();

    sendResponse({
      success: true,
      reply
    });
  } catch (error) {
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * Handle email categorization
 */
async function handleCategorize(request, sendResponse) {
  try {
    const prompt = buildCategoryPrompt(request.email);
    const response = await callOllama(prompt, MODELS.CATEGORY);

    const parsed = parseJsonResponse(response);
    if (!parsed) {
      sendResponse({
        success: false,
        error: "Failed to parse category response"
      });
      return;
    }

    sendResponse({
      success: true,
      category: parsed
    });
  } catch (error) {
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * Handle action item extraction
 */
async function handleActionItems(request, sendResponse) {
  try {
    const prompt = buildActionPrompt(request.thread, request.currentUser);
    const response = await callOllama(prompt, MODELS.ACTIONS);

    const parsed = parseJsonResponse(response);
    if (!parsed || !parsed.actionItems) {
      sendResponse({
        success: false,
        error: "Failed to parse action items"
      });
      return;
    }

    sendResponse({
      success: true,
      actionItems: parsed.actionItems
    });
  } catch (error) {
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * Handle explicit YOUR_BRAIN_REPLY — delegates to handleReply which
 * automatically uses Your Brain when enabled.
 */
async function handleYourBrainReply(request, sendResponse) {
  return handleReply(request, sendResponse);
}

/**
 * Handle reply refinement based on user feedback
 */
async function handleRefineReply(request, sendResponse) {
  try {
    const prompt = buildRefineReplyPrompt(
      request.originalReply,
      request.feedback,
      request.threadContext || ""
    );
    const response = await callOllama(prompt, MODELS.REPLY);
    const parsed = parseJsonResponse(response);
    const refined = parsed?.reply || response.trim();

    // Save the edit to Your Brain so it learns from corrections
    try {
      await saveEditedResponse(request.originalReply, refined);
    } catch (_) {
      // Non-critical — don't fail the refinement if storage fails
    }

    sendResponse({
      success: true,
      reply: refined
    });
  } catch (error) {
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * Save messages from the current thread to Your Brain memory
 */
async function handleTrainBrain(request, sendResponse) {
  try {
    const messages = request.messages || [];
    const subject = request.subject || "Unknown thread";
    let saved = 0;

    for (const msg of messages) {
      await savePastEmail({
        from: msg.sender || "me",
        to: "",
        subject,
        body: msg.body,
        date: new Date().toISOString()
      });
      saved++;
    }

    const stats = await getMemoryStats();

    sendResponse({
      success: true,
      savedCount: saved,
      totalEmails: stats.emailsStored
    });
  } catch (error) {
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * Check Ollama connection status
 */
async function handleCheckOllama(sendResponse) {
  try {
    const result = await checkOllamaStatus();
    sendResponse({
      success: true,
      connected: result.ok,
      error: result.error
    });
  } catch (error) {
    sendResponse({
      success: false,
      connected: false,
      error: error.message
    });
  }
}

/**
 * Get Your Brain memory statistics
 */
async function handleGetMemoryStats(sendResponse) {
  try {
    const stats = await getMemoryStats();
    sendResponse({
      success: true,
      stats
    });
  } catch (error) {
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * Send a message from background to content script
 */
function notifyContentScript(message, tabId = null) {
  if (tabId) {
    chrome.tabs.sendMessage(tabId, message);
  } else {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        try {
          chrome.tabs.sendMessage(tab.id, message);
        } catch (error) {
          // Ignore tabs that don't have content script
        }
      });
    });
  }
}
