const DEFAULT_MAX_DIFF_CHARS = 60_000;

/**
 * Fetches per-file patches for a PR and concatenates them into one
 * unified-diff-style text block, capped at maxChars so a 500-file PR
 * can't blow the model's context (or the API bill).
 */
export async function buildDiffText(octokit, { owner, repo, pullNumber, maxChars = DEFAULT_MAX_DIFF_CHARS }) {
  const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number: pullNumber,
    per_page: 100,
  });

  let diffText = "";
  const omittedFiles = [];

  for (const file of files) {
    if (!file.patch) {
      // Binary files, or files GitHub itself won't diff (too large) — skip, note it.
      omittedFiles.push(`${file.filename} (no textual diff available)`);
      continue;
    }
    const chunk = `--- a/${file.filename}\n+++ b/${file.filename}\n${file.patch}\n`;
    if (diffText.length + chunk.length > maxChars) {
      omittedFiles.push(file.filename);
      continue;
    }
    diffText += chunk;
  }

  return {
    diffText,
    truncated: omittedFiles.length > 0,
    omittedFiles,
    fileCount: files.length,
  };
}
