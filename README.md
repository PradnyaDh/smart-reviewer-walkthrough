# 🧭 Smart Reviewer Walkthrough

An AI-assisted code review engine and GitHub Action built on a **3-Layer Architecture** (Team Memory, Analysis Swarm, and Deterministic Risk Routing). Designed for Tech Leads, Senior Engineers, and Developers, it provides rapid 60-second PR orientation, maps architecture and blast radius across unfamiliar codebases, flags runtime failure modes, and certifies safe paths without replacing human accountability.

```
                          ┌────────────────────────┐
                          │   Pull Request (Diff)  │
                          └───────────┬────────────┘
                                      │
              ┌───────────────────────▼────────────────────────┐
              │  LAYER 3: Risk Router & Deterministic Gate     │
              │  • Diff Size (>500 LoC / >20 files)            │
              │  • Sensitive Deny-List (pricing, auth, schema) │
              │  • Fast-Path vs. Escalate-to-Human Verdict     │
              └───────────────────────┬────────────────────────┘
                                      │
              ┌───────────────────────▼────────────────────────┐
              │  LAYER 1: Team Memory (Context Injector)       │
              │  • Scoped AGENTS.md / CLAUDE.md                │
              │  • Per-service rules (.claude/pr-rules/*.md)   │
              │  • Invariant "Do-Not-Touch" Constraints        │
              └───────────────────────┬────────────────────────┘
                                      │
              ┌───────────────────────▼────────────────────────┐
              │  LAYER 2: Review Swarm (Analysis Engine)       │
              │  • Architectural Flow (Mermaid Diagram)        │
              │  • Failure Modes (Race conditions, null checks)│
              │  • "Verified" Section (What NOT to re-check)   │
              └───────────────────────┬────────────────────────┘
                                      │
              ┌───────────────────────▼────────────────────────┐
              │  OUTPUT: Structured Verdict & Compounding Loop │
              │  • Blocking / Should Fix / Verified            │
              │  • Candidate Rule Proposal for AGENTS.md       │
              └────────────────────────────────────────────────┘
```

---

## 🏛️ The Three Architectural Layers

### 1. Layer 1: Codified Team Memory (`src/context.mjs`)
* Dynamically inspects the PR's touched file paths and queries the GitHub Contents API for `AGENTS.md`, `CLAUDE.md`, or scoped `.claude/pr-rules/*.md` files without requiring a local checkout.
* The model reviews against **actual codebase conventions, anti-patterns, and deprecated paths** rather than generic lint advice.
* Transparently displays loaded context files in the review footer.

### 2. Layer 2: Analysis Swarm & Structured Verdict (`src/prompt.mjs`, `src/format.mjs`)
Replaces flat risk lists with a structured engineering taxonomy:
* **🏛️ Repository & Architectural Context:** Explains what the service does, its platform tier, critical dependencies, and high-level blast radius for reviewers evaluating unfamiliar code.
* **📝 3-Sentence Summary:** Plain-English synthesis: *What changed*, *Why*, and *The single biggest catch for the reviewer*.
* **🗺️ Data Flow Diagram:** Clean, native Mermaid (`flowchart TD`) diagrams with automated syntax sanitization (double-quoted labels for method calls with parentheses or colons).
* **🚫 Blocking:** Real race conditions, reflection/lambda arity mismatches, or invariant violations that must prevent merging.
* **⚠️ Should Fix:** Code quality issues, missing timeouts, or unhandled errors to address before release.
* **💡 Nice to Have:** Optional polish suggestions (e.g. using `emptyMap()` vs `mutableMapOf()`).
* **✅ Verified (Skip Manual Re-Checking):** **Highest leverage section for human reviewers.** Explicitly certifies what was checked and confirmed safe so the reviewer doesn't waste time re-checking it.
* **📝 Suggested Rule Additions (Compounding Loop):** When the reviewer catches a new pattern, it drafts a 1-sentence rule to commit to `AGENTS.md`, compounding team judgment over time.

### 3. Layer 3: Deterministic Risk Router & Gate (`src/router.mjs`)
Modeled after PostHog's *StampHog* and Morgan Stanley's *DDRA*:
* Runs **before calling any LLM** to save cost and enforce hard invariants.
* Evaluates diff size ceilings (<150 lines for fast-path; >500 lines or >20 files for escalation).
* Screens against a sensitive blast-radius deny-list: `pricing`, `fee`, `auth`, `secret`, `migration`, `schema`, `public-api`, `ingress`.
* Outputs a deterministic gate verdict: `🟢 LOW RISK (FAST_PATH)`, `🟡 MEDIUM RISK`, or `🔴 HIGH RISK (ESCALATE_HUMAN)`.

---

## 💻 Running Locally via CLI (`scripts/cli.mjs`)

You can run reviews against any GitHub repository your `gh` CLI has access to without modifying the target repository.

### Prerequisites
```bash
npm install
```

### 1. Single Model Review (Dry Run)
Prints the review directly to your terminal:
```bash
export ANTHROPIC_API_KEY="cloudflare"
export ANTHROPIC_BASE_URL="http://localhost:36253"

node scripts/cli.mjs deliveryhero/logistics-dynamic-pricing 842 --model gemini-3-5-flash
```

### 2. Multi-Model Benchmark Comparison (`--compare`)
Evaluates the PR simultaneously across **GPT-5**, **Gemini 2.5 Pro**, and **Gemini 3.5 Flash**:
```bash
node scripts/cli.mjs deliveryhero/logistics-dynamic-pricing 842 --compare
```

### 3. Post to Your Personal Review Tracker (`--post-issue`)
Instead of commenting on the author's PR or modifying the target repository, save the review as an **Issue in your personal tracking repo**:
```bash
# Creates a new review issue in your tracking repo:
node scripts/cli.mjs deliveryhero/logistics-dynamic-pricing 842 \
  --compare \
  --post-issue PradnyaDh/smart-reviewer-walkthrough

# Refresh / update an existing issue with new findings:
node scripts/cli.mjs deliveryhero/logistics-dynamic-pricing 842 \
  --compare \
  --post-issue PradnyaDh/smart-reviewer-walkthrough \
  --issue-number 3
```

### 4. Post Directly to the Target PR (`--post`)
Updates the PR comment in-place on the author's pull request:
```bash
node scripts/cli.mjs owner/repo 123 --model gemini-3-5-flash --post
```

---

## 📊 Sprint PR Triage & Batch Scanner (`scripts/batch-review.mjs`)

For engineers and Tech Leads conducting sprint planning or daily PR triage, `scripts/batch-review.mjs` scans all open PRs across a target repository, runs deterministic risk screening, matches **CODEOWNERS**, and compiles a **PR Triage Matrix**:

```bash
# Fast triage of top 10 open PRs across the repository:
node scripts/batch-review.mjs deliveryhero/logistics-dynamic-pricing --limit 10

# Scan and save the Sprint Triage Dashboard to your personal tracking repo:
node scripts/batch-review.mjs deliveryhero/logistics-dynamic-pricing \
  --limit 10 \
  --post-issue PradnyaDh/smart-reviewer-walkthrough

# Full AI scan on all open PRs (generates 3-sentence summaries for all):
node scripts/batch-review.mjs deliveryhero/logistics-dynamic-pricing \
  --limit 10 --full-ai --model gemini-3-5-flash

# Launch the interactive local Web Dashboard at http://localhost:8787:
node scripts/batch-review.mjs deliveryhero/logistics-dynamic-pricing --limit 10 --web
```

The generated dashboard sorts PRs into:
* 🟢 **Fast-Track Candidates:** Non-sensitive, compact diffs ready for rapid sign-off.
* 🟡 **Standard Reviews:** Routine features and non-blocking updates.
* 🔴 **High Blast-Radius:** Flags touching pricing, core calculations, auth, migrations, or large diffs with recommended reviewer squads automatically resolved from `CODEOWNERS` or git history.

---

## 🤖 Supported Models & Gateways

The engine uses an Anthropic-compatible tool-calling interface (`/v1/messages`) with automatic response fallbacks. It seamlessly supports:

| Provider / Model | Recommended Use Case | Performance |
| :--- | :--- | :--- |
| **`gpt-5`** | Complex concurrency, deep race condition analysis, and type systems. | ~6–8s (Deep reasoning) |
| **`gemini-2-5-pro`** | Architectural overviews, clean Mermaid diagrams, and business risk. | ~3–4s (Frontier reasoning) |
| **`gemini-3-5-flash`** | CI/CD automation, unit test bug hunting, and ultra-fast orientation. | **~1.2s (Fastest)** |
| **`claude-3-5-sonnet`** | Direct Anthropic API (`api.anthropic.com`) via `sk-ant-...` key. | ~2–3s |

---

## ⚙️ CLI Reference (`scripts/cli.mjs`)

| Option | Description |
| :--- | :--- |
| `<owner/repo> <pr-number>` | Target repository and Pull Request number (positional). |
| `--model <id>` | Model identifier (defaults to `gemini-3-5-flash` or `$TEST_MODEL`). |
| `--compare` | Evaluates all 3 top models (`gpt-5`, `gemini-2-5-pro`, `gemini-3-5-flash`) side-by-side. |
| `--models <m1,m2>` | Custom comma-separated list of models to benchmark. |
| `--post-issue <owner/repo>`| Posts the formatted review to a personal tracking repository as a GitHub Issue. |
| `--issue-number <num>` | Updates an existing GitHub issue number instead of creating a duplicate. |
| `--post` | Creates or updates the review comment on the source PR. |
| `--max-diff-chars <n>` | Maximum diff characters sent to LLM before truncation (default: `60000`). |

---

## 🛠️ GitHub Action Setup (Target Repositories)

To run automatically in CI on pull requests:

1. Add your API key or gateway token as a secret named `ANTHROPIC_API_KEY` in the repository settings.
2. Add `.github/workflows/smart-reviewer-walkthrough.yml`:

```yaml
name: Smart Reviewer Walkthrough

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  walkthrough:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - name: Run Smart Reviewer
        uses: PradnyaDh/smart-reviewer-walkthrough@main
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          model: "gemini-3-5-flash"
```

---

## 📚 Codifying Team Memory (`AGENTS.md`)

To make the reviewer aware of your team's specific standards, place an `AGENTS.md` file in the root of your repository (or in subdirectories):

```markdown
# AGENTS.md — Team Memory

## Shared Resources — Check Before Building
- Feature flags: Use `FeaturesWithFriends` client, never invent local toggle singletons.
- Metrics: Wrap DB and external calls in `metricsCollector.observe {}`.

## Architecture Rules
- All new pricing endpoints must define a fallback flat-pricing strategy.
- Cache stores must use thread-safe collections (`ConcurrentHashMap`).

## Do-Not-Touch Without Approval
- `public/src/main/kotlin/.../pricing/` — Delivery fee core calculations.
- `src/main/resources/db/migration/` — Flyway database schemas.
```

---

## 🛡️ Non-Negotiable Core Invariants

1. **AI Never Has Final Approval:** The tool provides first-pass analysis, verified safe lists, and risk ratings; a human engineer is always accountable for approving and merging code.
2. **Fail Closed:** Any API timeout or syntax ambiguity results in an escalation recommendation, never silent approval.
3. **The Compounding Habit:** Every time a human reviewer catches a defect missed by the tool, it is converted into a 1-sentence bullet in `AGENTS.md` or `.claude/pr-rules/common.md`.
