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

function buildSummaryPrompt(thread, metadata = {}) {
  const { currentUser = "Unknown", from, to, cc, subject, timestamp } = typeof metadata === "string"
    ? { currentUser: metadata }
    : metadata;

  const contextLines = [];
  if (subject && subject !== "No subject") contextLines.push(`Subject: ${subject}`);
  if (from) contextLines.push(`From: ${from}`);
  if (to && to.length) contextLines.push(`To: ${Array.isArray(to) ? to.join(", ") : to}`);
  if (cc && cc.length) contextLines.push(`Cc: ${Array.isArray(cc) ? cc.join(", ") : cc}`);
  if (currentUser && currentUser !== "Unknown") contextLines.push(`Current user: ${currentUser}`);
  if (timestamp) contextLines.push(`Date: ${timestamp}`);
  const contextBlock = contextLines.length > 0 ? `\n${contextLines.join("\n")}\n` : "";

  return `${SYSTEM_PERSONA} Analyze this email thread and provide:

1. Summary: 3-5 concise bullet points covering the most important information in the thread
2. Key Decisions: Main decisions mentioned or implied
3. Open Questions: Unresolved questions or ambiguities
4. Action Items: Concrete tasks that need to be done
${contextBlock}
Email Thread:
${thread}

${JSON_MANDATE}
Respond in this EXACT JSON structure — no other text:
{"summary":["string"],"keyDecisions":["string"],"openQuestions":["string"],"actionItems":["string"]}`;
}

function buildReplyPrompt(structuredThread, tone = "professional", metadata = {}) {
  const toneGuidance = {
    professional: "formal and professional",
    casual: "friendly and conversational",
    brief: "concise and to the point",
    detailed: "thorough and detailed"
  };

  const { currentUser = "Unknown", from = "Unknown", subject = "No subject", isFollowup = false } = metadata;

  let framingText;
  let guidelines;

  if (isFollowup) {
    framingText = `${SYSTEM_PERSONA} The last message in this thread is yours and it has not received a response yet. Draft a NEW follow-up email that is substantially different from your last message.`;
    guidelines = `- Do NOT repeat or rephrase your last message — the recipient already has it
- Acknowledge that time has passed since your last email (e.g. "Just following up on my earlier email…")
- Add gentle urgency or a specific ask to prompt a response
- Optionally suggest a next step, deadline, or alternative if no reply comes
- Keep it short — 2-4 sentences max
- Match the user's greeting and sign-off style from their earlier messages`;
  } else {
    framingText = `${SYSTEM_PERSONA} You are writing as ${currentUser}. You are replying to an email from ${from}.`;
    guidelines = `- Address all questions or requests mentioned
- Be clear and actionable
- Keep it concise (2-3 paragraphs max)
- Match the conversation tone`;
  }

  return `${framingText}

IMPORTANT: Write as the USER — adopt THEIR greeting style, sign-off, and phrasing (visible in their messages marked "(You)"). Do NOT mimic the other party's tone, greetings, or formality level.

Email Subject: ${subject}

Email Thread:
${structuredThread}

Tone: ${toneGuidance[tone] || "professional"}

Guidelines:
${guidelines}

${JSON_MANDATE}
Respond in this EXACT JSON structure — no other text:
{"reply":"the full reply text here"}`;
}

function buildCategoryPrompt(email, metadata = {}) {
  const { subject, from, to, cc } = typeof metadata === "string" ? {} : metadata;
  const contextLines = [];
  if (subject && subject !== "No subject") contextLines.push(`Subject: ${subject}`);
  if (from) contextLines.push(`From: ${from}`);
  if (to && to.length) contextLines.push(`To: ${Array.isArray(to) ? to.join(", ") : to}`);
  if (cc && cc.length) contextLines.push(`Cc: ${Array.isArray(cc) ? cc.join(", ") : cc}`);
  const contextBlock = contextLines.length > 0 ? `\n${contextLines.join("\n")}\n` : "";

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
${contextBlock}
Email:
${email}

${JSON_MANDATE}
Respond in this EXACT JSON structure — no other text:
{"category":"string","confidence":number}`;
}

function buildActionPrompt(thread, metadata = {}) {
  const { currentUser = "Unknown", from, to, cc, subject } = typeof metadata === "string"
    ? { currentUser: metadata }
    : metadata;

  const contextLines = [];
  if (subject && subject !== "No subject") contextLines.push(`Subject: ${subject}`);
  if (from) contextLines.push(`From: ${from}`);
  if (to && to.length) contextLines.push(`To: ${Array.isArray(to) ? to.join(", ") : to}`);
  if (cc && cc.length) contextLines.push(`Cc: ${Array.isArray(cc) ? cc.join(", ") : cc}`);
  if (currentUser && currentUser !== "Unknown") contextLines.push(`Current user: ${currentUser}`);
  const contextBlock = contextLines.length > 0 ? `\n${contextLines.join("\n")}\n` : "";

  return `${SYSTEM_PERSONA} Extract action items from this email thread. For each action item, provide:
- Task description
- Owner (person responsible, if mentioned)
- Priority (Low, Medium, High)
${contextBlock}
Email Thread:
${thread}

${JSON_MANDATE}
Respond in this EXACT JSON structure — no other text:
{"actionItems":[{"task":"string","owner":"string or null","priority":"Low|Medium|High"}]}`;
}

function buildYourBrainPrompt(examples, structuredThread, metadata = {}) {
  const { currentUser = "Unknown", from = "Unknown", subject = "No subject", isFollowup = false } = metadata;

  let framingText;
  let guidelines;

  if (isFollowup) {
    framingText = `${SYSTEM_PERSONA} You write in a specific user's style. The last message in this thread is yours and it has not received a response yet. Draft a NEW follow-up email that is substantially different from your last message.`;
    guidelines = `- Do NOT repeat or rephrase your last message — the recipient already has it
- Acknowledge that time has passed since your last email
- Add gentle urgency or a specific ask to prompt a response
- Optionally suggest a next step, deadline, or alternative if no reply comes
- Keep it short — 2-4 sentences max
- Maintain the user's characteristic writing style, vocabulary, and tone from the examples
- If style corrections are provided, follow the patterns shown in the "Preferred" versions`;
  } else {
    framingText = `${SYSTEM_PERSONA} You write in a specific user's style. You are writing as ${currentUser}. You are replying to an email from ${from}.`;
    guidelines = `- Maintain the user's characteristic writing style
- Use similar vocabulary and tone
- Keep sentence length and structure consistent
- Match their level of formality
- If style corrections are provided, follow the patterns shown in the "Preferred" versions`;
  }

  return `${framingText}

IMPORTANT: Write as the USER — adopt THEIR greeting style, sign-off, and phrasing from the examples below. Do NOT mimic the other party's tone, greetings, or formality level.

Below are examples of the user's writing. "Writing samples" are real emails they wrote. "Style corrections" show cases where they revised an AI draft — always prefer the "Preferred" version as the target style.

${examples}

Email Subject: ${subject}

Current email thread to reply to:
${structuredThread}

Guidelines:
${guidelines}

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
