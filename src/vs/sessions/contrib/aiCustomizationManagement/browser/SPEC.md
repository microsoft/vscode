# AI Customization Management Editor Specification

## Overview

The AI Customization Management Editor is a global management surface for AI customizations. It provides sectioned navigation and a content area that switches between prompt lists, MCP servers, models, and an embedded editor.

**Location:** `src/vs/sessions/contrib/aiCustomizationManagement/browser/`

**Purpose:** Centralized discovery and management across worktree, user, and extension sources, optimized for agent sessions.

## Architecture

### Component Hierarchy

```
AICustomizationManagementEditor (EditorPane)
├── SplitView (Horizontal orientation)
│   ├── Sidebar Panel (Left)
│   │   └── WorkbenchList (sections)
│   └── Content Panel (Right)
│       ├── PromptsContent (AICustomizationListWidget)
│       ├── MCP Content (McpListWidget)
│       ├── Models Content (ChatModelsWidget)
│       └── Embedded Editor (CodeEditorWidget)
```

### File Structure

```
aiCustomizationManagement/browser/
├── aiCustomizationManagement.ts              # IDs + context keys
├── aiCustomizationManagement.contribution.ts # Commands + context menus
├── aiCustomizationManagementEditor.ts        # SplitView list/editor
├── aiCustomizationManagementEditorInput.ts   # Singleton input
├── aiCustomizationListWidget.ts              # Search + grouped list
├── customizationCreatorService.ts            # AI-guided creation flow
├── mcpListWidget.ts                          # MCP servers list
├── aiCustomizationOverviewView.ts            # Overview view
└── media/
    └── aiCustomizationManagement.css
```

## Key Components

### AICustomizationManagementEditorInput

**Pattern:** Singleton editor input with dynamic tab title (section label).

### AICustomizationManagementEditor

**Responsibilities:**
- Manages section navigation and content swapping.
- Hosts embedded editor view for prompt files.
- Persists selected section and sidebar width.

**Sections:**
- Agents, Skills, Instructions, Prompts, Hooks, MCP Servers, Models.

**Embedded Editor:**
- Uses `CodeEditorWidget` for full editor UX.
- Auto-commits worktree files on exit via agent session command.

**Overview View:**
- A compact view (`AICustomizationOverviewView`) shows counts and deep-links to sections.

**Creation flows:**
- Manual create (worktree/user) with snippet templates.
- AI-guided create opens a new chat with hidden system instructions.

### AICustomizationListWidget

**Responsibilities:**
- Search + grouped list of prompt files by storage (Worktree/User/Extensions).
- Collapsible group headers.
- Storage badges and git status badges.
 - Empty state UI with icon, title, and description.
 - Section footer with description + docs link.

**Search behavior:**
- Fuzzy matches across name, description, and filename.
- Debounced (200ms) filtering.

**Active session scoping:**
- The active worktree comes from `IActiveSessionService` and is the source of truth for scoping.
- Prompt discovery is scoped by the agentic prompt service override using the active session root.
- Views refresh counts/filters when the active session changes.

**Context menu actions:**
- Open, Run Prompt (prompts), Reveal in OS, Delete.
- Copy full path / relative path actions.

**Add button behavior:**
- Primary action targets worktree when available, otherwise user.
- Dropdown offers User creation and AI-generated creation.
- Hooks use the built-in Configure Hooks flow and do not offer user-scoped creation.

### McpListWidget

**Responsibilities:**
- Lists MCP servers with status and actions.
- Provides add server flow and docs link.
 - Search input with debounced filtering and an empty state.

### Models Widget

**Responsibilities:**
- Hosts the chat models management widget with a footer link.

## Registration & Commands

- Editor pane registered under `AI_CUSTOMIZATION_MANAGEMENT_EDITOR_ID`.
- Command `aiCustomization.openManagementEditor` opens the singleton editor.
- Command visibility and actions are gated by `ChatContextKeys.enabled`.

## State and Context

- Selected section and sidebar width are persisted to profile storage.
- Context keys:
  - `aiCustomizationManagementEditorFocused`
  - `aiCustomizationManagementSection`

## User Workflows

### Open Management Editor

1. Run "Open AI Customizations" from the command palette.
2. Editor opens with the last selected section.

### Create Items

1. Use the Add button in the list header.
2. Choose worktree or user location (if available).
3. Optionally use "Generate" to start AI-guided creation.

This is the only UI surface for creating new customizations.

### Edit Items

1. Click an item to open the embedded editor.
2. Use back to return to list; worktree files auto-commit.

### Context Menu Actions

1. Right-click a list item.
2. Choose Open, Run Prompt (prompts only), Reveal in OS, or Delete.
3. Use Copy Full Path / Copy Relative Path for quick path access.

## Integration Points

- `IPromptsService` for agent/skill/prompt/instructions discovery.
- `parseAllHookFiles` for hooks.
- `IActiveSessionService` for worktree filtering.
- `ISCMService` for git status badges.
- `ITextModelService` and `IFileService` for embedded editor I/O.
- `IDialogService` for delete confirmation and extension-file guardrails.
- `IOpenerService` for docs links and external navigation.

## Service Alignment (Required)

AI customizations must lean on existing VS Code services with well-defined interfaces. The management surface should not reimplement discovery, storage rules, or MCP lifecycle behavior.

Browser compatibility is required. Do not use Node.js APIs; rely on VS Code services that work in browser contexts.

Required services to prefer:
- Prompt discovery and metadata: [src/vs/workbench/contrib/chat/common/promptSyntax/service/promptsService.ts](../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.ts)
- Active session scoping for worktrees: [src/vs/workbench/contrib/chat/browser/agentSessions/agentSessionsService.ts](../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.ts)
- MCP servers and connections: [src/vs/workbench/contrib/mcp/common/mcpService.ts](../../../../workbench/contrib/mcp/common/mcpService.ts)
- MCP management and gallery: [src/vs/platform/mcp/common/mcpManagement.ts](../../../../platform/mcp/common/mcpManagement.ts)
- Chat models: [src/vs/workbench/contrib/chat/common/chatService/chatService.ts](../../../../workbench/contrib/chat/common/chatService/chatService.ts)

## Known Gaps

- No bulk operations or sorting.
- Search query is not persisted between sessions.
- Hooks docs link is a placeholder and should be updated when available.

---

*This specification documents the AI Customization Management Editor in `src/vs/sessions/contrib/aiCustomizationManagement/browser/`.*
