/**
 * Content Script - Runs in Gmail context
 * Injects UI buttons and handles user interactions
 */

let panelVisible = false;
let currentAnalysis = null;

// Initialize when page loads
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}

function initialize() {
  console.log("AI Email Copilot content script initialized");

  // Inject the UI panel
  injectPanel();

  // Watch for navigation changes (Gmail SPA)
  observeThreadChanges();

  // Inject toolbar buttons
  injectToolbarButtons();
}

/**
 * Observe Gmail thread changes using MutationObserver
 */
function observeThreadChanges() {
  const observer = new MutationObserver(() => {
    if (isInThreadView() && !document.getElementById("ai-copilot-buttons")) {
      injectToolbarButtons();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

/**
 * Inject AI Copilot buttons into Gmail toolbar
 */
function injectToolbarButtons() {
  if (document.getElementById("ai-copilot-buttons")) {
    return; // Already injected
  }

  const toolbar = getGmailToolbar();
  if (!toolbar) {
    return; // Toolbar not found yet
  }

  const buttonGroup = document.createElement("div");
  buttonGroup.id = "ai-copilot-buttons";
  buttonGroup.style.cssText = `
    display: flex;
    gap: 8px;
    margin-left: 12px;
    align-items: center;
  `;

  const buttons = [
    { text: "📋 Summarise", action: "SUMMARISE" },
    { text: "✏️ Reply", action: "REPLY" },
    { text: "🏷️ Categorise", action: "CATEGORISE" },
    { text: "✓ Actions", action: "ACTION_ITEMS" }
  ];

  buttons.forEach(btn => {
    const button = document.createElement("button");
    button.textContent = btn.text;
    button.style.cssText = `
      padding: 8px 12px;
      background: #1f2937;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      transition: background 0.2s;
    `;

    button.onmouseover = () => {
      button.style.background = "#374151";
    };

    button.onmouseout = () => {
      button.style.background = "#1f2937";
    };

    button.onclick = () => handleButtonClick(btn.action);

    buttonGroup.appendChild(button);
  });

  toolbar.appendChild(buttonGroup);
}

/**
 * Handle button clicks
 */
function handleButtonClick(action) {
  const thread = getEmailThread();
  const metadata = getEmailMetadata();

  if (!thread || thread.length < 10) {
    showNotification("No email thread found", "error");
    return;
  }

  showPanel(true);
  showPanelLoading(`${action.replace(/_/g, " ")}...`);

  chrome.runtime.sendMessage(
    {
      action,
      thread,
      summary: `${metadata.subject}\n\n${thread}`,
      email: thread,
      tone: "professional"
    },
    (response) => {
      if (chrome.runtime.lastError) {
        showPanelError("Failed to connect to background script");
        return;
      }

      if (!response || response.error) {
        showPanelError(response?.error || "Unknown error");
        return;
      }

      if (response.success) {
        currentAnalysis = response;
        renderPanelContent(action, response);
      }
    }
  );
}

/**
 * Render panel content based on action type
 */
function renderPanelContent(action, response) {
  const panel = document.getElementById("ai-copilot-panel");
  if (!panel) return;

  const content = panel.querySelector("#ai-copilot-content");
  if (!content) return;

  content.innerHTML = "";

  switch (action) {
    case "SUMMARISE":
      renderSummary(content, response.summary);
      break;

    case "REPLY":
      renderReply(content, response.reply);
      break;

    case "CATEGORISE":
      renderCategory(content, response.category);
      break;

    case "ACTION_ITEMS":
      renderActionItems(content, response.actionItems);
      break;
  }
}

/**
 * Render summary section
 */
function renderSummary(container, summary) {
  const html = `
    <div class="ai-section">
      <h3>📋 Summary</h3>
      <div class="summary-item">
        <strong>TL;DR:</strong>
        <p>${escapeHtml(summary.tldr)}</p>
      </div>
      ${
        summary.keyDecisions && summary.keyDecisions.length > 0
          ? `
        <div class="summary-item">
          <strong>Key Decisions:</strong>
          <ul>
            ${summary.keyDecisions.map(d => `<li>${escapeHtml(d)}</li>`).join("")}
          </ul>
        </div>
      `
          : ""
      }
      ${
        summary.openQuestions && summary.openQuestions.length > 0
          ? `
        <div class="summary-item">
          <strong>Open Questions:</strong>
          <ul>
            ${summary.openQuestions.map(q => `<li>${escapeHtml(q)}</li>`).join("")}
          </ul>
        </div>
      `
          : ""
      }
      ${
        summary.actionItems && summary.actionItems.length > 0
          ? `
        <div class="summary-item">
          <strong>Action Items:</strong>
          <ul>
            ${summary.actionItems.map(a => `<li>${escapeHtml(a)}</li>`).join("")}
          </ul>
        </div>
      `
          : ""
      }
    </div>
  `;

  container.insertAdjacentHTML("beforeend", html);
  addCopyButton(container, `TL;DR: ${summary.tldr}`);
}

/**
 * Render reply section
 */
function renderReply(container, reply) {
  const html = `
    <div class="ai-section">
      <h3>✏️ Suggested Reply</h3>
      <div class="reply-box">
        <p>${escapeHtml(reply).replace(/\n/g, "<br>")}</p>
      </div>
    </div>
  `;

  container.insertAdjacentHTML("beforeend", html);
  addCopyButton(container, reply);
  addInsertButton(container, reply);
}

/**
 * Render category section
 */
function renderCategory(container, category) {
  const html = `
    <div class="ai-section">
      <h3>🏷️ Category</h3>
      <div class="category-box">
        <p><strong>${escapeHtml(category.category)}</strong></p>
        <p class="confidence">Confidence: ${category.confidence}%</p>
      </div>
    </div>
  `;

  container.insertAdjacentHTML("beforeend", html);
}

/**
 * Render action items section
 */
function renderActionItems(container, items) {
  const html = `
    <div class="ai-section">
      <h3>✓ Action Items</h3>
      <div class="actions-list">
        ${items
          .map(
            item => `
          <div class="action-item">
            <input type="checkbox" />
            <div>
              <p>${escapeHtml(item.task)}</p>
              ${item.owner ? `<small>Owner: ${escapeHtml(item.owner)}</small>` : ""}
              <small class="priority priority-${item.priority.toLowerCase()}">
                Priority: ${item.priority}
              </small>
            </div>
          </div>
        `
          )
          .join("")}
      </div>
    </div>
  `;

  container.insertAdjacentHTML("beforeend", html);
  addCopyButton(container, items.map(a => `- ${a.task}`).join("\n"));
}

/**
 * Add copy button to panel
 */
function addCopyButton(container, text) {
  const button = document.createElement("button");
  button.textContent = "📋 Copy";
  button.className = "ai-button";
  button.onclick = () => {
    navigator.clipboard.writeText(text);
    button.textContent = "✓ Copied!";
    setTimeout(() => {
      button.textContent = "📋 Copy";
    }, 2000);
  };
  container.appendChild(button);
}

/**
 * Add insert button to compose
 */
function addInsertButton(container, text) {
  const button = document.createElement("button");
  button.textContent = "📤 Insert into Reply";
  button.className = "ai-button";
  button.onclick = () => {
    const success = insertIntoReply(text);
    if (success) {
      showNotification("Inserted into reply", "success");
    } else {
      showNotification("Could not find compose box", "error");
    }
  };
  container.appendChild(button);
}

/**
 * Inject the side panel into Gmail
 */
function injectPanel() {
  if (document.getElementById("ai-copilot-panel")) {
    return; // Already injected
  }

  const panel = document.createElement("div");
  panel.id = "ai-copilot-panel";
  panel.innerHTML = `
    <div class="ai-panel-header">
      <h2>AI Copilot</h2>
      <button id="ai-close-panel">✕</button>
    </div>
    <div id="ai-copilot-content" class="ai-panel-content"></div>
  `;

  // Inject styles
  const style = document.createElement("style");
  style.textContent = `
    #ai-copilot-panel {
      position: fixed;
      right: 20px;
      bottom: 100px;
      width: 400px;
      max-height: 600px;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
      display: none;
      flex-direction: column;
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    #ai-copilot-panel.visible {
      display: flex;
    }

    .ai-panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
      border-bottom: 1px solid #e5e7eb;
      background: #f9fafb;
    }

    .ai-panel-header h2 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }

    .ai-panel-header button {
      background: none;
      border: none;
      font-size: 18px;
      cursor: pointer;
      color: #6b7280;
    }

    .ai-panel-content {
      overflow-y: auto;
      padding: 16px;
      flex: 1;
    }

    .ai-section {
      margin-bottom: 16px;
    }

    .ai-section h3 {
      margin: 0 0 12px 0;
      font-size: 14px;
      font-weight: 600;
      color: #1f2937;
    }

    .summary-item {
      margin-bottom: 12px;
      padding: 12px;
      background: #f3f4f6;
      border-radius: 4px;
    }

    .summary-item strong {
      display: block;
      margin-bottom: 8px;
      font-weight: 600;
    }

    .summary-item ul {
      margin: 0;
      padding-left: 20px;
    }

    .summary-item li {
      margin-bottom: 4px;
      font-size: 13px;
    }

    .reply-box {
      padding: 12px;
      background: #f0f9ff;
      border-left: 3px solid #3b82f6;
      border-radius: 4px;
      margin-bottom: 12px;
    }

    .reply-box p {
      margin: 0;
      font-size: 13px;
      line-height: 1.5;
    }

    .category-box {
      padding: 12px;
      background: #fef3c7;
      border-radius: 4px;
      margin-bottom: 12px;
    }

    .category-box p {
      margin: 0 0 4px 0;
      font-size: 13px;
    }

    .confidence {
      color: #92400e;
      font-size: 12px;
    }

    .actions-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .action-item {
      display: flex;
      gap: 8px;
      padding: 8px;
      background: #f9fafb;
      border-radius: 4px;
    }

    .action-item input[type="checkbox"] {
      margin-top: 2px;
    }

    .action-item p {
      margin: 0;
      font-size: 13px;
    }

    .action-item small {
      display: block;
      color: #6b7280;
      font-size: 11px;
    }

    .priority {
      font-weight: 600;
    }

    .priority-high {
      color: #dc2626;
    }

    .priority-medium {
      color: #ea580c;
    }

    .priority-low {
      color: #16a34a;
    }

    .ai-button {
      padding: 8px 12px;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      margin-right: 8px;
      margin-top: 12px;
      transition: background 0.2s;
    }

    .ai-button:hover {
      background: #2563eb;
    }

    .loading {
      text-align: center;
      padding: 20px;
    }

    .loading-spinner {
      display: inline-block;
      width: 20px;
      height: 20px;
      border: 3px solid #e5e7eb;
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .error {
      padding: 12px;
      background: #fee2e2;
      color: #dc2626;
      border-radius: 4px;
      font-size: 13px;
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(panel);

  // Close button handler
  document.getElementById("ai-close-panel").onclick = () => {
    panel.classList.remove("visible");
    panelVisible = false;
  };
}

/**
 * Show/hide panel
 */
function showPanel(visible) {
  const panel = document.getElementById("ai-copilot-panel");
  if (panel) {
    panelVisible = visible;
    if (visible) {
      panel.classList.add("visible");
    } else {
      panel.classList.remove("visible");
    }
  }
}

/**
 * Show loading state in panel
 */
function showPanelLoading(message) {
  const content = document.getElementById("ai-copilot-content");
  if (content) {
    content.innerHTML = `
      <div class="loading">
        <div class="loading-spinner"></div>
        <p style="margin-top: 12px; color: #6b7280; font-size: 13px;">${message}</p>
      </div>
    `;
  }
}

/**
 * Show error in panel
 */
function showPanelError(message) {
  const content = document.getElementById("ai-copilot-content");
  if (content) {
    content.innerHTML = `
      <div class="error">
        ⚠️ ${escapeHtml(message)}
        <p style="margin-top: 8px; font-size: 12px;">Make sure Ollama is running on localhost:11434</p>
      </div>
    `;
  }
}

/**
 * Show notification toast
 */
function showNotification(message, type = "info") {
  const toast = document.createElement("div");
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 16px;
    background: ${type === "error" ? "#dc2626" : "#16a34a"};
    color: white;
    border-radius: 4px;
    font-size: 13px;
    z-index: 10001;
    animation: slideIn 0.3s ease-out;
  `;

  const style = document.createElement("style");
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(400px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `;

  toast.textContent = message;
  document.head.appendChild(style);
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = "slideOut 0.3s ease-out";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
