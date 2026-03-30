---
phase: 2
name: Mermaid Process Flows as Authoritative Specs
status: pending
priority: high
---

# Phase 2: Mermaid Process Flows

## Context

- Superpowers uses DOT/GraphViz flowcharts as AUTHORITATIVE process definitions
- Models follow structured graphs more reliably than prose
- CKE uses Mermaid (not DOT) — add Mermaid flowcharts to core skills
- "The Description Trap": models follow short descriptions over detailed flowcharts, so descriptions must be trigger-only

## Overview

Add Mermaid process flow diagrams to `cook`, `fix`, `brainstorm`, `plan` SKILL.md as authoritative workflow specs.

## Files to Modify

- `.claude/skills/cook/SKILL.md`
- `.claude/skills/fix/SKILL.md`
- `.claude/skills/brainstorm/SKILL.md`
- `.claude/skills/plan/SKILL.md`

## Implementation Steps

### 1. Cook Process Flow

Insert after Hard Gate section, replace or augment "## Workflow Overview":

```markdown
## Process Flow (Authoritative)

```mermaid
flowchart TD
    A[Intent Detection] --> B{Has plan path?}
    B -->|Yes| F[Load Plan]
    B -->|No| C{Mode?}
    C -->|fast| D[Scout → Plan → Code]
    C -->|interactive/auto| E[Research → Review → Plan]
    E --> F
    D --> F
    F --> G[Review Gate]
    G -->|approved| H[Implement]
    G -->|rejected| E
    H --> I[Review Gate]
    I -->|approved| J{--no-test?}
    J -->|No| K[Test]
    J -->|Yes| L[Finalize]
    K --> L
    L --> M[Report + Journal]
`` `

**This diagram is the authoritative workflow.** Prose sections provide detail for each node.
```

### 2. Fix Process Flow

Insert after Hard Gate section:

```markdown
## Process Flow (Authoritative)

```mermaid
flowchart TD
    A[Issue Input] --> B[Mode Selection]
    B --> C[Debug - Root Cause Investigation]
    C --> D[Complexity Assessment]
    D -->|Simple| E[Quick Fix]
    D -->|Moderate| F[Standard Workflow]
    D -->|Complex| G[Deep Workflow]
    D -->|Parallel| H[Multi-Agent Fix]
    E --> I[Verify Fix]
    F --> I
    G --> I
    H --> I
    I -->|Pass| J[Finalize]
    I -->|Fail, <3 attempts| C
    I -->|Fail, 3+ attempts| K[Question Architecture]
    K --> L[Discuss with User]
    J --> M[Report + Docs + Journal]
`` `

**This diagram is the authoritative workflow.** If prose conflicts with this flow, follow the diagram.
```

### 3. Brainstorm Process Flow

Insert after Hard Gate section:

```markdown
## Process Flow (Authoritative)

```mermaid
flowchart TD
    A[Scout Project Context] --> B[Ask Clarifying Questions]
    B --> C{Scope too large?}
    C -->|Yes| D[Decompose into Sub-Projects]
    D --> B
    C -->|No| E[Propose 2-3 Approaches]
    E --> F[Present Design Sections]
    F --> G{User Approves?}
    G -->|No| F
    G -->|Yes| H[Write Design Doc / Report]
    H --> I{Create Plan?}
    I -->|Yes| J[Invoke /ck:plan]
    I -->|No| K[End Session]
    J --> L[Journal]
    K --> L
`` `

**This diagram is the authoritative workflow.** The terminal state is either `/ck:plan` or end.
```

### 4. Plan Process Flow

Insert after "## Workflow Process" numbered list:

```markdown
## Process Flow (Authoritative)

```mermaid
flowchart TD
    A[Pre-Creation Check] --> B[Cross-Plan Scan]
    B --> C[Mode Detection]
    C -->|fast| D[Skip Research]
    C -->|hard/parallel/two| E[Spawn Researchers]
    D --> F[Codebase Analysis]
    E --> F
    F --> G[Write Plan via Planner]
    G --> H{Red Team?}
    H -->|Yes| I[Red Team Review]
    H -->|No| J{Validate?}
    I --> J
    J -->|Yes| K[Validation Interview]
    J -->|No| L[Hydrate Tasks]
    K --> L
    L --> M[Output Cook Command]
    M --> N[Journal]
`` `

**This diagram is the authoritative workflow.** Prose provides detail for each node.
```

## Todo

- [ ] Add Mermaid process flow to `cook/SKILL.md`
- [ ] Add Mermaid process flow to `fix/SKILL.md`
- [ ] Add Mermaid process flow to `brainstorm/SKILL.md`
- [ ] Add Mermaid process flow to `plan/SKILL.md`
- [ ] Add "This diagram is authoritative" statement after each flow

## Success Criteria

- Each core skill has a Mermaid flowchart as authoritative spec
- Prose sections annotate the graph nodes, not replace them
- Skill descriptions remain trigger-only (no workflow summaries in description field)
