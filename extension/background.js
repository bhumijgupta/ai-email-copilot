/**
 * Service Worker (Background Script) for Chrome Extension
 * Handles message routing and Ollama API calls
 */

// Model configuration
const MODELS = {
  SUMMARY: "mistral",
  REPLY: "llama3",
  CATEGORY: "mistral",
  ACTIONS: "mistral",
  PM_BRAIN: "mixtral"
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

      case "PM_BRAIN_REPLY":
        await handlePMBrainReply(request, sendResponse);
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
    const prompt = buildSummaryPrompt(request.thread);
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
 * Handle reply generation
 */
async function handleReply(request, sendResponse) {
  try {
    const prompt = buildReplyPrompt(request.summary, request.tone || "professional");
    const response = await callOllama(prompt, MODELS.REPLY);

    sendResponse({
      success: true,
      reply: response.trim()
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
    const prompt = buildActionPrompt(request.thread);
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
 * Handle PM Brain reply generation
 */
async function handlePMBrainReply(request, sendResponse) {
  try {
    const pmBrainEnabled = await isPMBrainEnabled();
    if (!pmBrainEnabled) {
      // Fallback to regular reply
      const prompt = buildReplyPrompt(request.summary, request.tone || "professional");
      const response = await callOllama(prompt, MODELS.REPLY);
      sendResponse({
        success: true,
        reply: response.trim()
      });
      return;
    }

    const examples = await getPMBrainExamples();
    const prompt = buildPMBrainPrompt(examples, request.summary);
    const response = await callOllama(prompt, MODELS.PM_BRAIN);

    sendResponse({
      success: true,
      reply: response.trim()
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
    const status = await checkOllamaStatus();
    sendResponse({
      success: true,
      connected: status
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
 * Get PM Brain memory statistics
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
