# Claude Native Task Management trong ClaudeKit Skills

Tài liệu này mô tả chi tiết cách các skills của ClaudeKit sử dụng Claude Native Task Management để theo dõi tiến độ, điều phối subagents, và quản lý workflows phức tạp.

## Tổng quan

Claude Code cung cấp 4 native tools để quản lý tasks trong session:

| Tool | Mục đích |
|------|----------|
| `TaskCreate` | Tạo task mới với metadata và dependencies |
| `TaskUpdate` | Cập nhật trạng thái, gán owner, thiết lập dependencies |
| `TaskGet` | Lấy chi tiết đầy đủ của một task |
| `TaskList` | Liệt kê tất cả tasks với status và blockedBy |

**Đặc điểm quan trọng:** Tasks là **session-scoped** — chúng biến mất khi session kết thúc. Plan files (markdown với checkboxes) là layer **persistent**.

## Nguyên tắc 3-Task Rule

| Số tasks | Tạo Tasks? | Lý do |
|----------|-----------|-------|
| < 3 | Không | Overhead vượt quá lợi ích |
| ≥ 3 | Có | Tracking có ý nghĩa, hỗ trợ parallel execution |

## Task Lifecycle

```
pending → in_progress → completed
```

- **pending**: Task chưa bắt đầu
- **in_progress**: Đang thực hiện (chỉ 1 task/agent tại một thời điểm)
- **completed**: Hoàn thành

## Hydration Pattern — Bridge giữa Sessions

```
┌──────────────────┐  Hydrate   ┌───────────────────┐
│ Plan Files       │ ─────────► │ Claude Tasks      │
│ (persistent)     │            │ (session-scoped)  │
│ [ ] Phase 1      │            │ ◼ pending         │
│ [ ] Phase 2      │            │ ◼ pending         │
└──────────────────┘            └───────────────────┘
                                        │ Work
                                        ▼
┌──────────────────┐  Sync-back ┌───────────────────┐
│ Plan Files       │ ◄───────── │ Task Updates      │
│ (updated)        │            │ (completed)       │
│ [x] Phase 1      │            │ ✓ completed       │
│ [ ] Phase 2      │            │ ◼ in_progress     │
└──────────────────┘            └───────────────────┘
```

### Hydration (Session Start)

1. Đọc plan files: `plan.md` + `phase-XX-*.md`
2. Xác định unchecked `[ ]` items = công việc còn lại
3. `TaskCreate` per unchecked item với metadata
4. Thiết lập `addBlockedBy` dependency chains
5. Checked `[x]` items = done, skip

### Sync-Back (Session End)

1. Thu thập completed tasks (`TaskUpdate(status: "completed")`) + metadata (`phase`, `phaseFile`, `planDir`)
2. Sweep toàn bộ `phase-XX-*.md` trong plan
3. Reconcile/backfill: update `[ ]` → `[x]` cho mọi completed item (không chỉ phase hiện tại)
4. Update `plan.md` frontmatter status + progress table
5. Nếu có completed task không map được phase file, report unresolved mappings trước khi kết luận done
6. Git commit lưu trữ state transition

---

## Skills sử dụng Task Management

### 1. Plan Skill (`/ck:plan`)

**Khi nào tạo tasks:**
- Multi-phase feature (3+ phases)
- Dependencies phức tạp giữa phases
- Plan sẽ được execute bởi `/ck:cook`

**Task Schema cho Phase:**

```javascript
TaskCreate(
  subject: "Setup environment and dependencies",
  activeForm: "Setting up environment",
  description: "Install packages, configure env. See phase-01-setup.md",
  metadata: {
    phase: 1,
    priority: "P1",
    effort: "2h",
    planDir: "plans/260205-auth/",
    phaseFile: "phase-01-setup.md"
  }
)
```

**Task Schema cho Critical Step:**

```javascript
TaskCreate(
  subject: "Implement OAuth2 token refresh",
  activeForm: "Implementing token refresh",
  description: "Handle token expiry, refresh flow, error recovery",
  metadata: {
    phase: 3,
    step: "3.4",
    priority: "P1",
    effort: "1.5h",
    planDir: "plans/260205-auth/",
    phaseFile: "phase-03-api.md",
    critical: true,
    riskLevel: "high"
  },
  addBlockedBy: ["{phase-2-task-id}"]
)
```

**Dependency Chains:**

```
Phase 1 (no blockers)              ← start here
Phase 2 (addBlockedBy: [P1-id])    ← auto-unblocked when P1 completes
Phase 3 (addBlockedBy: [P2-id])
Step 3.4 (addBlockedBy: [P2-id])   ← critical steps share phase dependency
```

---

### 2. Cook Skill (`/ck:cook`)

**Workflow Integration:**

**Step 3 Implementation:**
1. `TaskList()` — check existing tasks (hydrated by planning)
2. Nếu có tasks → pick them up, skip re-creation
3. Nếu không có → read plan phases, `TaskCreate` cho mỗi unchecked item
4. `TaskUpdate(status: "in_progress")` khi bắt đầu task

**Step 6 Finalize:**
1. `TaskUpdate` marks all session tasks complete
2. Spawn `project-manager` agent để chạy full-plan sync-back (sweep all phases + backfill stale completed items)
3. Sync checkboxes `[ ]` → `[x]` across all phase files, rồi update `plan.md`

**Same-Session Handoff:**
```
planning hydrates tasks → tasks exist → cook picks them up → cook skips re-creation
```

**Cross-Session Resume:**
```
new session → TaskList() empty → read plan files → re-hydrate from unchecked [ ] items
```

---

### 3. Fix Skill (`/ck:fix`)

**Task Schemas theo Complexity:**

**Standard Workflow (6 steps):**

```javascript
TaskCreate(subject="Debug & investigate", metadata={step: 1})
TaskCreate(subject="Scout related code", metadata={step: 2})
TaskCreate(subject="Implement fix", metadata={step: 3}, addBlockedBy=[step1, step2])
TaskCreate(subject="Run tests", metadata={step: 4}, addBlockedBy=[step3])
TaskCreate(subject="Code review", metadata={step: 5}, addBlockedBy=[step4])
TaskCreate(subject="Finalize", metadata={step: 6}, addBlockedBy=[step5])
```

**Deep Workflow (8 steps):**

```javascript
TaskCreate(subject="Debug & investigate", metadata={step: 1, phase: "diagnose"})
TaskCreate(subject="Research solutions", metadata={step: 2, phase: "research"})
TaskCreate(subject="Brainstorm approaches", metadata={step: 3, phase: "design"}, addBlockedBy=[step2])
TaskCreate(subject="Create implementation plan", metadata={step: 4, phase: "design"}, addBlockedBy=[step3])
TaskCreate(subject="Implement fix", metadata={step: 5, phase: "implement"}, addBlockedBy=[step1, step4])
TaskCreate(subject="Run tests", metadata={step: 6, phase: "verify"}, addBlockedBy=[step5])
TaskCreate(subject="Code review", metadata={step: 7, phase: "verify"}, addBlockedBy=[step6])
TaskCreate(subject="Finalize & docs", metadata={step: 8, phase: "finalize"}, addBlockedBy=[step7])
```

**Parallel Issue Coordination:**

```javascript
// Issue A tree
TaskCreate(subject="[Issue A] Debug", metadata={issue: "A", step: 1})
TaskCreate(subject="[Issue A] Fix", metadata={issue: "A", step: 2}, addBlockedBy=[A-step1])
TaskCreate(subject="[Issue A] Verify", metadata={issue: "A", step: 3}, addBlockedBy=[A-step2])

// Issue B tree
TaskCreate(subject="[Issue B] Debug", metadata={issue: "B", step: 1})
TaskCreate(subject="[Issue B] Fix", metadata={issue: "B", step: 2}, addBlockedBy=[B-step1])
TaskCreate(subject="[Issue B] Verify", metadata={issue: "B", step: 3}, addBlockedBy=[B-step2])

// Final shared task
TaskCreate(subject="Integration verify", addBlockedBy=[A-step3, B-step3])
```

---

### 4. Debug Skill (`/ck:debug`)

**Investigation Pipeline as Tasks:**

```javascript
TaskCreate(subject="Assess incident scope", metadata={debugStage: "assess"})
TaskCreate(subject="Collect logs and evidence", metadata={debugStage: "collect"}, addBlockedBy=[assess])
TaskCreate(subject="Analyze root cause", metadata={debugStage: "analyze"}, addBlockedBy=[collect])
TaskCreate(subject="Implement fix", metadata={debugStage: "fix"}, addBlockedBy=[analyze])
TaskCreate(subject="Verify fix resolves issue", metadata={debugStage: "verify"}, addBlockedBy=[fix])
```

**Parallel Evidence Collection:**

```javascript
// Parallel — no blockedBy between them
TaskCreate(subject="Collect CI/CD pipeline logs", metadata={source: "ci", agentIndex: 1})
TaskCreate(subject="Collect application server logs", metadata={source: "server", agentIndex: 2})
TaskCreate(subject="Query database for anomalies", metadata={source: "db", agentIndex: 3})

// Analyze blocks on ALL collection completing
TaskCreate(subject="Analyze root cause from collected evidence",
  addBlockedBy=["{ci-id}", "{server-id}", "{db-id}"])
```

---

### 5. Code-Review Skill (`/code-review`)

**Review Pipeline as Tasks:**

```javascript
TaskCreate(subject="Scout edge cases", metadata={reviewStage: "scout"})
TaskCreate(subject="Review implementation", metadata={reviewStage: "review"}, blockedBy=[scout])
TaskCreate(subject="Fix critical issues", metadata={reviewStage: "fix"}, blockedBy=[review])
TaskCreate(subject="Verify fixes pass", metadata={reviewStage: "verify"}, blockedBy=[fix])
```

**Parallel Review Coordination:**

```javascript
// No blockedBy between parallel reviews
TaskCreate(subject="Review backend auth changes",
  metadata={scope: "src/api/", agentIndex: 1, totalAgents: 2})
TaskCreate(subject="Review frontend auth UI",
  metadata={scope: "src/components/", agentIndex: 2, totalAgents: 2})

// Fix task blocks on BOTH completing
TaskCreate(subject="Fix all review issues",
  addBlockedBy=["{backend-review-id}", "{frontend-review-id}"])
```

**Re-Review Cycle:**

```javascript
TaskCreate(subject="Re-review after fixes",
  addBlockedBy=["{fix-task-id}"],
  metadata={reviewStage: "review", cycle: 2})
```

---

### 6. Scout Skill (`/ck:scout`)

**Khi nào tạo tasks:**
- ≤ 2 agents: Không tạo (overhead > benefit)
- ≥ 3 agents: Có tạo (meaningful coordination)

**Task Schema:**

```javascript
TaskCreate(
  subject: "Scout {directory} for {target}",
  activeForm: "Scouting {directory}",
  description: "Search {directories} for {patterns}",
  metadata: {
    agentType: "Explore",           // "Explore" or "Bash"
    scope: "src/auth/,src/middleware/",
    scale: 6,
    agentIndex: 1,                  // 1-indexed
    totalAgents: 6,
    toolMode: "internal",           // "internal" or "external"
    priority: "P2",                 // Always P2 for scout
    effort: "3m"                    // Fixed timeout
  }
)
```

**Task Lifecycle:**

```
Step 3: TaskCreate per agent     → status: pending
Step 4: Before spawning agent    → TaskUpdate → status: in_progress
Step 5: Agent returns report     → TaskUpdate → status: completed
Step 5: Agent times out (3m)     → Keep in_progress, add error metadata
```

---

### 7. Team Skill (`/ck:team`) — Agent Teams

**Tools API Surface:**

| Tool | Operation | Purpose |
|------|-----------|---------|
| TeammateTool | `spawnTeam` | Create team + task list |
| TeammateTool | `cleanup` | Remove team/task dirs |
| SendMessage | `message` | DM to one teammate |
| SendMessage | `broadcast` | Send to ALL teammates |
| SendMessage | `shutdown_request` | Ask teammate to exit |
| SendMessage | `plan_approval_response` | Lead approves/rejects plan |

**Task Fields:**

| Field | Purpose |
|-------|---------|
| `status` | `pending` → `in_progress` → `completed` |
| `owner` | Agent name assigned to task |
| `blocks` | Task IDs this task blocks |
| `blockedBy` | Task IDs that must complete first |
| `addBlocks` | Set blocking relations (write) |
| `addBlockedBy` | Set dependency relations (write) |
| `metadata` | Arbitrary key-value pairs |

**Hook Events:**
- **TaskCompleted**: Fires when teammate calls `TaskUpdate(status: "completed")`
- **TeammateIdle**: Fires after `SubagentStop` for team members

**Event Lifecycle:**
```
SubagentStart(worker) → TaskCompleted(task) → SubagentStop(worker) → TeammateIdle(worker)
```

---

### 8. Project-Management Skill (`/project-management`)

**Hydration Workflow:**

1. Read plan files: `plan.md` + `phase-XX-*.md`
2. Check `TaskList()` — if tasks exist, skip re-creation
3. `TaskCreate` per unchecked `[ ]` item
4. Set up `addBlockedBy` chains between phases
5. During work: `TaskUpdate` tracks status
6. Sync-back: Update `[ ]` → `[x]`, update frontmatter

**YAML Frontmatter Sync:**

```yaml
---
title: Feature name
description: Brief description
status: in-progress  # pending | in-progress | completed
priority: P1
effort: medium
branch: feature-branch
tags: [auth, api]
created: 2026-02-05
---
```

---

## Best Practices

### Task Creation

1. **Create tasks BEFORE starting work** (upfront planning)
2. **Chỉ 1 task `in_progress` per agent** tại một thời điểm
3. **Mark complete IMMEDIATELY** sau khi hoàn thành (không batch)
4. **Sử dụng metadata** cho filtering: `{step, phase, issue, severity}`
5. **Nếu task fails** → giữ `in_progress`, tạo subtask cho blocker

### Naming Conventions

**subject** (imperative): Action verb + deliverable, <60 chars
- "Setup database migrations"
- "Implement OAuth2 flow"
- "Create user profile endpoints"

**activeForm** (present continuous): Matches subject in -ing form
- "Setting up database"
- "Implementing OAuth2"
- "Creating user profile endpoints"

**description**: 1-2 sentences, concrete deliverables, reference phase file

### Required Metadata Fields

- `phase`: Phase number
- `priority`: P1/P2/P3
- `effort`: Estimated time
- `planDir`: Path to plan directory
- `phaseFile`: Phase file name

### Optional Metadata Fields

- `step`: Step within phase
- `critical`: Boolean for critical steps
- `riskLevel`: high/medium/low
- `dependencies`: Description
- `feature`: Feature name
- `owner`: Agent assignment

### Dependency Management

```javascript
// Forward references: "I need X done first"
addBlockedBy: ["{prior-task-id}"]

// Backward references: "X blocks these children"
addBlocks: ["{child-task-id}"]
```

### Error Handling

Nếu `TaskCreate` fails:
1. Log warning
2. Continue with sequential execution
3. Tasks add visibility, không phải core functionality

---

## Subagent vs Agent Teams Comparison

| Aspect | Subagents | Agent Teams |
|--------|-----------|-------------|
| **Context** | Own window; results return to caller | Own window; fully independent |
| **Communication** | Report back to main agent only | Message each other directly |
| **Coordination** | Main agent manages all work | Shared task list, self-coordination |
| **Best for** | Focused tasks, result-only | Complex work requiring discussion |
| **Token cost** | Lower | Higher (each teammate = separate instance) |
| **Task persistence** | Session-scoped | Session-scoped with shared task list |

---

## Quality Check Output Format

Các skills output theo format chuẩn:

```
✓ Hydrated [N] phase tasks + [M] critical step tasks with dependency chain
✓ Registered [N] scout tasks (internal mode, SCALE=6)
✓ Registered [N] review tasks (scout → review → fix → verify chain)
✓ Step [N]: [status] - [metrics]
```

---

## Validation Rules

1. **Dependency chain không có cycles**
2. **Tất cả phases có corresponding tasks**
3. **Required metadata fields present**
4. **Task count matches unchecked `[ ]` items**
5. **Nếu Task tool calls = 0 cuối workflow** → workflow INCOMPLETE
