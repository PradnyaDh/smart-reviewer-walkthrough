export const WALKTHROUGH_TOOL = {
  name: "submit_walkthrough",
  description: "Submit the structured PR review walkthrough.",
  input_schema: {
    type: "object",
    properties: {
      repo_context: {
        type: "object",
        description: "High-level architectural context for an Engineering Manager who is not deeply familiar with this repository.",
        properties: {
          architectural_role: {
            type: "string",
            description: "1-2 sentences: What this service/repository does, its tier/domain in the platform, and its key dependencies (e.g. databases, S3, Kafka, external APIs).",
          },
          em_strategic_lens: {
            type: "string",
            description: "2 sentences: The high-level blast radius of changes here (e.g. checkout conversion, fee calculation, rider dispatch), whether it appears gated by flags/regions, and key operational verification questions for an EM.",
          },
        },
        required: ["architectural_role", "em_strategic_lens"],
      },
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
    required: ["repo_context", "summary", "mermaid_diagram", "focus_points"],
  },
};

export function buildSystemPrompt() {
  return `You are an expert code reviewer generating a "Smart Reviewer Walkthrough" — a fast-orientation aid designed for an Engineering Manager (EM) who has 60 seconds to understand the pull request and evaluate operational risk without being deeply familiar with the codebase.

Rules:
- Provide an accurate, high-level architectural orientation in repo_context: describe the service's role, its position in the delivery platform, and the blast radius / operational risk lens for an EM.
- Base every code claim strictly on the diff provided. Never invent files, functions, or behavior not shown.
- The summary must be exactly 3 sentences and avoid jargon a non-specialist engineer wouldn't know.
- The Mermaid diagram must be valid 'flowchart TD' syntax and reflect only the actual data flow touched by this diff, not the whole system.
- focus_points must call out genuine race-condition, null/undefined, unhandled-error, or resource-leak risks — concrete ones, not generic reminders like "add tests" or "consider edge cases". If the diff has no such risks, return an empty array.
- Always respond by calling the submit_walkthrough tool. Do not respond in plain text.`;
}

export function buildUserPrompt({ repoInfo, prTitle, prBody, diffText, truncated, omittedFiles }) {
  const parts = [];

  if (repoInfo) {
    parts.push(
      `Repository: ${repoInfo.fullName || "(unknown)"}`,
      repoInfo.description ? `Repository Description: ${repoInfo.description}` : "",
      repoInfo.language ? `Primary Language: ${repoInfo.language}` : "",
      repoInfo.topics?.length ? `Topics: ${repoInfo.topics.join(", ")}` : "",
      ""
    );
  }

  parts.push(
    `PR title: ${prTitle || "(none)"}`,
    prBody ? `PR description:\n${prBody}` : "PR description: (none)",
    "",
    "Diff (unified format, grouped by file):",
    "```diff",
    diffText,
    "```"
  );

  if (truncated) {
    parts.push(
      "",
      `NOTE: This diff was truncated to fit context limits. ${omittedFiles.length} file(s) were omitted entirely: ${omittedFiles.join(", ")}. Do not claim coverage of omitted files.`
    );
  }

  return parts.filter(Boolean).join("\n");
}
