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
    { label: "Summarise", action: "SUMMARISE" },
    { label: "Reply",     action: "REPLY" },
    { label: "Categorise", action: "CATEGORISE" },
    { label: "Actions",   action: "ACTION_ITEMS" },
    { label: "Your Brain", action: "TRAIN_BRAIN" }
  ];

  // Logo / title
  const title = document.createElement("span");
  title.className = "aib-title";
  title.textContent = "AI Copilot";
  bar.appendChild(title);

  buttons.forEach(btn => {
    const el = document.createElement("button");
    el.className = btn.action === "TRAIN_BRAIN" ? "aib-btn aib-btn-brain" : "aib-btn";
    el.textContent = btn.label;
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
      <div class="ai-section-header">
        <h3>Summary</h3>
      </div>
      <div class="ai-card ai-card-tldr">
        <div class="ai-card-label">TL;DR</div>
        <p>${escapeHtml(s.tldr || "No summary available")}</p>
      </div>
      ${renderList("Key decisions", s.keyDecisions)}
      ${renderList("Open questions", s.openQuestions)}
      ${renderList("Action items", s.actionItems)}
    </div>`;
  addCopyButton(container, formatSummaryText(s));
}

function renderReply(container, reply) {
  lastReply = reply;

  container.innerHTML = `
    <div class="ai-section">
      <div class="ai-section-header">
        <h3>Suggested Reply</h3>
      </div>
      <div id="ai-reply-text" class="ai-reply">${escapeHtml(reply).replace(/\n/g, "<br>")}</div>
      <div class="ai-reply-actions" id="ai-reply-actions"></div>
      <div class="ai-refine-box">
        <div class="ai-refine-label">Refine this reply</div>
        <div class="ai-refine-chips" id="ai-refine-chips"></div>
        <div class="ai-refine-row">
          <input
            type="text"
            id="ai-feedback-input"
            class="ai-refine-input"
            placeholder='e.g. "make it shorter", "mention the deadline"'
          />
          <button id="ai-refine-btn" class="aib-btn aib-btn-primary ai-refine-btn">Refine</button>
        </div>
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
    <div class="aip-loading" style="padding:14px">
      <div class="aip-spinner"></div>
      <p class="aip-loading-text">Refining...</p>
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
  const confidence = c.confidence || 0;
  const confidenceColor = confidence >= 80 ? "#188038" : confidence >= 50 ? "#e37400" : "#d93025";
  container.innerHTML = `
    <div class="ai-section">
      <div class="ai-section-header">
        <h3>Category</h3>
      </div>
      <div class="ai-category-card">
        <span class="ai-category-badge">${escapeHtml(c.category || "Unknown")}</span>
        <div class="ai-confidence-bar-wrap">
          <div class="ai-confidence-label">
            <span>Confidence</span>
            <span style="color:${confidenceColor};font-weight:500">${confidence}%</span>
          </div>
          <div class="ai-confidence-bar">
            <div class="ai-confidence-fill" style="width:${confidence}%;background:${confidenceColor}"></div>
          </div>
        </div>
      </div>
    </div>`;
}

function renderActionItems(container, items) {
  const list = Array.isArray(items) ? items : [];
  container.innerHTML = `
    <div class="ai-section">
      <div class="ai-section-header">
        <h3>Action items</h3>
        ${list.length > 0 ? `<span class="ai-badge">${list.length}</span>` : ""}
      </div>
      ${list.length === 0 ? '<p class="ai-muted">No action items found.</p>' : ""}
      <div class="ai-actions-list">
        ${list.map(item => `
          <label class="ai-action-row">
            <input type="checkbox" />
            <div>
              <span class="ai-action-task">${escapeHtml(item.task)}</span>
              <div class="ai-action-meta">
                ${item.owner ? `<span class="ai-action-owner">${escapeHtml(item.owner)}</span>` : ""}
                <span class="ai-priority ai-priority-${(item.priority || "medium").toLowerCase()}">
                  ${item.priority || "Medium"}
                </span>
              </div>
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
      <div class="ai-section-header"><h3>Train Your Brain</h3></div>
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
        Save to Your Brain
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
        saveBtn.textContent = "Save to Your Brain";
        showNotification(response?.error || "Failed to save", "error");
        return;
      }

      container.querySelector(".ai-section").innerHTML = `
        <div class="ai-train-success">
          <div class="ai-train-success-icon">&#10003;</div>
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
      <div class="ai-card-label">${escapeHtml(title)}</div>
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
  btn.className = "aib-action-btn";
  btn.textContent = "Copy";
  btn.addEventListener("click", () => {
    navigator.clipboard.writeText(text).then(() => {
      btn.textContent = "Copied!";
      btn.classList.add("aib-action-btn-success");
      setTimeout(() => {
        btn.textContent = "Copy";
        btn.classList.remove("aib-action-btn-success");
      }, 2000);
    });
  });
  container.appendChild(btn);
}

function addInsertButton(container, text) {
  const btn = document.createElement("button");
  btn.className = "aib-action-btn aib-action-btn-filled";
  btn.textContent = "Insert into reply";
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
      <div class="aip-header-left">
        <svg class="aip-header-icon" width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z" fill="#1a73e8"/>
        </svg>
        <span class="aip-header-title">AI Copilot</span>
      </div>
      <button id="ai-close-panel" aria-label="Close panel">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
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
      <p class="aip-loading-text">${escapeHtml(message)}</p>
    </div>`;
}

function showPanelError(message) {
  const content = document.getElementById("ai-copilot-content");
  if (!content) return;
  content.innerHTML = `
    <div class="aip-error">
      <div class="aip-error-icon">⚠️</div>
      <p class="aip-error-msg">${escapeHtml(message)}</p>
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
    /* ── Design tokens (Gmail-native) ────────────── */
    /* See style-guide.md for full reference         */

    /* ── Floating Action Bar ──────────────────────── */
    #ai-copilot-bar {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(80px);
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 8px;
      background: #202124;
      border-radius: 24px;
      box-shadow: 0 1px 3px rgba(60,64,67,.3), 0 4px 8px 3px rgba(60,64,67,.15);
      z-index: 9999;
      opacity: 0;
      transition: transform .25s cubic-bezier(.4,0,.2,1), opacity .25s ease;
      font-family: 'Google Sans', Roboto, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    #ai-copilot-bar.visible {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
    .aib-title {
      color: #8ab4f8;
      font-size: 12px;
      font-weight: 500;
      padding: 0 10px 0 8px;
      border-right: 1px solid #3c4043;
      margin-right: 2px;
      white-space: nowrap;
    }
    .aib-btn {
      padding: 8px 14px;
      background: transparent;
      color: #e8eaed;
      border: none;
      border-radius: 18px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      white-space: nowrap;
      transition: background .15s;
      font-family: inherit;
    }
    .aib-btn:hover {
      background: rgba(232,234,237,.12);
      color: #fff;
    }
    .aib-btn-brain {
      color: #c58af9;
    }
    .aib-btn-brain:hover { background: rgba(197,138,249,.15); color: #e8d0fe; }

    .aib-btn-primary {
      background: #1a73e8;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-weight: 500;
      padding: 8px 16px;
    }
    .aib-btn-primary:hover { background: #1765cc; }

    /* ── Side Panel ───────────────────────────────── */
    #ai-copilot-panel {
      position: fixed;
      top: 0;
      right: -420px;
      width: 400px;
      bottom: 0;
      background: #fff;
      border-left: 1px solid #dadce0;
      box-shadow: 0 4px 8px rgba(60,64,67,.3), 0 8px 16px 6px rgba(60,64,67,.15);
      display: flex;
      flex-direction: column;
      z-index: 10000;
      font-family: 'Google Sans', Roboto, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      transition: right .25s cubic-bezier(.4,0,.2,1);
    }
    #ai-copilot-panel.visible { right: 0; }

    .aip-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 16px;
      border-bottom: 1px solid #dadce0;
      background: #fff;
      flex-shrink: 0;
    }
    .aip-header-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .aip-header-icon {
      display: flex;
      align-items: center;
    }
    .aip-header-title {
      font-size: 14px;
      font-weight: 500;
      color: #202124;
    }
    .aip-header button {
      background: transparent;
      border: none;
      color: #5f6368;
      cursor: pointer;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background .15s;
    }
    .aip-header button:hover {
      background: #f1f3f4;
    }

    .aip-body {
      overflow-y: auto;
      padding: 16px;
      flex: 1;
      font-size: 13px;
      line-height: 1.6;
      color: #202124;
      background: #f8f9fa;
    }
    .aip-body::-webkit-scrollbar { width: 8px; }
    .aip-body::-webkit-scrollbar-track { background: transparent; }
    .aip-body::-webkit-scrollbar-thumb {
      background: #dadce0;
      border-radius: 4px;
      border: 2px solid transparent;
      background-clip: padding-box;
    }
    .aip-body::-webkit-scrollbar-thumb:hover { background: #bdc1c6; background-clip: padding-box; }

    /* ── Section headers ──────────────────────────── */
    .ai-section {
      animation: aip-fadeIn .2s ease;
    }
    @keyframes aip-fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .ai-section-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }
    .ai-section-header h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 500;
      color: #202124;
    }
    .ai-badge {
      background: #e8f0fe;
      color: #1a73e8;
      font-size: 11px;
      font-weight: 500;
      padding: 2px 8px;
      border-radius: 100px;
      margin-left: auto;
    }

    /* ── Content cards ────────────────────────────── */
    .ai-card {
      background: #fff;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 8px;
      box-shadow: 0 1px 2px rgba(60,64,67,.3), 0 1px 3px 1px rgba(60,64,67,.15);
      transition: box-shadow .15s;
    }
    .ai-card:hover {
      box-shadow: 0 1px 3px rgba(60,64,67,.3), 0 4px 8px 3px rgba(60,64,67,.15);
    }
    .ai-card-tldr {
      border-left: 3px solid #1a73e8;
      background: #e8f0fe;
      box-shadow: none;
    }
    .ai-card-tldr:hover { box-shadow: none; }
    .ai-card-label {
      font-size: 11px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: .5px;
      color: #5f6368;
      margin-bottom: 6px;
    }
    .ai-card p { margin: 0; color: #202124; font-size: 13px; }
    .ai-card ul {
      margin: 6px 0 0;
      padding-left: 0;
      list-style: none;
    }
    .ai-card li {
      position: relative;
      padding: 5px 0 5px 14px;
      color: #3c4043;
      font-size: 13px;
      line-height: 1.5;
    }
    .ai-card li::before {
      content: '';
      position: absolute;
      left: 0;
      top: 12px;
      width: 5px;
      height: 5px;
      background: #dadce0;
      border-radius: 50%;
    }
    .ai-card li + li { border-top: 1px solid #e8eaed; }

    /* ── Reply block ──────────────────────────────── */
    .ai-reply {
      padding: 14px 16px;
      background: #fff;
      border-radius: 8px;
      margin-bottom: 10px;
      white-space: pre-wrap;
      font-size: 13px;
      line-height: 1.7;
      color: #202124;
      box-shadow: 0 1px 2px rgba(60,64,67,.3), 0 1px 3px 1px rgba(60,64,67,.15);
    }

    /* ── Category card ────────────────────────────── */
    .ai-category-card {
      background: #fff;
      border-radius: 8px;
      padding: 20px 16px;
      box-shadow: 0 1px 2px rgba(60,64,67,.3), 0 1px 3px 1px rgba(60,64,67,.15);
      text-align: center;
    }
    .ai-category-badge {
      display: inline-block;
      background: #1a73e8;
      color: #fff;
      padding: 6px 20px;
      border-radius: 100px;
      font-size: 13px;
      font-weight: 500;
    }
    .ai-confidence-bar-wrap {
      margin-top: 16px;
      text-align: left;
    }
    .ai-confidence-label {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: #5f6368;
      margin-bottom: 6px;
    }
    .ai-confidence-bar {
      height: 4px;
      background: #e8eaed;
      border-radius: 2px;
      overflow: hidden;
    }
    .ai-confidence-fill {
      height: 100%;
      border-radius: 2px;
      transition: width .5s ease;
    }

    /* ── Action items ─────────────────────────────── */
    .ai-actions-list { display: flex; flex-direction: column; gap: 6px; }
    .ai-action-row {
      display: flex;
      gap: 10px;
      padding: 10px 12px;
      background: #fff;
      border-radius: 8px;
      cursor: pointer;
      align-items: flex-start;
      box-shadow: 0 1px 2px rgba(60,64,67,.3), 0 1px 3px 1px rgba(60,64,67,.15);
      transition: box-shadow .15s;
    }
    .ai-action-row:hover {
      box-shadow: 0 1px 3px rgba(60,64,67,.3), 0 4px 8px 3px rgba(60,64,67,.15);
    }
    .ai-action-row input[type="checkbox"] {
      margin-top: 2px;
      cursor: pointer;
      accent-color: #1a73e8;
      width: 16px;
      height: 16px;
      flex-shrink: 0;
    }
    .ai-action-row div { flex: 1; }
    .ai-action-task { display: block; font-size: 13px; color: #202124; }
    .ai-action-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 4px;
    }
    .ai-action-owner {
      font-size: 12px;
      color: #5f6368;
    }
    .ai-priority {
      font-size: 11px;
      font-weight: 500;
      padding: 1px 8px;
      border-radius: 4px;
    }
    .ai-priority-high   { color: #d93025; background: #fce8e6; }
    .ai-priority-medium { color: #e37400; background: #fef7e0; }
    .ai-priority-low    { color: #188038; background: #e6f4ea; }
    .ai-muted { color: #80868b; font-style: italic; text-align: center; padding: 16px 0; }

    /* ── Loading / Error ──────────────────────────── */
    .aip-loading {
      text-align: center;
      padding: 48px 24px 40px;
    }
    .aip-spinner {
      display: inline-block;
      width: 28px;
      height: 28px;
      border: 3px solid #e8eaed;
      border-top-color: #1a73e8;
      border-radius: 50%;
      animation: aip-spin .7s linear infinite;
    }
    @keyframes aip-spin { to { transform: rotate(360deg); } }
    .aip-loading-text {
      margin: 14px 0 0;
      font-size: 13px;
      font-weight: 500;
      color: #5f6368;
    }

    .aip-error {
      padding: 20px 16px;
      background: #fce8e6;
      border-radius: 8px;
      text-align: center;
    }
    .aip-error-icon { font-size: 28px; margin-bottom: 10px; }
    .aip-error-msg {
      color: #d93025;
      font-weight: 500;
      font-size: 13px;
      margin: 0 0 6px;
    }
    .aip-error small { display: block; color: #5f6368; font-size: 12px; }

    /* ── Toast ─────────────────────────────────────── */
    .ai-toast {
      position: fixed;
      bottom: 90px;
      right: 24px;
      padding: 10px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      font-family: 'Google Sans', Roboto, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      z-index: 10001;
      opacity: 0;
      transform: translateY(8px);
      transition: opacity .2s ease-out, transform .2s ease-out;
      box-shadow: 0 1px 3px rgba(60,64,67,.3), 0 4px 8px 3px rgba(60,64,67,.15);
    }
    .ai-toast.visible { opacity: 1; transform: translateY(0); }
    .ai-toast-success { background: #202124; color: #fff; }
    .ai-toast-error   { background: #202124; color: #fff; }
    .ai-toast-info    { background: #202124; color: #fff; }

    /* ── Refine reply ─────────────────────────────── */
    .ai-reply-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .ai-refine-box {
      margin-top: 12px;
      padding: 14px;
      background: #fff;
      border-radius: 8px;
      box-shadow: 0 1px 2px rgba(60,64,67,.3), 0 1px 3px 1px rgba(60,64,67,.15);
    }
    .ai-refine-label {
      font-size: 13px;
      font-weight: 500;
      color: #202124;
      margin-bottom: 10px;
    }
    .ai-refine-row {
      display: flex;
      gap: 8px;
    }
    .ai-refine-input {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid #dadce0;
      border-radius: 8px;
      font-size: 13px;
      font-family: inherit;
      outline: none;
      background: #fff;
      color: #202124;
      transition: border-color .15s, box-shadow .15s;
    }
    .ai-refine-input:focus {
      border-color: #1a73e8;
      box-shadow: 0 0 0 2px rgba(26,115,232,.2);
    }
    .ai-refine-input:disabled {
      background: #f1f3f4;
      color: #80868b;
    }
    .ai-refine-btn {
      margin: 0 !important;
      white-space: nowrap;
      padding: 8px 16px !important;
      border-radius: 8px !important;
      background: #1a73e8 !important;
      color: #fff !important;
      font-weight: 500 !important;
      border: none !important;
    }
    .ai-refine-btn:hover {
      background: #1765cc !important;
    }
    .ai-refine-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 10px;
    }
    .ai-chip {
      padding: 4px 12px;
      background: #fff;
      border: 1px solid #dadce0;
      border-radius: 100px;
      font-size: 12px;
      color: #3c4043;
      cursor: pointer;
      transition: all .15s;
      font-family: inherit;
      font-weight: 500;
    }
    .ai-chip:hover {
      background: #e8f0fe;
      border-color: #1a73e8;
      color: #1a73e8;
    }

    /* ── Action buttons (copy, insert) ────────────── */
    .aib-action-btn {
      padding: 7px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      background: #fff;
      color: #1a73e8;
      border: 1px solid #dadce0;
      cursor: pointer;
      transition: all .15s;
      margin-top: 8px;
      margin-right: 8px;
      font-family: inherit;
    }
    .aib-action-btn:hover {
      background: #f8f9fa;
      border-color: #1a73e8;
    }
    .aib-action-btn-filled {
      background: #1a73e8;
      color: #fff;
      border-color: #1a73e8;
    }
    .aib-action-btn-filled:hover {
      background: #1765cc;
      border-color: #1765cc;
      color: #fff;
    }
    .aib-action-btn-success {
      background: #188038 !important;
      color: #fff !important;
      border-color: #188038 !important;
    }

    /* ── Train Brain ──────────────────────────────── */
    .ai-train-subtitle {
      font-size: 12px;
      color: #5f6368;
      margin-bottom: 12px;
      line-height: 1.6;
    }
    .ai-train-thread-info {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 14px;
      background: #fff;
      border-radius: 8px;
      margin-bottom: 14px;
      font-size: 12px;
      box-shadow: 0 1px 2px rgba(60,64,67,.3), 0 1px 3px 1px rgba(60,64,67,.15);
    }
    .ai-train-thread-info strong {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-right: 8px;
      color: #202124;
    }
    .ai-train-thread-info span { color: #5f6368; white-space: nowrap; }
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
      font-weight: 500;
      color: #202124;
    }
    .ai-train-hint {
      font-size: 11px;
      color: #80868b;
      font-style: italic;
    }
    .ai-train-msg {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 10px 12px;
      background: #fff;
      border-radius: 8px;
      margin-bottom: 6px;
      cursor: pointer;
      box-shadow: 0 1px 2px rgba(60,64,67,.3), 0 1px 3px 1px rgba(60,64,67,.15);
      transition: box-shadow .15s;
    }
    .ai-train-msg:hover {
      box-shadow: 0 1px 3px rgba(60,64,67,.3), 0 4px 8px 3px rgba(60,64,67,.15);
    }
    .ai-train-msg-mine {
      border-left: 3px solid #1a73e8;
    }
    .ai-train-msg input[type="checkbox"] {
      margin-top: 3px;
      cursor: pointer;
      accent-color: #1a73e8;
    }
    .ai-train-msg-body {
      flex: 1;
      min-width: 0;
    }
    .ai-train-sender {
      display: block;
      font-size: 11px;
      font-weight: 500;
      color: #5f6368;
      margin-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: .3px;
    }
    .ai-train-msg-body p {
      margin: 0;
      font-size: 12px;
      color: #3c4043;
      line-height: 1.5;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
    }
    .ai-train-save-btn {
      width: 100%;
      text-align: center;
      margin-top: 10px !important;
      padding: 10px !important;
      font-size: 13px !important;
      border-radius: 8px !important;
      background: #1a73e8 !important;
      color: #fff !important;
      font-weight: 500 !important;
      border: none !important;
    }
    .ai-train-save-btn:hover {
      background: #1765cc !important;
    }
    .ai-train-success {
      text-align: center;
      padding: 36px 20px;
    }
    .ai-train-success-icon {
      font-size: 40px;
      margin-bottom: 12px;
      color: #188038;
    }
    .ai-train-success h3 {
      margin: 0 0 8px;
      font-size: 16px;
      font-weight: 500;
      color: #202124;
    }
    .ai-train-success p {
      margin: 0 0 4px;
      font-size: 13px;
      color: #5f6368;
    }
    .ai-train-empty p {
      font-size: 12px;
      margin-bottom: 10px;
      color: #5f6368;
    }
  `;

  document.head.appendChild(style);
}
