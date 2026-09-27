// src/codeowners.mjs
//
// Layer 3 Extension: Smart Reviewer & Squad Routing.
// Parses CODEOWNERS from the target repo or falls back to git-commit history
// to identify the right human reviewers when a PR requires escalation.

const CANDIDATE_CODEOWNERS_PATHS = [
  '.github/CODEOWNERS',
  'CODEOWNERS',
  'docs/CODEOWNERS',
];

/**
 * Resolves the recommended reviewers for a set of changed files.
 * @param {object} opts
 * @param {object} opts.octokit
 * @param {string} opts.owner
 * @param {string} opts.repo
 * @param {string[]} opts.changedFiles
 * @returns {Promise<{reviewers: string[], source: string, rulesMatched: Array}>}
 */
export async function resolveReviewers({ octokit, owner, repo, changedFiles = [] }) {
  const codeownersText = await fetchCodeownersContent(octokit, owner, repo);

  if (codeownersText) {
    const parsedRules = parseCodeowners(codeownersText);
    const matchedOwners = new Set();
    const rulesMatched = [];

    for (const file of changedFiles) {
      const match = matchRule(file, parsedRules);
      if (match) {
        match.owners.forEach((o) => matchedOwners.add(o));
        rulesMatched.push({ file, pattern: match.pattern, owners: match.owners });
      }
    }

    if (matchedOwners.size > 0) {
      return {
        reviewers: [...matchedOwners],
        source: 'CODEOWNERS',
        rulesMatched: rulesMatched.slice(0, 5),
      };
    }
  }

  // Fallback: Git-commit familiarity on the most critical changed files
  const topCommitters = await findRecentCommitters(octokit, owner, repo, changedFiles.slice(0, 3));
  if (topCommitters.length > 0) {
    return {
      reviewers: topCommitters,
      source: 'git-commit familiarity',
      rulesMatched: [],
    };
  }

  return {
    reviewers: [],
    source: 'none',
    rulesMatched: [],
  };
}

async function fetchCodeownersContent(octokit, owner, repo) {
  for (const path of CANDIDATE_CODEOWNERS_PATHS) {
    try {
      const res = await octokit.rest.repos.getContent({ owner, repo, path });
      if (res.data && res.data.content) {
        return Buffer.from(res.data.content, 'base64').toString('utf8');
      }
    } catch (err) {
      // Ignore 404
    }
  }
  return null;
}

function parseCodeowners(text) {
  const lines = text.split('\n');
  const rules = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      const pattern = parts[0];
      const owners = parts.slice(1);
      rules.push({ pattern, owners });
    }
  }

  return rules;
}

function matchRule(file, rules) {
  // Last matching rule in CODEOWNERS takes precedence
  let matched = null;
  const normalizedFile = file.startsWith('/') ? file : `/${file}`;

  for (const rule of rules) {
    let pat = rule.pattern;
    if (!pat.startsWith('/')) pat = `*${pat}`;
    if (pat.endsWith('/')) pat = `${pat}*`;

    // Simple glob matching
    const regexStr = '^' + pat
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '.*')
      .replace(/(?<!\.)\*/g, '[^/]*') + '$';

    try {
      const regex = new RegExp(regexStr);
      if (regex.test(normalizedFile) || regex.test(file)) {
        matched = rule;
      }
    } catch {
      // Fallback substring check if complex regex fails
      if (file.includes(rule.pattern.replace(/\*/g, ''))) {
        matched = rule;
      }
    }
  }

  return matched;
}

async function findRecentCommitters(octokit, owner, repo, files) {
  const committers = new Map();

  for (const path of files) {
    try {
      const res = await octokit.rest.repos.listCommits({
        owner,
        repo,
        path,
        per_page: 5,
      });

      for (const item of res.data) {
        const login = item.author?.login || item.commit?.author?.name;
        if (login && !login.includes('[bot]') && !login.includes('dependabot')) {
          committers.set(login, (committers.get(login) || 0) + 1);
        }
      }
    } catch {
      // Ignore
    }
  }

  return [...committers.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([login]) => `@${login.replace(/^@/, '')}`)
    .slice(0, 3);
}
