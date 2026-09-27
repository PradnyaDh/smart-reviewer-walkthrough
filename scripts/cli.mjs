#!/usr/bin/env node
import { execSync } from "node:child_process";
import * as github from "@actions/github";
import { generateAndMaybePost } from "../src/run.mjs";

function parseArgs(argv) {
  const args = {
    post: false,
    postIssue: null,
    model: process.env.TEST_MODEL || "claude-sonnet-5",
    maxDiffChars: 60000,
  };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--post") args.post = true;
    else if (a === "--post-issue") args.postIssue = argv[++i];
    else if (a === "--model") args.model = argv[++i];
    else if (a === "--max-diff-chars") args.maxDiffChars = parseInt(argv[++i], 10);
    else if (a === "--help" || a === "-h") args.help = true;
    else positional.push(a);
  }
  return { ...args, positional };
}

function printUsage() {
  console.error(`Usage: node scripts/cli.mjs <owner/repo> <pr-number> [options]

Options:
  --model <id>              Model to request (default: $TEST_MODEL or claude-sonnet-5)
  --max-diff-chars <n>      Cap on diff size sent to the model (default: 60000)
  --post                    Actually create/update the PR comment on the source PR.
  --post-issue <owner/repo> Post the review as a new Issue in your tracking repo
                             instead of commenting on the source PR.

Environment:
  ANTHROPIC_API_KEY         Required. API key or gateway token.
  ANTHROPIC_BASE_URL        Optional. Override to point at an internal gateway.
  CF_ACCESS_CLIENT_ID       Optional. Cloudflare Access service token id.
  CF_ACCESS_CLIENT_SECRET   Optional. Cloudflare Access service token secret.
  GH_TOKEN / GITHUB_TOKEN   Optional. Falls back to \`gh auth token\` if unset.

Example:
  # Dry run
  ANTHROPIC_API_KEY=cloudflare ANTHROPIC_BASE_URL=http://localhost:36253 \\
    node scripts/cli.mjs deliveryhero/logistics-dynamic-pricing 842 --model gemini-3-5-flash

  # Save review into your personal tracking repo:
  ANTHROPIC_API_KEY=cloudflare ANTHROPIC_BASE_URL=http://localhost:36253 \\
    node scripts/cli.mjs deliveryhero/logistics-dynamic-pricing 842 \\
      --model gemini-3-5-flash --post-issue PradnyaDh/smart-reviewer-walkthrough
`);
}

function getGithubToken() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  return execSync("gh auth token", { encoding: "utf8" }).trim();
}

async function main() {
  const { positional, post, postIssue, model, maxDiffChars, help } = parseArgs(process.argv.slice(2));

  if (help || positional.length < 2) {
    printUsage();
    process.exit(help ? 0 : 1);
  }

  const [ownerRepo, prNumberStr] = positional;
  const [owner, repo] = ownerRepo.split("/");
  const pullNumber = parseInt(prNumberStr, 10);

  if (!owner || !repo || Number.isNaN(pullNumber)) {
    printUsage();
    process.exit(1);
  }

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    console.error("Set ANTHROPIC_API_KEY (and ANTHROPIC_BASE_URL if using a gateway) first.");
    process.exit(1);
  }

  const octokit = github.getOctokit(getGithubToken());

  const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: pullNumber });

  const result = await generateAndMaybePost({
    octokit,
    owner,
    repo,
    pullNumber,
    prTitle: pr.title,
    prBody: pr.body,
    anthropicApiKey,
    anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL,
    cfAccessClientId: process.env.CF_ACCESS_CLIENT_ID,
    cfAccessClientSecret: process.env.CF_ACCESS_CLIENT_SECRET,
    model,
    maxDiffChars,
    post,
    log: (msg) => console.error(`[smart-reviewer-walkthrough] ${msg}`),
  });

  if (!result) {
    process.exit(0);
  }

  console.log(result.body);

  if (postIssue) {
    const [targetOwner, targetRepo] = postIssue.split("/");
    if (!targetOwner || !targetRepo) {
      console.error(`\n❌ Invalid --post-issue target: "${postIssue}". Expected format: owner/repo`);
      process.exit(1);
    }

    const issueTitle = `[Review] ${owner}/${repo}#${pullNumber}: ${pr.title}`;
    const issueBody = `${result.body}\n\n---\n**🔗 Source Pull Request:** https://github.com/${owner}/${repo}/pull/${pullNumber}`;

    console.error(`\n[smart-reviewer-walkthrough] Creating tracking issue in ${targetOwner}/${targetRepo}...`);
    try {
      const { data: createdIssue } = await octokit.rest.issues.create({
        owner: targetOwner,
        repo: targetRepo,
        title: issueTitle,
        body: issueBody,
      });
      console.error(`[smart-reviewer-walkthrough] ✅ Created review issue #${createdIssue.number}: ${createdIssue.html_url}`);
    } catch (err) {
      console.error(`\n❌ Failed to create issue in ${targetOwner}/${targetRepo}: ${err.message}`);
    }
  } else if (!post) {
    console.error("\n(Dry run — nothing was posted to GitHub. Pass --post to comment on the PR, or --post-issue <owner/repo> to save to your tracking repo.)");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
