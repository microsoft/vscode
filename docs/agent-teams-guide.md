# Agent Teams — Orchestration Guide

> Feature added in ClaudeKit Engineer v2.11.x | Claude Code v2.1.33+ | Status: Experimental
> Source: https://code.claude.com/docs/en/agent-teams | Last synced: Feb 5, 2026
> Skill version: v2.1.0 — event-driven hooks, agent memory, Task restrictions

## Overview

Agent Teams enable multiple **independent Claude Code sessions** working in parallel, coordinated by a lead session. Unlike subagents (Task tool), teammates have their own context windows, communicate peer-to-peer, and share a task list.

**Use case:** Complex tasks where parallel exploration + inter-agent discussion adds value (research, cross-layer implementation, competing hypotheses).

## Prerequisites

Enable in `settings.json` (may be GA in Claude Code 2.1.33+):
```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

## Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                     YOUR TERMINAL                             │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                    TEAM LEAD                            │  │
│  │            (your main Claude session)                   │  │
│  │                                                         │  │
│  │  - Create team (spawnTeam)                              │  │
│  │  - Create & assign tasks (TaskCreate/TaskUpdate)        │  │
│  │  - Spawn teammates (Task tool + team_name)              │  │
│  │  - Message teammates (SendMessage)                      │  │
│  │  - Synthesize results                                   │  │
│  │  - Shut down teammates & cleanup                        │  │
│  └──────────┬──────────────┬──────────────┬────────────────┘  │
│             │              │              │                   │
│    ┌────────▼──────┐ ┌────▼────────┐ ┌───▼─────────┐         │
│    │  Teammate A   │ │ Teammate B  │ │ Teammate C  │          │
│    │  (own context)│ │ (own context)│ │ (own context)│        │
│    │               │ │              │ │              │        │
│    │ Can message:  │ │ Can message: │ │ Can message: │        │
│    │ - Lead        │ │ - Lead       │ │ - Lead       │        │
│    │ - B, C        │ │ - A, C       │ │ - A, B       │        │
│    └───────────────┘ └──────────────┘ └──────────────┘        │
│                                                               │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  SHARED INFRASTRUCTURE                                   │ │
│  │  ~/.claude/teams/{name}/config.json   <- Team roster     │ │
│  │  ~/.claude/tasks/{name}/              <- Task list       | │
│  │  Mailbox system                       <- Message delivery│ │
│  └──────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

| Component | Location | Purpose |
|-----------|----------|---------|
| Team config | `~/.claude/teams/{name}/config.json` | Team membership (name, agentId, agentType) |
| Task list | `~/.claude/tasks/{name}/` | Shared work items with dependencies |
| Lead | Main Claude Code session | Coordinates, assigns, synthesizes |
| Teammates | Separate sessions | Independent workers with full tool access |
| Mailbox | Internal messaging system | Auto-delivery of messages between agents |

**Context inheritance:** Each teammate loads CLAUDE.md, skills, agents, hooks, MCP servers — same as any fresh session. They do **NOT** inherit the lead's conversation history. Include task-specific context in the spawn prompt.

## CK-Native Behavior

The `/ck:team` skill (v2.1.0) is an **imperative execution engine** — templates auto-execute on activation, not a manual playbook.

It automatically integrates with the CK workflow stack:

| Template | Wraps Workflow | Auto-Injected |
|----------|---------------|---------------|
| `/ck:team research` | `/ck:research` | Report naming, output format |
| `/ck:team cook` | `/ck:cook` | Phase sequence, docs sync eval |
| `/ck:team review` | `/ck:code-review` | Evidence gates, severity ratings |
| `/ck:team debug` | `/ck:fix` | Root-cause-first, adversarial hypotheses |

Teammates automatically receive CK context (reports path, naming pattern, branch, commit conventions) via the SubagentStart hook (`team-context-inject.cjs`).

## Subagents vs Agent Teams

```
SUBAGENTS (Task tool)                  AGENT TEAMS (Teammate tool)
═════════════════════                  ═════════════════════════════

  ┌─────────┐                            ┌─────────┐
  │  LEAD   │                            │  LEAD   │
  └────┬────┘                            └────┬────┘
       │                                      │
  ┌────▼────┐  <- reports back           ┌────▼────┐
  │ Worker  │──────────────┐             │ Worker A│<──────────┐
  └─────────┘              │             └────┬────┘           │
                           │                  │          ┌─────┴────┐
  One-way:                 v             ┌────▼────┐     │ Worker C │
  worker -> lead only    Result          │ Worker B│<--->└──────────┘
                                         └─────────┘
  No worker<->worker                     Multi-way:
  communication                          everyone <-> everyone
```

| Dimension | Subagents | Agent Teams |
|-----------|-----------|-------------|
| Communication | Worker -> Lead only | Any -> Any (peer-to-peer) |
| Context | Own window; results return to caller | Own window; fully independent |
| Coordination | Lead manages all work | Shared task list + self-coordination |
| Token cost | Lower (results summarized back) | Higher (N separate Claude instances) |
| Best for | Quick focused tasks, sequential chains | Complex parallel + discussion |
| User control | Cannot interact with subagents | Can message teammates directly |

**Default rule:** Subagents for focused tasks. Teams for collaborative parallel work requiring discussion.

## Message Flow

```
SendMessage types:
═══════════════════════════════════════════════════════════════

1. "message"  --- Direct 1:1 message
   Lead ────────────> Teammate A
   Teammate A ──────> Teammate B

2. "broadcast" --- Fan-out to ALL (expensive! N = N API calls)
   Lead ────────────> Teammate A
        ────────────> Teammate B
        ────────────> Teammate C

3. "shutdown_request" / "shutdown_response"
   Lead ── shutdown_request ────> Teammate
   Lead <── shutdown_response ── Teammate
                                 (approve=true -> exits gracefully)
                                 (approve=false -> stays, sends reason)

4. "plan_approval_response" (for teammates in plan mode)
   Teammate ── ExitPlanMode ──> Lead (sends plan_approval_request)
   Lead ── plan_approval_response ──> Teammate
           (approve=true -> exits plan mode, begins implementation)
           (approve=false + feedback -> revises plan, resubmits)
```

**Key:** Messages auto-deliver to recipients. Lead does not poll. Idle notifications sent automatically when teammate's turn ends.

## Task Lifecycle

```
                    TaskCreate
                        │
                        v
              ┌─────────────────┐
              │     PENDING     │ <- created, unassigned
              │  (owner: none)  │
              └────────┬────────┘
                       │
            TaskUpdate │ (owner + status: in_progress)
                       │
              ┌────────▼────────┐
              │   IN_PROGRESS   │ <- teammate working
              │  (owner: "dev1")│
              └────────┬────────┘
                       │
            TaskUpdate │ (status: completed)
                       │
              ┌────────▼────────┐
              │    COMPLETED    │ <- done, unblocks dependents
              └─────────────────┘

Dependencies:
  Task 2 ──blockedBy──> Task 1
  (Task 2 cannot start until Task 1 completes)
  Task 1 completes -> Task 2 auto-unblocks -> teammate self-claims

Claiming: File locking prevents race conditions when multiple
          teammates try to claim the same task simultaneously.
```

## Team Lifecycle

```
Phase 1: SETUP
══════════════
  User prompt -> Lead calls Teammate(spawnTeam)
                 -> Team config at ~/.claude/teams/{name}/config.json

Phase 2: POPULATE
═════════════════
  Lead calls Task(team_name="{name}") x N
              |               |               |
          Teammate A      Teammate B      Teammate C
          (spawned)       (spawned)       (spawned)

Phase 3: WORK
═════════════
  Lead: TaskCreate x M tasks
  Lead: TaskUpdate (assign owner or teammates self-claim)
  Teammates: work -> message lead/peers -> complete tasks
  Lead: monitor, steer, synthesize

Phase 4: SHUTDOWN
═════════════════
  Lead -> SendMessage(shutdown_request) -> each teammate
  Teammate -> SendMessage(shutdown_response, approve=true)
  Teammate process exits

Phase 5: CLEANUP
════════════════
  Lead -> Teammate(cleanup)
  ~/.claude/teams/{name}/  -> deleted
  ~/.claude/tasks/{name}/  -> deleted
  (MUST shut down all teammates first or cleanup fails)
```

## Display Modes

```
IN-PROCESS (default)                SPLIT PANES (tmux/iTerm2)
════════════════════                ═════════════════════════

┌──────────────────────┐           ┌──────────┬───────────┐
│                      │           │ Lead     │ Teammate A│
│  Single terminal     │           │          │           │
│                      │           │ (your    │ (visible  │
│  Shift+Up/Down:      │           │  main    │  output)  │
│    cycle teammates   │           │  session)│           │
│                      │           ├──────────┼───────────┤
│  Enter: view session │           │Teammate B│ Teammate C│
│  Escape: interrupt   │           │          │           │
│  Ctrl+T: task list   │           │ (click   │ (click    │
│  Shift+Tab: delegate │           │  to talk)│  to talk) │
│    mode (coord only) │           │          │           │
└──────────────────────┘           └──────────┴───────────┘
```

| Mode | Terminal | Setup | Config |
|------|----------|-------|--------|
| `"auto"` (default) | Split if in tmux, else in-process | None | `"teammateMode": "auto"` |
| `"in-process"` | All in one terminal | None | `"teammateMode": "in-process"` |
| `"tmux"` | Each teammate gets own pane | tmux or iTerm2 (`it2` CLI) | `"teammateMode": "tmux"` |

CLI override: `claude --teammate-mode in-process`

### Keyboard Controls (In-Process Mode)

| Key | Action |
|-----|--------|
| `Shift+Up/Down` | Cycle through teammates |
| `Enter` | View selected teammate's session |
| `Escape` | Interrupt teammate's current turn |
| `Ctrl+T` | Toggle task list |
| `Shift+Tab` | Toggle delegate mode (lead = coordination-only) |

## Team Templates

Automatically orchestrated. Lead executes the full sequence on activation.

### Research Team
```
/ck:team research "best caching strategies for our API"
```
- N researcher teammates (haiku, cost-effective). Default N=3.
- No plan approval — read-only work
- Lead synthesizes findings into single report at `{CK_REPORTS_PATH}/`
- Est. tokens: 150K-300K

### Cook Team
```
/ck:team cook plans/260205-feature/plan.md
```
- Planner + N developers (sonnet) + tester (haiku). Default N=2.
- **Plan approval required** per developer
- File ownership boundaries enforced
- Task dependencies: planner -> devs -> tester
- Docs sync eval mandatory at end
- Est. tokens: 400K-800K

### Review Team
```
/ck:team review src/auth/
```
- N reviewers (haiku) with specific focus areas. Default N=3.
- Security + Performance + Test Coverage
- Evidence-based only — no "seems" or "probably"
- Lead deduplicates and prioritizes findings
- Est. tokens: 100K-200K

### Debug Team
```
/ck:team debug "API returns 500 on concurrent requests"
```
- N debuggers (sonnet) investigating competing hypotheses. Default N=3.
- Adversarial: debuggers challenge each other's theories
- Root cause report with evidence chain
- Est. tokens: 200K-400K

## Event-Driven Monitoring (v2.1.0)

In v2.0.0, the lead polled `TaskList` every 30s to detect progress — wasting tokens and missing events between polls. v2.1.0 replaces polling with two Claude Code 2.1.33 hook events.

```
BEFORE (v2.0.0): Polling                    AFTER (v2.1.0): Event-Driven
================================             ================================

Lead           Teammates                     Lead        HOOKS       Teammates
┌────────┐    ┌──────────┐                   ┌────────┐ ┌─────────┐ ┌──────────┐
│        │--->│ worker-1 │                   │        │<│TaskCompl│<│ worker-1 │
│        │--->│ worker-2 │                   │        │ │  HOOK   │ └──────────┘
│  LEAD  │    └──────────┘                   │  LEAD  │ ├─────────┤ ┌──────────┐
│        │         │                         │        │<│Teammate │<│ worker-2 │
│        │<--poll--┘ every 30s               │        │ │Idle HOOK│ └──────────┘
│        │<--poll--  (wastes tokens)         └────────┘ └─────────┘
│        │<--poll--  (misses events)              │
└────────┘                                        │ Hook injects context:
                                                  │ "Task #2 done. 3/5 complete."
[X] Burns tokens polling                          │ "worker-2 idle. #4 available."
[X] 30s blind spot                                │
[X] No shutdown detection                         └──> Lead REACTS instantly
                                                  [OK] Zero-cost monitoring
                                                  [OK] Instant reaction
                                                  [OK] Auto shutdown hints
```

### TaskCompleted Hook

Fires when any teammate calls `TaskUpdate(status: "completed")`.

```
Teammate completes task
    │
    v
TaskCompleted event fires → task-completed-handler.cjs
    │
    ├── Injects progress: "2/5 done. 2 pending, 1 in progress."
    ├── Logs to {CK_REPORTS_PATH}/team-{name}-completions.md
    └── Hints "All tasks completed" when remaining = 0
```

**Payload:** `{ task_id, task_subject, task_description, teammate_name, team_name }`

### TeammateIdle Hook

Fires after a teammate's session turn ends (after SubagentStop).

```
Teammate turn ends
    │
    v
TeammateIdle event fires → teammate-idle-handler.cjs
    │
    ├── Lists unblocked, unassigned tasks
    ├── Suggests assignment or shutdown
    └── Detects "all blocked" deadlock state
```

**Payload:** `{ teammate_name, team_name, permission_mode }`

**Fallback:** Templates include 60s `TaskList` polling as backup for pre-2.1.33 environments.

## Agent Memory (v2.1.0)

Agents persist knowledge across sessions via `memory` frontmatter in agent definitions.

| Scope | Agents | Storage | Use Case |
|-------|--------|---------|----------|
| `project` | code-reviewer, debugger, tester, planner | `.claude/agent-memory/` (gitignored) | Project-specific patterns, test frameworks, architecture |
| `user` | researcher | `~/.claude/agent-memory/` | Domain knowledge reusable across projects |
| None | code-simplifier, fullstack-dev, docs-manager, journal-writer, mcp-manager, ui-ux-designer | No persistence | Session-scoped, stateless |

Memory auto-injects into agent context at session start (first 200 lines of `MEMORY.md`). Agents maintain their own memory files with insights, patterns, and lessons learned.

```
Session 1                              Session 2
═══════════                            ═══════════

tester learns:                         tester already knows:
  "vitest not jest"  ──persist──>        vitest framework
  "coverage > 80%"                       coverage threshold

planner learns:                        planner skips discovery:
  "monorepo with 4    ──persist──>       goes straight to
   submodules"                           phase planning

researcher learns:                     researcher reuses:
  "REST + GraphQL      ──persist──>      API design patterns
   hybrid API"                           (across ALL projects)
                     .claude/
                     agent-memory/
                     ├── tester/MEMORY.md
                     ├── planner/MEMORY.md
                     └── researcher/MEMORY.md  (in ~/.claude/)
```

## Task(agent_type) Restrictions (v2.1.0)

Controls which sub-agents each agent can spawn via `tools` frontmatter, preventing recursive spawning and token explosion.

```
BEFORE: No Restrictions                 AFTER: Controlled Access
═══════════════════════                 ════════════════════════

tester                                  tester
  └─> spawns planner                      └─> Task(Explore) only
        └─> spawns researcher
              └─> spawns researcher     planner
                    └─> ...               ├─> Task(Explore)
                                          └─> Task(researcher)
  = recursive spawning
  = token explosion                     journal-writer
  = unpredictable costs                   └─> NO Task access

                                        = controlled costs
                                        = predictable behavior
```

| Agent | Allowed Sub-agents | Rationale |
|-------|-------------------|-----------|
| planner | `Task(Explore)`, `Task(researcher)` | Research-then-plan workflow |
| tester, debugger | `Task(Explore)` | Read-only codebase search |
| code-simplifier, fullstack-dev, docs-manager | `Task(Explore)` | Read-only codebase search |
| ui-ux-designer | `Task(Explore)`, `Task(researcher)` | Design research needs |
| journal-writer, mcp-manager | No `Task` access | No sub-agent spawning needed |

## Key Tools

| Tool | Purpose |
|------|---------|
| `Teammate(operation: "spawnTeam")` | Create team |
| `Task(team_name, name, subagent_type)` | Spawn teammate |
| `TaskCreate / TaskUpdate / TaskList / TaskGet` | Manage shared tasks |
| `SendMessage(type: "message")` | DM a teammate |
| `SendMessage(type: "broadcast")` | Message all (use sparingly) |
| `SendMessage(type: "shutdown_request")` | Request graceful shutdown |
| `SendMessage(type: "plan_approval_response")` | Approve/reject teammate plans |
| `Teammate(operation: "cleanup")` | Remove team resources |

## File Ownership (Critical)

Each teammate **MUST** own distinct files. Two teammates editing same file = silent overwrites.

```
Task A: "Implement API" -- owns: src/api/*, src/models/*
Task B: "Implement UI"  -- owns: src/components/*, src/pages/*
Task C: "Write tests"   -- owns: tests/* (blocked by A and B)
```

If two tasks need the same file -> restructure tasks or have lead handle the shared file.

## Permissions

All teammates inherit the lead's permission settings at spawn. If lead has `--dangerously-skip-permissions`, all teammates do too. Can change individual teammate modes after spawning, but not at spawn time.

## Error Recovery

| Situation | Action |
|-----------|--------|
| Teammate unresponsive | Check via Shift+Up/Down, send direct message |
| Teammate wrong output | Redirect with corrective message |
| Teammate crashed | Shut down, spawn replacement, reassign task |
| Lead implementing instead of delegating | Enable delegate mode (Shift+Tab) or tell it to wait |
| Task appears stuck | Check if work done, update status manually |
| Abort entire team | "Shut down all teammates. Clean up the team." |
| After /resume or /rewind | In-process teammates lost. Spawn new ones. |

## Limitations

- **Version pairing:** Skill v2.1.0 requires Claude Code v2.1.33+ for hook events (TaskCompleted, TeammateIdle) and agent memory. Falls back to polling on older versions.
- No session resumption for in-process teammates (`/resume`, `/rewind` don't restore them)
- One team per session (cleanup current before starting new)
- No nested teams (teammates cannot spawn their own teams)
- Lead is fixed for team lifetime (no promotion/transfer)
- Permissions set at spawn (change individually after)
- Task status can lag — check manually if stuck
- Shutdown can be slow (teammates finish current tool call first)
- Split panes not supported in VS Code terminal, Windows Terminal, or Ghostty

## Hook Integration

| Hook | Event | Purpose |
|------|-------|---------|
| `team-context-inject.cjs` | SubagentStart | Injects team context (peers, tasks) + CK context (reports, naming, branch) |
| `task-completed-handler.cjs` | TaskCompleted | Progress tracking, completion logging, shutdown hints |
| `teammate-idle-handler.cjs` | TeammateIdle | Available task detection, assignment/shutdown suggestions |
| `session-init.cjs` | SessionStart | Sets `CK_AGENT_TEAM`, `CK_AGENT_TEAM_MEMBERS` env vars |

All hooks follow fail-open design (exit 0 always) and are gated by `isHookEnabled()` in `ck-config-utils.cjs`.

## Related Files

| File | Purpose |
|------|---------|
| `.claude/skills/team/SKILL.md` | Skill definition with imperative templates (v2.1.0) |
| `.claude/skills/team/references/` | Official docs reference (hooks, memory, restrictions) |
| `.claude/rules/team-coordination-rules.md` | Teammate behavior rules + CK conventions |
| `.claude/rules/orchestration-protocol.md` | Decision matrix, file ownership rules |
| `.claude/hooks/team-context-inject.cjs` | Team + CK context injection (SubagentStart) |
| `.claude/hooks/task-completed-handler.cjs` | Progress tracking + completion logging (TaskCompleted) |
| `.claude/hooks/teammate-idle-handler.cjs` | Task availability detection (TeammateIdle) |
| `.claude/hooks/session-init.cjs` | Team detection and env injection |

## Quick Start

1. Ensure `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is set
2. Tell Claude: `/ck:team research "how should we optimize our database queries?"`
3. Watch 3 researchers investigate in parallel
4. Lead synthesizes findings into actionable report
5. Team auto-cleans up when done

> v2.1.0: Event-driven orchestration. Hook-based monitoring replaces polling. Agent memory persists cross-session.
