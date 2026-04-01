# vs/sessions — Agentic Sessions Window Layer

## Overview

The `vs/sessions` layer hosts the implementation of the **Agentic Window**, a dedicated workbench experience optimized for agent session workflows. This is a distinct top-level layer within the VS Code architecture, sitting alongside `vs/workbench`.

## Architecture

### Layering Rules

```
vs/base          ← Foundation utilities
vs/platform      ← Platform services
vs/editor        ← Text editor core
vs/workbench     ← Standard workbench
vs/sessions      ← Agentic window (this layer)
```

**Key constraint:** `vs/sessions` may import from `vs/workbench` (and all layers below it), but `vs/workbench` must **never** import from `vs/sessions`. This ensures the standard workbench remains independent of the agentic window implementation.

### Allowed Dependencies

| From `vs/sessions` | Can Import |
|--------------------|------------|
| `vs/base/**` | ✅ |
| `vs/platform/**` | ✅ |
| `vs/editor/**` | ✅ |
| `vs/workbench/**` | ✅ |
| `vs/sessions/**` | ✅ (internal) |

| From `vs/workbench` | Can Import |
|----------------------|------------|
| `vs/sessions/**` | ❌ **Forbidden** |

### Folder Structure

The `vs/sessions` layer follows the same layering conventions as `vs/workbench`:

```
src/vs/sessions/
├── README.md                           ← This specification
├── LAYOUT.md                           ← Layout specification for the agentic workbench
├── AI_CUSTOMIZATIONS.md                ← AI customization design document
├── sessions.common.main.ts             ← Common (browser + desktop) entry point
├── sessions.desktop.main.ts            ← Desktop entry point
├── common/                             ← Shared types and context keys
│   └── contextkeys.ts                  ← ChatBar context keys
├── browser/                            ← Core workbench implementation
│   ├── workbench.ts                    ← Main workbench layout (Workbench class)
│   ├── layoutActions.ts                ← Layout toggle actions
│   ├── menus.ts                        ← Menu IDs for agent sessions menus (Menus export)
│   ├── paneCompositePartService.ts     ← AgenticPaneCompositePartService
│   ├── style.css                       ← Layout styles
│   ├── widget/                         ← Agent sessions chat widget
│   │   ├── AGENTS_CHAT_WIDGET.md       ← Chat widget architecture documentation
│   │   ├── agentSessionsChatWidget.ts  ← Main chat widget wrapper
│   │   ├── agentSessionsChatTargetConfig.ts ← Target configuration (observable)
│   │   ├── agentSessionsTargetPickerActionItem.ts ← Target picker for input toolbar
│   │   └── media/
│   │       └── agentSessionsChatWidget.css
│   └── parts/                          ← Workbench part implementations
│       ├── titlebarPart.ts             ← Simplified titlebar part & title service
│       ├── sidebarPart.ts              ← Sidebar part (with footer)
│       ├── auxiliaryBarPart.ts         ← Auxiliary bar part (with run script dropdown)
│       ├── panelPart.ts               ← Panel part
│       ├── chatBarPart.ts             ← Chat bar part
│       ├── projectBarPart.ts          ← Project bar part (folder entries)
│       ├── parts.ts                   ← AgenticParts enum
│       ├── agentSessionsChatInputPart.ts  ← Chat input part adapter
│       ├── agentSessionsChatWelcomePart.ts ← Chat welcome part
│       └── media/                     ← Part CSS
├── electron-browser/                   ← Desktop-specific entry points
│   ├── sessions.main.ts
│   ├── sessions.ts
│   ├── sessions.html
│   └── sessions-dev.html
├── contrib/                            ← Feature contributions
│   ├── accountMenu/browser/            ← Account menu widget and sidebar footer
│   │   └── account.contribution.ts
│   ├── aiCustomizationManagement/      ← AI customization management editor
│   │   └── browser/
│   ├── aiCustomizationTreeView/        ← AI customization tree view sidebar
│   │   └── browser/
│   ├── changesView/browser/            ← File changes view
│   │   ├── changesView.contribution.ts
│   │   └── changesView.ts
│   ├── chat/browser/                   ← Chat-related actions and services
│   │   ├── chat.contribution.ts
│   │   ├── branchChatSessionAction.ts
│   │   ├── runScriptAction.ts
│   │   └── promptsService.ts
│   ├── configuration/browser/          ← Configuration contribution
│   │   └── configuration.contribution.ts
│   └── sessions/browser/              ← Sessions view and title bar widget
│       ├── sessions.contribution.ts
│       ├── sessionsViewPane.ts
│       ├── sessionsTitleBarWidget.ts
│       ├── activeSessionService.ts
│       └── media/
```

## What is the Agentic Window?

The Agentic Window (`Workbench`) provides a simplified, fixed-layout workbench tailored for agent session workflows. Unlike the standard VS Code workbench:

- **Fixed layout** — Part positions are not configurable via settings
- **Simplified chrome** — No activity bar, no status bar, no banner
- **Chat-first UX** — Chat bar is a primary part alongside sidebar and auxiliary bar
- **Modal editor** — Editors appear as modal overlays rather than in the main grid
- **Session-aware titlebar** — Titlebar shows active session with a session picker
- **Sidebar footer** — Account widget and sign-in live in the sidebar footer

See [LAYOUT.md](LAYOUT.md) for the detailed layout specification.

## Sessions Provider Architecture

The agent sessions window uses an extensible provider model to manage sessions. Instead of hardcoding session type logic (CLI, Cloud, Agent Host) throughout the codebase, all session behavior is encapsulated in **sessions providers** that register with a central registry.

### Overview Diagram

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                              UI Components                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐  ┌──────────────┐  │
│  │ SessionsView │  │  TitleBar    │  │   NewChatWidget    │  │ ChangesView  │  │
│  │   Pane       │  │   Widget     │  │ (workspace/type    │  │              │  │
│  │              │  │              │  │  pickers)          │  │              │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬───────────┘  └──────┬───────┘  │
│         │                 │                    │                     │          │
│         │     reads ISessionData observables   │                     │          │
│         │   (title, status, changes, workspace, isArchived, ...)     │          │
│         └─────────────────┼────────────────────┼─────────────────────┘          │
│                           │                    │                                │
│                    ┌──────▼────────────────────▼──┐                              │
│                    │  Sessions Management Service │  ISessionsManagementService  │
│                    │  - activeSession: IObservable<ISessionData>                 │
│                    │  - getSessions(): ISessionData[]                            │
│                    │  - openSession / createNewSession                           │
│                    │  - sendRequest / setSessionType                             │
│                    │  - onDidChangeSessions                                      │
│                    └──────────────┬────────────────┘                             │
│                                  │                                              │
│                    ┌─────────────▼─────────────┐                                │
│                    │ Sessions Providers Service │  ISessionsProvidersService     │
│                    │ - registerProvider(p)      │                                │
│                    │ - getProviders()           │                                │
│                    │ - getSessions() (merged)   │                                │
│                    └─────────────┬──────────────┘                               │
│                                  │                                              │
│              ┌───────────────────┼───────────────────┐                          │
│              │                   │                   │                          │
│       ┌──────▼──────┐     ┌──────▼──────┐     ┌──────▼──────┐                  │
│       │  Copilot    │     │ Remote Agent│     │   Custom    │                  │
│       │  Chat       │     │ Host        │     │  Provider   │                  │
│       │  Sessions   │     │ Provider    │     │  (future)   │                  │
│       │  Provider   │     │             │     │             │                  │
│       └──────┬──────┘     └──────┬──────┘     └─────────────┘                  │
│              │                   │                                              │
│              │    Each provider returns ISessionData[]                          │
│              │                   │                                              │
│       ┌──────▼──────┐     ┌──────▼──────┐                                      │
│       │ Agent       │     │ Agent Host  │                                      │
│       │ Sessions    │     │ Protocol    │                                      │
│       │ Service     │     │             │                                      │
│       └─────────────┘     └─────────────┘                                      │
└──────────────────────────────────────────────────────────────────────────────────┘

ISessionData (reactive session facade)
┌─────────────────────────────────────────────────────────────┐
│  sessionId: string          providerId: string              │
│  resource: URI              sessionType: string             │
│  icon: ThemeIcon            createdAt: Date                 │
├─────────────────────────────────────────────────────────────┤
│  Observable properties (auto-update UI when changed):       │
│                                                             │
│  title ─────────── "Fix login bug"                          │
│  status ────────── InProgress | NeedsInput | Completed      │
│  workspace ─────── { label, icon, repositories[] }          │
│  changes ───────── [{ modifiedUri, insertions, deletions }] │
│  updatedAt ─────── Date                                     │
│  lastTurnEnd ───── Date | undefined                         │
│  isArchived ────── boolean                                  │
│  isRead ────────── boolean                                  │
│  modelId ───────── "gpt-4o" | undefined                     │
│  mode ──────────── { id, kind } | undefined                 │
│  loading ───────── boolean                                  │
└─────────────────────────────────────────────────────────────┘

ISessionWorkspace (nested in ISessionData.workspace)
┌─────────────────────────────────────────────────────────────┐
│  label: "my-app"     icon: Codicon.folder                   │
│  repositories: [{                                           │
│      uri ──────────── file:///repo or github-remote-file:// │
│      workingDirectory ── file:///worktree (if isolation)     │
│      detail ─────────── "feature-branch"                    │
│      baseBranchProtected ── true/false                      │
│  }]                                                         │
└─────────────────────────────────────────────────────────────┘
```

### Core Concepts

#### Session Type (`ISessionType`)

A lightweight label identifying an agent backend. Says nothing about where it runs or how it's configured.

```typescript
// Platform-level session type (registered once)
interface ISessionType {
    readonly id: string;      // e.g., 'copilot-cli', 'copilot-cloud'
    readonly label: string;   // e.g., 'Copilot CLI', 'Cloud'
    readonly icon: ThemeIcon;
}
```

#### Sessions Provider (`ISessionsProvider`)

A compute environment adapter. One provider can serve multiple session types. Multiple provider instances can serve the same session type.

```typescript
interface ISessionsProvider {
    readonly id: string;                       // 'default-copilot', 'agenthost-hostA'
    readonly label: string;
    readonly sessionTypes: readonly ISessionType[];

    // Workspace browsing
    getWorkspaces(): ISessionWorkspace[];
    readonly browseActions: readonly ISessionsBrowseAction[];

    // Session CRUD
    getSessions(): ISessionData[];
    createNewSession(workspace: ISessionWorkspace): ISessionData;
    sendRequest(sessionId: string, options: ISendRequestOptions): Promise<ISessionData>;

    // Lifecycle
    archiveSession(sessionId: string): Promise<void>;
    deleteSession(sessionId: string): Promise<void>;
    renameSession(sessionId: string, title: string): Promise<void>;
}
```

#### Session Data (`ISessionData`)

The universal session interface. All reactive properties are observables — UI components subscribe and update automatically.

```typescript
interface ISessionData {
    readonly sessionId: string;          // Globally unique: 'providerId:localId'
    readonly resource: URI;
    readonly providerId: string;
    readonly sessionType: string;        // e.g., 'copilot-cli'

    // Reactive properties
    readonly title: IObservable<string>;
    readonly status: IObservable<SessionStatus>;
    readonly workspace: IObservable<ISessionWorkspace | undefined>;
    readonly changes: IObservable<readonly IChatSessionFileChange[]>;
    readonly isArchived: IObservable<boolean>;
    readonly isRead: IObservable<boolean>;
    readonly lastTurnEnd: IObservable<Date | undefined>;
}
```

### Examples

#### Example 1: CopilotChatSessionsProvider

The default provider wrapping existing CLI and Cloud sessions:

```
CopilotChatSessionsProvider
├── id: 'default-copilot'
├── sessionTypes: [CopilotCLI, CopilotCloud]
├── browseActions:
│   ├── "Browse Folders..." → file dialog
│   └── "Browse Repositories..." → GitHub repo picker
├── getSessions() → wraps IAgentSession[] as AgentSessionAdapter[]
├── createNewSession(workspace)
│   ├── file:// URI → CopilotCLISession (local background agent)
│   └── github-remote-file:// → RemoteNewSession (cloud agent)
└── sendRequest() → delegates to IChatService
```

#### Example 2: RemoteAgentHostSessionsProvider

One instance per connected remote agent host:

```
RemoteAgentHostSessionsProvider
├── id: 'agenthost-<hostId>'
├── sessionTypes: [CopilotCLI]  (reuses platform type)
├── browseActions:
│   └── "Browse Remote Folders..." → remote folder picker
├── getSessions() → sessions from this specific host
└── createNewSession(workspace)
    └── Creates session on the remote agent host
```

### Data Flow

#### Creating a New Session

```
User picks workspace in WorkspacePicker
    │
    ▼
SessionsManagementService.createNewSession(providerId, workspace)
    │
    ├── Finds provider by ID
    ├── Calls provider.createNewSession(workspace)
    │       │
    │       ▼
    │   Provider creates ISessionData
    │   (e.g., CopilotCLISession or RemoteNewSession)
    │
    ├── Sets as active session
    └── Returns ISessionData to widget

User types message and sends
    │
    ▼
SessionsManagementService.sendRequest(session, options)
    │
    ├── Finds provider by session.providerId
    ├── Calls provider.sendRequest(sessionId, options)
    │       │
    │       ▼
    │   Provider creates real agent session
    │   (e.g., starts CLI agent, opens cloud session)
    │
    └── Returns created ISessionData (now backed by real session)
```

#### Session Change Events

```
Agent session completes a turn
    │
    ▼
AgentSessionsService fires onDidChangeSessions
    │
    ▼
CopilotChatSessionsProvider._refreshSessionCache()
    ├── Diffs current sessions vs cache
    ├── Updates AgentSessionAdapter observables (title, status, changes)
    └── Fires onDidChangeSessions { added, removed, changed, archived }
         │
         ▼
    SessionsProvidersService forwards event
         │
         ▼
    SessionsManagementService forwards event
         │
         ├── UI re-renders (sessions list, titlebar, changes view)
         └── Context keys updated (hasChanges, isBackground, etc.)
```

### Key Files

| File | Purpose |
|------|---------|
| `contrib/sessions/common/sessionData.ts` | `ISessionData`, `ISessionWorkspace`, `ISessionRepository`, `SessionStatus` |
| `contrib/sessions/browser/sessionsProvider.ts` | `ISessionsProvider`, `ISessionType`, `ISessionsChangeEvent` |
| `contrib/sessions/browser/sessionsProvidersService.ts` | `ISessionsProvidersService` + implementation |
| `contrib/sessions/browser/sessionsManagementService.ts` | `ISessionsManagementService` — active session, routing |
| `contrib/copilotChatSessions/browser/copilotChatSessionsProvider.ts` | Default Copilot provider |
| `contrib/remoteAgentHost/browser/remoteAgentHostSessionsProvider.ts` | Remote agent host provider |

## Adding New Functionality

When adding features to the agentic window:

1. **Core workbench code** (layout, parts, services) goes under `browser/`
2. **Feature contributions** (views, actions, editors) go under `contrib/<featureName>/browser/`
3. Register contributions by importing them in `sessions.desktop.main.ts` (or `sessions.common.main.ts` for browser-compatible code)
4. Do **not** add imports from `vs/workbench` back to `vs/sessions`
5. Contributions can import from `vs/sessions/browser/` (core) and other `vs/sessions/contrib/*/` modules
6. Update the layout spec (`LAYOUT.md`) for any layout changes
