# ClaudeKit Skills Interconnection Map

> 54 skills · 80+ connections · 1 ecosystem

## Core Architecture

ClaudeKit's skill system is designed as an **interconnected ecosystem** — not a collection of isolated tools. Skills call each other, delegate subtasks, and compose workflows automatically.

## Dependency Graph

```
cook (orchestrator)
├── plan → research → docs-seeker
│         → scout (parallel agents)
│         → mermaidjs-v11
├── scout → parallel Explore subagents
├── debug → docs-seeker, repomix, chrome-devtools, problem-solving, sequential-thinking
├── fix → debug, code-review, problem-solving, sequential-thinking, brainstorm, context-engineering
├── test → chrome-devtools, ai-multimodal, debug, sequential-thinking
├── code-review → scout (edge-case scouting)
├── ui-ux-pro-max
├── project-management → plans-kanban
└── git → context-engineering

team (meta-orchestrator)
├── cook, plan, research
├── code-review, fix, test
└── wraps each as multi-agent template

bootstrap → plan, cook, research, git
brainstorm → scout, docs-seeker, ai-multimodal, sequential-thinking, plan, research
frontend-design → ui-ux-pro-max, ai-multimodal, media-processing
skill-creator → docs-seeker, research
copywriting → ai-multimodal
```

## Layer Model

### Layer 1 — Orchestrators
| Skill | Role | Outbound deps |
|-------|------|---------------|
| **cook** | Central orchestrator for all feature implementation | 10+ skills |
| **team** | Multi-session parallel collaboration wrapper | 6 skills |
| **bootstrap** | New project scaffolding | 4 skills |

### Layer 2 — Workflow Hubs
| Skill | Role | Called by | Calls |
|-------|------|----------|-------|
| **plan** | Architecture & planning | cook, team, bootstrap, brainstorm | research, scout, mermaidjs-v11 |
| **scout** | Fast codebase exploration | cook, plan, brainstorm, code-review, fix | parallel Explore agents |
| **debug** | Root cause investigation | cook, fix, test | docs-seeker, repomix, chrome-devtools, problem-solving, sequential-thinking |
| **fix** | Bug resolution | cook, team | debug, code-review, problem-solving, sequential-thinking, brainstorm, context-engineering |
| **test** | Validation & coverage | cook, team | chrome-devtools, ai-multimodal, debug, sequential-thinking |
| **code-review** | Quality assurance | cook, fix, team | scout |
| **brainstorm** | Solution ideation | fix | scout, docs-seeker, ai-multimodal, sequential-thinking, plan, research |

### Layer 3 — Utility Providers
Pure capability providers — referenced by hub skills but don't call other skills.

| Skill | Domain | Referenced by |
|-------|--------|---------------|
| **research** | Knowledge gathering | plan, cook, bootstrap, team, brainstorm, skill-creator |
| **docs-seeker** | External documentation | research, debug, brainstorm, skill-creator |
| **sequential-thinking** | Step-by-step analysis | brainstorm, fix, test, debug |
| **problem-solving** | Structured problem decomposition | debug, fix |
| **ai-multimodal** | Image/video/audio analysis | frontend-design, test, copywriting, brainstorm |
| **chrome-devtools** | Browser automation | debug, test |
| **repomix** | Repository packing | debug, gkg |
| **context-engineering** | Token management | git, fix |
| **mermaidjs-v11** | Diagram generation | plan |
| **ui-ux-pro-max** | Design intelligence | cook, frontend-design |
| **media-processing** | FFmpeg/ImageMagick | frontend-design |

### Layer 4 — Standalone Skills
Domain-specific tools operating independently.

`agent-browser` · `ai-artist` · `backend-development` · `better-auth` · `databases` · `devops` · `frontend-development` · `google-adk-python` · `markdown-novel-viewer` · `mcp-builder` · `mcp-management` · `mintlify` · `mobile-development` · `payment-integration` · `plans-kanban` · `react-best-practices` · `remotion` · `shader` · `shopify` · `tanstack` · `template-skill` · `threejs` · `ui-styling` · `web-design-guidelines` · `web-frameworks` · `web-testing`

## Hub Connectivity (most referenced)

| Skill | Inbound references |
|-------|-------------------|
| scout | 5 (brainstorm, code-review, fix, plan, cook) |
| debug | 3 (fix, test, cook) |
| docs-seeker | 4 (research, debug, brainstorm, skill-creator) |
| sequential-thinking | 4 (brainstorm, fix, test, debug) |
| research | 5 (plan, cook, bootstrap, team, skill-creator) |
| ai-multimodal | 3 (frontend-design, test, copywriting) |
| code-review | 3 (fix, cook, team) |
| plan | 4 (bootstrap, brainstorm, cook, team) |

## Key Architectural Patterns

1. **cook is the nucleus** — mandatory for all feature implementation, orchestrates 10+ skills through the full lifecycle: plan → scout → debug → fix → test → review → git

2. **Hub-and-spoke topology** — orchestrators (cook, team) fan out to workflow hubs (plan, debug, fix, test, review), which fan out to utility providers

3. **Cross-hub references** — fix calls debug, test calls debug, brainstorm calls plan — creating a resilient mesh, not a rigid tree

4. **Utility layer is stateless** — sequential-thinking, problem-solving, docs-seeker provide pure capabilities without calling other skills, keeping the dependency graph acyclic at the leaf level

5. **team wraps everything** — for multi-session parallel work, team composes cook + plan + research + code-review + fix + test into coordinated agent templates
