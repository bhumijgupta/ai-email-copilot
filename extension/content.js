/**
 * Content Script - Runs in Gmail context
 * Uses a floating action bar (not injected into Gmail's toolbar)
 * so it works reliably across Gmail layout changes.
 */

let panelVisible = false;
let currentAnalysis = null;
let actionBarVisible = false;
let lastUrl = "";
let lastReply = "";
let lastThreadContext = "";

// Initialize when page loads
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}

function initialize() {
  console.debug("[AI Copilot] Content script loaded on", window.location.href);

  injectStyles();
  injectPanel();
  injectActionBar();

  // Gmail is an SPA — poll for URL / DOM changes
  setInterval(checkForThreadView, 1000);

  // Also use MutationObserver as a faster secondary trigger
  const observer = new MutationObserver(() => checkForThreadView());
  observer.observe(document.body, { childList: true, subtree: true });
}

// ─── Thread Detection ─────────────────────────────────────────────

function checkForThreadView() {
  const url = window.location.href;
  const inThread = detectThreadView();

  if (inThread && !actionBarVisible) {
    showActionBar(true);
  } else if (!inThread && actionBarVisible) {
    showActionBar(false);
    showPanel(false);
  }

  lastUrl = url;
}

/**
 * Detect whether the current Gmail view is an open email thread.
 * Uses multiple heuristics since Gmail DOM changes over time.
 */
function detectThreadView() {
  // Heuristic 1: .a3s message body nodes (most reliable)
  if (document.querySelectorAll(".a3s").length > 0) return true;

  // Heuristic 2: Gmail thread wrapper with role=list inside main
  if (document.querySelector('[role="main"] [role="list"]')) {
    const bodies = document.querySelectorAll('[role="main"] [data-message-id]');
    if (bodies.length > 0) return true;
  }

  // Heuristic 3: URL contains a hash fragment typical of thread view
  // Gmail thread URLs look like: #inbox/FMfcgz...  or #sent/FMfcgz...
  if (/#[a-z]+\/[A-Za-z0-9]+/.test(window.location.hash)) {
    // If there are expanded messages visible, we're in a thread
    const expandedMsgs = document.querySelectorAll(".h7, .kv, .gs");
    if (expandedMsgs.length > 0) return true;
  }

  return false;
}

// ─── Floating Action Bar ──────────────────────────────────────────

function injectActionBar() {
  if (document.getElementById("ai-copilot-bar")) return;

  const bar = document.createElement("div");
  bar.id = "ai-copilot-bar";

  const buttons = [
    { label: "Summarise", icon: "📋", action: "SUMMARISE" },
    { label: "Reply",     icon: "✏️",  action: "REPLY" },
    { label: "Categorise",icon: "🏷️", action: "CATEGORISE" },
    { label: "Actions",   icon: "✓",  action: "ACTION_ITEMS" },
    { label: "Your Brain", icon: "🧠", action: "TRAIN_BRAIN" }
  ];

  // Logo / title
  const title = document.createElement("span");
  title.className = "aib-title";
  title.textContent = "AI Copilot";
  bar.appendChild(title);

  buttons.forEach(btn => {
    const el = document.createElement("button");
    el.className = btn.action === "TRAIN_BRAIN" ? "aib-btn aib-btn-brain" : "aib-btn";
    el.innerHTML = `${btn.icon} ${btn.label}`;
    el.addEventListener("click", () => handleButtonClick(btn.action));
    bar.appendChild(el);
  });

  document.body.appendChild(bar);
}

function showActionBar(visible) {
  actionBarVisible = visible;
  const bar = document.getElementById("ai-copilot-bar");
  if (bar) {
    bar.classList.toggle("visible", visible);
  }
}

// ─── Extension runtime check ──────────────────────────────────────

/**
 * Returns true if the extension context is still valid.
 * After an extension reload, orphaned content scripts lose chrome.runtime.
 */
function isExtensionContextValid() {
  try {
    return !!(chrome && chrome.runtime && chrome.runtime.id);
  } catch (e) {
    return false;
  }
}

// ─── Button Click Handler ─────────────────────────────────────────

async function handleButtonClick(action) {
  if (!isExtensionContextValid()) {
    showPanel(true);
    showPanelError("Extension was reloaded. Please refresh this Gmail tab (Ctrl+R / Cmd+R).");
    return;
  }

  // Train Brain has its own flow
  if (action === "TRAIN_BRAIN") {
    handleTrainBrain();
    return;
  }

  showPanel(true);
  showPanelLoading("Expanding thread...");

  try {
    const thread = await getEmailThread();
    const metadata = getEmailMetadata();

    if (!thread || thread.length < 10) {
      showNotification("Could not read the email thread. The thread appears to be empty.", "error");
      return;
    }

    lastThreadContext = thread;

    const friendlyName = {
      SUMMARISE: "Summarising thread",
      REPLY: "Generating reply",
      CATEGORISE: "Categorising email",
      ACTION_ITEMS: "Extracting action items"
    };
    showPanelLoading(friendlyName[action] || "Working...");

    chrome.runtime.sendMessage(
      {
        action,
        thread,
        summary: `${metadata.subject}\n\n${thread}`,
        email: thread,
        tone: "professional",
        currentUser: metadata.currentUser
      },
      (response) => {
        if (chrome.runtime.lastError) {
          showPanelError("Failed to connect to background script: " + chrome.runtime.lastError.message);
          return;
        }
        if (!response || response.error) {
          showPanelError(response?.error || "Unknown error occurred");
          return;
        }
        if (response.success) {
          currentAnalysis = response;
          renderPanelContent(action, response);
        }
      }
    );
  } catch (error) {
    console.error("Error in handleButtonClick:", error);
    showPanelError("Error processing thread: " + error.message);
  }
}

// ─── Panel Rendering ──────────────────────────────────────────────

function renderPanelContent(action, response) {
  const content = document.getElementById("ai-copilot-content");
  if (!content) return;
  content.innerHTML = "";

  switch (action) {
    case "SUMMARISE":   renderSummary(content, response.summary);       break;
    case "REPLY":       renderReply(content, response.reply);           break;
    case "CATEGORISE":  renderCategory(content, response.category);     break;
    case "ACTION_ITEMS":renderActionItems(content, response.actionItems);break;
  }
}

function renderSummary(container, summary) {
  const s = summary || {};
  container.innerHTML = `
    <div class="ai-section">
      <h3>📋 Summary</h3>
      <div class="ai-card">
        <strong>TL;DR</strong>
        <p>${escapeHtml(s.tldr || "No summary available")}</p>
      </div>
      ${renderList("Key Decisions", s.keyDecisions)}
      ${renderList("Open Questions", s.openQuestions)}
      ${renderList("Action Items", s.actionItems)}
    </div>`;
  addCopyButton(container, formatSummaryText(s));
}

function renderReply(container, reply) {
  lastReply = reply;

  container.innerHTML = `
    <div class="ai-section">
      <h3>✏️ Suggested Reply</h3>
      <div id="ai-reply-text" class="ai-reply">${escapeHtml(reply).replace(/\n/g, "<br>")}</div>
      <div class="ai-reply-actions" id="ai-reply-actions"></div>
      <div class="ai-refine-box">
        <label class="ai-refine-label">Refine this reply:</label>
        <div class="ai-refine-row">
          <input
            type="text"
            id="ai-feedback-input"
            class="ai-refine-input"
            placeholder='e.g. "make it shorter", "more formal", "mention deadline"'
          />
          <button id="ai-refine-btn" class="aib-btn aib-btn-primary ai-refine-btn">Refine</button>
        </div>
        <div class="ai-refine-chips" id="ai-refine-chips"></div>
      </div>
    </div>`;

  const actionsDiv = container.querySelector("#ai-reply-actions");
  addCopyButton(actionsDiv, reply);
  addInsertButton(actionsDiv, reply);

  // Quick-refine chips
  const chips = ["Shorter", "More formal", "More casual", "Add a greeting", "Be more direct"];
  const chipsContainer = container.querySelector("#ai-refine-chips");
  chips.forEach(chip => {
    const el = document.createElement("button");
    el.className = "ai-chip";
    el.textContent = chip;
    el.addEventListener("click", () => {
      container.querySelector("#ai-feedback-input").value = chip;
      submitRefinement(container);
    });
    chipsContainer.appendChild(el);
  });

  // Refine button
  container.querySelector("#ai-refine-btn").addEventListener("click", () => submitRefinement(container));

  // Enter key submits
  container.querySelector("#ai-feedback-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitRefinement(container);
  });
}

function submitRefinement(container) {
  if (!isExtensionContextValid()) {
    showPanelError("Extension was reloaded. Please refresh this Gmail tab.");
    return;
  }

  const input = container.querySelector("#ai-feedback-input");
  const feedback = input.value.trim();
  if (!feedback) {
    input.focus();
    return;
  }

  // Show loading in the reply area
  const replyEl = container.querySelector("#ai-reply-text");
  const prevHtml = replyEl.innerHTML;
  replyEl.innerHTML = `
    <div class="aip-loading" style="padding:12px">
      <div class="aip-spinner"></div>
      <p>Refining reply...</p>
    </div>`;

  // Disable input while refining
  input.disabled = true;
  container.querySelector("#ai-refine-btn").disabled = true;

  chrome.runtime.sendMessage(
    {
      action: "REFINE_REPLY",
      originalReply: lastReply,
      feedback,
      threadContext: lastThreadContext
    },
    (response) => {
      input.disabled = false;
      container.querySelector("#ai-refine-btn").disabled = false;
      input.value = "";

      if (chrome.runtime.lastError || !response || !response.success) {
        replyEl.innerHTML = prevHtml;
        showNotification(response?.error || "Refinement failed", "error");
        return;
      }

      lastReply = response.reply;
      replyEl.innerHTML = escapeHtml(response.reply).replace(/\n/g, "<br>");

      // Update copy/insert buttons to use new reply
      const actionsDiv = container.querySelector("#ai-reply-actions");
      actionsDiv.innerHTML = "";
      addCopyButton(actionsDiv, response.reply);
      addInsertButton(actionsDiv, response.reply);

      showNotification("Reply refined", "success");
    }
  );
}

function renderCategory(container, category) {
  const c = category || {};
  container.innerHTML = `
    <div class="ai-section">
      <h3>🏷️ Category</h3>
      <div class="ai-card">
        <span class="ai-category-badge">${escapeHtml(c.category || "Unknown")}</span>
        <p class="ai-confidence">Confidence: ${c.confidence || 0}%</p>
      </div>
    </div>`;
}

function renderActionItems(container, items) {
  const list = Array.isArray(items) ? items : [];
  container.innerHTML = `
    <div class="ai-section">
      <h3>✓ Action Items</h3>
      ${list.length === 0 ? '<p class="ai-muted">No action items found.</p>' : ""}
      <div class="ai-actions-list">
        ${list.map(item => `
          <label class="ai-action-row">
            <input type="checkbox" />
            <div>
              <span>${escapeHtml(item.task)}</span>
              ${item.owner ? `<small>Owner: ${escapeHtml(item.owner)}</small>` : ""}
              <small class="ai-priority ai-priority-${(item.priority || "medium").toLowerCase()}">
                ${item.priority || "Medium"}
              </small>
            </div>
          </label>`).join("")}
      </div>
    </div>`;
  if (list.length > 0) {
    addCopyButton(container, list.map(a => `- [${a.priority}] ${a.task}${a.owner ? ` (${a.owner})` : ""}`).join("\n"));
  }
}

// ─── Train Brain ──────────────────────────────────────────────────

async function handleTrainBrain() {
  showPanel(true);
  showPanelLoading("Expanding thread...");

  try {
    const messages = await getIndividualMessages();
    const metadata = getEmailMetadata();

    if (messages.length === 0) {
      showNotification("No messages found in this thread", "error");
      return;
    }

    renderTrainBrainPanel(messages, metadata);
  } catch (error) {
    console.error("Error in handleTrainBrain:", error);
    showPanelError("Error processing thread: " + error.message);
  }
}

function renderTrainBrainPanel(messages, metadata) {
  const content = document.getElementById("ai-copilot-content");
  if (!content) return;

  const myMessages = messages.filter(m => m.isMe);
  const otherMessages = messages.filter(m => !m.isMe);

  content.innerHTML = `
    <div class="ai-section">
      <h3>🧠 Train Your Brain</h3>
      <p class="ai-train-subtitle">
        Select messages from this thread to save to Your Brain memory.
        Your writing style will be learned from these examples.
      </p>
      <div class="ai-train-thread-info">
        <strong>${escapeHtml(metadata.subject)}</strong>
        <span>${messages.length} message${messages.length !== 1 ? "s" : ""} in thread</span>
      </div>

      ${myMessages.length > 0 ? `
        <div class="ai-train-group">
          <div class="ai-train-group-header">
            <label>
              <input type="checkbox" id="ai-train-select-mine" checked />
              <strong>Your messages (${myMessages.length})</strong>
            </label>
          </div>
          ${myMessages.map((msg, i) => `
            <label class="ai-train-msg ai-train-msg-mine" data-idx="mine-${i}">
              <input type="checkbox" class="ai-train-cb ai-train-cb-mine" checked />
              <div class="ai-train-msg-body">
                <span class="ai-train-sender">You</span>
                <p>${escapeHtml(msg.body.substring(0, 150))}${msg.body.length > 150 ? "..." : ""}</p>
              </div>
            </label>
          `).join("")}
        </div>
      ` : ""}

      ${otherMessages.length > 0 ? `
        <div class="ai-train-group">
          <div class="ai-train-group-header">
            <label>
              <input type="checkbox" id="ai-train-select-others" />
              <strong>Other messages (${otherMessages.length})</strong>
            </label>
            <span class="ai-train-hint">Include for context</span>
          </div>
          ${otherMessages.map((msg, i) => `
            <label class="ai-train-msg" data-idx="other-${i}">
              <input type="checkbox" class="ai-train-cb ai-train-cb-other" />
              <div class="ai-train-msg-body">
                <span class="ai-train-sender">${escapeHtml(msg.sender || msg.senderEmail || "Unknown")}</span>
                <p>${escapeHtml(msg.body.substring(0, 150))}${msg.body.length > 150 ? "..." : ""}</p>
              </div>
            </label>
          `).join("")}
        </div>
      ` : ""}

      ${myMessages.length === 0 ? `
        <div class="ai-train-empty">
          <p>Could not auto-detect your messages in this thread.</p>
          <p class="ai-muted">Select messages manually from below to save them.</p>
          <div class="ai-train-group">
            ${messages.map((msg, i) => `
              <label class="ai-train-msg" data-idx="all-${i}">
                <input type="checkbox" class="ai-train-cb ai-train-cb-all" />
                <div class="ai-train-msg-body">
                  <span class="ai-train-sender">${escapeHtml(msg.sender || "Message " + (i + 1))}</span>
                  <p>${escapeHtml(msg.body.substring(0, 150))}${msg.body.length > 150 ? "..." : ""}</p>
                </div>
              </label>
            `).join("")}
          </div>
        </div>
      ` : ""}

      <button id="ai-train-save" class="aib-btn aib-btn-primary ai-train-save-btn">
        🧠 Save to Your Brain
      </button>
    </div>
  `;

  // "Select all mine" toggle
  const selectMine = content.querySelector("#ai-train-select-mine");
  if (selectMine) {
    selectMine.addEventListener("change", (e) => {
      content.querySelectorAll(".ai-train-cb-mine").forEach(cb => { cb.checked = e.target.checked; });
    });
  }

  // "Select all others" toggle
  const selectOthers = content.querySelector("#ai-train-select-others");
  if (selectOthers) {
    selectOthers.addEventListener("change", (e) => {
      content.querySelectorAll(".ai-train-cb-other").forEach(cb => { cb.checked = e.target.checked; });
    });
  }

  // Save button
  content.querySelector("#ai-train-save").addEventListener("click", () => {
    const selectedMessages = [];

    // Collect checked "mine" messages
    content.querySelectorAll(".ai-train-cb-mine:checked").forEach((cb, i) => {
      if (myMessages[i]) selectedMessages.push(myMessages[i]);
    });
    // Collect checked "other" messages
    content.querySelectorAll(".ai-train-cb-other:checked").forEach((cb, i) => {
      if (otherMessages[i]) selectedMessages.push(otherMessages[i]);
    });
    // Collect checked "all" messages (fallback when no auto-detect)
    content.querySelectorAll(".ai-train-cb-all:checked").forEach((cb, i) => {
      if (messages[i]) selectedMessages.push(messages[i]);
    });

    if (selectedMessages.length === 0) {
      showNotification("Select at least one message to save", "error");
      return;
    }

    saveSelectedToTrainBrain(selectedMessages, metadata.subject, content);
  });
}

function saveSelectedToTrainBrain(selectedMessages, subject, container) {
  const saveBtn = container.querySelector("#ai-train-save");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";

  chrome.runtime.sendMessage(
    {
      action: "TRAIN_BRAIN",
      messages: selectedMessages,
      subject
    },
    (response) => {
      if (chrome.runtime.lastError || !response || !response.success) {
        saveBtn.disabled = false;
        saveBtn.textContent = "🧠 Save to Your Brain";
        showNotification(response?.error || "Failed to save", "error");
        return;
      }

      container.querySelector(".ai-section").innerHTML = `
        <div class="ai-train-success">
          <div class="ai-train-success-icon">🧠</div>
          <h3>Brain Updated!</h3>
          <p>${response.savedCount} message${response.savedCount !== 1 ? "s" : ""} saved to Your Brain.</p>
          <p class="ai-muted">Total emails in memory: ${response.totalEmails}</p>
          <p class="ai-muted" style="margin-top:12px">
            Your Brain will use these examples to match your writing style in future replies.
          </p>
        </div>
      `;

      showNotification(`${response.savedCount} message(s) saved to Your Brain`, "success");
    }
  );
}

// ─── Helpers ──────────────────────────────────────────────────────

function renderList(title, items) {
  if (!items || items.length === 0) return "";
  return `
    <div class="ai-card">
      <strong>${escapeHtml(title)}</strong>
      <ul>${items.map(i => `<li>${escapeHtml(i)}</li>`).join("")}</ul>
    </div>`;
}

function formatSummaryText(s) {
  let text = `TL;DR: ${s.tldr || ""}\n`;
  if (s.keyDecisions?.length)  text += `\nKey Decisions:\n${s.keyDecisions.map(d => `- ${d}`).join("\n")}`;
  if (s.openQuestions?.length)  text += `\nOpen Questions:\n${s.openQuestions.map(q => `- ${q}`).join("\n")}`;
  if (s.actionItems?.length)   text += `\nAction Items:\n${s.actionItems.map(a => `- ${a}`).join("\n")}`;
  return text;
}

function addCopyButton(container, text) {
  const btn = document.createElement("button");
  btn.className = "aib-btn aib-btn-primary";
  btn.textContent = "📋 Copy";
  btn.addEventListener("click", () => {
    navigator.clipboard.writeText(text).then(() => {
      btn.textContent = "✓ Copied!";
      setTimeout(() => { btn.textContent = "📋 Copy"; }, 2000);
    });
  });
  container.appendChild(btn);
}

function addInsertButton(container, text) {
  const btn = document.createElement("button");
  btn.className = "aib-btn aib-btn-primary";
  btn.textContent = "📤 Insert into Reply";
  btn.addEventListener("click", () => {
    if (insertIntoReply(text)) {
      showNotification("Inserted into reply", "success");
    } else {
      showNotification("Open the reply box first, then click Insert", "error");
    }
  });
  container.appendChild(btn);
}

function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ─── Side Panel ───────────────────────────────────────────────────

function injectPanel() {
  if (document.getElementById("ai-copilot-panel")) return;

  const panel = document.createElement("div");
  panel.id = "ai-copilot-panel";
  panel.innerHTML = `
    <div class="aip-header">
      <span>AI Copilot</span>
      <button id="ai-close-panel">✕</button>
    </div>
    <div id="ai-copilot-content" class="aip-body"></div>`;

  document.body.appendChild(panel);

  document.getElementById("ai-close-panel").addEventListener("click", () => showPanel(false));
}

function showPanel(visible) {
  panelVisible = visible;
  const panel = document.getElementById("ai-copilot-panel");
  if (panel) panel.classList.toggle("visible", visible);
}

function showPanelLoading(message) {
  const content = document.getElementById("ai-copilot-content");
  if (!content) return;
  content.innerHTML = `
    <div class="aip-loading">
      <div class="aip-spinner"></div>
      <p>${escapeHtml(message)}...</p>
    </div>`;
}

function showPanelError(message) {
  const content = document.getElementById("ai-copilot-content");
  if (!content) return;
  content.innerHTML = `
    <div class="aip-error">
      <p>⚠️ ${escapeHtml(message)}</p>
      <small>Make sure Ollama is running on localhost:11434</small>
    </div>`;
}

// ─── Toast Notifications ──────────────────────────────────────────

function showNotification(message, type = "info") {
  const existing = document.getElementById("ai-copilot-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "ai-copilot-toast";
  toast.className = `ai-toast ai-toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("visible"));
  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ─── Styles (injected once) ───────────────────────────────────────

function injectStyles() {
  if (document.getElementById("ai-copilot-styles")) return;

  const style = document.createElement("style");
  style.id = "ai-copilot-styles";
  style.textContent = `
    /* ── Floating Action Bar ──────────────────────── */
    #ai-copilot-bar {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(80px);
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      background: #1f2937;
      border-radius: 12px;
      box-shadow: 0 8px 30px rgba(0,0,0,.25);
      z-index: 9999;
      opacity: 0;
      transition: transform .3s ease, opacity .3s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    #ai-copilot-bar.visible {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
    .aib-title {
      color: #a5b4fc;
      font-size: 12px;
      font-weight: 700;
      padding: 0 8px 0 4px;
      border-right: 1px solid #374151;
      margin-right: 4px;
      white-space: nowrap;
    }
    .aib-btn {
      padding: 7px 14px;
      background: #374151;
      color: #e5e7eb;
      border: none;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      white-space: nowrap;
      transition: background .15s;
    }
    .aib-btn:hover { background: #4b5563; color: #fff; }
    .aib-btn-brain {
      background: #4c1d95;
      color: #e0d5ff;
      border-left: 1px solid #6b7280;
      margin-left: 2px;
    }
    .aib-btn-brain:hover { background: #6d28d9; color: #fff; }

    .aib-btn-primary {
      background: #3b82f6;
      color: #fff;
      margin-top: 12px;
      margin-right: 8px;
    }
    .aib-btn-primary:hover { background: #2563eb; }

    /* ── Side Panel ───────────────────────────────── */
    #ai-copilot-panel {
      position: fixed;
      top: 64px;
      right: -440px;
      width: 420px;
      bottom: 80px;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 12px 0 0 12px;
      box-shadow: -4px 0 20px rgba(0,0,0,.08);
      display: flex;
      flex-direction: column;
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      transition: right .3s ease;
    }
    #ai-copilot-panel.visible { right: 0; }

    .aip-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 16px;
      border-bottom: 1px solid #e5e7eb;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 12px 0 0 0;
    }
    .aip-header span {
      font-size: 15px;
      font-weight: 700;
      color: #fff;
    }
    .aip-header button {
      background: rgba(255,255,255,.2);
      border: none;
      color: #fff;
      font-size: 16px;
      cursor: pointer;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background .15s;
    }
    .aip-header button:hover { background: rgba(255,255,255,.35); }

    .aip-body {
      overflow-y: auto;
      padding: 16px;
      flex: 1;
      font-size: 13px;
      line-height: 1.6;
      color: #1f2937;
    }

    /* ── Content blocks ───────────────────────────── */
    .ai-section h3 {
      margin: 0 0 12px;
      font-size: 14px;
      font-weight: 700;
    }
    .ai-card {
      background: #f3f4f6;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 10px;
    }
    .ai-card strong { display: block; margin-bottom: 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .5px; color: #6b7280; }
    .ai-card p { margin: 0; }
    .ai-card ul { margin: 4px 0 0; padding-left: 18px; }
    .ai-card li { margin-bottom: 3px; }

    .ai-reply {
      padding: 14px;
      background: #eff6ff;
      border-left: 3px solid #3b82f6;
      border-radius: 6px;
      margin-bottom: 10px;
      white-space: pre-wrap;
    }

    .ai-category-badge {
      display: inline-block;
      background: #667eea;
      color: #fff;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 600;
    }
    .ai-confidence { margin-top: 8px; color: #6b7280; font-size: 12px; }

    .ai-actions-list { display: flex; flex-direction: column; gap: 6px; }
    .ai-action-row {
      display: flex;
      gap: 8px;
      padding: 10px;
      background: #f9fafb;
      border-radius: 6px;
      cursor: pointer;
      align-items: flex-start;
    }
    .ai-action-row:hover { background: #f3f4f6; }
    .ai-action-row input[type="checkbox"] { margin-top: 3px; cursor: pointer; }
    .ai-action-row div { flex: 1; }
    .ai-action-row span { display: block; font-size: 13px; }
    .ai-action-row small { display: block; font-size: 11px; color: #6b7280; }
    .ai-priority { font-weight: 600; }
    .ai-priority-high   { color: #dc2626; }
    .ai-priority-medium { color: #ea580c; }
    .ai-priority-low    { color: #16a34a; }
    .ai-muted { color: #9ca3af; font-style: italic; }

    /* ── Loading / Error ──────────────────────────── */
    .aip-loading { text-align: center; padding: 40px 16px; }
    .aip-loading p { margin-top: 14px; color: #6b7280; }
    .aip-spinner {
      display: inline-block;
      width: 24px; height: 24px;
      border: 3px solid #e5e7eb;
      border-top-color: #667eea;
      border-radius: 50%;
      animation: aip-spin .7s linear infinite;
    }
    @keyframes aip-spin { to { transform: rotate(360deg); } }

    .aip-error {
      padding: 16px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      color: #b91c1c;
    }
    .aip-error small { display: block; margin-top: 8px; color: #dc2626; font-size: 12px; }

    /* ── Toast ─────────────────────────────────────── */
    .ai-toast {
      position: fixed;
      bottom: 90px;
      right: 24px;
      padding: 10px 18px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      z-index: 10001;
      opacity: 0;
      transform: translateY(10px);
      transition: opacity .3s, transform .3s;
    }
    .ai-toast.visible { opacity: 1; transform: translateY(0); }
    .ai-toast-success { background: #065f46; color: #fff; }
    .ai-toast-error   { background: #991b1b; color: #fff; }
    .ai-toast-info    { background: #1e40af; color: #fff; }

    /* ── Refine reply ─────────────────────────────── */
    .ai-reply-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0;
    }
    .ai-refine-box {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid #e5e7eb;
    }
    .ai-refine-label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: #374151;
      margin-bottom: 8px;
    }
    .ai-refine-row {
      display: flex;
      gap: 6px;
    }
    .ai-refine-input {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 13px;
      font-family: inherit;
      outline: none;
      transition: border-color .15s;
    }
    .ai-refine-input:focus {
      border-color: #667eea;
      box-shadow: 0 0 0 2px rgba(102,126,234,.15);
    }
    .ai-refine-input:disabled {
      background: #f3f4f6;
      color: #9ca3af;
    }
    .ai-refine-btn {
      margin: 0 !important;
      white-space: nowrap;
      padding: 8px 16px !important;
    }
    .ai-refine-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 10px;
    }
    .ai-chip {
      padding: 4px 10px;
      background: #f3f4f6;
      border: 1px solid #e5e7eb;
      border-radius: 20px;
      font-size: 11px;
      color: #374151;
      cursor: pointer;
      transition: all .15s;
      font-family: inherit;
    }
    .ai-chip:hover {
      background: #e0e7ff;
      border-color: #a5b4fc;
      color: #4338ca;
    }

    /* ── Train Brain ──────────────────────────────── */
    .ai-train-subtitle {
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 12px;
      line-height: 1.5;
    }
    .ai-train-thread-info {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 12px;
      background: #f3f4f6;
      border-radius: 8px;
      margin-bottom: 14px;
      font-size: 12px;
    }
    .ai-train-thread-info strong {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-right: 8px;
    }
    .ai-train-thread-info span { color: #6b7280; white-space: nowrap; }
    .ai-train-group {
      margin-bottom: 14px;
    }
    .ai-train-group-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .ai-train-group-header label {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      font-size: 13px;
    }
    .ai-train-hint {
      font-size: 11px;
      color: #9ca3af;
      font-style: italic;
    }
    .ai-train-msg {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 10px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      margin-bottom: 6px;
      cursor: pointer;
      transition: all .15s;
    }
    .ai-train-msg:hover {
      border-color: #a5b4fc;
      background: #f5f3ff;
    }
    .ai-train-msg-mine {
      border-left: 3px solid #667eea;
    }
    .ai-train-msg input[type="checkbox"] {
      margin-top: 3px;
      cursor: pointer;
    }
    .ai-train-msg-body {
      flex: 1;
      min-width: 0;
    }
    .ai-train-sender {
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: #6b7280;
      margin-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: .3px;
    }
    .ai-train-msg-body p {
      margin: 0;
      font-size: 12px;
      color: #374151;
      line-height: 1.4;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
    }
    .ai-train-save-btn {
      width: 100%;
      text-align: center;
      margin-top: 8px !important;
      padding: 10px !important;
      font-size: 13px !important;
    }
    .ai-train-success {
      text-align: center;
      padding: 32px 16px;
    }
    .ai-train-success-icon {
      font-size: 48px;
      margin-bottom: 12px;
    }
    .ai-train-success h3 {
      margin: 0 0 8px;
      font-size: 18px;
      color: #1f2937;
    }
    .ai-train-success p {
      margin: 0 0 4px;
      font-size: 13px;
    }
    .ai-train-empty p {
      font-size: 12px;
      margin-bottom: 10px;
    }
  `;

  document.head.appendChild(style);
}
