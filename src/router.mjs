// src/router.mjs
//
// Layer 3: Deterministic Risk Router & Auto-Stamp Gate.
// Inspired by PostHog's StampHog and Morgan Stanley's DDRA.
// Evaluates diff size, sensitive path deny-lists, and architectural impact
// before calling LLMs.

const DENY_LIST_PATTERNS = [
  { category: "Pricing & Billing", regex: /(?:pricing|billing|fee|payment|invoice|campaign.*capping|currency)/i },
  { category: "Security & Auth", regex: /(?:auth|secret|token|credential|session|\.env|password|key)/i },
  { category: "Database & Schema", regex: /(?:migration|schema|flyway|liquibase|\.sql)/i },
  { category: "Public API & Gateway", regex: /(?:public-api|\/api\/v\d+\/|ingress|envoy|contour)/i },
  { category: "Infrastructure & CI", regex: /(?:\.github\/workflows|helm|k8s|dockerfile|spinnaker)/i },
];

const MAX_FAST_PATH_LINES = 150;
const MAX_FAST_PATH_FILES = 5;
const MAX_STANDARD_LINES = 500;
const MAX_STANDARD_FILES = 20;

/**
 * Evaluates the PR diff against deterministic risk criteria.
 * @param {object} params
 * @param {string[]} params.changedFiles
 * @param {number} params.totalAdditions
 * @param {number} params.totalDeletions
 * @param {boolean} params.isDraft
 * @returns {object} Risk routing verdict
 */
export function evaluateRisk({ changedFiles = [], totalAdditions = 0, totalDeletions = 0, isDraft = false }) {
  const totalLinesChanged = totalAdditions + totalDeletions;
  const fileCount = changedFiles.length;

  const matchedDenyList = [];
  for (const file of changedFiles) {
    for (const rule of DENY_LIST_PATTERNS) {
      if (rule.regex.test(file)) {
        matchedDenyList.push({ file, category: rule.category });
      }
    }
  }

  const uniqueCategories = [...new Set(matchedDenyList.map((m) => m.category))];

  let riskLevel = "LOW";
  let recommendation = "FAST_PATH";
  const reasons = [];

  if (uniqueCategories.length > 0) {
    riskLevel = "HIGH";
    recommendation = "ESCALATE_HUMAN";
    reasons.push(`Touches sensitive path(s): ${uniqueCategories.join(", ")}`);
  }

  if (totalLinesChanged > MAX_STANDARD_LINES || fileCount > MAX_STANDARD_FILES) {
    riskLevel = "HIGH";
    recommendation = "ESCALATE_HUMAN";
    reasons.push(`Diff exceeds standard threshold: ${totalLinesChanged} lines changed across ${fileCount} files`);
  } else if (totalLinesChanged > MAX_FAST_PATH_LINES || fileCount > MAX_FAST_PATH_FILES) {
    if (riskLevel === "LOW") {
      riskLevel = "MEDIUM";
      recommendation = "STANDARD_REVIEW";
      reasons.push(`Medium diff size: ${totalLinesChanged} lines across ${fileCount} files`);
    }
  }

  if (isDraft) {
    reasons.push("PR is currently marked as DRAFT");
  }

  if (recommendation === "FAST_PATH") {
    reasons.push(`Compact diff (${totalLinesChanged} lines, ${fileCount} files) with no sensitive paths touched`);
  }

  return {
    riskLevel, // LOW | MEDIUM | HIGH
    recommendation, // FAST_PATH | STANDARD_REVIEW | ESCALATE_HUMAN
    totalLinesChanged,
    fileCount,
    sensitiveCategories: uniqueCategories,
    flaggedFiles: matchedDenyList.slice(0, 5),
    reasons,
  };
}
