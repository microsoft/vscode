---
name: agent-sessions-layout
description: Agent Sessions workbench layout — covers the fixed layout structure, grid configuration, part visibility, editor modal, titlebar, sidebar footer, and implementation requirements. Use when implementing features or fixing issues in the Agent Sessions workbench layout.
---

When working on the Agent Sessions workbench layout, always follow these guidelines:

## 1. Read the Specification First

The authoritative specification for the Agent Sessions layout lives at:

**`src/vs/sessions/LAYOUT.md`**

Before making any changes to the layout code, read and understand the current spec. It defines:

- The fixed layout structure (grid tree, part positions, default sizes)
- Which parts are included/excluded and their visibility defaults
- Titlebar configuration and custom menu IDs
- Editor modal overlay behavior and sizing
- Part visibility API and events
- Agent session part classes and storage keys
- Workbench contributions and lifecycle
- CSS classes and file structure

## 2. Keep the Spec in Sync

If you modify the layout implementation, you **must** update `LAYOUT.md` to reflect those changes. The spec should always match the code. This includes:

- Adding/removing parts or changing their positions
- Changing default visibility or sizing
- Adding new actions, menus, or contributions
- Modifying the grid structure
- Changing titlebar configuration
- Adding new CSS classes or file structure changes

Update the **Revision History** table at the bottom of `LAYOUT.md` with a dated entry describing what changed.

## 3. Implementation Principles

When proposing or implementing changes, follow these rules from the spec:

1. **Maintain fixed positions** — Do not add settings-based position customization
2. **Panel must span the right section width** — The grid structure places the panel below Chat Bar and Auxiliary Bar only
3. **Sidebar spans full height** — Sidebar is in the main content branch, spanning from top to bottom
4. **New parts go in the right section** — Any new parts should be added to the horizontal branch alongside Chat Bar and Auxiliary Bar
5. **Preserve no-op methods** — Unsupported features (zen mode, centered layout, etc.) should remain as no-ops, not throw errors
6. **Handle pane composite lifecycle** — When hiding/showing parts, manage the associated pane composites
7. **Use agent session parts** — New part functionality goes in the agent session part classes (`SidebarPart`, `AuxiliaryBarPart`, `PanelPart`, `ChatBarPart`), not the standard workbench parts
8. **Use separate storage keys** — Agent session parts use their own storage keys (prefixed with `workbench.agentsession.` or `workbench.chatbar.`) to avoid conflicts with regular workbench state
9. **Use agent session menu IDs** — Actions should use `Menus.*` menu IDs (from `sessions/browser/menus.ts`), not shared `MenuId.*` constants

## 4. Key Files

| File | Purpose |
|------|---------|
| `sessions/LAYOUT.md` | Authoritative specification |
| `sessions/browser/workbench.ts` | Main layout implementation (`Workbench` class) |
| `sessions/browser/menus.ts` | Agent sessions menu IDs (`Menus` export) |
| `sessions/browser/layoutActions.ts` | Layout actions (toggle sidebar, panel, secondary sidebar) |
| `sessions/browser/paneCompositePartService.ts` | `AgenticPaneCompositePartService` |
| `sessions/browser/style.css` | Layout-specific styles |
| `sessions/browser/parts/` | Agent session part implementations |
| `sessions/browser/parts/titlebarPart.ts` | Titlebar part, MainTitlebarPart, AuxiliaryTitlebarPart, TitleService |
| `sessions/browser/parts/editorModal.ts` | Editor modal overlay |
| `sessions/browser/parts/sidebarPart.ts` | Sidebar part (with footer) |
| `sessions/browser/parts/chatBarPart.ts` | Chat Bar part |
| `sessions/browser/widget/` | Agent sessions chat widget |
| `sessions/contrib/sessions/browser/sessionsTitleBarWidget.ts` | Title bar widget and session picker |
| `sessions/contrib/chat/browser/runScriptAction.ts` | Run script contribution |
| `sessions/contrib/accountMenu/browser/account.contribution.ts` | Account widget for sidebar footer |

## 5. Testing Changes

After modifying layout code:

1. Verify the build compiles without errors via the `VS Code - Build` task
2. Ensure the grid structure matches the spec's visual representation
3. Confirm part visibility toggling works correctly (show/hide/maximize)
4. Test the editor modal opens/closes properly on editor events
5. Verify sidebar footer renders with account widget
