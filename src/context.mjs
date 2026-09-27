// src/context.mjs
//
// Loads team-memory context (AGENTS.md / CLAUDE.md / .claude/pr-rules/*.md)
// from the target repo via the GitHub Contents API, scoped to the paths the
// PR actually touches. No local checkout required.

const MAX_CONTEXT_CHARS = 20_000;

export async function loadRepoContext({ owner, repo, ref, changedFiles = [], githubToken, octokit }) {
  const candidatePaths = buildCandidatePaths(changedFiles);
  const loaded = [];

  for (const path of candidatePaths) {
    const content = await fetchFileIfExists({ owner, repo, ref, path, githubToken, octokit });
    if (content) loaded.push({ path, content });
  }

  if (loaded.length === 0) {
    return { text: '', filesLoaded: [], truncated: false };
  }

  let text = loaded
    .map(({ path, content }) => `### ${path}\n\n${content.trim()}`)
    .join('\n\n---\n\n');

  let truncated = false;
  if (text.length > MAX_CONTEXT_CHARS) {
    text = text.slice(0, MAX_CONTEXT_CHARS) + '\n\n[...team-memory context truncated...]';
    truncated = true;
  }

  return { text, filesLoaded: loaded.map((f) => f.path), truncated };
}

function buildCandidatePaths(changedFiles) {
  const topLevelDirs = new Set();
  for (const file of changedFiles) {
    const segment = file.split('/')[0];
    if (file.includes('/')) topLevelDirs.add(segment);
  }

  const paths = ['AGENTS.md', 'CLAUDE.md', '.claude/pr-rules/common.md'];

  for (const dir of topLevelDirs) {
    paths.push(`${dir}/AGENTS.md`);
    paths.push(`.claude/pr-rules/${dir}.md`);
  }

  return paths;
}

async function fetchFileIfExists({ owner, repo, ref, path, githubToken, octokit }) {
  try {
    if (octokit) {
      const res = await octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref: ref || undefined,
      });
      if (res.data && res.data.content) {
        return Buffer.from(res.data.content, 'base64').toString('utf8');
      }
    }
  } catch (err) {
    if (err.status !== 404) {
      console.warn(`[context] note: could not fetch ${path}: ${err.message}`);
    }
  }
  return null;
}
