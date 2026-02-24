# AI Customizations – Design Document

This document describes the current AI customization experience in this branch: a management editor and tree view that surface items across worktree, user, and extension storage.

## Current Architecture

### File Structure (Agentic)

```
src/vs/sessions/contrib/aiCustomizationManagement/browser/
├── aiCustomizationManagement.contribution.ts   # Commands + context menus
├── aiCustomizationManagement.ts                # IDs + context keys
├── aiCustomizationManagementEditor.ts          # SplitView list/editor
├── aiCustomizationManagementEditorInput.ts     # Singleton input
├── aiCustomizationListWidget.ts                # Search + grouped list
├── aiCustomizationOverviewView.ts              # Overview view (counts + deep links)
├── customizationCreatorService.ts              # AI-guided creation flow
├── mcpListWidget.ts                            # MCP servers section
├── SPEC.md                                     # Feature specification
└── media/
    └── aiCustomizationManagement.css

src/vs/sessions/contrib/aiCustomizationTreeView/browser/
├── aiCustomizationTreeView.contribution.ts     # View + actions
├── aiCustomizationTreeView.ts                  # IDs + menu IDs
├── aiCustomizationTreeViewViews.ts             # Tree data source + view
├── aiCustomizationTreeViewIcons.ts             # Icons
├── SPEC.md                                     # Feature specification
└── media/
    └── aiCustomizationTreeView.css
```

---

## Service Alignment (Required)

AI customizations must lean on existing VS Code services with well-defined interfaces. This avoids duplicated parsing logic, keeps discovery consistent across the workbench, and ensures prompt/hook behavior stays authoritative.

Browser compatibility is required. Do not use Node.js APIs; rely on VS Code services that work in browser contexts.

Key services to rely on:
- Prompt discovery, parsing, and lifecycle: [src/vs/workbench/contrib/chat/common/promptSyntax/service/promptsService.ts](../workbench/contrib/chat/common/promptSyntax/service/promptsService.ts)
- Active session scoping for worktree filtering: [src/vs/workbench/contrib/chat/browser/agentSessions/agentSessionsService.ts](../workbench/contrib/chat/browser/agentSessions/agentSessionsService.ts)
- MCP servers and tool access: [src/vs/workbench/contrib/mcp/common/mcpService.ts](../workbench/contrib/mcp/common/mcpService.ts)
- MCP management and gallery: [src/vs/platform/mcp/common/mcpManagement.ts](../platform/mcp/common/mcpManagement.ts)
- Chat models and session state: [src/vs/workbench/contrib/chat/common/chatService/chatService.ts](../workbench/contrib/chat/common/chatService/chatService.ts)
- File and model plumbing: [src/vs/platform/files/common/files.ts](../platform/files/common/files.ts), [src/vs/editor/common/services/resolverService.ts](../editor/common/services/resolverService.ts)

The active worktree comes from `IActiveSessionService` and is the source of truth for any workspace/worktree scoping.

In the agentic workbench, prompt discovery is scoped by an agentic prompt service override that uses the active session root for workspace folders. See [src/vs/sessions/contrib/chat/browser/promptsService.ts](contrib/chat/browser/promptsService.ts).

## Implemented Experience

### Management Editor (Current)

- A singleton editor surfaces Agents, Skills, Instructions, Prompts, Hooks, MCP Servers, and Models.
- Prompts-based sections use a grouped list (Worktree/User/Extensions) with search, context menus, and an embedded editor.
- Embedded editor uses a full `CodeEditorWidget` and auto-commits worktree files on exit (agent session workflow).
- Creation supports manual or AI-guided flows; AI-guided creation opens a new chat with hidden system instructions.

### Tree View (Current)

- Unified sidebar tree with Type -> Storage -> File hierarchy.
- Auto-expands categories to reveal storage groups.
- Context menus provide Open and Run Prompt.
- Creation actions are centralized in the management editor.

### Additional Surfaces (Current)

- Overview view provides counts and deep-links into the management editor.
- Management list groups by storage with empty states, git status, and path copy actions.

---

## AI Feature Gating

All commands and UI must respect `ChatContextKeys.enabled`:

```typescript
All entry points (view contributions, commands) respect `ChatContextKeys.enabled`.
```

---

## References

- [Settings Editor](../src/vs/workbench/contrib/preferences/browser/settingsEditor2.ts)
- [Keybindings Editor](../src/vs/workbench/contrib/preferences/browser/keybindingsEditor.ts)
- [Webview Editor](../src/vs/workbench/contrib/webviewPanel/browser/webviewEditorInput.ts)
- [AI Customization Management (agentic)](../src/vs/sessions/contrib/aiCustomizationManagement/browser/)
- [AI Customization Overview View](../src/vs/sessions/contrib/aiCustomizationManagement/browser/aiCustomizationOverviewView.ts)
- [AI Customization Tree View (agentic)](../src/vs/sessions/contrib/aiCustomizationTreeView/browser/)
- [IPromptsService](../src/vs/workbench/contrib/chat/common/promptSyntax/service/promptsService.ts)
