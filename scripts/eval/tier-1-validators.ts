/**
 * Tier 1 validator functions — extracted to keep tier-1-static.ts under 200 lines.
 * Each function validates one category and returns a ScanResult or CheckResult.
 */

import { existsSync } from "fs";
import { join } from "path";
import { CheckResult, ScanResult, listSubdirs, findFiles, readFileSafe } from "./eval-utils.ts";

// ── YAML frontmatter parser ──────────────────────────────────────────────────

interface FrontmatterResult {
  fields: Record<string, unknown>;
  error?: string;
}

function parseFrontmatter(content: string): FrontmatterResult {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { fields: {}, error: "no frontmatter found" };
  const fields: Record<string, unknown> = {};
  for (const line of match[1].split("\n")) {
    const m = line.match(/^(\w[\w-]*):\s*(.+)$/);
    if (m) fields[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    const nested = line.match(/^\s{2}(\w[\w-]*):\s*(.+)$/);
    if (nested) fields[`metadata.${nested[1]}`] = nested[2].trim().replace(/^["']|["']$/g, "");
  }
  return { fields };
}

// ── Skills ───────────────────────────────────────────────────────────────────

export function validateSkills(skillsDir: string): ScanResult {
  const skillDirs = listSubdirs(skillsDir).filter(
    (d) => !d.startsWith(".") && !d.startsWith("_") && d !== "agent_skills_spec.md"
  );
  const items: CheckResult[] = [];
  let pass = 0, fail = 0, warn = 0;

  for (const skill of skillDirs) {
    const skillMd = join(skillsDir, skill, "SKILL.md");
    if (!existsSync(skillMd)) {
      items.push({ label: `skills/${skill}`, status: "warn", message: "no SKILL.md" });
      warn++; continue;
    }
    const content = readFileSafe(skillMd) ?? "";
    const { fields, error } = parseFrontmatter(content);
    if (error) {
      items.push({ label: `skills/${skill}`, status: "fail", message: error });
      fail++; continue;
    }
    const missing = ["name", "description"].filter((k) => !fields[k]);
    const warnings = ["metadata.version", "argument-hint"].filter((k) => !fields[k]);
    if (missing.length > 0) {
      items.push({ label: `skills/${skill}`, status: "fail", message: `missing: ${missing.join(", ")}` });
      fail++;
    } else if (warnings.length > 0) {
      items.push({ label: `skills/${skill}`, status: "warn", message: `no ${warnings.join(", ")}` });
      warn++;
    } else {
      pass++;
    }
  }
  return { total: skillDirs.length, pass, fail, warn, items };
}

// ── Agents ───────────────────────────────────────────────────────────────────

export function validateAgents(agentsDir: string): ScanResult {
  const agentFiles = findFiles(agentsDir, ".md");
  const items: CheckResult[] = [];
  let pass = 0, fail = 0, warn = 0;

  for (const file of agentFiles) {
    const content = readFileSafe(file) ?? "";
    const name = file.replace(agentsDir + "/", "");
    if (content.trim().length === 0) {
      items.push({ label: `agents/${name}`, status: "fail", message: "empty file" });
      fail++; continue;
    }
    const hasHeading = /^#{1,3} .+/m.test(content);
    const bodyLines = content.split("\n").filter((l) => l.trim().length > 0 && !l.startsWith("#"));
    if (!hasHeading || bodyLines.length < 2) {
      items.push({ label: `agents/${name}`, status: "warn", message: "missing heading or body — unclear role description" });
      warn++;
    } else {
      pass++;
    }
  }
  return { total: agentFiles.length, pass, fail, warn, items };
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

/** Only top-level .cjs files are entrypoint hooks (not lib/, tests/, vendor, etc.) */
function isEntrypointHook(name: string): boolean {
  return !name.includes("/");
}

export function validateHooks(hooksDir: string): ScanResult {
  const hookFiles = findFiles(hooksDir, ".cjs");
  const items: CheckResult[] = [];
  let pass = 0, fail = 0, warn = 0;

  for (const file of hookFiles) {
    const content = readFileSafe(file) ?? "";
    const name = file.replace(hooksDir + "/", "");
    // Strip shebang before syntax check (new Function rejects '#!')
    const checkable = content.startsWith("#!") ? content.slice(content.indexOf("\n") + 1) : content;
    try {
      new Function(checkable);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      items.push({ label: `hooks/${name}`, status: "fail", message: `syntax error: ${msg}` });
      fail++; continue;
    }
    if (isEntrypointHook(name) && !content.includes("process.exit(0)")) {
      items.push({ label: `hooks/${name}`, status: "warn", message: "missing process.exit(0) — fail-open risk" });
      warn++;
    } else {
      pass++;
    }
  }
  return { total: hookFiles.length, pass, fail, warn, items };
}

// ── Config files ──────────────────────────────────────────────────────────────

export function validateCkJson(ckJsonPath: string): CheckResult {
  if (!existsSync(ckJsonPath)) return { label: ".ck.json", status: "warn", message: "not found" };
  const content = readFileSafe(ckJsonPath) ?? "";
  try {
    JSON.parse(content);
    return { label: ".ck.json", status: "pass" };
  } catch (e: unknown) {
    return { label: ".ck.json", status: "fail", message: `invalid JSON: ${(e as Error).message}` };
  }
}

export function validateManifest(manifestPath: string): CheckResult {
  if (!existsSync(manifestPath)) return { label: "portable-manifest.json", status: "warn", message: "not found" };
  const content = readFileSafe(manifestPath) ?? "";
  try {
    const obj = JSON.parse(content);
    if (!obj.version) return { label: "portable-manifest.json", status: "warn", message: "missing version field" };
    return { label: "portable-manifest.json", status: "pass" };
  } catch (e: unknown) {
    return { label: "portable-manifest.json", status: "fail", message: `invalid JSON: ${(e as Error).message}` };
  }
}

export function validateSkillReferences(skillsDir: string): CheckResult {
  const skillDirs = listSubdirs(skillsDir).filter(
    (d) => !d.startsWith(".") && !d.startsWith("_") && d !== "agent_skills_spec.md"
  );
  const broken: string[] = [];

  for (const skill of skillDirs) {
    const content = readFileSafe(join(skillsDir, skill, "SKILL.md")) ?? "";
    for (const ref of content.matchAll(/references\/([^\s\)"`]+)/g)) {
      const refPath = join(skillsDir, skill, "references", ref[1]);
      if (!existsSync(refPath) || !existsSync(join(skillsDir, skill, "references"))) {
        broken.push(`skills/${skill}/references/${ref[1]}`);
      }
    }
  }

  if (broken.length > 0) {
    const extra = broken.length > 3 ? ` (+${broken.length - 3} more)` : "";
    return { label: "skill references", status: "warn", message: `broken: ${broken.slice(0, 3).join(", ")}${extra}` };
  }
  return { label: "skill references", status: "pass", message: "no broken references found" };
}
