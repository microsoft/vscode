/**
 * Shared utilities for eval tiers: logging, file scanning, result types.
 */

import { readdirSync, statSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";

// ── Result types ────────────────────────────────────────────────────────────

export type Status = "pass" | "fail" | "warn";

export interface CheckResult {
  label: string;
  status: Status;
  message?: string;
}

export interface ScanResult {
  total: number;
  pass: number;
  fail: number;
  warn: number;
  items: CheckResult[];
}

// ── Output helpers ──────────────────────────────────────────────────────────

export function icon(s: Status): string {
  if (s === "pass") return "[OK]";
  if (s === "warn") return "[!] ";
  return "[X] ";
}

export function printSummary(results: CheckResult[]): void {
  const pass = results.filter((r) => r.status === "pass").length;
  const fail = results.filter((r) => r.status === "fail").length;
  const warn = results.filter((r) => r.status === "warn").length;
  console.log(`\nSummary: ${pass} checks passed, ${fail} failed, ${warn} warnings`);
}

export function printLine(r: CheckResult): void {
  console.log(`${icon(r.status)} ${r.label}${r.message ? ` — ${r.message}` : ""}`);
}

// ── File helpers ────────────────────────────────────────────────────────────

/**
 * Return immediate subdirectory names of a directory.
 */
export function listSubdirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => {
    try {
      return statSync(join(dir, name)).isDirectory();
    } catch {
      return false;
    }
  });
}

/**
 * Return all files matching an extension recursively.
 */
export function findFiles(dir: string, ext: string): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      try {
        const s = statSync(full);
        if (s.isDirectory()) walk(full);
        else if (entry.endsWith(ext)) results.push(full);
      } catch {
        // skip unreadable
      }
    }
  };
  walk(dir);
  return results;
}

/**
 * Read file safely, return null on error.
 */
export function readFileSafe(p: string): string | null {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

/**
 * Resolve project root (two levels up from scripts/eval/).
 */
export function projectRoot(): string {
  return new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
}

// ── Skill enumeration ───────────────────────────────────────────────────────

/**
 * Predicate: keep only real skill directories (exclude hidden, underscore-prefixed, and spec docs).
 */
export function isSkillDir(name: string, skillsDir: string): boolean {
  return (
    !name.startsWith(".") &&
    !name.startsWith("_") &&
    name !== "agent_skills_spec.md" &&
    existsSync(join(skillsDir, name, "SKILL.md"))
  );
}

/**
 * Return skill directory names that changed in HEAD~1..HEAD (git diff).
 */
export function getChangedSkills(root: string): string[] {
  const result = spawnSync("git", ["diff", "--name-only", "HEAD~1", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.error || result.status !== 0) return [];
  const changed = result.stdout.split("\n").filter(Boolean);
  const skillDirs = new Set<string>();
  for (const file of changed) {
    const m = file.match(/^\.claude\/skills\/([^/]+)\//);
    if (m) skillDirs.add(m[1]);
  }
  return [...skillDirs];
}

/**
 * Return all valid skill directory names under skillsDir.
 */
export function allSkillNames(skillsDir: string): string[] {
  return listSubdirs(skillsDir).filter((d) => isSkillDir(d, skillsDir));
}

// ── CLI command resolution ──────────────────────────────────────────────────

/**
 * Resolve the AI CLI command + prefix args for eval invocations.
 * Priority: CK_EVAL_CMD env var > default "claude"
 *
 * Examples:
 *   CK_EVAL_CMD="ccs glm"  → cmd: "ccs",  prefixArgs: ["glm"]
 *   CK_EVAL_CMD="claude"   → cmd: "claude", prefixArgs: []
 *   (unset)                 → cmd: "claude", prefixArgs: []
 */
export function resolveEvalCli(): { cmd: string; prefixArgs: string[] } {
  const raw = process.env.CK_EVAL_CMD?.trim();
  if (!raw) return { cmd: "claude", prefixArgs: [] };
  const parts = raw.split(/\s+/);
  return { cmd: parts[0], prefixArgs: parts.slice(1) };
}
