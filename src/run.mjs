import { buildDiffText } from "./diff.mjs";
import { buildSystemPrompt, buildUserPrompt, WALKTHROUGH_TOOL } from "./prompt.mjs";
import { generateWalkthrough } from "./claude.mjs";
import { formatComment, COMMENT_MARKER } from "./format.mjs";
import { upsertComment } from "./github.mjs";

/**
 * Shared orchestration used by both the GitHub Action entrypoint (src/index.mjs)
 * and the local CLI (scripts/cli.mjs): build the diff, call the model, format
 * the comment, and optionally post it. `post: false` makes this a pure dry run —
 * no GitHub write calls at all.
 */
export async function generateAndMaybePost({
  octokit,
  owner,
  repo,
  pullNumber,
  prTitle,
  prBody,
  anthropicApiKey,
  anthropicBaseUrl,
  cfAccessClientId,
  cfAccessClientSecret,
  model,
  maxDiffChars,
  post,
  log = () => {},
}) {
  log(`Building diff for ${owner}/${repo}#${pullNumber}...`);
  const { diffText, truncated, omittedFiles, fileCount } = await buildDiffText(octokit, {
    owner,
    repo,
    pullNumber,
    maxChars: maxDiffChars,
  });

  if (!diffText.trim()) {
    log("No textual diff to review (binary-only or empty PR) — skipping.");
    return null;
  }

  log(`Diff built from ${fileCount} file(s)${truncated ? ` (${omittedFiles.length} omitted for size)` : ""}. Calling model...`);

  const walkthrough = await generateWalkthrough({
    apiKey: anthropicApiKey,
    baseUrl: anthropicBaseUrl,
    cfAccessClientId,
    cfAccessClientSecret,
    model,
    system: buildSystemPrompt(),
    userPrompt: buildUserPrompt({ prTitle, prBody, diffText, truncated, omittedFiles }),
    tool: WALKTHROUGH_TOOL,
  });

  const body = formatComment({ walkthrough, model, truncated, omittedFiles });

  let posted = null;
  if (post) {
    posted = await upsertComment(octokit, { owner, repo, pullNumber, body, marker: COMMENT_MARKER });
    log(`Comment ${posted.action} (id ${posted.commentId}).`);
  }

  return { body, walkthrough, truncated, omittedFiles, posted };
}
