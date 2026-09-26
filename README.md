# Smart Reviewer Walkthrough

A GitHub Action that posts a "Smart Reviewer Walkthrough" as a PR comment: a 3-sentence plain-English
summary, a Mermaid data-flow diagram, and a "Focus Your Eyes Here" list of the top 1-3 lines with a
genuine race-condition / null / error-handling risk. The comment is upserted (found by a hidden marker
and updated in place), so a `synchronize` push updates the existing comment instead of piling up new ones.

## How it works

1. On `pull_request` (`opened` / `synchronize` / `reopened`), the action fetches the PR's per-file
   patches via the GitHub API (`GET /pulls/{n}/files`), capped at `max-diff-chars` total so a huge PR
   doesn't blow context or cost.
2. It calls the Claude API (`src/claude.mjs`) with a forced tool call (`tool_choice`), so the model's
   response is guaranteed structured JSON — no regex-scraping prose out of a free-text reply.
3. It formats that JSON into markdown (`src/format.mjs`) and creates or updates the PR comment
   (`src/index.mjs`).

## Setup in a target repo

This repo is published standalone, so other repos reference it as an external action —
no need to copy files around.

1. Add a repo or org secret named `ANTHROPIC_API_KEY` with a valid Anthropic API key
   (Settings → Secrets and variables → Actions) on the **target** repo (the one whose PRs
   you want walkthroughs on).
2. Copy [`examples/consumer-workflow.yml`](examples/consumer-workflow.yml) into that repo at
   `.github/workflows/smart-reviewer-walkthrough.yml`. It references this action as
   `PradnyaDh/smart-reviewer-walkthrough@main`.
3. Open a PR on the target repo. The bot comment should appear within a minute or two of the
   workflow running.

(The workflow committed in *this* repo at `.github/workflows/smart-reviewer-walkthrough.yml` uses
the local `./` path instead, so this repo dogfoods the action on its own PRs.)

## Configuration

All inputs are optional except the API key:

| Input | Default | Purpose |
|---|---|---|
| `model` | `claude-sonnet-5` | Claude model id |
| `max-diff-chars` | `60000` | Diff characters sent to the model before truncating (oversized files/diffs are noted, not silently dropped) |
| `github-token` | `${{ github.token }}` | Override only if you need elevated permissions (e.g. to comment across forks) |

## Notes / limitations

- **Fork PRs**: `pull_request` (not `pull_request_target`) is used deliberately — it never exposes
  `ANTHROPIC_API_KEY` to a fork's untrusted workflow code. The tradeoff: the default `GITHUB_TOKEN` on a
  fork PR is read-only, so the bot comment won't post on PRs from forks unless you consciously switch to
  `pull_request_target` (which changes the trust model — read GitHub's docs on that before doing so).
- Binary files and files GitHub itself won't diff (huge single-file changes) are skipped and named in
  the comment rather than silently ignored.
- This is an assistive first-pass, not a substitute for human review — the comment says so, and the
  risk list is intentionally allowed to come back empty rather than padded with generic advice.
