/**
 * Popup Script - Extension settings and status
 */

document.addEventListener("DOMContentLoaded", initialize);

function initialize() {
  checkOllamaStatus();
  loadYourBrainState();
  loadMemoryStats();

  // Event listeners
  document.getElementById("your-brain-toggle").addEventListener("change", toggleYourBrain);
  document.getElementById("reset-memory").addEventListener("click", resetMemory);

  // Refresh status every 5 seconds
  setInterval(checkOllamaStatus, 5000);
}

/**
 * Check Ollama connection status
 */
function checkOllamaStatus() {
  chrome.runtime.sendMessage({ action: "CHECK_OLLAMA" }, (response) => {
    const dot = document.getElementById("status-dot");
    const text = document.getElementById("status-text");
    const hint = document.getElementById("status-hint");

    if (response && response.connected) {
      dot.classList.remove("disconnected", "warning");
      dot.classList.add("connected");
      text.textContent = "Connected";
      text.style.color = "#81c995";
      if (hint) hint.textContent = "";
    } else if (response && response.error === "origins") {
      dot.classList.remove("connected", "disconnected");
      dot.classList.add("warning");
      text.textContent = "Blocked (CORS)";
      text.style.color = "#fdd663";
      if (hint) {
        hint.innerHTML =
          'Ollama is running but blocking the extension.<br>' +
          'Restart with: <code>OLLAMA_ORIGINS="*" ollama serve</code>';
      }
    } else {
      dot.classList.remove("connected", "warning");
      dot.classList.add("disconnected");
      text.textContent = "Disconnected";
      text.style.color = "#f28b82";
      if (hint) hint.textContent = "Run: ollama serve";
    }
  });
}

/**
 * Toggle Your Brain setting
 */
function toggleYourBrain(event) {
  const enabled = event.target.checked;
  chrome.storage.local.set({ your_brain_enabled: enabled }, () => {
    console.debug("Your Brain", enabled ? "enabled" : "disabled");
  });
}

/**
 * Load Your Brain toggle state
 */
function loadYourBrainState() {
  chrome.storage.local.get(["your_brain_enabled"], (result) => {
    const toggle = document.getElementById("your-brain-toggle");
    toggle.checked = result.your_brain_enabled !== false;
  });
}

/**
 * Load memory statistics
 */
function loadMemoryStats() {
  chrome.runtime.sendMessage({ action: "GET_MEMORY_STATS" }, (response) => {
    if (response && response.stats) {
      document.getElementById("emails-count").textContent = response.stats.emailsStored || 0;
      document.getElementById("edits-count").textContent = response.stats.editsStored || 0;
    }
  });
}

/**
 * Clear Your Brain memory
 */
function resetMemory() {
  if (
    confirm(
      "Clear all stored emails and edits? This cannot be undone."
    )
  ) {
    chrome.storage.local.remove(
      ["your_brain_past_emails", "your_brain_edited_responses"],
      () => {
        alert("Memory cleared");
        loadMemoryStats();
      }
    );
  }
}
