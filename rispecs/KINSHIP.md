# rispecs KINSHIP.md

## Purpose

Link mia-vscode to its relational kin — the projects it serves, depends on, and offers its capabilities to.

---

## Primary Kin: `miadisabelle/mia-code-server`

> **Role**: The Platform — mia-vscode is the visual client layer of mia-code-server
> **Demand-side specs**: `mia-code-server/rispecs/mia-vscode/` (12 specs) + `mia-code-server/rispecs/agentic-ide/` (8 specs)
> **Supply-side specs**: This directory (`mia-vscode/rispecs/`) — 16 specs

### The Structural Relationship

mia-code-server serves the customized VS Code editor to users over the network. The server provides:
- Narrative intelligence APIs (`/api/narrative/*`)
- WebSocket real-time events (`/api/ws/narrative`)
- MCP tool server (`/api/mcp`)
- Session persistence and configuration

mia-vscode provides:
- Product identity and branding (what users see)
- Built-in extensions (what users interact with)
- Integration contracts (how extensions talk to the server)

### Spec Correspondence Map

| mia-vscode spec | Fulfills mia-code-server spec |
|-----------------|------------------------------|
| `foundation/01-product-identity` | `mia-vscode/08-product-json` |
| `foundation/02-workbench-branding` | `mia-vscode/01-branding-theme` |
| `foundation/03-welcome-experience` | `mia-vscode/02-welcome-experience` |
| `foundation/04-extension-gallery` | `mia-vscode/09-extension-marketplace` |
| `foundation/05-narrative-telemetry-hook` | `mia-vscode/11-telemetry-narrative` |
| `extensions/01-theme-mia` | `mia-vscode/01-branding-theme` |
| `extensions/02-three-universe-core` | `mia-vscode/03-activity-bar` + `04-sidebar-views` + `06-settings-schema` + `07-keybindings` + `12-output-channels` |
| `extensions/03-stc-charts` | `agentic-ide/04-status-bar` (charts aspect) |
| `extensions/04-story-monitor` | `narrative-intelligence/05-live-story-monitor` |
| `extensions/05-agent-panel` | `agentic-ide/01-agent-panel` |
| `extensions/06-mia-terminal` | `agentic-ide/06-terminal-integration` |
| `extensions/07-editor-intelligence` | `agentic-ide/02-inline-suggestions` + `05-file-decorations` + `08-diagnostic-provider` + `mia-vscode/05-editor-overlays` |
| `extensions/08-chat-participant` | `agentic-ide/07-chat-participant` |
| `integration/01-server-api-client` | `mia-server-core/03-narrative-routes` |
| `integration/02-websocket-narrative-client` | `mia-server-core/04-websocket-narrative-channel` |
| `integration/03-mcp-client-bridge` | `mia-server-core/09-mcp-server-integration` |

---

## Upstream: `microsoft/vscode`

> **Role**: The Foundation — mia-vscode is a fork of VS Code (Code - OSS)
> **Architecture**: Layered (base → platform → editor → workbench), DI, contribution model

### What We Preserve
- The entire VS Code extension API surface
- Layered architecture and dependency injection patterns
- Build system (`gulp`, extension bundling, product.json configuration)
- All existing built-in extensions

### What We Add
- Modified `product.json` for mia-code identity
- 8 built-in extensions in `extensions/` directory
- Branding assets in `resources/`
- Telemetry interception hook in workbench telemetry service

### Merge Strategy
Foundation changes are minimal and localized (product.json, resources/, telemetry hook). Built-in extensions are additive — no existing code modified. This enables clean upstream merges.

---

## Sibling: `jgwill/smcraft`

> **Role**: State Machine Toolkit — provides visual designer embedded as webview

The `extensions/03-stc-charts` extension may host smcraft's web designer via webview. The integration contract lives in `mia-code-server/rispecs/smcraft-integration/03-visual-designer-integration`.

---

## Relational Accountability

### What this kinship tends
- Clean separation between platform demands (mia-code-server) and fork implementation (mia-vscode)
- Upstream merge compatibility through minimal, additive changes
- Extension-first philosophy — prefer extension API over source modification

### What this kinship offers
- A fully branded, narrative-aware VS Code distribution
- 8 built-in extensions providing zero-config narrative development
- Integration contracts enabling any mia-code-server backend

### Relational Change Log
- [2026-02-28] Created mia-vscode/rispecs — 16 specifications across foundation, extensions, and integration layers. Supply-side complement to mia-code-server demand-side specs.
