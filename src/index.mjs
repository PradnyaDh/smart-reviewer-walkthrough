import * as core from "@actions/core";
import * as github from "@actions/github";
import { generateAndMaybePost } from "./run.mjs";

async function run() {
  const githubToken = core.getInput("github-token", { required: true });
  const anthropicApiKey = core.getInput("anthropic-api-key", { required: true });
  const anthropicBaseUrl = core.getInput("anthropic-base-url") || undefined;
  const cfAccessClientId = core.getInput("cf-access-client-id") || undefined;
  const cfAccessClientSecret = core.getInput("cf-access-client-secret") || undefined;
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

  await generateAndMaybePost({
    octokit,
    owner,
    repo,
    pullNumber: pr.number,
    prTitle: pr.title,
    prBody: pr.body,
    anthropicApiKey,
    anthropicBaseUrl,
    cfAccessClientId,
    cfAccessClientSecret,
    model,
    maxDiffChars,
    post: true,
    log: core.info,
  });
}

run().catch((err) => {
  core.setFailed(err instanceof Error ? err.message : String(err));
});
