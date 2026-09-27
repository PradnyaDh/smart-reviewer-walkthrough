const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com";
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * Calls the Claude API (or an Anthropic-compatible internal gateway) with a
 * forced tool call so the response is guaranteed to be the structured JSON
 * we asked for, instead of freeform prose we'd have to parse/regex out of a
 * text reply.
 *
 * baseUrl/cfAccessClientId/cfAccessClientSecret let this point at a proxy
 * (e.g. a LiteLLM gateway behind Cloudflare Access) instead of the public
 * Anthropic API, without changing the request shape.
 */
export async function generateWalkthrough({
  apiKey,
  baseUrl = DEFAULT_ANTHROPIC_BASE_URL,
  cfAccessClientId,
  cfAccessClientSecret,
  model,
  system,
  userPrompt,
  tool,
}) {
  const headers = {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
  };
  if (cfAccessClientId && cfAccessClientSecret) {
    headers["CF-Access-Client-Id"] = cfAccessClientId;
    headers["CF-Access-Client-Secret"] = cfAccessClientSecret;
  }

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      system,
      messages: [{ role: "user", content: userPrompt }],
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic-compatible API error ${res.status} (${baseUrl}): ${body.slice(0, 500)}`);
  }

  const data = await res.json();
  if (!data.content || data.content.length === 0) {
    console.error("RAW LITELLM RESPONSE:", JSON.stringify(data, null, 2));
  }
  const toolUse = data.content?.find((block) => block.type === "tool_use" && block.name === tool.name);
  if (toolUse && toolUse.input) {
    return toolUse.input;
  }

  // Fallback 1: Any tool_use block
  const anyTool = data.content?.find((block) => block.type === "tool_use");
  if (anyTool && anyTool.input) {
    return anyTool.input;
  }

  // Fallback 2: Parse text block if model returned JSON
  const textBlock = data.content?.find((block) => block.type === "text")?.text;
  if (textBlock) {
    try {
      const cleaned = textBlock.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
      return JSON.parse(cleaned);
    } catch {}
  }

  throw new Error(`Model did not return the expected tool_use block: ${JSON.stringify(data.content)}`);
}
