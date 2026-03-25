#!/usr/bin/env node

/**
 * AI Email Copilot — Model Evaluation Runner
 *
 * Orchestrates model evaluation across all AI operations:
 * - Iterates over models, fixtures, and operations
 * - Calls Ollama with timed requests
 * - Scores outputs against ground truth
 * - Collects results for reporting
 *
 * Usage:
 *   node eval/runner.js [--models mistral,llama3] [--tier 3]
 */

const fs = require("fs");
const path = require("path");
const scorer = require("./scorer.js");

const OLLAMA_BASE_URL = "http://localhost:11434";
const TIMEOUT_MS = 120000; // 120 seconds

// ============================================================================
// Load prompt builder functions
// ============================================================================

/**
 * Load and wrap promptBuilder.js functions for Node.js
 */
function loadPromptBuilder() {
  const filePath = path.join(__dirname, "../extension/utils/promptBuilder.js");
  const code = fs.readFileSync(filePath, "utf8");

  // Extract function definitions from the file
  const module = {};

  // Eval the code in a controlled scope
  // eslint-disable-next-line no-eval
  eval(`
    (function() {
      ${code}
      module.buildSummaryPrompt = buildSummaryPrompt;
      module.buildReplyPrompt = buildReplyPrompt;
      module.buildCategoryPrompt = buildCategoryPrompt;
      module.buildActionPrompt = buildActionPrompt;
      module.parseJsonResponse = parseJsonResponse;
    })()
  `);

  return module;
}

const promptBuilder = loadPromptBuilder();

// JSON schemas from background.js
const SCHEMAS = {
  SUMMARY: {
    type: "object",
    properties: {
      summary: { type: "array", items: { type: "string" } },
      keyDecisions: { type: "array", items: { type: "string" } },
      openQuestions: { type: "array", items: { type: "string" } },
      actionItems: { type: "array", items: { type: "string" } }
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
      category: { type: "string" },
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
            task: { type: "string" },
            owner: { type: "string" },
            priority: { type: "string" }
          },
          required: ["task", "priority"]
        }
      }
    },
    required: ["actionItems"]
  }
};

// ============================================================================
// Ollama communication
// ============================================================================

/**
 * Call Ollama API with timeout
 */
async function callOllama(prompt, model, schema = undefined) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const payload = { model, prompt, stream: false };
    if (schema) {
      payload.format = schema;
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

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Ollama returned ${response.status}: ${body || response.statusText}`
      );
    }

    const data = await response.json();
    return {
      response: data.response || "",
      metrics: {
        eval_count: data.eval_count,
        prompt_eval_count: data.prompt_eval_count
      }
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error("Ollama request timed out (120s)");
    }
    throw error;
  }
}

/**
 * Check if model is available in Ollama
 */
async function isModelAvailable(model) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    const availableModels = (data.models || []).map((m) => m.name);
    
    // Check for exact match (e.g., "llama3.1:8b")
    if (availableModels.includes(model)) {
      return true;
    }
    
    // Check for base model name match (e.g., "llama3.1" matches "llama3.1:8b")
    const modelBase = model.split(":")[0];
    return availableModels.some((m) => m.startsWith(modelBase));
  } catch {
    return false;
  }
}

// ============================================================================
// Operation mapping
// ============================================================================

const OPERATIONS = {
  summarize: {
    name: "summarize",
    buildPrompt: (fixture) => 
      promptBuilder.buildSummaryPrompt(fixture.thread, fixture.currentUser),
    schema: SCHEMAS.SUMMARY,
    parseResult: (response) => promptBuilder.parseJsonResponse(response)
  },
  categorize: {
    name: "categorize",
    buildPrompt: (fixture) => promptBuilder.buildCategoryPrompt(fixture.thread),
    schema: SCHEMAS.CATEGORY,
    parseResult: (response) => promptBuilder.parseJsonResponse(response)
  },
  actionItems: {
    name: "actionItems",
    buildPrompt: (fixture) =>
      promptBuilder.buildActionPrompt(fixture.thread, fixture.currentUser),
    schema: SCHEMAS.ACTIONS,
    parseResult: (response) => promptBuilder.parseJsonResponse(response)
  },
  reply: {
    name: "reply",
    buildPrompt: (fixture) => {
      // For reply, we need a summary first. Create a simple one.
      const simpleSummary = `Email thread about: ${fixture.description}`;
      return promptBuilder.buildReplyPrompt(simpleSummary, "professional", fixture.currentUser);
    },
    schema: SCHEMAS.REPLY,
    parseResult: (response) => promptBuilder.parseJsonResponse(response)
  }
};

// ============================================================================
// CLI argument parsing
// ============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    models: null,
    tier: null,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--models") {
      parsed.models = args[i + 1] ? args[i + 1].split(",") : null;
      i++;
    } else if (args[i] === "--tier") {
      parsed.tier = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--help" || args[i] === "-h") {
      parsed.help = true;
    }
  }

  return parsed;
}

function showHelp() {
  console.log(`
AI Email Copilot — Model Evaluation Runner

Usage: node eval/runner.js [options]

Options:
  --models <list>   Comma-separated models to test (default: mistral,llama3,gemma2,phi3)
  --tier <number>   Test only fixtures from a specific tier (1-5)
  --help            Show this help message

Examples:
  node eval/runner.js
  node eval/runner.js --models mistral,llama3
  node eval/runner.js --tier 3
  node eval/runner.js --models llama3 --tier 1
`);
}

// ============================================================================
// Model warmup (hot loading)
// ============================================================================

/**
 * Pre-warm a model by sending a quick inference request.
 * This loads the model into memory so subsequent tests aren't affected
 * by model loading time.
 */
async function warmupModel(model) {
  try {
    const warmupPrompt = "What is 2+2?";
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        prompt: warmupPrompt,
        stream: false
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Warmup failed: ${response.status}`);
    }

    return true;
  } catch (error) {
    console.log(`  ⚠ Warmup failed for ${model}: ${error.message}`);
    return false;
  }
}

// ============================================================================
// Main evaluation loop
// ============================================================================

async function runEvaluation() {
  const args = parseArgs();

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  // Load fixtures
  const fixturesPath = path.join(__dirname, "fixtures.json");
  const fixturesData = JSON.parse(fs.readFileSync(fixturesPath, "utf8"));
  let fixtures = fixturesData.fixtures;

  // Filter by tier if specified
  if (args.tier) {
    fixtures = fixtures.filter((f) => f.tier === args.tier);
  }

  // Models to test
  const modelsToTest = args.models || ["mistral", "llama3", "gemma2", "phi3"];

  console.log("\n=== AI Email Copilot — Model Evaluation ===\n");
  console.log(`Fixtures: ${fixtures.length}`);
  console.log(`Operations: ${Object.keys(OPERATIONS).length}`);
  console.log(`Models to test: ${modelsToTest.join(", ")}\n`);

  const results = [];
  const startTime = Date.now();

  // Iterate: models → fixtures → operations
  for (const model of modelsToTest) {
    console.log(`Checking model availability: ${model}...`);
    const available = await isModelAvailable(model);

    if (!available) {
      console.log(`  ⚠ Model "${model}" not found. Skipping.\n`);
      continue;
    }

    console.log(`  ✓ Found. Warming up model...`);
    const warmedUp = await warmupModel(model);
    if (!warmedUp) {
      console.log(`  ⚠ Warmup incomplete, but proceeding.\n`);
    } else {
      console.log(`  ✓ Model preloaded. Running evaluation...\n`);
    }

    for (const fixture of fixtures) {
      for (const opKey of Object.keys(OPERATIONS)) {
        const op = OPERATIONS[opKey];
        process.stdout.write(
          `  [${fixture.id}] ${op.name}... `
        );

        try {
          const prompt = op.buildPrompt(fixture);
          const opStartTime = Date.now();

          const { response } = await callOllama(prompt, model, op.schema);

          const latencyMs = Date.now() - opStartTime;
          const parsed = op.parseResult(response);
          const jsonValid = parsed !== null;

          let scoreObj = { score: 0, breakdown: {} };
          if (jsonValid) {
            const expectedKey = {
              summarize: "summary",
              categorize: "category",
              actionItems: "actionItems",
              reply: "reply"
            }[opKey];

            scoreObj = scorer.scoreResult(
              opKey,
              parsed,
              fixture.expected[expectedKey]
            );
          }

          results.push({
            model,
            fixtureId: fixture.id,
            tier: fixture.tier,
            operation: opKey,
            score: scoreObj.score,
            breakdown: scoreObj.breakdown,
            latencyMs,
            jsonValid,
            timestamp: new Date().toISOString()
          });

          const statusIcon = jsonValid ? "✓" : "✗";
          console.log(
            `${statusIcon} ${scoreObj.score}/100 (${latencyMs}ms)`
          );
        } catch (error) {
          console.log(`✗ ERROR: ${error.message}`);
          results.push({
            model,
            fixtureId: fixture.id,
            tier: fixture.tier,
            operation: opKey,
            score: 0,
            error: error.message,
            timestamp: new Date().toISOString()
          });
        }
      }
    }
  }

  const totalTime = Date.now() - startTime;

  console.log(`\nEvaluation complete in ${(totalTime / 1000).toFixed(1)}s\n`);

  // Save results
  const outputPath = path.join(__dirname, "results.json");
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        models: modelsToTest,
        fixtures: fixtures.length,
        results
      },
      null,
      2
    )
  );

  console.log(`Results saved to: ${outputPath}\n`);

  return results;
}

// ============================================================================
// Entry point
// ============================================================================

runEvaluation().catch((error) => {
  console.error("Fatal error:", error.message);
  process.exit(1);
});
