---
name: chat-customizations-editor
description: Use when working on the Chat Customizations editor — the management UI for agents, skills, instructions, hooks, prompts, MCP servers, and plugins.
---

# Chat Customizations Editor

Split-view management pane for AI customization items across workspace, user, extension, and plugin storage. Supports harness-based filtering (Local, Copilot CLI, Claude).

## Spec

**`src/vs/sessions/AI_CUSTOMIZATIONS.md`** — always read before making changes, always update after.

## Key Folders

| Folder | What |
|--------|------|
| `src/vs/workbench/contrib/chat/common/` | `ICustomizationHarnessService`, `ISectionOverride`, `IStorageSourceFilter` — shared interfaces and filter helpers |
| `src/vs/workbench/contrib/chat/browser/aiCustomization/` | Management editor, list widgets (prompts, MCP, plugins), harness service registration |
| `src/vs/sessions/contrib/chat/browser/` | Sessions-window overrides (harness service, workspace service) |
| `src/vs/sessions/contrib/sessions/browser/` | Sessions tree view counts and toolbar |

When changing harness descriptor interfaces or factory functions, verify both core and sessions registrations compile.

## Key Interfaces

- **`IHarnessDescriptor`** — drives all UI behavior declaratively (hidden sections, button overrides, file filters, agent gating). See spec for full field reference.
- **`ISectionOverride`** — per-section button customization (command invocation, root file creation, type labels, file extensions).
- **`IStorageSourceFilter`** — controls which storage sources and user roots are visible per harness/type.

Principle: the UI widgets read everything from the descriptor — no harness-specific conditionals in widget code.

## Testing

Component explorer fixtures (see `component-fixtures` skill): `aiCustomizationListWidget.fixture.ts`, `aiCustomizationManagementEditor.fixture.ts` under `src/vs/workbench/test/browser/componentFixtures/`.

```bash
./scripts/test.sh --grep "applyStorageSourceFilter|customizationCounts"
npm run compile-check-ts-native && npm run valid-layers-check
```

See the `sessions` skill for sessions-window specific guidance.
