# 🧭 Smart Reviewer Walkthrough

An AI-assisted code review engine and GitHub Action built on a **3-Layer Architecture** (Cascading Team Memory, Analysis Swarm, and Deterministic Risk Routing). Designed for Tech Leads, Senior Engineers, and Developers, it provides rapid 60-second PR orientation, maps architecture and blast radius across unfamiliar codebases, flags runtime failure modes, and certifies safe paths without replacing human accountability.

```
                          ┌────────────────────────┐
                          │   Pull Request (Diff)  │
                          └───────────┬────────────┘
                                      │
              ┌───────────────────────▼────────────────────────┐
              │  LAYER 3: Risk Router & Deterministic Gate     │
              │  • Diff Size (>500 LoC / >20 files)            │
              │  • Sensitive Deny-List (pricing, auth, schema) │
              │  • CODEOWNERS & Git-Commit Reviewer Routing    │
              │  • Fast-Path vs. Escalate-to-Human Verdict     │
              └───────────────────────┬────────────────────────┘
                                      │
              ┌───────────────────────▼────────────────────────┐
              │  LAYER 1: 3-Tier Cascading Team Memory         │
              │  • Tier 1: Universal Platform Invariants       │
              │  • Tier 2: Domain Memory & Outage Guardrails   │
              │  • Tier 3: Scoped Repo Rules (Remote GitHub)   │
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
              │  • Interactive Local Standup Web Dashboard     │
              └────────────────────────────────────────────────┘
```

---

## 🏛️ The Three Architectural Layers

### 1. Layer 1: 3-Tier Cascading Team Memory (`src/context.mjs`)
Rather than relying solely on generic lint advice or dumping monolith rule files into LLM prompts, Layer 1 executes a **3-tier context cascade**:

```
┌─────────────────────────────────────────────────────────────────┐
│ TIER 1: Platform Engineering Invariants                         │
│ File: src/rules/platform-invariants.json                        │
│ • [INV-001]: Concurrency & thread-safe stores (ConcurrentMap).  │
│ • [INV-002]: Feature flag explicit safe fallbacks.              │
│ • [INV-003]: SQL parameterized bind parameters only.            │
│ • [INV-004]: Kafka/Protobuf wire-compatibility (optional tags). │
│ • [INV-005]: Cron & Kafka boundary error handling / metrics.    │
└────────────────────────────────┬────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────┐
│ TIER 2: Domain Memory & Postmortem Guardrails                   │
│ File: src/rules/domain-knowledge.json                           │
│ • DevHub Architectural Catalog (DPS, DAS, Tracking API, etc.)   │
│ • [PM-6946]: Assert delivery_fee >= 0 (PH outage guardrail).    │
│ • [PM-6561]: Weather surge multiplier watchdog (Ukraine fail).  │
│ • [PM-6990]: Subscription fee waiver continuity (SG pandapro).  │
│ • [PM-3838]: S3 precomputed dataset path sync (Woowa Korea).    │
│ • [PM-3681]: Audit log zero-throughput watchdogs (Bulgaria).    │
└────────────────────────────────┬────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────┐
│ TIER 3: Scoped Target Repo Memory                               │
│ Fetched dynamically from target repo on GitHub                  │
│ • AGENTS.md / CLAUDE.md                                         │
│ • Path-scoped rules: .claude/pr-rules/<module>.md               │
└─────────────────────────────────────────────────────────────────┘
```

* **Never Runs Blind:** Even if a repository lacks an `AGENTS.md`, Tiers 1 and 2 provide immediate platform safety and domain guardrails.
* **Transparent Attribution:** Reviews cite the exact rules evaluated in their footer (e.g. `📚 Evaluated against Team Memory: Platform Invariants • Service Catalog • Incident Guardrails (PM-6990)`).

---

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

---

### 3. Layer 3: Deterministic Risk Router & Smart CODEOWNERS (`src/router.mjs`, `src/codeowners.mjs`)
Modeled after PostHog's *StampHog* and Morgan Stanley's *DDRA*:
* Runs **before calling any LLM** to save cost and enforce hard invariants.
* Evaluates diff size ceilings (<150 lines for fast-path; >500 lines or >20 files for escalation).
* Screens against a sensitive blast-radius deny-list: `pricing`, `fee`, `auth`, `secret`, `migration`, `schema`, `public-api`, `ingress`.
* **Smart Reviewer Routing:** Inspects `CODEOWNERS` (or falls back to git-commit familiarity) to recommend the exact owning squad or senior engineers who should review the PR.
* Outputs a deterministic gate verdict: `🟢 LOW RISK (FAST_PATH)`, `🟡 MEDIUM RISK`, or `🔴 HIGH RISK (ESCALATE_HUMAN)`.

---

## 📚 Pre-Built Codified Rule Catalogs (36 Rules from 3,462 Reviews)

The engine includes pre-codified rule catalogs extracted from **3,462 real human code reviews across 2025 and 2026**:

| Guideline Catalog | Coverage & Source | Key Invariants Enforced |
| :--- | :--- | :--- |
| **`.claude/pr-rules/api.md`** | **13 Rules**<br>*(320 reviews in `dynamic-pricing-api`)* | • Early feature flag checks before cache lookups (`REV-001`)<br>• Fallback service parity (`REV-002`)<br>• Strict `BigDecimal` precision; no Float/Double (`REV-012`)<br>• Revenue protection on upstream nulls ("free money" bug) (`REV-013`)<br>• Prometheus tag cardinality bounding (`REV-003`) |
| **`.claude/pr-rules/backend.md`** | **12 Rules**<br>*(1,858 reviews in `dynamic-pricing`)* | • Non-nullable JPA primary keys (`BACK-001`)<br>• Liquibase migration immutability & rollback blocks (`BACK-002`)<br>• Spring Security `@PreAuthorize` on Admin endpoints (`BACK-003`)<br>• PostgreSQL `= ANY(?)` array queries over dynamic `IN` (`BACK-007`)<br>• Transactional event publishing (`@TransactionalEventListener`) (`BACK-010`) |
| **`.claude/pr-rules/dashboard.md`** | **11 Rules**<br>*(1,284 reviews in `dashboard`)* | • No float casting on `big_decimal` strings (`DASH-001`)<br>• Explicit `undefined` on form clone ID stripping (`DASH-002`)<br>• Primitive hook dependencies in `useEffect` arrays (`DASH-003`)<br>• Search filter lowercase memoization outside loops (`DASH-006`)<br>• Numerical ID nullish checks (`id != null` vs `!!id`) (`DASH-007`) |

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

## 📊 Sprint PR Triage & Interactive Web Dashboard (`scripts/batch-review.mjs`)

For daily PR standups and sprint planning, `scripts/batch-review.mjs` scans all open PRs across a target repository, runs deterministic risk screening, matches **CODEOWNERS**, and serves an interactive web board:

```bash
# Fast triage of top 10 open PRs across the repository:
node scripts/batch-review.mjs deliveryhero/logistics-dynamic-pricing --limit 10

# Scan and save the Sprint Triage Dashboard to your personal tracking repo:
node scripts/batch-review.mjs deliveryhero/logistics-dynamic-pricing \
  --limit 10 \
  --post-issue PradnyaDh/smart-reviewer-walkthrough

# Launch the interactive local Web Dashboard at http://localhost:8787:
node scripts/batch-review.mjs deliveryhero/logistics-dynamic-pricing --limit 10 --web
```

### 🎨 Web Dashboard Capabilities (`http://localhost:8787`):
* **Visual Kanban Swimlanes:** Sorts PRs into 🔴 *High Blast-Radius*, 🟡 *Standard Reviews*, and 🟢 *Fast-Track Candidates*.
* **Interactive PR Detail Drawer:** Click any PR card to inspect the 3-sentence summary, native interactive Mermaid flowchart, blocking bugs, and verified checklists.
* **1-Click Slack Standup Digest:** Click **"📋 Copy Slack Standup Digest"** to copy formatted Slack markdown directly to your clipboard for morning team standups.
* **Real-time Search:** Filter instantly by Jira ticket (e.g. `LOGDPO-1707`), author, or category.

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

## ⚙️ CLI Reference

### `scripts/cli.mjs` (Single PR Review)
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

### `scripts/batch-review.mjs` (Sprint PR Triage & Dashboard)
| Option | Description |
| :--- | :--- |
| `<owner/repo>` | Target repository to scan (positional). |
| `--limit <n>` | Maximum number of PRs to scan (default: `10`). |
| `--state <open\|closed\|all>`| State of pull requests to evaluate (default: `open`). |
| `--web` | Starts the local HTTP server and opens the interactive dashboard at `http://localhost:8787`. |
| `--port <num>` | Port to run the local web server on (default: `8787`). |
| `--full-ai` | Runs full AI analysis swarms on all PRs in the batch. |
| `--post-issue <owner/repo>`| Posts the Sprint Triage Matrix as an Issue in your personal tracking repo. |
| `--issue-number <num>` | Updates an existing sprint triage issue number. |

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

## 🛡️ Non-Negotiable Core Invariants

1. **AI Never Has Final Approval:** The tool provides first-pass analysis, verified safe lists, and risk ratings; a human engineer is always accountable for approving and merging code.
2. **Fail Closed:** Any API timeout or syntax ambiguity results in an escalation recommendation, never silent approval.
3. **The Compounding Habit:** Every time a human reviewer catches a defect missed by the tool, it is converted into a 1-sentence bullet in `AGENTS.md` or `.claude/pr-rules/common.md`.
