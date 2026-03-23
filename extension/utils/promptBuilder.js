/**
 * Prompt templates for various AI tasks
 */

function buildSummaryPrompt(thread) {
  return `You are a product manager assistant. Analyze this email thread and provide:

1. TL;DR: A one-sentence summary
2. Key Decisions: Main decisions mentioned or implied
3. Open Questions: Unresolved questions or ambiguities
4. Action Items: Concrete tasks that need to be done

Email Thread:
${thread}

Respond in this exact JSON format:
{
  "tldr": "string",
  "keyDecisions": ["string"],
  "openQuestions": ["string"],
  "actionItems": ["string"]
}`;
}

function buildReplyPrompt(summary, tone = "professional") {
  const toneGuidance = {
    professional: "formal and professional",
    casual: "friendly and conversational",
    brief: "concise and to the point",
    detailed: "thorough and detailed"
  };

  return `You are a product manager assistant. Draft a reply to this email thread.

Thread Summary:
${summary}

Tone: ${toneGuidance[tone] || "professional"}

Guidelines:
- Address all questions or requests mentioned
- Be clear and actionable
- Keep it concise (2-3 paragraphs max)
- Match the conversation tone

Provide only the reply text, no other formatting.`;
}

function buildCategoryPrompt(email) {
  return `Categorize this email into ONE of the following categories:
- Bug Report
- Vendor Query
- Pricing
- Onboarding
- Internal Update
- Meeting/Calendar
- Action Required
- FYI
- Other

Also provide a confidence score from 0-100.

Email:
${email}

Respond in this exact JSON format:
{
  "category": "string",
  "confidence": number
}`;
}

function buildActionPrompt(thread) {
  return `Extract action items from this email thread. For each action item, provide:
- Task description
- Owner (person responsible, if mentioned)
- Priority (Low, Medium, High)

Email Thread:
${thread}

Respond in this exact JSON format:
{
  "actionItems": [
    {
      "task": "string",
      "owner": "string or null",
      "priority": "Low" | "Medium" | "High"
    }
  ]
}`;
}

function buildPMBrainPrompt(examples, summary) {
  return `You are a product manager assistant that writes in a specific user's style.

Examples of the user's past email writing:
${examples}

Now draft a reply in the SAME tone and style as above. Match their personality, sentence structure, and level of formality.

Current email thread summary to reply to:
${summary}

Guidelines:
- Maintain the user's characteristic writing style
- Use similar vocabulary and tone
- Keep sentence length and structure consistent
- Match their level of formality

Provide only the reply text, no other formatting.`;
}

function buildRefineReplyPrompt(originalReply, feedback, threadContext) {
  return `You are a product manager assistant. You previously drafted an email reply, and the user wants changes.

Original reply you drafted:
${originalReply}

User's feedback:
${feedback}

${threadContext ? `Original email thread for context:\n${threadContext}\n` : ""}
Rewrite the reply incorporating the user's feedback. Keep the same general intent but apply the requested changes.

Provide only the updated reply text, no other formatting or explanation.`;
}

/**
 * Parse JSON from model response with error handling
 * @param {string} response - Raw model response
 * @returns {object} Parsed JSON object
 */
function parseJsonResponse(response) {
  try {
    // Try to extract JSON from response (in case model adds extra text)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(response);
  } catch (error) {
    console.error("Failed to parse JSON response:", error);
    return null;
  }
}
