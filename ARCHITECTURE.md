# Architecture

## System overview

Every agent action flows through one chokepoint by design:

```
IDE shell (this repo)
    ↓
Agent orchestrator      (plan → act → observe loop)
    ↓
Governance gate         (approval gates + audit log)
    ↓
Capability layer        (peers, called as needed, not a strict hierarchy)
    ├── Model routing         (local Ollama / cloud Claude API / other providers)
    ├── Retrieval             (hybrid: vector search + code graph + knowledge base)
    ├── Tool & infra layer    (read/edit/run/git + Docker/Kubernetes provisioning)
    └── Skills & hooks        (progressive-disclosure skill loading, lifecycle hooks)
    ↓
Integrations             (MCP, Slack, Teams, WhatsApp, Jira/Linear/Confluence)
```

The governance gate is the single reason every capability (model calls,
tool execution, infra provisioning, skill installation) is auditable and
interruptible in one place, rather than each subsystem enforcing its own
rules independently. **This must not be bypassable by project-level
config** — governance policy sits above `.ide-config.json` in precedence.

## Prompt composition (lives inside the agent orchestrator)

The "system prompt" is layered, assembled fresh per request, additive-and-
minimal (only relevant layers included, to keep the local-model fast path
cheap):

1. Core system prompt — shipped with the product, versioned like code
2. Governance policy overlay — org-level rules, admin-set, not project-overridable
3. Project rules — `.ide-config.json`, versioned with the repo
4. Mode-specific prompt — Plan/Architect/Code/Debug/Ask
5. Active skill instructions — only skills matched to the current task
6. Subagent-specific prompt — swapped in only for that subagent's isolated context
7. Retrieved context — pulled live from the retrieval layer, not a prompt but composed alongside one

## Feature roadmap by tier

### Tier 0 — Foundation (current phase)
VS Code fork, agent orchestrator scaffold (not yet started), tool layer,
diff/edit UI, checkpointing, macOS+Windows CI matrix, code signing,
project rules file, governance approval gates + audit log, dual-mode
online/offline model routing, tiered model routing + self-hosted
inference, context efficiency (AST chunking, caching), offline request
queue, SSH remote dev (no Tailscale).

### Tier 1 — Core differentiators
Skills loader (`SKILL.md` standard) + curated starter pack, hybrid
retrieval indexing, hooks (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`,
`PostToolUseFailure`, `Stop`), security subagent, regression testing
subagent, plan mode + named modes (Architect/Code/Debug/Ask), Slack +
Teams integration, environment/infra subagent (Docker/Kubernetes/Supabase/
Redis provisioning), secrets vault.

### Tier 2 — Strong second wave
MCP client + connector gateway, Repo Wiki, prompt-to-UI subagent + Figma
integration + design tokens, background/cloud agents, persistent cross-
session memory, documentation/code-review/API-contract/dependency-license
subagents, automated commit/PR descriptions, in-IDE CI/CD status,
enterprise controls (SSO, access control, audit export), DB schema
visualizer, API test/mock panel, observability panel, IaC generation +
cost estimation, WhatsApp + SMS-fallback notifications, org-wide code
search, Jira/Linear/Confluence sync, admin/telemetry dashboard.

### Tier 3 — Differentiated, not urgent
Multilingual (Ewe, Twi) + voice input, built-in design canvas, browser
automation, skills with interactive UI, in-IDE skill/agent authoring,
parallel agents on git worktrees, Kanban multi-agent panel, cost/usage
dashboard, explainability/replay log, load/accessibility testing, live
pair programming, stacked PRs, notebook support, extension SDK + public
API, data residency controls, offline license activation, GDPR/local
compliance tooling, changelog automation, dependency update bot, low-spec
hardware mode, i18n/l10n tooling, visual CI/CD builder, message-broker
visualization, env-var management with drift detection, visual regression
testing, session recording/time-travel debugging, browser extension + CLI
companions, carbon/compute footprint indicator, bootcamp/university
learning mode, versioned/pinned team skill packs, settings backup/multi-
device sync, offline installer, in-app support chat, air-gapped enterprise
install.

### Tier 4 — Long-term / ecosystem
Third-party skill marketplace, mobile app, JetBrains plugin, model gateway
at zero markup (500+ models), dedicated security branding, African
payment-rail billing (Paystack/mobile money) + usage-based billing,
template/starter-project marketplace.

## Why VS Code directly, not Cursor/Void

Forking `microsoft/vscode` directly (rather than an existing fork like
Cursor or Void) keeps upstream merges tractable. Cursor and Void have
patched core internals in ways that make tracking upstream painful — worth
the extra initial setup work to avoid inheriting that problem.
