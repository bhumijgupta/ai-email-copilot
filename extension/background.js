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
  SUMMARY: "gemma3:4b",
  REPLY: "llama3.1:8b",
  CATEGORY: "gemma3:4b",
  ACTIONS: "gemma3:4b",
  YOUR_BRAIN: "llama3.1:8b"
};

// JSON schemas for structured output (passed to Ollama's format parameter)
const SCHEMAS = {
  SUMMARY: {
    type: "object",
    properties: {
      summary:       { type: "array", items: { type: "string" } },
      keyDecisions:  { type: "array", items: { type: "string" } },
      openQuestions:  { type: "array", items: { type: "string" } },
      actionItems:   { type: "array", items: { type: "string" } }
    },
    required: ["summary", "keyDecisions", "openQuestions", "actionItems"]
  },
  REPLY: {
    type: "object",
    properties: {
      reply: { type: "string" }
    },
    required: ["reply"]
  },
  CATEGORY: {
    type: "object",
    properties: {
      category:   { type: "string" },
      confidence: { type: "number" }
    },
    required: ["category", "confidence"]
  },
  ACTIONS: {
    type: "object",
    properties: {
      actionItems: {
        type: "array",
        items: {
          type: "object",
          properties: {
            task:     { type: "string" },
            owner:    { type: "string" },
            priority: { type: "string" }
          },
          required: ["task", "priority"]
        }
      }
    },
    required: ["actionItems"]
  }
};

/**
 * Debug-aware wrapper around callOllama.
 * When debug mode is active, logs the full prompt, model, and response
 * to the service worker console with copy-pasteable formatting.
 */
async function callOllamaDebug(prompt, model, format, operation) {
  const debug = await isDebugMode();

  if (debug) {
    console.group(`%c[DEBUG] ${operation}`, "color:#1a73e8;font-weight:bold");
    console.log("%cModel:", "font-weight:bold", model);
    console.log("%cFormat schema:", "font-weight:bold", format || "(none)");
    console.log("%cPrompt:\n", "font-weight:bold", prompt);
    console.time(`${operation} duration`);
  }

  const response = await callOllama(prompt, model, format);

  if (debug) {
    console.timeEnd(`${operation} duration`);
    console.log("%cRaw response:\n", "font-weight:bold;color:#188038", response);
    const parsed = parseJsonResponse(response);
    console.log("%cParsed JSON:", "font-weight:bold;color:#e37400", parsed);
    console.groupEnd();
  }

  return response;
}

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

      case "SET_DEBUG_MODE":
        await setDebugMode(request.enabled);
        sendResponse({ success: true, debug: request.enabled });
        break;

      case "GET_DEBUG_MODE":
        sendResponse({ success: true, debug: await isDebugMode() });
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
    const metadata = request.metadata || { currentUser: request.currentUser };
    const prompt = buildSummaryPrompt(request.thread, metadata);
    const response = await callOllamaDebug(prompt, MODELS.SUMMARY, SCHEMAS.SUMMARY, "SUMMARISE");

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

    // Use structuredThread if available (has sender headers), fallback to summary
    const threadContent = request.structuredThread || request.summary || "";
    const metadata = request.metadata || { currentUser: request.currentUser };

    let response;
    if (hasExamples) {
      const prompt = buildYourBrainPrompt(examples, threadContent, metadata);
      response = await callOllamaDebug(prompt, MODELS.YOUR_BRAIN, SCHEMAS.REPLY, "REPLY (Your Brain)");
    } else {
      const prompt = buildReplyPrompt(threadContent, request.tone || "professional", metadata);
      response = await callOllamaDebug(prompt, MODELS.REPLY, SCHEMAS.REPLY, "REPLY");
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
    const metadata = request.metadata || {};
    const prompt = buildCategoryPrompt(request.email, metadata);
    const response = await callOllamaDebug(prompt, MODELS.CATEGORY, SCHEMAS.CATEGORY, "CATEGORISE");

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
    const metadata = request.metadata || { currentUser: request.currentUser };
    const prompt = buildActionPrompt(request.thread, metadata);
    const response = await callOllamaDebug(prompt, MODELS.ACTIONS, SCHEMAS.ACTIONS, "ACTION_ITEMS");

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
    const response = await callOllamaDebug(prompt, MODELS.REPLY, SCHEMAS.REPLY, "REFINE_REPLY");
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
