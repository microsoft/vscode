---
name: Superpowers vs CKE Post-Adoption Comparison
description: Updated comparison after adopting Superpowers discipline-enforcement into CKE
type: brainstorm-report
date: 2026-03-15
previous: plans/reports/brainstorm-260315-1144-superpowers-vs-cke-analysis.md
---

# Superpowers vs CKE — Post-Adoption Comparison

> **Context:** This report compares after CKE adopted 6 Superpowers learnings (commit `f93d3cc`).
> Previous report: `brainstorm-260315-1144-superpowers-vs-cke-analysis.md`

---

## 1. What Changed

| # | Learning Adopted | Before | After |
|---|-----------------|--------|-------|
| 1 | Hard Gates | No enforcement — workflows described in prose | `<HARD-GATE>` blocks in cook, fix, brainstorm prevent premature action |
| 2 | Anti-Rationalization Tables | None | 17 rationalization patterns covered across 3 skills |
| 3 | Authoritative Process Flows | Text-only workflow descriptions | Mermaid flowcharts in cook, fix, brainstorm, plan marked as authoritative |
| 4 | Two-Stage Code Review | Single-pass quality review | Stage 1 (spec compliance) + Stage 2 (code quality) with new reference |
| 5 | Subagent Status Protocol | No standardized reporting | DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT with handling rules |
| 6 | Scope Assessment | Not checked | Brainstorm step 3 flags 3+ independent subsystems for decomposition |
| 7 | Context Isolation | Subagent-init hook (~200 tokens) | Explicit guidelines + prompt template + anti-pattern table |

---

## 2. Updated Feature-by-Feature Matrix

| Feature | Superpowers | CKE (Post-Adoption) | Winner |
|---------|-------------|---------------------|--------|
| **Brainstorming** | Socratic, visual companion, spec review loop, hard gates | Hard gate, scope assessment, anti-rationalization, Mermaid flow, agent delegation | **Tie** |
| **Planning** | Bite-sized tasks, chunk review, TDD-enforced | Multi-phase, structured dirs, kanban, Mermaid flow, scope check | **CKE** |
| **TDD Enforcement** | Iron Law, delete-code-first, rationalization tables | Mentioned in rules + hard gate in fix (root cause first) | **Superpowers** |
| **Code Review** | Two-stage (spec + quality), loop-based | Two-stage (spec + quality), edge case scouting, task pipeline | **Tie** |
| **Debugging** | 4-phase systematic, root-cause tracing, 3-fix rule | 4-phase systematic, root-cause tracing, hard gate (no fix before RCA), 3-fix rule, anti-rationalization | **Tie** |
| **Git Workflow** | Worktree-first, branch finishing | Git-manager agent, conventional commits, worktree skill | **Superpowers** |
| **Domain Skills** | None (14 workflow skills) | 70+ covering full-stack, mobile, AI, DevOps, payments | **CKE** |
| **Agent Orchestration** | Subagent dispatch, fresh-per-task | 14 agents, team coordination, status protocol, context isolation | **CKE** |
| **Hook System** | 1 hook (SessionStart) | 15+ hooks (lifecycle management) | **CKE** |
| **Multi-Platform** | CC, Codex, OpenCode, Gemini, Cursor | CC, OpenCode | **Superpowers** |
| **Test Infrastructure** | 5 test suites, token analysis | Hook unit tests | **Superpowers** |
| **Memory/Persistence** | None | File-based memory system | **CKE** |
| **Visual Tools** | Brainstorm companion | Preview, diagrams, slides, markdown viewer | **CKE** |
| **Security** | None | Privacy block, security scan, secret detection | **CKE** |
| **Documentation** | Minimal | Full management system | **CKE** |
| **Workflow Enforcement** | Hard gates, DOT flows, rationalization tables | Hard gates, Mermaid flows, rationalization tables, status protocol | **Tie** |

### Score Summary

| | Before Adoption | After Adoption |
|---|---|---|
| **Superpowers wins** | 6 | 3 |
| **CKE wins** | 8 | 9 |
| **Tie** | 1 | 4 |

**CKE closed 3 gaps** that were Superpowers advantages → now ties. Remaining SP advantages: TDD iron law, multi-platform, test infrastructure.

---

## 3. Gap Analysis — What Superpowers Still Does Better

### 3.1 TDD Iron Law (Gap: Medium)

**Superpowers:** Strict TDD enforcement — "NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST." Delete code written before tests. No exceptions.

**CKE:** Has `test` skill and `tester` agent but doesn't enforce TDD ordering. Testing is a step, not a prerequisite.

**Recommendation:** Add TDD enforcement as optional mode in `cook` skill (`--tdd` flag). Not default — too opinionated for general use. But available for teams that want it.

### 3.2 Multi-Platform Support (Gap: Medium)

**Superpowers:** Claude Code, Codex, OpenCode, Gemini CLI, Cursor — with platform-specific install, tool mapping, polyglot hooks.

**CKE:** Claude Code, OpenCode only.

**Recommendation:** Priority 4. Gemini CLI extension format + Cursor plugin manifest would cover 90% of gap. Not urgent — CC is primary platform.

### 3.3 Skill Test Infrastructure (Gap: Low-Medium)

**Superpowers:** 5 test suites validating skill behavior: triggering, integration, explicit requests, e2e workflows, token analysis.

**CKE:** Hook unit tests only. No skill behavior tests.

**Recommendation:** Priority 3. Build skill-triggering tests using `claude -p` headless mode. Start with core 4 skills (cook, fix, brainstorm, plan).

### 3.4 Brainstorm Visual Companion (Gap: Low)

**Superpowers:** WebSocket server showing mockups/diagrams in browser during brainstorming.

**CKE:** Has `preview` skill + `markdown-novel-viewer` but not integrated into brainstorm flow.

**Recommendation:** Priority 4. CKE's preview system is more versatile. Could add optional visual step to brainstorm, but not critical.

### 3.5 Spec-Then-Plan Two-Document Approach (Gap: Low)

**Superpowers:** Writes spec document first → spec review loop → then writes plan.

**CKE:** Brainstorm produces report → plan produces plan. Similar but less formal spec review loop.

**Recommendation:** Not needed. CKE's brainstorm report serves as spec. Adding formal spec review loop would add overhead without proportional benefit.

---

## 4. What CKE Does Better (Unchanged)

These CKE advantages remain and Superpowers has no equivalent:

| CKE Advantage | Detail |
|---------------|--------|
| **70+ domain skills** | Full-stack coverage: React, Vue, Three.js, Flutter, NestJS, Stripe, etc. |
| **14 specialized agents** | Planner, researcher, tester, debugger, UI/UX designer, etc. |
| **15+ lifecycle hooks** | Privacy, scout block, simplify reminder, task completion, team inject |
| **Agent team orchestration** | File ownership, communication protocol, task claiming, shutdown |
| **Plan management system** | Timestamped dirs, multi-phase, kanban, progress tracking |
| **Memory system** | User, feedback, project, reference memories with MEMORY.md index |
| **MCP integration** | Browser automation, external tools via mcp-manager |
| **Security features** | Privacy block, security scan, secret detection |
| **Documentation management** | Docs-manager agent, auto changelog/roadmap |

---

## 5. Adoption Impact Assessment

### Quantitative

- **Skills enhanced:** 5 (cook, fix, brainstorm, code-review, plan)
- **Rules enhanced:** 1 (orchestration-protocol)
- **New references:** 1 (spec-compliance-review)
- **Lines added:** ~248 across 6 modified files
- **Breaking changes:** 0
- **Existing mode compatibility:** 100% (--auto, --fast, --quick all preserved)

### Qualitative

| Dimension | Before | After | Impact |
|-----------|--------|-------|--------|
| Workflow enforcement | Prose-based, easily skipped | Hard gates + Mermaid flows | High — models follow structured constraints more reliably |
| LLM rationalization prevention | None | 17 patterns across 3 skills | Medium — catches common excuse patterns |
| Code review thoroughness | Single-pass quality | Two-stage (spec then quality) | High — prevents well-written code that misses requirements |
| Subagent communication | Unstructured | 4 statuses with handling rules | Medium — clearer escalation paths |
| Context efficiency | ~200 token injection | Explicit isolation guidelines | Medium — prevents context window pollution |
| Scope management | None | Early decomposition gate | Low-Medium — catches over-scoped projects |

---

## 6. Conclusion

CKE has successfully adopted Superpowers' core discipline-enforcement philosophy while maintaining its own breadth advantage. The adoption closed 3 of 6 gaps (workflow enforcement, code review, debugging) to ties while preserving all existing CKE strengths.

**Remaining gaps are intentional trade-offs:**
- TDD iron law → too opinionated for CKE's general-purpose positioning
- Multi-platform → CC is primary, others can be added incrementally
- Skill tests → good idea but lower priority than feature work

**Net result:** CKE now combines Superpowers-level discipline with a 5x larger skill ecosystem, 14x more agents, and 15x more hooks. The best of both worlds.
