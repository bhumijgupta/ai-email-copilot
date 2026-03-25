#!/usr/bin/env node

/**
 * Report generator for evaluation results
 *
 * Reads eval/results.json and produces:
 * - Formatted terminal table with scores and latencies
 * - Leaderboard by overall average
 * - Recommended model assignments per operation
 * - Enhanced JSON with aggregates
 */

const fs = require("fs");
const path = require("path");

// ============================================================================
// Formatting utilities
// ============================================================================

function padRight(str, width) {
  return String(str).padEnd(width);
}

function padLeft(str, width) {
  return String(str).padStart(width);
}

function formatLatency(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ============================================================================
// Data aggregation
// ============================================================================

function aggregateResults(results) {
  const byModel = {};
  const byModelAndOp = {};
  const byTier = {};
  const byModelAndTier = {};

  for (const result of results) {
    const model = result.model;
    const op = result.operation;
    const tier = result.tier;
    const score = result.score || 0;
    const latency = result.latencyMs || 0;

    // By model
    if (!byModel[model]) {
      byModel[model] = { scores: [], latencies: [], jsonValid: [] };
    }
    byModel[model].scores.push(score);
    byModel[model].latencies.push(latency);
    byModel[model].jsonValid.push(result.jsonValid === true);

    // By model and operation
    const key = `${model}:${op}`;
    if (!byModelAndOp[key]) {
      byModelAndOp[key] = { scores: [], latencies: [] };
    }
    byModelAndOp[key].scores.push(score);
    byModelAndOp[key].latencies.push(latency);

    // By tier
    if (!byTier[tier]) {
      byTier[tier] = { scores: [], latencies: [] };
    }
    byTier[tier].scores.push(score);
    byTier[tier].latencies.push(latency);

    // By model and tier
    const tierKey = `${model}:tier${tier}`;
    if (!byModelAndTier[tierKey]) {
      byModelAndTier[tierKey] = { scores: [], latencies: [] };
    }
    byModelAndTier[tierKey].scores.push(score);
    byModelAndTier[tierKey].latencies.push(latency);
  }

  // Compute averages
  const computeAvg = (arr) => (arr.length > 0 ? arr.reduce((a, b) => a + b) / arr.length : 0);

  const aggregated = {
    byModel: {},
    byModelAndOp: {},
    byTier: {},
    byModelAndTier: {},
    recommended: {}
  };

  for (const [model, data] of Object.entries(byModel)) {
    aggregated.byModel[model] = {
      avgScore: Math.round(computeAvg(data.scores)),
      avgLatency: Math.round(computeAvg(data.latencies)),
      jsonValidPercent: Math.round(
        (data.jsonValid.filter((v) => v).length / data.jsonValid.length) * 100
      )
    };
  }

  for (const [key, data] of Object.entries(byModelAndOp)) {
    aggregated.byModelAndOp[key] = {
      avgScore: Math.round(computeAvg(data.scores)),
      avgLatency: Math.round(computeAvg(data.latencies))
    };
  }

  for (const [tier, data] of Object.entries(byTier)) {
    aggregated.byTier[tier] = {
      avgScore: Math.round(computeAvg(data.scores)),
      avgLatency: Math.round(computeAvg(data.latencies))
    };
  }

  for (const [key, data] of Object.entries(byModelAndTier)) {
    aggregated.byModelAndTier[key] = {
      avgScore: Math.round(computeAvg(data.scores)),
      avgLatency: Math.round(computeAvg(data.latencies))
    };
  }

  // Compute recommended models per operation
  const operations = ["summarize", "categorize", "actionItems", "reply"];
  const modelScoresByOp = {};

  for (const op of operations) {
    modelScoresByOp[op] = {};
    for (const model of Object.keys(byModel)) {
      const key = `${model}:${op}`;
      const opData = aggregated.byModelAndOp[key];
      if (opData) {
        modelScoresByOp[op][model] = opData.avgScore;
      }
    }
  }

  for (const op of operations) {
    let bestModel = null;
    let bestScore = -1;
    for (const [model, score] of Object.entries(modelScoresByOp[op])) {
      if (score > bestScore) {
        bestScore = score;
        bestModel = model;
      }
    }
    if (bestModel) {
      aggregated.recommended[op] = {
        model: bestModel,
        score: bestScore
      };
    }
  }

  return aggregated;
}

// ============================================================================
// Terminal output
// ============================================================================

function printTerminalReport(results, aggregates) {
  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║  AI Email Copilot — Model Evaluation Report                  ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  // Group results by model
  const resultsByModel = {};
  for (const result of results) {
    if (!resultsByModel[result.model]) {
      resultsByModel[result.model] = [];
    }
    resultsByModel[result.model].push(result);
  }

  // Print per-model tables
  for (const [model, modelResults] of Object.entries(resultsByModel)) {
    console.log(`\nModel: ${model}`);
    console.log("─".repeat(70));
    console.log(
      `  ${padRight("Fixture", 20)} ${padRight("Operation", 13)} ${padLeft("Score", 7)} ${padLeft("Latency", 10)} ${padRight("Valid", 7)}`
    );
    console.log("─".repeat(70));

    for (const result of modelResults) {
      const status = result.jsonValid ? "✓" : "✗";
      console.log(
        `  ${padRight(result.fixtureId, 20)} ${padRight(result.operation, 13)} ${padLeft(
          result.score,
          7
        )} ${padLeft(formatLatency(result.latencyMs), 10)} ${padRight(
          status,
          7
        )}`
      );
    }

    console.log("─".repeat(70));

    // Tier-wise averages
    const tiers = {};
    for (const result of modelResults) {
      if (!tiers[result.tier]) {
        tiers[result.tier] = [];
      }
      tiers[result.tier].push(result);
    }

    for (const tier of Object.keys(tiers).sort()) {
      const tierResults = tiers[tier];
      const avgScore = Math.round(
        tierResults.reduce((s, r) => s + r.score, 0) / tierResults.length
      );
      const avgLatency = Math.round(
        tierResults.reduce((s, r) => s + r.latencyMs, 0) / tierResults.length
      );
      console.log(
        `  ${padRight(`Tier ${tier} avg`, 20)} ${padRight("", 13)} ${padLeft(
          avgScore,
          7
        )} ${padLeft(formatLatency(avgLatency), 10)}`
      );
    }

    const modelAggregate = aggregates.byModel[model];
    console.log(
      `  ${padRight("OVERALL AVG", 20)} ${padRight("", 13)} ${padLeft(
        modelAggregate.avgScore,
        7
      )} ${padLeft(formatLatency(modelAggregate.avgLatency), 10)} ${padLeft(
        modelAggregate.jsonValidPercent + "%",
        7
      )}`
    );
  }

  // Leaderboard
  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║  Leaderboard (by overall average score)                        ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  const leaderboard = Object.entries(aggregates.byModel)
    .sort((a, b) => b[1].avgScore - a[1].avgScore);

  for (let i = 0; i < leaderboard.length; i++) {
    const [model, stats] = leaderboard[i];
    console.log(
      `  ${padLeft((i + 1) + ".", 3)} ${padRight(model, 15)} ${padLeft(stats.avgScore, 3)} avg  ${padLeft(
        formatLatency(stats.avgLatency),
        10
      )} latency  ${padLeft(stats.jsonValidPercent + "%", 4)} valid`
    );
  }

  // Recommended models
  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║  Recommended Model Assignment                                  ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  for (const [op, rec] of Object.entries(aggregates.recommended)) {
    console.log(`  ${padRight(op, 18)}: ${padRight(rec.model, 15)} (${rec.score}/100)`);
  }

  // Performance by operation per model
  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║  Performance by Operation (Per Model)                          ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  for (const model of Object.keys(aggregates.byModel).sort()) {
    console.log(`Model: ${model}`);
    console.log("─".repeat(70));
    
    const operationLabels = {
      summarize: "Summarize",
      categorize: "Categorize",
      actionItems: "Action Items",
      reply: "Reply"
    };

    for (const op of ["summarize", "categorize", "actionItems", "reply"]) {
      const key = `${model}:${op}`;
      if (aggregates.byModelAndOp[key]) {
        const stats = aggregates.byModelAndOp[key];
        const label = operationLabels[op];
        console.log(
          `  ${padRight(label, 18)}: ${padLeft(stats.avgScore, 3)}/100  ${padLeft(
            formatLatency(stats.avgLatency),
            10
          )}`
        );
      }
    }
    console.log();
  }

  // Tier analysis
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║  Performance by Difficulty Tier                               ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  for (const tier of Object.keys(aggregates.byTier).sort()) {
    const tierStats = aggregates.byTier[tier];
    const tierLabel = {
      1: "Simple single-sender",
      2: "Two-party conversation",
      3: "Multi-sender thread",
      4: "Informal/messy",
      5: "Long complex thread"
    }[tier];

    console.log(
      `  Tier ${tier} (${tierLabel}): ${padLeft(tierStats.avgScore, 3)}/100  ${padLeft(
        formatLatency(tierStats.avgLatency),
        10
      )}`
    );
  }

  console.log();
}

// ============================================================================
// Main entry point
// ============================================================================

function main() {
  const resultsPath = path.join(__dirname, "results.json");

  if (!fs.existsSync(resultsPath)) {
    console.error(`❌ Results file not found: ${resultsPath}`);
    console.error("Run the evaluation first: node eval/runner.js");
    process.exit(1);
  }

  const resultsData = JSON.parse(fs.readFileSync(resultsPath, "utf8"));
  const results = resultsData.results || [];

  if (results.length === 0) {
    console.error("❌ No results found in results.json");
    process.exit(1);
  }

  const aggregates = aggregateResults(results);

  // Print terminal report
  printTerminalReport(results, aggregates);

  // Enhance and save results
  const enhanced = {
    timestamp: new Date().toISOString(),
    models: resultsData.models,
    fixtures: resultsData.fixtures,
    results,
    aggregates
  };

  fs.writeFileSync(resultsPath, JSON.stringify(enhanced, null, 2));
  console.log(`✓ Full results saved to: ${resultsPath}\n`);
}

if (require.main === module) {
  main();
}

module.exports = { aggregateResults, printTerminalReport };
