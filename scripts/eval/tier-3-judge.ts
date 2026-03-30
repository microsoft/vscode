/**
 * Tier 3 — LLM Judge (~$0.15/run, on-demand)
 *
 * Sends each SKILL.md to AI CLI (claude or ccs glm via CK_EVAL_CMD) for scoring:
 *   clarity, specificity, completeness (1-10 each).
 * Flags skills scoring below 6. Results saved to results/judge-{date}.json
 */

import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";
import { readFileSafe, projectRoot, resolveEvalCli, getChangedSkills, allSkillNames } from "./eval-utils.ts";

const ROOT = projectRoot();
const SKILLS_DIR = join(ROOT, ".claude/skills");
const RESULTS_DIR = join(ROOT, "scripts/eval/results");

const LOW_SCORE_THRESHOLD = 6;
const JUDGE_TIMEOUT_MS = 60_000;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface JudgeScore {
  clarity: number;
  specificity: number;
  completeness: number;
  overall: number;
  feedback: string;
}

export interface JudgeResult {
  skill: string;
  status: "pass" | "fail" | "error";
  scores?: JudgeScore;
  error?: string;
}

// ── AI CLI invocation (CK_EVAL_CMD="ccs glm" or default "claude") ────────────

function judgeSkill(skillName: string, skillContent: string): JudgeResult {
  const prompt = [
    `Rate this skill instruction on a 1-10 scale for:`,
    `(a) clarity of role definition`,
    `(b) specificity of instructions`,
    `(c) completeness of workflow`,
    ``,
    `Return ONLY valid JSON with no markdown fences:`,
    `{"clarity": N, "specificity": N, "completeness": N, "overall": N, "feedback": "brief note"}`,
    ``,
    `Skill content:`,
    `---`,
    skillContent.slice(0, 3000), // cap to avoid token overflow
    `---`,
  ].join("\n");

  const { cmd, prefixArgs } = resolveEvalCli();
  const result = spawnSync(cmd, [...prefixArgs, "-p", prompt], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: JUDGE_TIMEOUT_MS,
    env: { ...process.env },
  });

  if (result.error) {
    return { skill: skillName, status: "error", error: result.error.message };
  }

  const raw = (result.stdout ?? "").trim();

  // Extract JSON from output — Claude may wrap with extra text
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { skill: skillName, status: "error", error: `no JSON in response: ${raw.slice(0, 100)}` };
  }

  try {
    const scores = JSON.parse(jsonMatch[0]) as JudgeScore;
    // Validate required fields
    for (const key of ["clarity", "specificity", "completeness", "overall"] as const) {
      if (typeof scores[key] !== "number") {
        return { skill: skillName, status: "error", error: `missing numeric field: ${key}` };
      }
    }
    const isLow = scores.overall < LOW_SCORE_THRESHOLD;
    return { skill: skillName, status: isLow ? "fail" : "pass", scores };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { skill: skillName, status: "error", error: `JSON parse failed: ${msg}` };
  }
}

// ── Reporting ─────────────────────────────────────────────────────────────────

function printResult(r: JudgeResult): void {
  if (r.status === "error") {
    console.log(`[X]  ${r.skill}: ${r.error}`);
    return;
  }
  const s = r.scores!;
  const indicator = r.status === "fail" ? "[!] " : "[OK]";
  console.log(
    `${indicator} ${r.skill.padEnd(20)} clarity:${s.clarity} spec:${s.specificity} complete:${s.completeness} overall:${s.overall} — ${s.feedback}`
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function runTier3(opts: {
  diff?: boolean;
  skill?: string;
  all?: boolean;
  verbose?: boolean;
}): Promise<boolean> {
  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

  let skillsToTest: string[] = [];

  if (opts.skill) {
    skillsToTest = [opts.skill];
  } else if (opts.all) {
    skillsToTest = allSkillNames(SKILLS_DIR);
  } else if (opts.diff) {
    skillsToTest = getChangedSkills(ROOT);
    if (skillsToTest.length === 0) {
      console.log("[i] No changed skills detected (--diff). Nothing to judge.");
      return true;
    }
  } else {
    skillsToTest = getChangedSkills(ROOT);
    if (skillsToTest.length === 0) {
      console.log("[i] No changed skills detected. Use --all to judge everything.");
      return true;
    }
  }

  console.log(`[i] Judging ${skillsToTest.length} skill(s)...\n`);

  const results: JudgeResult[] = [];

  for (const skill of skillsToTest) {
    const skillMd = join(SKILLS_DIR, skill, "SKILL.md");
    if (!existsSync(skillMd)) {
      const r: JudgeResult = { skill, status: "error", error: "SKILL.md not found" };
      results.push(r);
      printResult(r);
      continue;
    }

    process.stdout.write(`[..] judging ${skill} ...`);
    const content = readFileSafe(skillMd) ?? "";
    const result = judgeSkill(skill, content);
    results.push(result);
    process.stdout.write("\r");
    printResult(result);
  }

  // Aggregate averages
  const scored = results.filter((r) => r.scores);
  if (scored.length > 0) {
    const avg = (key: keyof JudgeScore) =>
      (scored.reduce((sum, r) => sum + (r.scores![key] as number), 0) / scored.length).toFixed(1);

    console.log(`\nAverages: clarity:${avg("clarity")} spec:${avg("specificity")} complete:${avg("completeness")} overall:${avg("overall")}`);

    const lowScoring = results.filter((r) => r.scores && r.scores.overall < LOW_SCORE_THRESHOLD);
    if (lowScoring.length > 0) {
      console.log(`\n[!]  ${lowScoring.length} skill(s) scored below ${LOW_SCORE_THRESHOLD}: ${lowScoring.map((r) => r.skill).join(", ")}`);
    }
  }

  // Save results
  const date = new Date().toISOString().slice(0, 10);
  const outFile = join(RESULTS_DIR, `judge-${date}.json`);
  writeFileSync(outFile, JSON.stringify({ date, results }, null, 2), "utf8");
  console.log(`\nResults saved: ${outFile}`);

  const failures = results.filter((r) => r.status === "fail" || r.status === "error").length;
  return failures === 0;
}

// CLI entry
if (import.meta.main) {
  const args = process.argv.slice(2);
  const diff = args.includes("--diff");
  const all = args.includes("--all");
  const verbose = args.includes("--verbose");
  const skillIdx = args.indexOf("--skill");
  const skill = skillIdx !== -1 ? args[skillIdx + 1] : undefined;

  const ok = await runTier3({ diff, all, skill, verbose });
  process.exit(ok ? 0 : 1);
}
