/**
 * Scoring module for evaluating AI model outputs against ground truth.
 * Each operation uses a different rubric, all on 0-100 scale.
 */

/**
 * Score a summarization result against expected output.
 * Rubric:
 * - Keyword coverage (40 pts): % of mustInclude keywords found
 * - Bullet count (15 pts): Within bulletCountRange
 * - Key decisions present (15 pts): Non-empty array with content
 * - Open questions present (15 pts): Non-empty where expected
 * - Action items present (15 pts): Non-empty where expected
 * Total: 100 pts
 */
function scoreSummarize(result, expected) {
  if (!result || typeof result !== "object") {
    return { score: 0, breakdown: { error: "Invalid result format" } };
  }

  const breakdown = {};
  let score = 0;

  // 1. Keyword coverage (40 pts)
  const keywords = expected.mustInclude || [];
  const text = [
    ...(result.summary || []),
    ...(result.keyDecisions || []),
    ...(result.openQuestions || []),
    ...(result.actionItems || [])
  ]
    .join(" ")
    .toLowerCase();

  const matchedKeywords = keywords.filter((kw) =>
    text.includes(kw.toLowerCase())
  );
  const keywordScore = Math.round((matchedKeywords.length / keywords.length) * 40);
  breakdown.keywordCoverage = {
    score: keywordScore,
    matched: matchedKeywords.length,
    total: keywords.length
  };
  score += keywordScore;

  // 2. Bullet count (15 pts)
  const bulletCount = (result.summary || []).length;
  const [minBullets, maxBullets] = expected.bulletCountRange || [1, 10];
  const bulletScore =
    bulletCount >= minBullets && bulletCount <= maxBullets ? 15 : 0;
  breakdown.bulletCount = {
    score: bulletScore,
    count: bulletCount,
    range: [minBullets, maxBullets]
  };
  score += bulletScore;

  // 3. Key decisions present (15 pts)
  const decisionsScore =
    result.keyDecisions && result.keyDecisions.length > 0 ? 15 : 0;
  breakdown.keyDecisions = {
    score: decisionsScore,
    present: !!result.keyDecisions && result.keyDecisions.length > 0
  };
  score += decisionsScore;

  // 4. Open questions present (15 pts)
  const questionsScore =
    result.openQuestions && result.openQuestions.length > 0 ? 15 : 0;
  breakdown.openQuestions = {
    score: questionsScore,
    present: !!result.openQuestions && result.openQuestions.length > 0
  };
  score += questionsScore;

  // 5. Action items present (15 pts)
  const itemsScore =
    result.actionItems && result.actionItems.length > 0 ? 15 : 0;
  breakdown.actionItems = {
    score: itemsScore,
    present: !!result.actionItems && result.actionItems.length > 0
  };
  score += itemsScore;

  return { score: Math.min(score, 100), breakdown };
}

/**
 * Score a categorization result against expected output.
 * Rubric:
 * - Exact match (70 pts): Category matches expected exactly (case-insensitive)
 * - Acceptable match (40 pts): Category matches one of acceptableAlternatives
 * - Confidence calibration (30 pts): Confidence > 70 = 30pts; 50-70 = 15pts; < 50 = 0pts
 * Total: 100 pts
 */
function scoreCategorize(result, expected) {
  if (!result || typeof result !== "object") {
    return { score: 0, breakdown: { error: "Invalid result format" } };
  }

  const breakdown = {};
  let score = 0;

  const resultCategory = (result.category || "").toLowerCase().trim();
  const expectedCategory = (expected.expected || "").toLowerCase().trim();
  const alternatives = (expected.acceptableAlternatives || []).map((a) =>
    a.toLowerCase().trim()
  );

  // 1. Category match (70 or 40 or 0 pts)
  let categoryScore = 0;
  let categoryMatch = "no";

  if (resultCategory === expectedCategory) {
    categoryScore = 70;
    categoryMatch = "exact";
  } else if (alternatives.includes(resultCategory)) {
    categoryScore = 40;
    categoryMatch = "acceptable";
  }

  breakdown.categoryMatch = {
    score: categoryScore,
    result: result.category,
    expected: expected.expected,
    match: categoryMatch
  };
  score += categoryScore;

  // 2. Confidence calibration (30 pts max)
  const confidence = result.confidence || 0;
  let confidenceScore = 0;

  if (confidence > 70) {
    confidenceScore = 30;
  } else if (confidence >= 50) {
    confidenceScore = 15;
  }

  breakdown.confidence = {
    score: confidenceScore,
    value: confidence
  };
  score += confidenceScore;

  return { score: Math.min(score, 100), breakdown };
}

/**
 * Score action items extraction against expected output.
 * Rubric:
 * - Count accuracy (25 pts): Number of items within countRange
 * - Task coverage (35 pts): % of expected items with matching keywords found
 * - Owner accuracy (20 pts): Correct owner assignment for items with expectedOwner
 * - Priority accuracy (20 pts): Correct priority for items with expectedPriority
 * Total: 100 pts
 */
function scoreActionItems(result, expected) {
  if (!result || typeof result !== "object") {
    return { score: 0, breakdown: { error: "Invalid result format" } };
  }

  const breakdown = {};
  let score = 0;

  const items = result.actionItems || [];
  const expectedItems = expected.items || [];
  const [minCount, maxCount] = expected.countRange || [0, 10];

  // 1. Count accuracy (25 pts)
  const countScore =
    items.length >= minCount && items.length <= maxCount ? 25 : 0;
  breakdown.countAccuracy = {
    score: countScore,
    actual: items.length,
    range: [minCount, maxCount]
  };
  score += countScore;

  // 2. Task coverage (35 pts)
  if (expectedItems.length > 0) {
    const fullText = items
      .map((item) => `${item.task || ""} ${item.owner || ""}`.toLowerCase())
      .join(" ");

    const matchedExpected = expectedItems.filter((exp) => {
      const keywords = exp.taskKeywords || [];
      return keywords.some((kw) => fullText.includes(kw.toLowerCase()));
    });

    const taskCoverageScore = Math.round(
      (matchedExpected.length / expectedItems.length) * 35
    );
    breakdown.taskCoverage = {
      score: taskCoverageScore,
      matched: matchedExpected.length,
      total: expectedItems.length
    };
    score += taskCoverageScore;

    // 3. Owner accuracy (20 pts)
    let ownersCorrect = 0;
    for (const exp of expectedItems) {
      if (exp.expectedOwner) {
        // Find item with matching keywords
        const matchingItem = items.find((item) => {
          const keywords = exp.taskKeywords || [];
          return keywords.some((kw) =>
            (item.task || "").toLowerCase().includes(kw.toLowerCase())
          );
        });

        if (
          matchingItem &&
          matchingItem.owner &&
          matchingItem.owner.toLowerCase().includes(exp.expectedOwner.toLowerCase())
        ) {
          ownersCorrect++;
        }
      }
    }

    const itemsWithOwner = expectedItems.filter((e) => e.expectedOwner).length;
    const ownerScore = itemsWithOwner > 0
      ? Math.round((ownersCorrect / itemsWithOwner) * 20)
      : 20;

    breakdown.ownerAccuracy = {
      score: ownerScore,
      correct: ownersCorrect,
      total: itemsWithOwner
    };
    score += ownerScore;

    // 4. Priority accuracy (20 pts)
    let prioritiesCorrect = 0;
    for (const exp of expectedItems) {
      if (exp.expectedPriority) {
        const matchingItem = items.find((item) => {
          const keywords = exp.taskKeywords || [];
          return keywords.some((kw) =>
            (item.task || "").toLowerCase().includes(kw.toLowerCase())
          );
        });

        if (matchingItem && matchingItem.priority === exp.expectedPriority) {
          prioritiesCorrect++;
        }
      }
    }

    const itemsWithPriority = expectedItems.filter(
      (e) => e.expectedPriority
    ).length;
    const priorityScore = itemsWithPriority > 0
      ? Math.round((prioritiesCorrect / itemsWithPriority) * 20)
      : 20;

    breakdown.priorityAccuracy = {
      score: priorityScore,
      correct: prioritiesCorrect,
      total: itemsWithPriority
    };
    score += priorityScore;
  } else {
    // No expected items - if result is empty, full marks for all
    if (items.length === 0) {
      breakdown.taskCoverage = { score: 35, matched: 0, total: 0 };
      breakdown.ownerAccuracy = { score: 20, correct: 0, total: 0 };
      breakdown.priorityAccuracy = { score: 20, correct: 0, total: 0 };
      score += 35 + 20 + 20;
    }
  }

  return { score: Math.min(score, 100), breakdown };
}

/**
 * Score a reply against expected output.
 * Rubric:
 * - Addresses required topics (35 pts): % of mustAddress items reflected
 * - No forbidden content (15 pts): None of forbiddenContent appears
 * - Anti-mimicry (15 pts): Reply doesn't copy sender's distinctive greetings/sign-offs
 * - Tone match (15 pts): Simple heuristics based on toneToTest
 * - Length sanity (10 pts): Between 50 and 1000 chars
 * - Valid JSON parse (10 pts): Response was valid JSON with 'reply' key
 * Total: 100 pts
 */
function scoreReply(result, expected) {
  if (!result || typeof result !== "object") {
    return { score: 0, breakdown: { error: "Invalid result format" } };
  }

  const breakdown = {};
  let score = 0;

  const replyText = (result.reply || "").toLowerCase();

  // 1. Addresses required topics (35 pts)
  const mustAddress = expected.mustAddress || [];
  if (mustAddress.length > 0) {
    const addressedCount = mustAddress.filter((topic) =>
      replyText.includes(topic.toLowerCase())
    ).length;
    const addressScore = Math.round((addressedCount / mustAddress.length) * 35);
    breakdown.addressesTopics = {
      score: addressScore,
      addressed: addressedCount,
      total: mustAddress.length
    };
    score += addressScore;
  } else {
    breakdown.addressesTopics = { score: 35, addressed: 0, total: 0 };
    score += 35;
  }

  // 2. No forbidden content (15 pts)
  const forbidden = expected.forbiddenContent || [];
  const hasForbidden = forbidden.some((content) =>
    replyText.includes(content.toLowerCase())
  );
  const forbiddenScore = hasForbidden ? 0 : 15;
  breakdown.forbiddenContent = {
    score: forbiddenScore,
    hasForbidden
  };
  score += forbiddenScore;

  // 3. Anti-mimicry (15 pts): reply must not parrot the sender's greeting or sign-off
  const forbiddenGreetings = expected.forbiddenGreetings || [];
  if (forbiddenGreetings.length > 0) {
    const mimickedPhrases = forbiddenGreetings.filter((phrase) =>
      replyText.includes(phrase.toLowerCase())
    );
    const mimicryScore = mimickedPhrases.length === 0 ? 15 : 0;
    breakdown.antiMimicry = {
      score: mimicryScore,
      mimickedPhrases,
      tested: forbiddenGreetings.length
    };
    score += mimicryScore;
  } else {
    breakdown.antiMimicry = { score: 15, mimickedPhrases: [], tested: 0 };
    score += 15;
  }

  // 4. Tone match (15 pts)
  const tone = expected.toneToTest || "professional";
  let toneScore = 0;

  if (tone === "professional") {
    const hasSlang =
      replyText.includes("lol") ||
      replyText.includes("ur ") ||
      replyText.includes("u r ");
    const hasEmoji = /[\u{1F300}-\u{1F9FF}]/u.test(replyText);
    toneScore = !hasSlang && !hasEmoji ? 15 : 8;
  } else if (tone === "casual") {
    toneScore = 15;
  }

  breakdown.toneMatch = {
    score: toneScore,
    tone
  };
  score += toneScore;

  // 5. Length sanity (10 pts)
  const replyLength = replyText.length;
  const lengthScore =
    replyLength >= 50 && replyLength <= 1000 ? 10 : replyLength > 0 ? 5 : 0;
  breakdown.lengthSanity = {
    score: lengthScore,
    length: replyLength
  };
  score += lengthScore;

  // 6. Valid JSON parse (10 pts)
  const hasReplyKey = "reply" in result && typeof result.reply === "string";
  const jsonScore = hasReplyKey ? 10 : 0;
  breakdown.validJson = {
    score: jsonScore,
    hasReplyKey
  };
  score += jsonScore;

  return { score: Math.min(score, 100), breakdown };
}

/**
 * Main scoring dispatcher
 */
function scoreResult(operation, result, expected) {
  switch (operation.toLowerCase()) {
    case "summarize":
    case "summary":
      return scoreSummarize(result, expected);
    case "categorize":
    case "category":
      return scoreCategorize(result, expected);
    case "actionitems":
    case "action items":
      return scoreActionItems(result, expected);
    case "reply":
      return scoreReply(result, expected);
    default:
      return { score: 0, breakdown: { error: `Unknown operation: ${operation}` } };
  }
}

// Export for Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    scoreSummarize,
    scoreCategorize,
    scoreActionItems,
    scoreReply,
    scoreResult
  };
}
