/**
 * Prompt templates for various AI tasks.
 * Every prompt mandates a JSON-only response so parsing is deterministic.
 */

const SYSTEM_PERSONA = "You are a highly intelligent email assistant. You help the user understand, respond to, and manage their emails effectively.";
const JSON_MANDATE = "IMPORTANT: You MUST respond with valid JSON only. No markdown, no explanation, no text outside the JSON object.";

function buildSummaryPrompt(thread, currentUser = "Unknown") {
  const userContext = currentUser && currentUser !== "Unknown" ? `\nThe current user is: ${currentUser}` : "";
  return `${SYSTEM_PERSONA} Analyze this email thread and provide:

1. TL;DR: A one-sentence summary
2. Key Decisions: Main decisions mentioned or implied
3. Open Questions: Unresolved questions or ambiguities
4. Action Items: Concrete tasks that need to be done${userContext}

Email Thread:
${thread}

${JSON_MANDATE}
Respond in this exact JSON format:
{
  "tldr": "string",
  "keyDecisions": ["string"],
  "openQuestions": ["string"],
  "actionItems": ["string"]
}`;
}

function buildReplyPrompt(summary, tone = "professional", currentUser = "Unknown") {
  const toneGuidance = {
    professional: "formal and professional",
    casual: "friendly and conversational",
    brief: "concise and to the point",
    detailed: "thorough and detailed"
  };

  const userContext = currentUser && currentUser !== "Unknown" ? `You are drafting a reply on behalf of: ${currentUser}\n\n` : "";

  return `${userContext}${SYSTEM_PERSONA} Draft a reply to this email thread.

Thread Summary:
${summary}

Tone: ${toneGuidance[tone] || "professional"}

Guidelines:
- Address all questions or requests mentioned
- Be clear and actionable
- Keep it concise (2-3 paragraphs max)
- Match the conversation tone

${JSON_MANDATE}
Respond in this exact JSON format:
{
  "reply": "the full reply text here"
}`;
}

function buildCategoryPrompt(email) {
  return `${SYSTEM_PERSONA} Categorize this email into ONE of the following categories:
- Bug Report
- Request
- Update / FYI
- Meeting / Calendar
- Action Required
- Feedback
- Introduction / Networking
- Newsletter / Promotional
- Personal
- Other

Also provide a confidence score from 0-100.

Email:
${email}

${JSON_MANDATE}
Respond in this exact JSON format:
{
  "category": "string",
  "confidence": number
}`;
}

function buildActionPrompt(thread, currentUser = "Unknown") {
  const userContext = currentUser && currentUser !== "Unknown" ? `\nThe current user is: ${currentUser}` : "";
  return `${SYSTEM_PERSONA} Extract action items from this email thread. For each action item, provide:
- Task description
- Owner (person responsible, if mentioned)
- Priority (Low, Medium, High)${userContext}

Email Thread:
${thread}

${JSON_MANDATE}
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

function buildYourBrainPrompt(examples, summary) {
  return `${SYSTEM_PERSONA} You write in a specific user's style.

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

${JSON_MANDATE}
Respond in this exact JSON format:
{
  "reply": "the full reply text here"
}`;
}

function buildRefineReplyPrompt(originalReply, feedback, threadContext) {
  return `${SYSTEM_PERSONA} You previously drafted an email reply, and the user wants changes.

Original reply you drafted:
${originalReply}

User's feedback:
${feedback}

${threadContext ? `Original email thread for context:\n${threadContext}\n` : ""}
Rewrite the reply incorporating the user's feedback. Keep the same general intent but apply the requested changes.

${JSON_MANDATE}
Respond in this exact JSON format:
{
  "reply": "the full updated reply text here"
}`;
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
