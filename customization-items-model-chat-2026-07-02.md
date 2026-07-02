# Customization Items Model Chat Notes

Date: 2026-07-02
Repo: `microsoft/vscode`
Branch: `aeschli/organic-caterpillar-433`
PR: `#324077` (`avoid global customizationItemsModel`)

## User requests captured in this chat

1. `IAICustomizationItemsModel` should not be a global singleton.
2. In a VS Code window, it should be created when a customization editor is opened and disposed when the editor is closed.
3. In the Agents/session window, it should be owned by `CustomizationsToolbarContribution`.
4. Do not inject `@IAICustomizationItemsModel` anymore for the affected UI pieces; pass the instance explicitly.
5. Do not use a global `sessionsCustomizationItemsModel`.
6. The editor-side model can be part of the editor input.

## Resulting design

### Workbench / editor path

- `AICustomizationManagementEditorInput` now owns the `AICustomizationItemsModel` instance.
- `AICustomizationManagementEditor` gets the model from the input in `setInput(...)`.
- Model-backed widgets are bound from the input-owned model instead of resolving the model through DI.
- The model is disposed when the editor input is disposed.

### Sessions window path

- `CustomizationsToolbarContribution` owns the sessions-window `AICustomizationItemsModel`.
- `CustomizationLinkViewItem` and `AICustomizationShortcutsWidget` receive the model instance explicitly.
- `SessionsView` obtains the model through the contribution helper path, not through a module-global singleton.

## Important constraints/feedback from user

- Do not keep `IAICustomizationItemsModel` as a global singleton.
- Do not keep a global `sessionsCustomizationItemsModel`.
- Prefer explicit instance passing over `@IAICustomizationItemsModel` injection for locally owned model lifetimes.
- The editor-input lifetime is the right owner for the editor-side model.

## Validation performed

- Core typecheck/watch completed cleanly.
- `npm run valid-layers-check` passed.
- Targeted tests passed:
  - `aiCustomizationListWidget.test.ts`
  - `aiCustomizationItemsModel.test.ts`

## Files touched during this work

- `src/vs/workbench/contrib/chat/browser/aiCustomization/aiCustomizationItemsModel.ts`
- `src/vs/workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditorInput.ts`
- `src/vs/workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.ts`
- `src/vs/workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagement.contribution.ts`
- `src/vs/workbench/contrib/chat/browser/aiCustomization/aiCustomizationListWidget.ts`
- `src/vs/workbench/contrib/chat/browser/aiCustomization/pluginListWidget.ts`
- `src/vs/sessions/contrib/sessions/browser/customizationsToolbar.contribution.ts`
- `src/vs/sessions/contrib/sessions/browser/customizationsItemsModel.ts`
- `src/vs/sessions/contrib/sessions/browser/views/sessionsView.ts`
- `src/vs/sessions/contrib/sessions/browser/aiCustomizationShortcutsWidget.ts`
- `src/vs/sessions/contrib/aiCustomizationTreeView/browser/aiCustomizationOverviewView.ts`
- `src/vs/sessions/contrib/aiCustomizationTreeView/browser/aiCustomizationTreeViewViews.ts`
- `src/vs/sessions/AI_CUSTOMIZATIONS.md`
