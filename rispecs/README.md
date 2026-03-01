# RISE Specifications — mia-vscode

> VS Code Fork for Narrative-Driven Development

**Version**: 0.1.0  
**Framework**: RISE v1.2 (Reverse-engineer → Intent-extract → Specify → Export)  
**Composed by**: Copilot, 2026-02-28  
**Upstream**: microsoft/vscode (Code - OSS)  
**Demand-side specs**: miadisabelle/mia-code-server/rispecs/mia-vscode/ (12 specs) + agentic-ide/ (8 specs)

---

## Vision

**mia-vscode** transforms the VS Code editor into a **narrative-aware IDE** — the client layer of the mia-code-server platform. The fork provides the visual identity, built-in extensions, and integration contracts that enable three-universe intelligence (Engineer/Ceremony/Story) to be a first-class development experience.

### Desired Outcome
Developers open mia-vscode and immediately inhabit a narrative development environment — branded, equipped with three-universe tools in the activity bar and sidebar, and connected to the mia-code-server backend for real-time narrative intelligence.

### Current Reality
mia-vscode is an unmodified fork of microsoft/vscode (Code - OSS). The default product.json, branding, and extension set are stock VS Code.

### Structural Tension
The gap between stock VS Code and a narrative IDE creates natural convergence toward targeted modifications: product identity, built-in extensions, and server integration contracts.

---

## Specification Index

### 🏗️ [foundation/](./foundation/) — VS Code Source Modifications (5 specs)
Direct changes to VS Code source code that cannot be achieved through extensions alone.

| # | Spec | Description |
|---|------|-------------|
| 01 | [product-identity.spec.md](./foundation/01-product-identity.spec.md) | product.json identity, data folders, URL protocol |
| 02 | [workbench-branding.spec.md](./foundation/02-workbench-branding.spec.md) | Title bar, about dialog, splash screen, application icons |
| 03 | [welcome-experience.spec.md](./foundation/03-welcome-experience.spec.md) | First-run walkthrough and getting-started experience |
| 04 | [extension-gallery.spec.md](./foundation/04-extension-gallery.spec.md) | Extension marketplace configuration and Open VSX support |
| 05 | [narrative-telemetry-hook.spec.md](./foundation/05-narrative-telemetry-hook.spec.md) | Telemetry interception point for narrative event routing |

### 🧩 [extensions/](./extensions/) — Built-in Extensions (8 specs)
Extensions bundled in `extensions/` directory — shipped with the fork, zero installation needed.

| # | Spec | Description |
|---|------|-------------|
| 01 | [theme-mia.spec.md](./extensions/01-theme-mia.spec.md) | Three-universe dark/light theme and file icon theme |
| 02 | [three-universe-core.spec.md](./extensions/02-three-universe-core.spec.md) | Activity bar, sidebar views, commands, keybindings, output channels, settings |
| 03 | [stc-charts.spec.md](./extensions/03-stc-charts.spec.md) | Structural Tension Chart management sidebar and webview |
| 04 | [story-monitor.spec.md](./extensions/04-story-monitor.spec.md) | Live narrative event dashboard webview |
| 05 | [agent-panel.spec.md](./extensions/05-agent-panel.spec.md) | Three-universe agentic chat webview panel |
| 06 | [mia-terminal.spec.md](./extensions/06-mia-terminal.spec.md) | Terminal profile for miadi-code agent |
| 07 | [editor-intelligence.spec.md](./extensions/07-editor-intelligence.spec.md) | CodeLens, hover, decorations, inline suggestions, diagnostics |
| 08 | [chat-participant.spec.md](./extensions/08-chat-participant.spec.md) | VS Code Chat API three-universe participant |

### 🔗 [integration/](./integration/) — Server Integration Contracts (3 specs)
Client-side contracts for connecting to the mia-code-server backend.

| # | Spec | Description |
|---|------|-------------|
| 01 | [server-api-client.spec.md](./integration/01-server-api-client.spec.md) | HTTP client for mia-code-server narrative API routes |
| 02 | [websocket-narrative-client.spec.md](./integration/02-websocket-narrative-client.spec.md) | WebSocket client for real-time narrative events |
| 03 | [mcp-client-bridge.spec.md](./integration/03-mcp-client-bridge.spec.md) | MCP tool discovery and invocation from editor extensions |

---

## Total: 16 Specifications

## Cross-Cutting Concerns

All specs follow:
- **RISE Framework** v1.2 — Creative Orientation, Structural Tension, Advancing Patterns
- **SpecLang Syntax** — Behavior/Styling/Layout sections, backtick cross-references
- **Codebase Agnosticism** — Each spec is implementable without access to other repos
- **VS Code Architecture** — Respects layered architecture (base → platform → editor → workbench) and contribution model
- **Three-Universe Lens** — Every component considered through Engineer/Ceremony/Story perspectives

## Relationship to mia-code-server/rispecs

These specs are the **supply side** — what mia-vscode implements. The **demand side** lives in:
- `mia-code-server/rispecs/mia-vscode/` (12 specs) — what the platform needs from the VS Code fork
- `mia-code-server/rispecs/agentic-ide/` (8 specs) — IDE presence requirements (all extension-based)

See [KINSHIP.md](./KINSHIP.md) for the full relational map.

---
**RISE Framework Compliance**: ✅ Creative Orientation | ✅ Structural Dynamics | ✅ Advancing Patterns | ✅ Desired Outcomes
