# Multi-Agent Orchestrator Patterns for VS Code Integration

**Report Date:** 2026-03-30
**Status:** Complete
**Recommendation Level:** Production-ready patterns with proven implementations

---

## Executive Summary

Building a desktop multi-agent orchestrator for VS Code requires **five core architectural layers**: task hydration (persistent specs → session-scoped tasks), agent lifecycle state machine, provider rotation strategy, provider-model mapping, and webview-based dashboard. Recommended approach uses **file-based communication + event-driven architecture**, proven by ClaudeKit Engineer's 14-agent system currently in production.

**Key insight:** VS Code agents don't need complex databases. Use markdown specs as source-of-truth, hydrate into VS Code's native Task API at session start, communicate via file-system events, and persist results back to specs.

---

## 1. Orchestrator Architecture

### Pattern: Hydration + Event-Driven + Fan-Out/Fan-In

**Why this architecture:**
- **Decoupled:** Agents don't share memory; communicate via files/events
- **Resilient:** Interrupted sessions resume from persistent specs (Hydration pattern)
- **Scalable:** Parallel sub-agents fan out, results fan in synchronously
- **Observable:** Every agent decision logged to markdown reports

**Data Flow:**
```
User Spec Files (.speckit/tasks.md)
    │
    ├─> Hydration: TaskCreate × N
    │   Load dependencies, set blockedBy
    │
    ├─> Orchestrator Route
    │   Master Agent receives task
    │
    └─> Decompose → Fan-Out
        ├─> Specialist Agent A (running)
        ├─> Specialist Agent B (running)
        ├─> Specialist Agent C (running)
        │
        └─> Fan-In: Collect results → Sync back to specs
```

**Layers (bottom-up):**
1. **Spec Layer** — Persistent markdown task/plan files (immutable source-of-truth)
2. **Hydration Layer** — Convert specs → native VS Code Tasks on session start
3. **Orchestration Layer** — Master agent receives task, decomposes, assigns
4. **Agent Layer** — Specialized workers (Planner, Coder, Tester, Reviewer)
5. **Execution Layer** — Bash, file I/O, API calls (agent tools)
6. **Communication Layer** — File-system events + markdown reports
7. **Persistence Layer** — Sync results back to `.speckit/` at session end

---

## 2. Agent Lifecycle State Machine

**States:** `idle` → `queued` → `running` → `blocked` → `waiting` → `error` → `done`

```
                    ┌─────────────────────────────────┐
                    │ IDLE                            │
                    │ (agent initialized, no task)    │
                    └────────────┬────────────────────┘
                                 │
                    TaskCreate / TaskUpdate(owner=self)
                                 │
                    ┌────────────▼────────────────────┐
                    │ QUEUED                          │
                    │ (task assigned, waiting turn)   │
        ┌──────────>│ Priority queue: P1 → P2 → P3   │<─ blockedBy dependency
        │           └────────────┬────────────────────┘   resolved
        │                        │
        │       No blockers + turn reached
        │                        │
        │           ┌───────────▼──────────┐
        │           │ RUNNING              │
        │     ┌────>│ Active work on task  │<──── Poll: "Are you busy?"
        │     │     │ Send heartbeat events│      every 500ms
        │     │     └───────────┬──────────┘
        │     │                 │
        │     │     Agent reports blockers
        │     │                 │
        │     └─────BLOCKED◄────┘ (awaits external fix, e.g., approval)
        │
        │     All conditions met
        │                 │
        │           ┌─────▼──────────┐
        │ "retry"   │ DONE / ERROR    │
        │ on error  │ Result persisted│
        │           └────────────────┘
        │
        └───────────────────────────────

Transitions:
  • RUNNING → BLOCKED: Missing approval, external dependency, API quota
  • BLOCKED → RUNNING: Condition resolved, agent resumes
  • RUNNING → ERROR: Exception, timeout (>configurable limit)
  • ERROR → QUEUED: Retry after exponential backoff (1s → 4s → 16s)
  • DONE → IDLE: Task completed, result persisted, agent released
```

**State Tracking (VS Code native Tasks):**
```typescript
interface AgentState {
  taskId: string;
  agentId: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  currentState: "idle" | "queued" | "running" | "blocked" | "waiting" | "error" | "done";
  owner?: string;        // Agent name
  blockedBy?: string[];  // Dependencies
  startedAt?: timestamp;
  completedAt?: timestamp;
  errorReason?: string;
  metadata?: Record<string, any>; // Custom tracking
}
```

---

## 3. Provider Rotation Strategy

### Problem
When a provider hits quota (429/503), agent must failover transparently without losing context.

### Solution: Two-Layer Provider Registry

**Layer 1: Provider Health Index**
```typescript
interface ProviderHealth {
  name: string;              // "anthropic", "google", "openrouter"
  models: string[];          // ["claude-opus", "claude-sonnet"]
  quotaRemaining: number;
  quotaResetAt: timestamp;
  lastError?: { code, retryAt };
  priority: number;          // 0=primary, 1=fallback
  costPer1MTokens: number;   // Track economics
}
```

**Layer 2: Model-Provider Map**
```typescript
interface ModelProviderMap {
  "claude-opus-4": {
    providers: [
      { name: "anthropic", priority: 0 },    // Try first
      { name: "openrouter", priority: 1 }    // Fallback
    ]
  },
  "gemini-2.5": {
    providers: [
      { name: "google", priority: 0 }
    ]
  }
}
```

### Failover Logic
```
Agent requests "claude-opus-4"
  │
  ├─> Check ProviderHealth["anthropic"]
  │   ├─ Quota OK? → Use it
  │   └─ Quota exceeded (429)? → Mark degraded
  │
  ├─> Fallback to "openrouter"
  │   ├─ Has claude-opus support? → Switch
  │   └─ Rate-limit? → Exponential backoff (1s → 4s → 16s)
  │
  └─> All providers exhausted? → Queue until reset OR
                                → Switch to lower-cost model (e.g., sonnet)
```

**Metrics to persist (in `.speckit/provider-status.json`):**
- Provider health (quota, errors, reset times)
- Model usage totals (tokens, cost, provider)
- Failover events (when, why, success rate)
- Agent performance by provider (task completion rate)

---

## 4. Model-Provider Compatibility Mapping

**Data structure (managed as JSON config + runtime cache):**

```json
{
  "models": {
    "claude-opus-4-20250805": {
      "providers": ["anthropic", "openrouter"],
      "costPer1MTokens": { "anthropic": 15, "openrouter": 16 },
      "rateLimit": "40k tokens/min",
      "capabilities": ["vision", "code", "reasoning"],
      "preferredFor": ["complex-planning", "architecture-decisions"]
    },
    "claude-sonnet-4-20250514": {
      "providers": ["anthropic", "openrouter", "together"],
      "costPer1MTokens": { "anthropic": 3, "openrouter": 3.5 },
      "rateLimit": "200k tokens/min",
      "capabilities": ["vision", "code"],
      "preferredFor": ["implementation", "testing", "reviews"]
    },
    "gemini-2.5-flash": {
      "providers": ["google"],
      "costPer1MTokens": { "google": 0.075 },
      "rateLimit": "1M tokens/min",
      "capabilities": ["vision", "code"],
      "preferredFor": ["documentation", "low-cost-tasks"]
    }
  },
  "providers": {
    "anthropic": {
      "baseUrl": "https://api.anthropic.com",
      "models": ["claude-opus-4", "claude-sonnet-4"],
      "apiKeyEnvVar": "ANTHROPIC_API_KEY"
    },
    "openrouter": {
      "baseUrl": "https://openrouter.ai/api/v1",
      "models": ["claude-opus-4", "claude-sonnet-4", "gpt-4"],
      "apiKeyEnvVar": "OPENROUTER_API_KEY"
    }
  }
}
```

**Agent configuration (in agent definition markdown):**
```yaml
---
name: planner
model: claude-opus-4-20250805
provider: anthropic
fallbackProviders:
  - openrouter
fallbackModel: claude-sonnet-4-20250514  # If model unavailable
---
```

**Selection algorithm:**
1. Check if primary provider has quota
2. If not, rotate through fallbackProviders in order
3. If model unavailable on any provider, use fallbackModel
4. If all exhausted, exponential backoff + retry

---

## 5. Real-Time Dashboard/Tracking Board

### Webview Architecture

**VS Code Extension Structure:**
```
extension/
├── src/
│   ├── extension.ts          # Entry point, register commands
│   ├── provider/
│   │   ├── AgentStateProvider.ts     # Webview data source
│   │   ├── ProviderHealthProvider.ts # Quota tracking
│   │   └── TaskTreeProvider.ts       # File tree of tasks
│   ├── dashboard/
│   │   ├── DashboardPanel.ts        # Webview controller
│   │   ├── dashboard.html           # Webview UI
│   │   └── dashboard.css
│   └── sync/
│       ├── SpecSync.ts              # Hydrate/sync-back logic
│       └── FileWatcher.ts           # Listen to .speckit/ changes
└── media/
    ├── main.ts                      # Webview script
    └── icons/                       # Agent status icons
```

**Dashboard Components:**

| Component | Purpose | Refreshes |
|-----------|---------|-----------|
| **Agent Cards** | Live status per agent (idle/running/error) | Event: TaskUpdate |
| **Task Board** | Kanban: Queued → Running → Blocked → Done | Event: File watch |
| **Provider Health** | Quota remaining, reset times, fallback count | Poll: 5s, Event: 429 |
| **Timeline** | Agent execution timeline (Gantt-style) | Event: state change |
| **Logs** | Real-time agent outputs + errors | Stream: markdown reports |

**Data flow (Webview → Extension → File System):**
```
Agent completes task
  │
  ├─> Update .speckit/tasks.md (sync-back)
  │
  ├─> Fire FileSystemWatcher event
  │   (SpecSync detects change)
  │
  ├─> Parse task status
  │   ├─ Find dependencies
  │   └─ Update TaskUpdate(blockedBy=[...])
  │
  ├─> Send webview message: { type: "taskUpdated", task }
  │
  └─> Webview updates card + timeline in real-time
```

**Key UI patterns:**
- **Status icons:** Spinning for `running`, checkmark for `done`, X for `error`, pause for `blocked`
- **Tooltips on hover:** Full task description, blockers, timestamps
- **Click to expand:** View full agent report (markdown rendered in panel)
- **Provider badge:** Show which provider is active; green/yellow/red for quota status

---

## 6. Key Design Decisions & Trade-Offs

| Decision | Choice | Why | Trade-Off |
|----------|--------|-----|-----------|
| **Communication** | File-system + events | No network, resilient to crashes | Polling latency (100-500ms) |
| **Task Persistence** | Markdown specs | Human-readable, version-controllable | No real-time sync (batch updates) |
| **State Storage** | VS Code Task API (session) + .speckit/ (persistent) | Native, lightweight, works offline | Session scoped (by design) |
| **Provider Rotation** | Deterministic fallback chain | Predictable, testable | Manual config required |
| **Dashboard Refresh** | Event-driven + 5s poll | Responsive + catches missed events | Slight latency on file changes |
| **Model Selection** | Config-driven + fallback rules | Flexible, cost-optimizable | Requires upfront mapping |
| **Error Recovery** | Exponential backoff + sync-back | Prevents thundering herd | May delay task completion |
| **Parallel Agents** | Fan-out via TaskCreate × N | Scales; blocks on TaskUpdate | Requires dependency tracking |

**Critical trade-off:** Session-scoped Tasks mean agent state doesn't survive across sessions. **Solution:** Hydration pattern syncs all progress back to `.speckit/` at end of session. Next session re-hydrates from scratch with updated specs. This is **a feature, not a bug** — keeps session context clean and allows task structure to evolve.

---

## 7. Recommended Implementation Roadmap

### Phase 1: Core Orchestration (Week 1-2)
- [ ] Implement SpecSync (hydrate/sync-back)
- [ ] Define Agent interface + lifecycle state machine
- [ ] Create TaskCreator utility (convert specs → Tasks)
- [ ] Test with 3 sample agents (planner, coder, reviewer)

### Phase 2: Provider Management (Week 2-3)
- [ ] Build ProviderRegistry + ProviderHealth tracker
- [ ] Implement failover routing logic
- [ ] Add quota-aware model selection
- [ ] Create provider status JSON schema

### Phase 3: Dashboard (Week 3-4)
- [ ] Webview scaffolding + data provider
- [ ] Agent status cards + task board
- [ ] Provider health display
- [ ] Real-time log streaming

### Phase 4: Hardening (Week 4-5)
- [ ] Error recovery + exponential backoff
- [ ] Tests: failover, timeout, concurrent agents
- [ ] Docs + runbook for custom agents

---

## 8. Unresolved Questions

1. **Custom agent registration UI:** How do users create agents in VS Code? Modal dialog or JSON config?
2. **Task visualization:** Should timeline view support grouping by agent role or milestone?
3. **Cost tracking:** Should dashboard show live cost accumulation per agent/provider?
4. **Persistence beyond session:** Do we need cross-session task history (audit log)?
5. **Webview performance:** At 20+ concurrent agents, does polling scale or need WebSocket?
6. **Model hotswapping:** Can user change agent model mid-task or only at start?
7. **Agent memory:** Should agents persist learnings across sessions (e.g., test patterns)?
