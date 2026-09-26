const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * Calls the Claude API with a forced tool call so the response is guaranteed
 * to be the structured JSON we asked for, instead of freeform prose we'd
 * have to parse/regex out of a text reply.
 */
export async function generateWalkthrough({ apiKey, model, system, userPrompt, tool }) {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: userPrompt }],
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${body.slice(0, 500)}`);
  }

  const data = await res.json();
  const toolUse = data.content?.find((block) => block.type === "tool_use" && block.name === tool.name);
  if (!toolUse) {
    throw new Error("Claude did not return the expected tool_use block");
  }
  return toolUse.input;
}
