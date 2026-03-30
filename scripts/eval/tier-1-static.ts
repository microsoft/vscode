/**
 * Tier 1 — Static Validation
 * $0 cost, <5s, CI-mandatory.
 *
 * Orchestrates validators from tier-1-validators.ts and prints results.
 * Validates: SKILL.md frontmatter, agent .md files, hook .cjs syntax,
 * .ck.json, portable-manifest.json, broken references in skills.
 */

import { join } from "path";
import {
  CheckResult,
  ScanResult,
  projectRoot,
  printLine,
  printSummary,
  icon,
} from "./eval-utils.ts";
import {
  validateSkills,
  validateAgents,
  validateHooks,
  validateCkJson,
  validateManifest,
  validateSkillReferences,
} from "./tier-1-validators.ts";

const ROOT = projectRoot();
const SKILLS_DIR = join(ROOT, ".claude/skills");
const AGENTS_DIR = join(ROOT, ".claude/agents");
const HOOKS_DIR = join(ROOT, ".claude/hooks");
const CK_JSON = join(ROOT, ".claude/.ck.json");
const MANIFEST = join(ROOT, "portable-manifest.json");

// ── Print helpers ─────────────────────────────────────────────────────────────

function printScanResult(
  scan: ScanResult,
  category: string,
  verbose: boolean
): CheckResult {
  const status = scan.fail > 0 ? "fail" : scan.warn > 0 ? "warn" : "pass";
  const warnMsg = scan.warn > 0 ? `${scan.warn} ${category} have warnings` : `${scan.total} ${category} validated`;
  const label =
    scan.fail > 0
      ? `${scan.fail} ${category} have errors`
      : `${warnMsg} (${scan.pass} pass, ${scan.fail} fail, ${scan.warn} warn)`;
  const result: CheckResult = { label, status };
  printLine(result);
  if (verbose || scan.fail > 0 || (scan.warn > 0 && category === "hooks")) {
    scan.items
      .filter((i) => i.status !== "pass")
      .forEach((r) =>
        console.log(`    ${icon(r.status)} ${r.label}${r.message ? ": " + r.message : ""}`)
      );
  }
  return result;
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function runTier1(verbose = false): Promise<boolean> {
  const allResults: CheckResult[] = [];

  allResults.push(printScanResult(validateSkills(SKILLS_DIR), "skills", verbose));
  allResults.push(printScanResult(validateAgents(AGENTS_DIR), "agents", verbose));
  allResults.push(printScanResult(validateHooks(HOOKS_DIR), "hooks", verbose));

  const ckJson = validateCkJson(CK_JSON);
  printLine(ckJson);
  allResults.push(ckJson);

  const manifest = validateManifest(MANIFEST);
  printLine(manifest);
  allResults.push(manifest);

  const refs = validateSkillReferences(SKILLS_DIR);
  printLine(refs);
  allResults.push(refs);

  printSummary(allResults);

  return allResults.every((r) => r.status !== "fail");
}

// CLI entry
if (import.meta.main) {
  const verbose = process.argv.includes("--verbose");
  const ok = await runTier1(verbose);
  process.exit(ok ? 0 : 1);
}
