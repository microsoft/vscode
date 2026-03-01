# Three-Universe Core

> Activity bar, sidebar views, commands, keybindings, output channels, and settings — the central extension for mia-vscode.

## Desired Outcome
A single built-in extension provides the scaffolding for all three-universe interaction: navigation (activity bar, sidebar), invocation (commands, keybindings), observation (output channels), and configuration (settings). Other mia extensions depend on this core.

## Current Reality
No narrative navigation, commands, or output infrastructure exists in the VS Code fork.

## Structural Tension
This core extension is the nervous system connecting all narrative surfaces. Without it, the built-in extensions have no shared infrastructure.

---

## Components

### ActivityBarContainers
Three activity bar icons for universe panels.
- **Behavior:** Register three `viewsContainers` in the activity bar:
  - **Three-Universe** — icon: three interlocking circles. Contains: `UniverseExplorer`, `BeatTimeline` views
  - **STC Dashboard** — icon: tension arc chart. Contains: `ChartExplorer` views (provided by `mia.stc-charts`)
  - **Story Monitor** — icon: open book. Contains: `SessionExplorer`, event feed (provided by `mia.story-monitor`)
  
  Each icon supports badge counts and tooltip text. Icons are SVG with theme color tokens.

### SidebarViews
Tree views for narrative navigation.
- **Behavior:** Register tree views using `TreeDataProvider` API:
  - **UniverseExplorer** — Three root nodes: Engineer (🔧), Ceremony (🌿), Story (📖). Under each: recent analyses grouped by file. Click navigates to analyzed file. Filter by date, significance.
  - **BeatTimeline** — Chronological tree of story beats grouped by session or day. Each beat shows type icon, description, significance. Click opens beat detail.
  
  Tree data refreshed via WebSocket events from `integration/02-websocket-narrative-client`.

### Commands
Command palette entries for mia operations.
- **Behavior:** Register commands with `mia.` prefix:
  | Command ID | Title | Description |
  |-----------|-------|-------------|
  | `mia.analyzeFile` | Mia: Analyze Current File | Three-universe analysis of active file |
  | `mia.showPanel` | Mia: Show Agent Panel | Open the agent chat panel |
  | `mia.createChart` | Mia: Create STC Chart | New Structural Tension Chart |
  | `mia.createBeat` | Mia: Create Story Beat | Log a narrative beat |
  | `mia.switchUniverse` | Mia: Switch Universe Focus | Cycle or select primary universe |
  | `mia.showDashboard` | Mia: Show Dashboard | Open STC dashboard view |
  | `mia.decompose` | Mia: Decompose Prompt | PDE decomposition of selected text |
  | `mia.quickAnalysis` | Mia: Quick Analysis | Lightweight analysis of selection |

### Keybindings
Default keyboard shortcuts.
- **Behavior:** All keybindings use `ctrl+shift+m` as prefix chord (avoiding conflicts with existing VS Code bindings):
  | Keybinding | Command |
  |-----------|---------|
  | `ctrl+shift+m a` | `mia.analyzeFile` |
  | `ctrl+shift+m p` | `mia.showPanel` |
  | `ctrl+shift+m c` | `mia.createChart` |
  | `ctrl+shift+m b` | `mia.createBeat` |
  | `ctrl+shift+m u` | `mia.switchUniverse` |
  | `ctrl+shift+m d` | `mia.showDashboard` |
  | `ctrl+shift+m e` | `mia.decompose` |
  | `ctrl+shift+m q` | `mia.quickAnalysis` |

### OutputChannels
Universe-specific output channels.
- **Behavior:** Create output channels lazily on first write:
  - `Mia: Engineer 🔧` — Technical analysis output
  - `Mia: Ceremony 🌿` — Relational analysis output
  - `Mia: Story 📖` — Narrative analysis output
  - `Mia: Narrative` — Combined narrative log
  - `Mia: Server` — Server connection and API log
  
  Each channel uses `LogOutputChannel` for structured logging with timestamps.

### Settings
Configuration properties.
- **Behavior:** Contribute settings under `mia.*` namespace:
  | Setting | Type | Default | Description |
  |---------|------|---------|-------------|
  | `mia.serverUrl` | string | `""` | mia-code-server URL |
  | `mia.primaryUniverse` | enum | `"balanced"` | Primary universe focus: engineer, ceremony, story, balanced |
  | `mia.enabled` | boolean | `true` | Enable mia features |
  | `mia.analysisDepth` | enum | `"standard"` | Analysis depth: quick, standard, deep |
  | `mia.decorations.enabled` | boolean | `true` | Show inline decorations |
  | `mia.decorations.level` | enum | `"moderate"` | Decoration density: minimal, moderate, rich |
  | `mia.telemetryNarrative` | boolean | `false` | Route telemetry through narrative system |
  | `mia.autoAnalyze` | boolean | `false` | Auto-analyze on file save |

### SharedAPIService
Internal API for other mia extensions.
- **Behavior:** Exports a service via `vscode.extensions.getExtension('mia.three-universe').exports`:
  ```typescript
  interface MiaAPI {
    getServerUrl(): string;
    isConnected(): boolean;
    analyzeFile(uri: vscode.Uri): Promise<ThreeUniverseResult>;
    onNarrativeEvent: vscode.Event<NarrativeEvent>;
    getOutputChannel(universe: 'engineer' | 'ceremony' | 'story' | 'narrative' | 'server'): vscode.LogOutputChannel;
  }
  ```
  Other mia extensions access shared state and server connection through this API rather than duplicating configuration.

---

## Supporting Structures
- Extension directory: `extensions/mia-three-universe/`
- Activation: `onStartupFinished` (waits for workbench to load)
- Dependencies: none (this is the root extension)
- Fulfills: `mia-code-server/rispecs/mia-vscode/03-activity-bar`, `04-sidebar-views`, `06-settings-schema`, `07-keybindings`, `12-output-channels`
