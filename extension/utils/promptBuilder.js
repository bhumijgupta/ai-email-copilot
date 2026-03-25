/**
 * Prompt templates for various AI tasks.
 * Every prompt mandates a JSON-only response so parsing is deterministic.
 */

const SYSTEM_PERSONA = "You are a highly intelligent email assistant. You help the user understand, respond to, and manage their emails effectively.";
const JSON_MANDATE = `CRITICAL OUTPUT RULES — FOLLOW EXACTLY:
1. Your ENTIRE response must be a single valid JSON object. Nothing else.
2. No markdown fences, no backticks, no explanatory text before or after the JSON.
3. Every opened { must have a matching }. Every opened [ must have a matching ].
4. All string values must be properly quoted and escaped.
5. No trailing commas after the last item in an object or array.
6. Before responding, mentally validate that your JSON is complete and parseable.
7. If in doubt, keep values shorter rather than risk truncation.`;

function buildSummaryPrompt(thread, currentUser = "Unknown") {
  const userContext = currentUser && currentUser !== "Unknown" ? `\nThe current user is: ${currentUser}` : "";
  return `${SYSTEM_PERSONA} Analyze this email thread and provide:

1. Summary: 3-5 concise bullet points covering the most important information in the thread
2. Key Decisions: Main decisions mentioned or implied
3. Open Questions: Unresolved questions or ambiguities
4. Action Items: Concrete tasks that need to be done${userContext}

Email Thread:
${thread}

${JSON_MANDATE}
Respond in this EXACT JSON structure — no other text:
{"summary":["string"],"keyDecisions":["string"],"openQuestions":["string"],"actionItems":["string"]}`;
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
Respond in this EXACT JSON structure — no other text:
{"reply":"the full reply text here"}`;
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
Respond in this EXACT JSON structure — no other text:
{"category":"string","confidence":number}`;
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
Respond in this EXACT JSON structure — no other text:
{"actionItems":[{"task":"string","owner":"string or null","priority":"Low|Medium|High"}]}`;
}

function buildYourBrainPrompt(examples, summary) {
  return `${SYSTEM_PERSONA} You write in a specific user's style.

Below are examples of the user's writing. "Writing samples" are real emails they wrote. "Style corrections" show cases where they revised an AI draft — always prefer the "Preferred" version as the target style.

${examples}

Now draft a reply in the SAME tone and style as the user. Match their personality, sentence structure, and level of formality.

Current email thread to reply to:
${summary}

Guidelines:
- Maintain the user's characteristic writing style
- Use similar vocabulary and tone
- Keep sentence length and structure consistent
- Match their level of formality
- If style corrections are provided, follow the patterns shown in the "Preferred" versions

${JSON_MANDATE}
Respond in this EXACT JSON structure — no other text:
{"reply":"the full reply text here"}`;
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
Respond in this EXACT JSON structure — no other text:
{"reply":"the full updated reply text here"}`;
}

/**
 * Parse JSON from model response.
 * Strips markdown fences and surrounding prose, then finds the first
 * balanced top-level JSON object via brace-counting (not a greedy regex).
 */
function parseJsonResponse(response) {
  if (!response || typeof response !== "string") return null;

  let text = response.trim();

  // Strip markdown fences (```json ... ```)
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

  // Fast path: response is already clean JSON
  try { return JSON.parse(text); } catch (_) {}

  // Find the first balanced { ... } in the string
  const start = text.indexOf("{");
  if (start === -1) {
    console.debug("[AI Copilot] No JSON object found in response:", text.substring(0, 200));
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped)           { escaped = false; continue; }
    if (ch === "\\")       { escaped = true;  continue; }
    if (ch === '"')        { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (depth === 0) {
      try {
        return JSON.parse(text.substring(start, i + 1));
      } catch (err) {
        console.debug("[AI Copilot] Found balanced braces but JSON invalid:", err.message);
        return null;
      }
    }
  }

  console.debug("[AI Copilot] Unbalanced JSON in response:", text.substring(0, 200));
  return null;
}
