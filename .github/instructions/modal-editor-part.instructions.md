---
description: Architecture documentation for VS Code modal editor part. Use when working with modal editor functionality in `src/vs/workbench/browser/parts/editor/modalEditorPart.ts`
applyTo: src/vs/workbench/**/modal*.ts
---

# Modal Editor Part Design Document

This document describes the conceptual design of the Modal Editor Part feature in VS Code. Use this as a reference when working with modal editor functionality.

## Overview

The Modal Editor Part is a new editor part concept that displays editors in a modal overlay on top of the workbench. It follows the same architectural pattern as `AUX_WINDOW_GROUP` (auxiliary window editor parts) but renders within the main window as an overlay instead of a separate window.

## Architecture

### Constants and Types

Location: `src/vs/workbench/services/editor/common/editorService.ts`

```typescript
export const MODAL_GROUP = -4;
export type MODAL_GROUP_TYPE = typeof MODAL_GROUP;
```

The `MODAL_GROUP` constant follows the pattern of other special group identifiers:
- `ACTIVE_GROUP = -1`
- `SIDE_GROUP = -2`
- `AUX_WINDOW_GROUP = -3`
- `MODAL_GROUP = -4`

### Interfaces

Location: `src/vs/workbench/services/editor/common/editorGroupsService.ts`

```typescript
export interface IModalEditorPart extends IEditorPart {
    readonly onWillClose: Event<void>;
    close(): boolean;
}
```

The `IModalEditorPart` interface extends `IEditorPart` and adds:
- `onWillClose`: Event fired before the modal closes
- `close()`: Closes the modal, merging confirming editors back to the main part

### Service Method

The `IEditorGroupsService` interface includes:

```typescript
createModalEditorPart(): Promise<IModalEditorPart>;
```

## Implementation

### ModalEditorPart Class

Location: `src/vs/workbench/browser/parts/editor/modalEditorPart.ts`

The implementation consists of two classes:

1. **`ModalEditorPart`**: Factory class that creates the modal UI
   - Creates modal backdrop with dimmed overlay
   - Creates shadow container for the modal window
   - Handles layout relative to main container dimensions
   - Registers escape key and click-outside handlers for closing

2. **`ModalEditorPartImpl`**: The actual editor part extending `EditorPart`
   - Enforces `showTabs: 'single'` and `closeEmptyGroups: true`
   - Overrides `removeGroup` to close modal when last group is removed
   - Does not persist state (modal is transient)
   - Merges editors back to main part on close

### Key Behaviors

1. **Single Tab Mode**: Modal enforces `showTabs: 'single'` for a focused experience
2. **Auto-close on Empty**: When all editors are closed, the modal closes automatically
3. **Merge on Close**: Confirming editors (dirty, etc.) are merged back to main part
4. **Escape to Close**: Pressing Escape closes the modal
5. **Click Outside to Close**: Clicking the dimmed backdrop closes the modal

### CSS Styling

Location: `src/vs/workbench/browser/parts/editor/media/modalEditorPart.css`

```css
.monaco-modal-editor-block {
    /* Full-screen overlay with flexbox centering */
}

.monaco-modal-editor-block.dimmed {
    /* Semi-transparent dark background */
}

.modal-editor-shadow {
    /* Shadow and border-radius for the modal window */
}
```

## Integration Points

### EditorParts Service

Location: `src/vs/workbench/browser/parts/editor/editorParts.ts`

The `EditorParts` class implements `createModalEditorPart()`:

```typescript
async createModalEditorPart(): Promise<IModalEditorPart> {
    const { part, disposables } = await this.instantiationService
        .createInstance(ModalEditorPart, this).create();

    this._onDidAddGroup.fire(part.activeGroup);

    disposables.add(toDisposable(() => {
        this._onDidRemoveGroup.fire(part.activeGroup);
    }));

    return part;
}
```

### Active Part Detection

Location: `src/vs/workbench/browser/parts/editor/editorParts.ts`

Override of `getPartByDocument` to detect when focus is in a modal:

```typescript
protected override getPartByDocument(document: Document): EditorPart {
    if (this._parts.size > 1) {
        const activeElement = getActiveElement();

        for (const part of this._parts) {
            if (part !== this.mainPart && part.element?.ownerDocument === document) {
                const container = part.getContainer();
                if (container && isAncestor(activeElement, container)) {
                    return part;
                }
            }
        }
    }
    return super.getPartByDocument(document);
}
```

This ensures that when focus is in the modal, it is considered the active part for editor opening via quick open, etc.

### Editor Group Finder

Location: `src/vs/workbench/services/editor/common/editorGroupFinder.ts`

The `findGroup` function handles `MODAL_GROUP`:

```typescript
else if (preferredGroup === MODAL_GROUP) {
    group = editorGroupService.createModalEditorPart()
        .then(part => part.activeGroup);
}
```

## Usage Examples

### Opening an Editor in Modal

```typescript
// Using the editor service
await editorService.openEditor(input, options, MODAL_GROUP);

// Using a flag pattern (e.g., settings)
interface IOpenSettingsOptions {
    openInModal?: boolean;
}

// Implementation checks the flag
if (options.openInModal) {
    group = await findGroup(accessor, {}, MODAL_GROUP);
}
```

### Current Integrations

1. **Settings Editor**: Opens in modal via `openInModal: true` option
2. **Keyboard Shortcuts Editor**: Opens in modal via `openInModal: true` option
3. **Extensions Editor**: Uses `openInModal: true` in `IExtensionEditorOptions`
4. **Profiles Editor**: Opens directly with `MODAL_GROUP`

## Testing

Location: `src/vs/workbench/services/editor/test/browser/modalEditorGroup.test.ts`

Test categories:
- Constants and types verification
- Creation and initial state
- Editor operations (open, split)
- Closing behavior and events
- Options enforcement
- Integration with EditorParts service

## Design Decisions

1. **Why extend EditorPart?**: Reuses all editor group functionality without duplication
2. **Why single tab mode?**: Modal is for focused, single-editor experiences
3. **Why merge on close?**: Prevents data loss for dirty editors
4. **Why same window?**: Avoids complexity of auxiliary windows while providing overlay UX
5. **Why transient state?**: Modal is meant for temporary focused editing, not persistence

## Future Considerations

- Consider adding animation for open/close transitions
- Consider size/position customization
- Consider multiple modal stacking (though likely not needed)
- Consider keyboard navigation between modal and main editor areas
