/**
 * Ollama API client for communicating with local Ollama instance.
 *
 * IMPORTANT: Ollama must be started with OLLAMA_ORIGINS="*" so it
 * accepts requests from the chrome-extension:// origin.
 *
 *   macOS / Linux:
 *     OLLAMA_ORIGINS="*" ollama serve
 *
 *   Or set it globally:
 *     launchctl setenv OLLAMA_ORIGINS "*"   (macOS)
 *     export OLLAMA_ORIGINS="*"             (Linux)
 */

const OLLAMA_BASE_URL = "http://localhost:11434";
const TIMEOUT_MS = 120000;

/**
 * Call Ollama API with the given prompt and model.
 * @param {string} prompt - The prompt to send
 * @param {string} model - Model name (e.g., "llama3", "mistral")
 * @param {object} [format] - Optional JSON schema to enforce structured output
 * @returns {Promise<string>} The model's response text
 */
async function callOllama(prompt, model = "llama3", format = undefined) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const payload = { model, prompt, stream: false };
    if (format) {
      payload.format = format;
    }

    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.status === 403) {
      throw new Error(
        "Ollama rejected the request (403 Forbidden). " +
        "Restart Ollama with:  OLLAMA_ORIGINS=\"*\" ollama serve"
      );
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Ollama returned ${response.status}: ${body || response.statusText}`);
    }

    const data = await response.json();
    return data.response || "";
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Ollama request timed out (model may still be loading)");
    }
    if (error.message.includes("Failed to fetch") || error.message.includes("NetworkError")) {
      throw new Error("Cannot reach Ollama. Make sure it is running: ollama serve");
    }
    throw error;
  }
}

/**
 * Check if Ollama is running and accessible
 * @returns {Promise<{ok: boolean, error: string|null}>}
 */
async function checkOllamaStatus() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.status === 403) {
      return { ok: false, error: "origins" };
    }
    return { ok: response.ok, error: null };
  } catch (error) {
    return { ok: false, error: "offline" };
  }
}
