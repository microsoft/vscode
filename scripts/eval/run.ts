/**
 * Eval runner — entry point for all 3 tiers.
 *
 * Usage:
 *   bun scripts/eval/run.ts [tier] [options]
 *
 * Tiers:
 *   1           Static validation (default, CI-mandatory)
 *   2           E2E harness (on-demand, ~$3.85/run)
 *   3           LLM judge (on-demand, ~$0.15/run)
 *   all         Run all tiers sequentially
 *
 * Options:
 *   --diff          Only test changed files (Tier 2, 3)
 *   --skill <name>  Test specific skill (Tier 2, 3)
 *   --all           Test all skills (Tier 2, 3)
 *   --verbose       Show detailed output
 */

import { runTier1 } from "./tier-1-static.ts";
import { runTier2 } from "./tier-2-e2e.ts";
import { runTier3 } from "./tier-3-judge.ts";

const args = process.argv.slice(2);
const tier = args[0] ?? "1";
const verbose = args.includes("--verbose");
const diff = args.includes("--diff");
const allSkills = args.includes("--all");
const skillIdx = args.indexOf("--skill");
const skill = skillIdx !== -1 ? args[skillIdx + 1] : undefined;

function printUsage(): void {
  console.log(`
Usage: bun scripts/eval/run.ts [tier] [options]

Tiers:
  1           Static validation (default, CI-mandatory, ~$0, <5s)
  2           E2E harness (on-demand, ~$3.85/run)
  3           LLM judge (on-demand, ~$0.15/run)
  all         Run all tiers sequentially

Options:
  --diff          Only test changed files vs HEAD~1 (Tier 2, 3)
  --skill <name>  Test a specific skill by name (Tier 2, 3)
  --all           Test all skills, not just changed (Tier 2, 3)
  --verbose       Show detailed per-item output
`);
}

async function main(): Promise<void> {
  if (tier === "--help" || tier === "-h") {
    printUsage();
    process.exit(0);
  }

  const opts = { diff, skill, all: allSkills, verbose };
  let ok = true;

  if (tier === "1") {
    console.log("=== Tier 1: Static Validation ===\n");
    ok = await runTier1(verbose);
  } else if (tier === "2") {
    console.log("=== Tier 2: E2E Harness ===\n");
    ok = await runTier2(opts);
  } else if (tier === "3") {
    console.log("=== Tier 3: LLM Judge ===\n");
    ok = await runTier3(opts);
  } else if (tier === "all") {
    console.log("=== Tier 1: Static Validation ===\n");
    const t1 = await runTier1(verbose);
    console.log("\n=== Tier 2: E2E Harness ===\n");
    const t2 = await runTier2(opts);
    console.log("\n=== Tier 3: LLM Judge ===\n");
    const t3 = await runTier3(opts);
    ok = t1 && t2 && t3;
    console.log(`\n=== All tiers complete: ${ok ? "PASS" : "FAIL"} ===`);
  } else {
    console.error(`[X]  Unknown tier: "${tier}". Run with --help for usage.`);
    process.exit(1);
  }

  process.exit(ok ? 0 : 1);
}

await main();
