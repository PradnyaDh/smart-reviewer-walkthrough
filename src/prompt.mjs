// src/prompt.mjs
//
// Layer 2: Analysis Swarm & Prompt Specification.
// Defines the structured review tool schema and prompt generation incorporating
// Team Memory (Layer 1) and Risk Routing (Layer 3).

export const WALKTHROUGH_TOOL = {
  name: "submit_review",
  description: "Submit a structured PR review walkthrough, risk assessment, and verification list. Always call this tool.",
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
          "A single Mermaid 'flowchart TD' diagram (code only, no ``` fences) showing how data flows through the changed code: entry points, the functions/modules touched, and where it terminates (DB write, API response, queue publish, etc). Max ~15 nodes. Use short node labels. IMPORTANT: Always wrap node text in double quotes if it contains parentheses, colons, or punctuation (e.g. A[\"Scheduler: fetch()\"] or B{\"Check: isEnabled?\"}) so GitHub's Mermaid renderer does not fail.",
      },
      blocking: {
        type: "array",
        description: "Issues that should block merge: race conditions, null/undefined crashes, unhandled errors, security vulnerabilities, or violations of team rules in the supplied repo context. Empty array if none.",
        items: {
          type: "object",
          required: ["file", "line", "issue"],
          properties: {
            file: { type: "string", description: "Repo-relative file path." },
            line: { type: "integer", description: "Line number in the NEW version of the file." },
            issue: { type: "string", description: "Specific, concrete failure scenario." },
          },
        },
      },
      should_fix: {
        type: "array",
        description: "Real issues or code smells that do not strictly block merge but should be addressed before production release.",
        items: {
          type: "object",
          required: ["file", "line", "issue"],
          properties: {
            file: { type: "string", description: "Repo-relative file path." },
            line: { type: "integer", description: "Line number in the NEW version of the file." },
            issue: { type: "string", description: "Specific suggestion and rationale." },
          },
        },
      },
      nice_to_have: {
        type: "array",
        description: "Optional minor polish suggestions or style nits. Keep this short.",
        items: { type: "string" },
      },
      verified: {
        type: "array",
        description:
          "What you checked and confirmed safe (e.g. 'error handling on the new API call', 'database connection timeout configured', 'thread safety of the cache store'). This tells the human reviewer what they can skip re-checking.",
        items: { type: "string" },
      },
      suggested_rules: {
        type: "array",
        description:
          "Optional compounding loop: if you noticed a recurring anti-pattern or convention worth remembering for future PRs, suggest a 1-sentence bullet to add to AGENTS.md or pr-rules.",
        items: {
          type: "object",
          required: ["rules_file", "bullet"],
          properties: {
            rules_file: { type: "string", description: "Target file, e.g. 'AGENTS.md' or '.claude/pr-rules/common.md'." },
            bullet: { type: "string", description: "1-sentence imperative rule." },
          },
        },
      },
    },
    required: ["repo_context", "summary", "mermaid_diagram", "blocking", "should_fix", "nice_to_have", "verified"],
  },
};

export function buildSystemPrompt() {
  return `You are an expert senior code reviewer generating a "Smart Reviewer Walkthrough" — a structured orientation aid for an Engineering Manager (EM) who has 60 seconds to understand the PR, assess blast radius, and identify operational risks without being deeply familiar with the codebase.

Rules:
- Provide an accurate, high-level architectural orientation in repo_context: describe the service's role, its tier, and the operational blast radius for an EM.
- Respect Team Memory rules supplied in the prompt: if the diff violates any rule from AGENTS.md or pr-rules, flag it under 'blocking'.
- Base every code claim strictly on the diff provided. Never invent files, functions, or behavior not shown.
- The summary must be exactly 3 sentences and avoid jargon a non-specialist engineer wouldn't know.
- The Mermaid diagram must be valid 'flowchart TD' syntax. Always wrap node labels in double quotes if they contain parentheses, colons, or punctuation (e.g. A["task()"]).
- 'verified' is high-value: explicitly list what was checked and found clean so the human reviewer knows what they can skip.
- If a new convention or anti-pattern is spotted, propose a candidate rule in 'suggested_rules' to close the compounding team learning loop.
- Always respond by calling the submit_review tool. Do not respond in plain text.`;
}

export function buildUserPrompt({ repoInfo, teamMemory, riskEvaluation, prTitle, prBody, diffText, truncated, omittedFiles }) {
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

  if (teamMemory && teamMemory.text) {
    parts.push(
      "================================================================================",
      "### Codebase Team Memory & Rules (from AGENTS.md / CLAUDE.md)",
      "================================================================================",
      teamMemory.text,
      ""
    );
  }

  if (riskEvaluation) {
    parts.push(
      `Risk Gate: ${riskEvaluation.riskLevel} Risk | Recommendation: ${riskEvaluation.recommendation}`,
      riskEvaluation.reasons?.length ? `Triggers: ${riskEvaluation.reasons.join("; ")}` : "",
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
