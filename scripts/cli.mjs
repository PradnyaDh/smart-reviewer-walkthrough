#!/usr/bin/env node
import { execSync } from "node:child_process";
import * as github from "@actions/github";
import { generateAndMaybePost } from "../src/run.mjs";

function parseArgs(argv) {
  const args = {
    post: false,
    postIssue: null,
    issueNumber: null,
    compare: false,
    models: null,
    model: process.env.TEST_MODEL || "gemini-3-5-flash",
    maxDiffChars: 60000,
  };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--post") args.post = true;
    else if (a === "--post-issue") args.postIssue = argv[++i];
    else if (a === "--issue-number") args.issueNumber = parseInt(argv[++i], 10);
    else if (a === "--compare") args.compare = true;
    else if (a === "--models") args.models = argv[++i].split(",").map((s) => s.trim());
    else if (a === "--model") args.model = argv[++i];
    else if (a === "--max-diff-chars") args.maxDiffChars = parseInt(argv[++i], 10);
    else if (a === "--help" || a === "-h") args.help = true;
    else positional.push(a);
  }

  if (args.compare && !args.models) {
    args.models = ["gpt-5", "gemini-2-5-pro", "gemini-3-5-flash"];
  }

  return { ...args, positional };
}

function printUsage() {
  console.error(`Usage: node scripts/cli.mjs <owner/repo> <pr-number> [options]

Options:
  --model <id>              Single model to request (default: $TEST_MODEL or gemini-3-5-flash)
  --compare                 Run all three top models (gpt-5, gemini-2-5-pro, gemini-3-5-flash)
  --models <m1,m2,...>      Custom comma-separated list of models to evaluate
  --max-diff-chars <n>      Cap on diff size sent to model (default: 60000)
  --post                    Actually create/update comment on the source PR
  --post-issue <owner/repo> Post the review as an Issue in your tracking repo
  --issue-number <number>   Update an existing issue instead of creating a new one

Environment:
  ANTHROPIC_API_KEY         Required. API key or gateway token.
  ANTHROPIC_BASE_URL        Optional. Override to point at internal gateway.
  GH_TOKEN / GITHUB_TOKEN   Optional. Falls back to \`gh auth token\` if unset.

Examples:
  # Refresh an existing review issue:
  node scripts/cli.mjs deliveryhero/logistics-dynamic-pricing 842 \\
    --compare --post-issue PradnyaDh/smart-reviewer-walkthrough --issue-number 3
`);
}

function getGithubToken() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  return execSync("gh auth token", { encoding: "utf8" }).trim();
}

async function main() {
  const { positional, post, postIssue, issueNumber, compare, models, model, maxDiffChars, help } = parseArgs(process.argv.slice(2));

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

  console.error(`[smart-reviewer-walkthrough] Fetching PR #${pullNumber} from ${owner}/${repo}...`);
  const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: pullNumber });

  const targetModels = models || [model];
  const isMultiModel = targetModels.length > 1;

  console.error(`[smart-reviewer-walkthrough] Running evaluation across ${targetModels.length} model(s): ${targetModels.join(", ")}...\n`);

  const results = [];

  for (const m of targetModels) {
    console.error(`--------------------------------------------------------------------------------`);
    console.error(`🤖 Analyzing with model: ${m}...`);
    console.error(`--------------------------------------------------------------------------------`);
    try {
      const res = await generateAndMaybePost({
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
        model: m,
        maxDiffChars,
        post: isMultiModel ? false : post,
        log: (msg) => console.error(`  ↳ ${msg}`),
      });
      if (res) {
        results.push({ model: m, body: res.body, success: true });
      }
    } catch (err) {
      console.error(`  ❌ Error running model ${m}: ${err.message}`);
      results.push({ model: m, error: err.message, success: false });
    }
  }

  if (results.length === 0) {
    console.error("No analysis results generated.");
    process.exit(1);
  }

  // Build the unified markdown output
  let finalMarkdown = "";
  if (isMultiModel) {
    finalMarkdown = [
      `# 🔬 Multi-Model Review Comparison`,
      ``,
      `**Repository:** \`${owner}/${repo}\`  `,
      `**PR Number:** \`#${pullNumber}\`  `,
      `**PR Title:** **${pr.title}**  `,
      `**🔗 Source Pull Request:** https://github.com/${owner}/${repo}/pull/${pullNumber}`,
      ``,
      `---`,
      ``,
    ].join("\n");

    results.forEach((r, idx) => {
      finalMarkdown += `## ${idx + 1}️⃣ Model: \`${r.model}\`\n\n`;
      if (r.success) {
        finalMarkdown += `${r.body}\n\n---\n\n`;
      } else {
        finalMarkdown += `> ⚠️ **Error:** Model run failed with: \`${r.error}\`\n\n---\n\n`;
      }
    });
  } else {
    finalMarkdown = results[0].body;
  }

  // Print output
  console.log("\n" + finalMarkdown);

  // Handle posting to personal issue tracker
  if (postIssue) {
    const [targetOwner, targetRepo] = postIssue.split("/");
    if (!targetOwner || !targetRepo) {
      console.error(`\n❌ Invalid --post-issue target: "${postIssue}". Expected format: owner/repo`);
      process.exit(1);
    }

    const issueTitle = isMultiModel
      ? `[Comparison] ${owner}/${repo}#${pullNumber}: ${pr.title}`
      : `[Review] ${owner}/${repo}#${pullNumber}: ${pr.title}`;

    const issueBody = isMultiModel
      ? finalMarkdown
      : `${finalMarkdown}\n\n---\n**🔗 Source Pull Request:** https://github.com/${owner}/${repo}/pull/${pullNumber}`;

    if (issueNumber) {
      console.error(`\n[smart-reviewer-walkthrough] Refreshing existing issue #${issueNumber} in ${targetOwner}/${targetRepo}...`);
      try {
        const { data: updatedIssue } = await octokit.rest.issues.update({
          owner: targetOwner,
          repo: targetRepo,
          issue_number: issueNumber,
          title: issueTitle,
          body: issueBody,
        });
        console.error(`[smart-reviewer-walkthrough] ✅ Successfully updated issue #${updatedIssue.number}: ${updatedIssue.html_url}`);
      } catch (err) {
        console.error(`\n❌ Failed to update issue #${issueNumber}: ${err.message}`);
      }
    } else {
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
    }
  } else if (!post) {
    console.error("\n(Dry run — nothing was posted to GitHub. Pass --post-issue <owner/repo> to save to your tracking repo.)");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
