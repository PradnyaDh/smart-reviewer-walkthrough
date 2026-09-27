import { buildDiffText } from "./diff.mjs";
import { buildSystemPrompt, buildUserPrompt, WALKTHROUGH_TOOL } from "./prompt.mjs";
import { generateWalkthrough } from "./claude.mjs";
import { formatComment, COMMENT_MARKER } from "./format.mjs";
import { upsertComment } from "./github.mjs";
import { loadRepoContext } from "./context.mjs";
import { evaluateRisk } from "./router.mjs";

/**
 * Shared orchestration: loads Team Memory (Layer 1), runs Analysis Swarm (Layer 2),
 * and evaluates Risk Router & Gate (Layer 3).
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

  log(`Diff built from ${fileCount} file(s)${truncated ? ` (${omittedFiles.length} omitted for size)` : ""}.`);

  // Fetch PR files & stats for Layer 3 (Risk Router)
  let changedFiles = [];
  let additions = 0;
  let deletions = 0;
  try {
    const { data: files } = await octokit.rest.pulls.listFiles({ owner, repo, pull_number: pullNumber });
    changedFiles = files.map((f) => f.filename);
    additions = files.reduce((acc, f) => acc + (f.additions || 0), 0);
    deletions = files.reduce((acc, f) => acc + (f.deletions || 0), 0);
  } catch (err) {
    log(`Note: could not list files (${err.message})`);
  }

  // 1. LAYER 3: Deterministic Risk Gate
  const riskEvaluation = evaluateRisk({
    changedFiles,
    totalAdditions: additions,
    totalDeletions: deletions,
  });
  log(`Layer 3 (Risk Gate): ${riskEvaluation.riskLevel} Risk -> ${riskEvaluation.recommendation}`);

  // 2. LAYER 1: Team Memory Context
  const teamMemory = await loadRepoContext({
    owner,
    repo,
    changedFiles,
    octokit,
  });
  if (teamMemory.filesLoaded?.length > 0) {
    log(`Layer 1 (Team Memory): Loaded ${teamMemory.filesLoaded.join(", ")}`);
  }

  // Repository Metadata for EM Context
  let repoInfo = null;
  try {
    const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
    repoInfo = {
      fullName: repoData.full_name,
      description: repoData.description,
      language: repoData.language,
      topics: repoData.topics,
    };
  } catch (err) {
    log(`Note: could not fetch repo metadata (${err.message})`);
  }

  // 3. LAYER 2: Analysis Swarm
  log(`Layer 2 (Analysis Swarm): Calling model ${model}...`);
  const walkthrough = await generateWalkthrough({
    apiKey: anthropicApiKey,
    baseUrl: anthropicBaseUrl,
    cfAccessClientId,
    cfAccessClientSecret,
    model,
    system: buildSystemPrompt(),
    userPrompt: buildUserPrompt({
      repoInfo,
      teamMemory,
      riskEvaluation,
      prTitle,
      prBody,
      diffText,
      truncated,
      omittedFiles,
    }),
    tool: WALKTHROUGH_TOOL,
  });

  const body = formatComment({
    walkthrough,
    model,
    riskEvaluation,
    teamMemory,
    truncated,
    omittedFiles,
  });

  let posted = null;
  if (post) {
    posted = await upsertComment(octokit, { owner, repo, pullNumber, body, marker: COMMENT_MARKER });
    log(`Comment ${posted.action} (id ${posted.commentId}).`);
  }

  return { body, walkthrough, riskEvaluation, teamMemory, truncated, omittedFiles, posted };
}
