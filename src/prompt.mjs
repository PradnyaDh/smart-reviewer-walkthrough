export const WALKTHROUGH_TOOL = {
  name: "submit_walkthrough",
  description: "Submit the structured PR review walkthrough.",
  input_schema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description:
          "Exactly 3 sentences, plain English, no jargon. Sentence 1: what changed. Sentence 2: why (the intent/motivation visible from the diff). Sentence 3: the biggest thing a reviewer should keep in mind.",
      },
      mermaid_diagram: {
        type: "string",
        description:
          "A single Mermaid 'flowchart TD' diagram (code only, no ``` fences) showing how data flows through the changed code: entry points, the functions/modules touched, and where it terminates (DB write, API response, queue publish, etc). Max ~15 nodes. Use short node labels.",
      },
      focus_points: {
        type: "array",
        maxItems: 3,
        description:
          "Up to 3 highest-risk lines in this diff, ranked most severe first. Only include real, specific risks visible in the diff — do not pad to 3 if fewer exist.",
        items: {
          type: "object",
          properties: {
            file: { type: "string", description: "Repo-relative file path exactly as it appears in the diff." },
            line: { type: "integer", description: "Line number in the NEW version of the file." },
            risk_type: {
              type: "string",
              enum: ["race_condition", "null_undefined", "unhandled_error", "resource_leak", "other"],
            },
            reason: {
              type: "string",
              description: "One or two sentences: the concrete failure scenario (what input/timing triggers it, what breaks).",
            },
          },
          required: ["file", "line", "risk_type", "reason"],
        },
      },
    },
    required: ["summary", "mermaid_diagram", "focus_points"],
  },
};

export function buildSystemPrompt() {
  return `You are an expert code reviewer generating a "Smart Reviewer Walkthrough" — a fast-orientation aid posted as the first comment on a pull request. Your reader has 60 seconds before deciding how deep to read.

Rules:
- Base every claim strictly on the diff provided. Never invent files, functions, or behavior not shown.
- The summary must be exactly 3 sentences and avoid jargon a non-specialist engineer wouldn't know.
- The Mermaid diagram must be valid 'flowchart TD' syntax and reflect only the actual data flow touched by this diff, not the whole system.
- focus_points must call out genuine race-condition, null/undefined, unhandled-error, or resource-leak risks — concrete ones, not generic reminders like "add tests" or "consider edge cases". If the diff has no such risks, return an empty array.
- Always respond by calling the submit_walkthrough tool. Do not respond in plain text.`;
}

export function buildUserPrompt({ prTitle, prBody, diffText, truncated, omittedFiles }) {
  const parts = [
    `PR title: ${prTitle || "(none)"}`,
    prBody ? `PR description:\n${prBody}` : "PR description: (none)",
    "",
    "Diff (unified format, grouped by file):",
    "```diff",
    diffText,
    "```",
  ];
  if (truncated) {
    parts.push(
      "",
      `NOTE: This diff was truncated to fit context limits. ${omittedFiles.length} file(s) were omitted entirely: ${omittedFiles.join(", ")}. Do not claim coverage of omitted files.`
    );
  }
  return parts.join("\n");
}
