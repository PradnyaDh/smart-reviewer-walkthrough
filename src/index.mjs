import * as core from "@actions/core";
import * as github from "@actions/github";
import { buildDiffText } from "./diff.mjs";
import { buildSystemPrompt, buildUserPrompt, WALKTHROUGH_TOOL } from "./prompt.mjs";
import { generateWalkthrough } from "./claude.mjs";
import { formatComment, COMMENT_MARKER } from "./format.mjs";

async function upsertComment(octokit, { owner, repo, pullNumber, body }) {
  const existing = await octokit.paginate(octokit.rest.issues.listComments, {
    owner,
    repo,
    issue_number: pullNumber,
    per_page: 100,
  });

  const previous = existing.find((c) => c.body?.includes(COMMENT_MARKER));

  if (previous) {
    await octokit.rest.issues.updateComment({ owner, repo, comment_id: previous.id, body });
    core.info(`Updated existing walkthrough comment (id ${previous.id}).`);
  } else {
    await octokit.rest.issues.createComment({ owner, repo, issue_number: pullNumber, body });
    core.info("Created new walkthrough comment.");
  }
}

async function run() {
  const githubToken = core.getInput("github-token", { required: true });
  const anthropicApiKey = core.getInput("anthropic-api-key", { required: true });
  const model = core.getInput("model") || "claude-sonnet-5";
  const maxDiffChars = parseInt(core.getInput("max-diff-chars") || "60000", 10);

  const context = github.context;
  const pr = context.payload.pull_request;
  if (!pr) {
    core.setFailed("This action must be triggered by a pull_request event.");
    return;
  }

  const octokit = github.getOctokit(githubToken);
  const { owner, repo } = context.repo;
  const pullNumber = pr.number;

  core.info(`Building diff for ${owner}/${repo}#${pullNumber}...`);
  const { diffText, truncated, omittedFiles, fileCount } = await buildDiffText(octokit, {
    owner,
    repo,
    pullNumber,
    maxChars: maxDiffChars,
  });

  if (!diffText.trim()) {
    core.info("No textual diff to review (binary-only or empty PR) — skipping.");
    return;
  }

  core.info(`Diff built from ${fileCount} file(s)${truncated ? ` (${omittedFiles.length} omitted for size)` : ""}. Calling Claude...`);

  const walkthrough = await generateWalkthrough({
    apiKey: anthropicApiKey,
    model,
    system: buildSystemPrompt(),
    userPrompt: buildUserPrompt({
      prTitle: pr.title,
      prBody: pr.body,
      diffText,
      truncated,
      omittedFiles,
    }),
    tool: WALKTHROUGH_TOOL,
  });

  const body = formatComment({ walkthrough, model, truncated, omittedFiles });

  await upsertComment(octokit, { owner, repo, pullNumber, body });
}

run().catch((err) => {
  core.setFailed(err instanceof Error ? err.message : String(err));
});
