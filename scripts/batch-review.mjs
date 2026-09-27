#!/usr/bin/env node
// scripts/batch-review.mjs
//
// Enhancement 2: Sprint PR Triage & Batch Scanner.
// Scans open pull requests across a repository, evaluates deterministic risk
// and reviewer routing for each, and generates an EM Sprint Triage Dashboard.

import { execSync } from "node:child_process";
import * as github from "@actions/github";
import { evaluateRisk } from "../src/router.mjs";
import { resolveReviewers } from "../src/codeowners.mjs";
import { generateAndMaybePost } from "../src/run.mjs";

function parseArgs(argv) {
  const args = {
    state: "open",
    limit: 10,
    fullAi: false,
    model: process.env.TEST_MODEL || "gemini-3-5-flash",
    postIssue: null,
    issueNumber: null,
  };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--state") args.state = argv[++i];
    else if (a === "--limit") args.limit = parseInt(argv[++i], 10);
    else if (a === "--full-ai") args.fullAi = true;
    else if (a === "--model") args.model = argv[++i];
    else if (a === "--post-issue") args.postIssue = argv[++i];
    else if (a === "--issue-number") args.issueNumber = parseInt(argv[++i], 10);
    else if (a === "--help" || a === "-h") args.help = true;
    else positional.push(a);
  }
  return { ...args, positional };
}

function printUsage() {
  console.error(`Usage: node scripts/batch-review.mjs <owner/repo> [options]

Options:
  --state <open|closed|all> State of PRs to scan (default: open)
  --limit <number>          Max number of PRs to scan (default: 10)
  --full-ai                 Run full AI analysis swarm on each PR
  --model <id>              Model to use for AI analysis (default: gemini-3-5-flash)
  --post-issue <owner/repo> Post compiled Sprint Triage Dashboard to your tracking repo
  --issue-number <num>      Update existing tracking issue instead of creating a new one

Environment:
  GH_TOKEN / GITHUB_TOKEN   Optional. Falls back to \`gh auth token\` if unset.
  ANTHROPIC_API_KEY         Required if --full-ai is used.
  ANTHROPIC_BASE_URL        Optional gateway override.

Example:
  # Fast triage of top 10 open PRs:
  node scripts/batch-review.mjs deliveryhero/logistics-dynamic-pricing --limit 10

  # Save triage report to personal tracker:
  node scripts/batch-review.mjs deliveryhero/logistics-dynamic-pricing \\
    --limit 10 --post-issue PradnyaDh/smart-reviewer-walkthrough
`);
}

function getGithubToken() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  return execSync("gh auth token", { encoding: "utf8" }).trim();
}

async function main() {
  const { positional, state, limit, fullAi, model, postIssue, issueNumber, help } = parseArgs(process.argv.slice(2));

  if (help || positional.length < 1) {
    printUsage();
    process.exit(help ? 0 : 1);
  }

  const [ownerRepo] = positional;
  const [owner, repo] = ownerRepo.split("/");
  if (!owner || !repo) {
    printUsage();
    process.exit(1);
  }

  const octokit = github.getOctokit(getGithubToken());

  console.error(`\n🔎 Scanning repository: ${owner}/${repo} (State: ${state}, Limit: ${limit})...`);
  const { data: prs } = await octokit.rest.pulls.list({
    owner,
    repo,
    state,
    per_page: limit,
    sort: "updated",
    direction: "desc",
  });

  if (prs.length === 0) {
    console.error(`No ${state} pull requests found in ${owner}/${repo}.`);
    process.exit(0);
  }

  console.error(`Found ${prs.length} pull requests. Running deterministic risk & routing evaluation...\n`);

  const triaged = [];

  for (const pr of prs) {
    process.stderr.write(`  ↳ [#${pr.number}] ${pr.title.slice(0, 45)}... `);

    let changedFiles = [];
    let additions = 0;
    let deletions = 0;
    try {
      const { data: files } = await octokit.rest.pulls.listFiles({
        owner,
        repo,
        pull_number: pr.number,
      });
      changedFiles = files.map((f) => f.filename);
      additions = files.reduce((acc, f) => acc + (f.additions || 0), 0);
      deletions = files.reduce((acc, f) => acc + (f.deletions || 0), 0);
    } catch {
      // Ignore
    }

    const risk = evaluateRisk({
      changedFiles,
      totalAdditions: additions,
      totalDeletions: deletions,
      isDraft: pr.draft,
    });

    const routing = await resolveReviewers({
      octokit,
      owner,
      repo,
      changedFiles,
    });

    let aiReview = null;
    if (fullAi) {
      try {
        const res = await generateAndMaybePost({
          octokit,
          owner,
          repo,
          pullNumber: pr.number,
          prTitle: pr.title,
          prBody: pr.body,
          anthropicApiKey: process.env.ANTHROPIC_API_KEY,
          anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL,
          model,
          post: false,
          log: () => {},
        });
        aiReview = res?.walkthrough;
      } catch (err) {
        // AI failure shouldn't abort triage
      }
    }

    const item = {
      number: pr.number,
      title: pr.title,
      author: pr.user?.login || "unknown",
      url: pr.html_url,
      draft: pr.draft,
      additions,
      deletions,
      totalLines: additions + deletions,
      fileCount: changedFiles.length,
      risk,
      routing,
      aiReview,
    };

    triaged.push(item);
    const badge = risk.riskLevel === "HIGH" ? "🔴 HIGH" : risk.riskLevel === "MEDIUM" ? "🟡 MED" : "🟢 LOW";
    process.stderr.write(`${badge} (${risk.recommendation})\n`);
  }

  // Group by risk
  const fastTrack = triaged.filter((t) => t.risk.recommendation === "FAST_PATH");
  const standard = triaged.filter((t) => t.risk.recommendation === "STANDARD_REVIEW");
  const escalated = triaged.filter((t) => t.risk.recommendation === "ESCALATE_HUMAN");

  // Build Markdown Dashboard
  const now = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const lines = [
    `# 📊 Sprint PR Triage Dashboard: \`${owner}/${repo}\``,
    ``,
    `- **Scan Date:** ${now}`,
    `- **Total PRs Evaluated:** ${triaged.length} (\`${state}\`)`,
    `- **Fast-Track Candidates (Low Risk):** **${fastTrack.length}** 🟢`,
    `- **Standard Reviews (Medium Risk):** **${standard.length}** 🟡`,
    `- **Escalated to Domain Leads (High Blast Radius):** **${escalated.length}** 🔴`,
    ``,
    `---`,
    ``,
    `## 🚦 Executive Triage Matrix`,
    ``,
    `| PR | Title | Author | Risk Level | Gate Recommendation | Size | Sensitive Paths | Suggested Reviewers |`,
    `| :---: | :--- | :---: | :---: | :---: | :---: | :--- | :--- |`,
  ];

  for (const t of triaged) {
    const icon = t.risk.riskLevel === "HIGH" ? "🔴" : t.risk.riskLevel === "MEDIUM" ? "🟡" : "🟢";
    const sensitive = t.risk.sensitiveCategories.length > 0 ? t.risk.sensitiveCategories.join(", ") : "None";
    const reviewers = t.routing.reviewers.length > 0 ? t.routing.reviewers.join(" ") : "_auto_";
    const titleSnippet = t.title.length > 40 ? t.title.slice(0, 37) + "..." : t.title;

    lines.push(
      `| [#${t.number}](${t.url}) | ${titleSnippet} | @${t.author} | ${icon} \`${t.risk.riskLevel}\` | \`${t.risk.recommendation}\` | ${t.totalLines} lines (${t.fileCount}f) | ${sensitive} | ${reviewers} |`
    );
  }

  lines.push("", "---", "");

  // Detailed breakdowns
  if (escalated.length > 0) {
    lines.push(`### 🔴 High Blast-Radius / Escalate to Domain Leads (${escalated.length})`);
    for (const t of escalated) {
      lines.push(
        `* **[#${t.number}: ${t.title}](${t.url})** (@${t.author})`,
        `  * **Triggers:** ${t.risk.reasons.join(" • ")}`,
        `  * **Recommended Squad/Reviewers:** ${t.routing.reviewers.length > 0 ? t.routing.reviewers.join(" ") : "Domain Staff"} (${t.routing.source})`
      );
      if (t.aiReview) {
        lines.push(`  * **AI Summary:** ${t.aiReview.summary}`);
      }
    }
    lines.push("");
  }

  if (standard.length > 0) {
    lines.push(`### 🟡 Standard Reviews (${standard.length})`);
    for (const t of standard) {
      lines.push(
        `* **[#${t.number}: ${t.title}](${t.url})** (@${t.author}) — ${t.totalLines} lines across ${t.fileCount} file(s)`
      );
    }
    lines.push("");
  }

  if (fastTrack.length > 0) {
    lines.push(`### 🟢 Fast-Track Candidates (Safe for Rapid Sign-Off) (${fastTrack.length})`);
    for (const t of fastTrack) {
      lines.push(
        `* **[#${t.number}: ${t.title}](${t.url})** (@${t.author}) — ${t.totalLines} lines (${t.fileCount} file) • Non-sensitive`
      );
    }
    lines.push("");
  }

  const finalReport = lines.join("\n");
  console.log("\n" + finalReport);

  // Post to personal tracking repo
  if (postIssue) {
    const [targetOwner, targetRepo] = postIssue.split("/");
    const issueTitle = `[Sprint Triage] ${owner}/${repo}: ${prs.length} PRs (${escalated.length} High Risk, ${fastTrack.length} Fast-Track)`;

    if (issueNumber) {
      console.error(`\n[batch-review] Updating existing triage issue #${issueNumber} in ${targetOwner}/${targetRepo}...`);
      try {
        const { data: updated } = await octokit.rest.issues.update({
          owner: targetOwner,
          repo: targetRepo,
          issue_number: issueNumber,
          title: issueTitle,
          body: finalReport,
        });
        console.error(`[batch-review] ✅ Successfully updated triage issue #${updated.number}: ${updated.html_url}`);
      } catch (err) {
        console.error(`\n❌ Failed to update issue #${issueNumber}: ${err.message}`);
      }
    } else {
      console.error(`\n[batch-review] Creating new sprint triage issue in ${targetOwner}/${targetRepo}...`);
      try {
        const { data: created } = await octokit.rest.issues.create({
          owner: targetOwner,
          repo: targetRepo,
          title: issueTitle,
          body: finalReport,
        });
        console.error(`[batch-review] ✅ Successfully created triage issue #${created.number}: ${created.html_url}`);
      } catch (err) {
        console.error(`\n❌ Failed to create issue: ${err.message}`);
      }
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
