/**
 * Ollama API client for communicating with local Ollama instance
 */

const OLLAMA_BASE_URL = "http://localhost:11434";
const TIMEOUT_MS = 60000;

/**
 * Call Ollama API with the given prompt and model
 * @param {string} prompt - The prompt to send
 * @param {string} model - Model name (e.g., "llama3", "mistral", "mixtral")
 * @returns {Promise<string>} The model's response text
 */
async function callOllama(prompt, model = "llama3") {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        prompt,
        stream: false
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.response || "";
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Ollama request timed out");
    }
    throw new Error(`Ollama error: ${error.message}`);
  }
}

/**
 * Check if Ollama is running and accessible
 * @returns {Promise<boolean>} True if Ollama is reachable
 */
async function checkOllamaStatus() {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      timeout: 5000
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}
