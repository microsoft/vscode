---
name: Multi-Agent Orchestrator with Providers & Agent Lanes
status: implemented
priority: high
branch: feat/multi-agent-orchestrator
date: 2026-03-30
blockedBy: []
blocks: []
---

# Multi-Agent Orchestrator with Providers & Agent Lanes

> Add two new VS Code sessions: **Providers** (AI provider/account management with rotation + dashboard) and **Agent Lanes** (multi-agent orchestration with role-based agents, tracking board)

## Goal

Build a multi-agent orchestrator system into VS Code that:
1. Manages multiple AI providers with API key rotation and quota tracking
2. Enables users to create role-based agents assigned to specific models/providers
3. Orchestrates task decomposition and delegation across specialized agents
4. Provides real-time dashboards for provider health and agent activity

## Research Reports

- [VS Code Chat Infrastructure](../reports/researcher-260330-1255-vscode-chat-infrastructure.md)
- [Reference Repos (9Router + Cockpit)](../reports/researcher-260330-1255-reference-repos-analysis.md)
- [VS Code Viewlet Architecture](../reports/researcher-260330-1257-vscode-viewlet-architecture.md)
- [Multi-Agent Orchestrator Patterns](../reports/researcher-260330-1255-multi-agent-orchestrator-patterns.md)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│ VS Code Workbench                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │  Providers    │  │ Agent Lanes  │  │  Existing Chat    │ │
│  │  ViewPane     │  │  ViewPane    │  │  (Copilot)        │ │
│  └──────┬───────┘  └──────┬───────┘  └────────┬──────────┘ │
│         │                 │                    │            │
│  ┌──────▼─────────────────▼────────────────────▼──────────┐ │
│  │              Multi-Agent Service Layer                  │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │ │
│  │  │ProviderMgr   │  │ AgentLaneMgr │  │ Orchestrator │ │ │
│  │  │ - accounts   │  │ - agents     │  │ - decompose  │ │ │
│  │  │ - rotation   │  │ - lifecycle  │  │ - delegate   │ │ │
│  │  │ - quota      │  │ - roles      │  │ - fan-out    │ │ │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │ │
│  └─────────┼─────────────────┼─────────────────┼─────────┘ │
│            │                 │                 │            │
│  ┌─────────▼─────────────────▼─────────────────▼──────────┐ │
│  │        Existing VS Code Chat Infrastructure            │ │
│  │  IChatService · IChatAgentService · ILanguageModels    │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Phases

| # | Phase | Status | Priority | Effort |
|---|-------|--------|----------|--------|
| 1 | [Core Provider Infrastructure](phase-01-core-provider-infrastructure.md) | implemented | P0 | L |
| 2 | [Provider Management UI](phase-02-provider-management-ui.md) | implemented | P0 | L |
| 3 | [Agent System Core](phase-03-agent-system-core.md) | implemented | P0 | XL |
| 4 | [Agent Lanes UI](phase-04-agent-lanes-ui.md) | implemented | P1 | L |
| 5 | [Orchestrator Engine](phase-05-orchestrator-engine.md) | implemented | P1 | XL |
| 6 | [Provider Rotation & Quota](phase-06-provider-rotation-quota.md) | implemented | P1 | M |
| 7 | [Integration & Wiring](phase-07-integration-wiring.md) | implemented | P2 | M |

## Key Decisions

1. **Build on existing infra** — extend `ILanguageModelsConfigurationService` for provider groups, use `IChatAgentService.registerDynamicAgent()` for custom agents
2. **New contrib module** — `src/vs/workbench/contrib/multiAgent/` for all new code
3. **ViewPaneContainer** — two views (Providers + Agent Lanes) in sidebar, reusable as panel
4. **Provider rotation** — deterministic failover chain per model, inspired by 9Router's tiered approach
5. **Agent lifecycle** — 7-state machine: idle → queued → running → blocked → waiting → error → done
6. **Orchestrator pattern** — fan-out/fan-in with dependency tracking via existing chat request pipeline
7. **Chat bridge integration** — completed wiring between Agent Lanes chat UI and multi-agent service layer via IChatAgentService

## Dependencies

- VS Code chat infrastructure (IChatService, IChatAgentService, ILanguageModelsService)
- ILanguageModelsConfigurationService for provider group management
- ViewPaneContainer + ViewPane for sidebar UI
- Existing chat request/response pipeline for agent communication

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Chat API changes upstream | High | Isolate via adapter interfaces |
| Provider API format differences | Medium | Format translation layer per provider |
| Agent state complexity | Medium | Keep state machine simple, persist minimally |
| UI performance with many agents | Low | Virtual scrolling, event-driven updates |
