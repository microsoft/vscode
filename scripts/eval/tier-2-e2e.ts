/**
 * Tier 2 — E2E Harness (~$3.85/run, on-demand)
 *
 * Spawns AI CLI (claude or ccs glm via CK_EVAL_CMD) to test skill responses.
 * Supports --diff (changed skills only), --skill <name>, --all.
 *
 * Results saved as NDJSON to scripts/eval/results/e2e-{date}.ndjson
 */

import { existsSync, mkdirSync, appendFileSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";
import { projectRoot, resolveEvalCli, getChangedSkills, allSkillNames } from "./eval-utils.ts";

const ROOT = projectRoot();
const SKILLS_DIR = join(ROOT, ".claude/skills");
const RESULTS_DIR = join(ROOT, "scripts/eval/results");

const CLAUDE_TIMEOUT_MS = 60_000;
const HEARTBEAT_TIMEOUT_MS = 30_000;

// ── Types ────────────────────────────────────────────────────────────────────

export interface E2EResult {
  skill: string;
  status: "pass" | "fail" | "timeout";
  duration_ms: number;
  output_summary: string;
}

// ── AI CLI invocation (CK_EVAL_CMD="ccs glm" or default "claude") ────────────

async function testSkill(skillName: string): Promise<E2EResult> {
  const prompt =
    `Activate /ck:${skillName} and describe what you would do. Do not execute any tools.`;
  const start = Date.now();

  return new Promise((resolve) => {
    let output = "";
    let heartbeatTimer: ReturnType<typeof setTimeout>;
    let done = false;

    const finish = (status: "pass" | "fail" | "timeout", summary: string) => {
      if (done) return;
      done = true;
      clearTimeout(heartbeatTimer);
      clearTimeout(overallTimer);
      child.kill("SIGTERM");
      resolve({
        skill: skillName,
        status,
        duration_ms: Date.now() - start,
        output_summary: summary.slice(0, 200),
      });
    };

    const { cmd, prefixArgs } = resolveEvalCli();
    const child = spawn(cmd, [...prefixArgs, "-p", prompt], {
      cwd: ROOT,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const resetHeartbeat = () => {
      clearTimeout(heartbeatTimer);
      heartbeatTimer = setTimeout(() => finish("timeout", "no output for 30s"), HEARTBEAT_TIMEOUT_MS);
    };

    resetHeartbeat();

    const overallTimer = setTimeout(
      () => finish("timeout", "exceeded 60s timeout"),
      CLAUDE_TIMEOUT_MS
    );

    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      resetHeartbeat();
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      resetHeartbeat();
    });

    child.on("close", (code) => {
      if (done) return;
      const lower = output.toLowerCase();
      // Check: did Claude acknowledge the skill and describe reasonable actions?
      const acknowledged =
        lower.includes(skillName.toLowerCase()) ||
        lower.includes("skill") ||
        lower.includes("activate") ||
        lower.includes("i would");
      const status = acknowledged && (code === 0 || output.length > 50) ? "pass" : "fail";
      const summary = output.slice(0, 200).replace(/\n/g, " ").trim();
      finish(status, summary || (code !== 0 ? `exit code ${code}` : "no output"));
    });

    child.on("error", (err) => {
      if (done) return;
      finish("fail", `spawn error: ${err.message}`);
    });
  });
}

// ── Results persistence ───────────────────────────────────────────────────────

function saveResult(result: E2EResult, outFile: string): void {
  appendFileSync(outFile, JSON.stringify(result) + "\n", "utf8");
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function runTier2(opts: {
  diff?: boolean;
  skill?: string;
  all?: boolean;
  verbose?: boolean;
}): Promise<boolean> {
  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

  const date = new Date().toISOString().slice(0, 10);
  const outFile = join(RESULTS_DIR, `e2e-${date}.ndjson`);

  let skillsToTest: string[] = [];

  if (opts.skill) {
    skillsToTest = [opts.skill];
  } else if (opts.all) {
    skillsToTest = allSkillNames(SKILLS_DIR);
  } else if (opts.diff) {
    skillsToTest = getChangedSkills(ROOT);
    if (skillsToTest.length === 0) {
      console.log("[i] No changed skills detected (--diff). Nothing to test.");
      return true;
    }
  } else {
    // Default: diff mode
    skillsToTest = getChangedSkills(ROOT);
    if (skillsToTest.length === 0) {
      console.log("[i] No changed skills detected. Use --all to test everything.");
      return true;
    }
  }

  console.log(`[i] Testing ${skillsToTest.length} skill(s): ${skillsToTest.join(", ")}`);
  console.log(`[i] Results → ${outFile}\n`);

  const results: E2EResult[] = [];

  for (const skill of skillsToTest) {
    process.stdout.write(`[..] testing ${skill} ...`);
    const result = await testSkill(skill);
    saveResult(result, outFile);
    results.push(result);

    const statusIcon = result.status === "pass" ? "[OK]" : result.status === "timeout" ? "[!] " : "[X] ";
    console.log(`\r${statusIcon} ${skill} (${result.duration_ms}ms) — ${result.output_summary}`);
  }

  const pass = results.filter((r) => r.status === "pass").length;
  const fail = results.filter((r) => r.status === "fail").length;
  const timeout = results.filter((r) => r.status === "timeout").length;

  console.log(`\nSummary: ${pass} pass, ${fail} fail, ${timeout} timeout`);
  console.log(`Results saved: ${outFile}`);

  return fail === 0 && timeout === 0;
}

// CLI entry
if (import.meta.main) {
  const args = process.argv.slice(2);
  const diff = args.includes("--diff");
  const all = args.includes("--all");
  const verbose = args.includes("--verbose");
  const skillIdx = args.indexOf("--skill");
  const skill = skillIdx !== -1 ? args[skillIdx + 1] : undefined;

  const ok = await runTier2({ diff, all, skill, verbose });
  process.exit(ok ? 0 : 1);
}
