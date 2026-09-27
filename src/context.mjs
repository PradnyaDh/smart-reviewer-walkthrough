// src/context.mjs
//
// Layer 1: 3-Tier Cascading Team Memory Loader.
//
// Tier 1: Universal Platform Engineering Invariants (concurrency, safety, protocols)
// Tier 2: Domain Knowledge & Historical Postmortem Guardrails (CPL / Pricing)
// Tier 3: Scoped Target Repo Rules (AGENTS.md / CLAUDE.md fetched via GitHub Contents API)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_CONTEXT_CHARS = 25_000;

let platformInvariants = { rules: [] };
let domainKnowledge = { serviceCatalog: {}, incidentGuardrails: [] };

try {
  const invPath = path.join(__dirname, "rules/platform-invariants.json");
  if (fs.existsSync(invPath)) {
    platformInvariants = JSON.parse(fs.readFileSync(invPath, "utf8"));
  }
} catch (e) {
  console.warn(`[context] note: could not load platform invariants: ${e.message}`);
}

try {
  const domPath = path.join(__dirname, "rules/domain-knowledge.json");
  if (fs.existsSync(domPath)) {
    domainKnowledge = JSON.parse(fs.readFileSync(domPath, "utf8"));
  }
} catch (e) {
  console.warn(`[context] note: could not load domain knowledge: ${e.message}`);
}

/**
 * Loads the 3-tier cascading context for a given PR diff.
 * @param {object} opts
 * @param {string} opts.owner
 * @param {string} opts.repo
 * @param {string} opts.ref
 * @param {string[]} opts.changedFiles
 * @param {string} [opts.diffSnippet]
 * @param {object} opts.octokit
 * @returns {Promise<{text: string, filesLoaded: string[], tiersLoaded: string[], catalogInfo: object|null, truncated: boolean}>}
 */
export async function loadRepoContext({ owner, repo, ref, changedFiles = [], diffSnippet = "", octokit }) {
  const tiersLoaded = [];
  const filesLoaded = [];
  const sections = [];

  const combinedSearchText = (changedFiles.join(" ") + " " + diffSnippet).toLowerCase();

  // =========================================================================
  // TIER 1: Platform Invariants (Universal Rules)
  // =========================================================================
  const matchedInvariants = platformInvariants.rules.filter((rule) => {
    return rule.triggers.some((trigger) => combinedSearchText.includes(trigger.toLowerCase()));
  });

  if (matchedInvariants.length > 0) {
    tiersLoaded.push("Platform Invariants");
    const invLines = [
      "#### 🌐 Tier 1: Platform Engineering Invariants",
      "These universal rules must be upheld regardless of repository conventions:",
      "",
    ];
    for (const inv of matchedInvariants) {
      invLines.push(`- **[${inv.id} - ${inv.category}]**: ${inv.rule}`);
    }
    sections.push(invLines.join("\n"));
  }

  // =========================================================================
  // TIER 2: Domain Memory & Postmortem Guardrails
  // =========================================================================
  const catalogEntry = domainKnowledge.serviceCatalog[repo] || null;

  const matchedGuardrails = (domainKnowledge.incidentGuardrails || []).filter((guard) => {
    return guard.triggers.some((trigger) => combinedSearchText.includes(trigger.toLowerCase()));
  });

  if (matchedGuardrails.length > 0 || catalogEntry) {
    const domainLines = [
      "#### 🛡️ Tier 2: Domain Memory & Postmortem Guardrails",
    ];

    if (catalogEntry) {
      tiersLoaded.push(`Service Catalog (${catalogEntry.name})`);
      domainLines.push(
        `* **Service Classification:** ${catalogEntry.name} (${catalogEntry.tier})`,
        `* **Domain Role:** ${catalogEntry.role}`,
        `* **Core Tech Stack:** ${catalogEntry.techStack}`,
        `* **Known Dependencies:** ${catalogEntry.dependencies.join(", ")}`,
        ""
      );
    }

    if (matchedGuardrails.length > 0) {
      tiersLoaded.push(`Incident Guardrails (${matchedGuardrails.map((g) => g.id).join(", ")})`);
      domainLines.push(
        "**Historical Outage Guardrails (Enforce Invariants):**",
        ""
      );
      for (const g of matchedGuardrails) {
        domainLines.push(`- **[${g.id}] ${g.name}** *(Source: ${g.sourceIncident})*: ${g.rule}`);
      }
    }

    sections.push(domainLines.join("\n"));
  }

  // =========================================================================
  // TIER 3: Scoped Target Repo Memory (Remote GitHub Fetch)
  // =========================================================================
  const candidatePaths = buildCandidatePaths(changedFiles);
  const remoteLoaded = [];

  for (const path of candidatePaths) {
    const content = await fetchFileIfExists({ owner, repo, ref, path, octokit });
    if (content) {
      remoteLoaded.push({ path, content });
      filesLoaded.push(path);
    }
  }

  if (remoteLoaded.length > 0) {
    tiersLoaded.push(`Remote Repo Rules (${remoteLoaded.map((f) => f.path).join(", ")})`);
    const remoteLines = [
      "#### 📚 Tier 3: Repository-Specific Rules (from GitHub)",
      "",
    ];
    for (const { path, content } of remoteLoaded) {
      remoteLines.push(`##### \`${path}\`\n\n${content.trim()}\n`);
    }
    sections.push(remoteLines.join("\n"));
  }

  if (sections.length === 0) {
    return { text: "", filesLoaded: [], tiersLoaded: [], catalogInfo: catalogEntry, truncated: false };
  }

  let text = sections.join("\n\n---\n\n");
  let truncated = false;
  if (text.length > MAX_CONTEXT_CHARS) {
    text = text.slice(0, MAX_CONTEXT_CHARS) + "\n\n[...team-memory context truncated...]";
    truncated = true;
  }

  return {
    text,
    filesLoaded,
    tiersLoaded,
    catalogInfo: catalogEntry,
    truncated,
  };
}

function buildCandidatePaths(changedFiles) {
  const topLevelDirs = new Set();
  for (const file of changedFiles) {
    const segment = file.split("/")[0];
    if (file.includes("/")) topLevelDirs.add(segment);
  }

  const paths = ["AGENTS.md", "CLAUDE.md", ".claude/pr-rules/common.md"];

  for (const dir of topLevelDirs) {
    paths.push(`${dir}/AGENTS.md`);
    paths.push(`.claude/pr-rules/${dir}.md`);
  }

  return paths;
}

async function fetchFileIfExists({ owner, repo, ref, path, octokit }) {
  try {
    if (octokit) {
      const res = await octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref: ref || undefined,
      });
      if (res.data && res.data.content) {
        return Buffer.from(res.data.content, "base64").toString("utf8");
      }
    }
  } catch (err) {
    // 404 is normal for missing files
  }
  return null;
}
