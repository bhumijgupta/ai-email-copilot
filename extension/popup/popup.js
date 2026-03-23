/**
 * Popup Script - Extension settings and status
 */

document.addEventListener("DOMContentLoaded", initialize);

function initialize() {
  checkOllamaStatus();
  loadPMBrainState();
  loadMemoryStats();

  // Event listeners
  document.getElementById("pmbrain-toggle").addEventListener("change", togglePMBrain);
  document.getElementById("improve-with-style").addEventListener("click", improveWithStyle);
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
      text.style.color = "#16a34a";
      if (hint) hint.textContent = "";
    } else if (response && response.error === "origins") {
      dot.classList.remove("connected", "disconnected");
      dot.classList.add("warning");
      text.textContent = "Blocked (CORS)";
      text.style.color = "#d97706";
      if (hint) {
        hint.innerHTML =
          'Ollama is running but blocking the extension.<br>' +
          'Restart with: <code>OLLAMA_ORIGINS="*" ollama serve</code>';
      }
    } else {
      dot.classList.remove("connected", "warning");
      dot.classList.add("disconnected");
      text.textContent = "Disconnected";
      text.style.color = "#dc2626";
      if (hint) hint.textContent = "Run: ollama serve";
    }
  });
}

/**
 * Toggle PM Brain setting
 */
function togglePMBrain(event) {
  const enabled = event.target.checked;
  chrome.storage.local.set({ pm_brain_enabled: enabled }, () => {
    console.log("PM Brain", enabled ? "enabled" : "disabled");
  });
}

/**
 * Load PM Brain toggle state
 */
function loadPMBrainState() {
  chrome.storage.local.get(["pm_brain_enabled"], (result) => {
    const toggle = document.getElementById("pmbrain-toggle");
    toggle.checked = result.pm_brain_enabled !== false;
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
 * Improve with my style - manually trigger PM Brain
 */
function improveWithStyle() {
  alert(
    "This will use your past emails to improve AI replies. Make sure to enable PM Brain and send some emails for it to learn from."
  );
}

/**
 * Clear PM Brain memory
 */
function resetMemory() {
  if (
    confirm(
      "Clear all stored emails and edits? This cannot be undone."
    )
  ) {
    chrome.storage.local.remove(
      ["pm_brain_past_emails", "pm_brain_edited_responses"],
      () => {
        alert("Memory cleared");
        loadMemoryStats();
      }
    );
  }
}
