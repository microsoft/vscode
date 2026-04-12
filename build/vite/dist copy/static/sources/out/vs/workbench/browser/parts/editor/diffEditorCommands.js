/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { KeyChord } from '../../../../base/common/keyCodes.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { localize, localize2 } from '../../../../nls.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { KeybindingsRegistry } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { TextDiffEditor } from './textDiffEditor.js';
import { ActiveCompareEditorCanSwapContext, TextCompareEditorActiveContext, TextCompareEditorVisibleContext } from '../../../common/contextkeys.js';
import { DiffEditorInput } from '../../../common/editor/diffEditorInput.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
export const TOGGLE_DIFF_SIDE_BY_SIDE = 'toggle.diff.renderSideBySide';
export const GOTO_NEXT_CHANGE = 'workbench.action.compareEditor.nextChange';
export const GOTO_PREVIOUS_CHANGE = 'workbench.action.compareEditor.previousChange';
export const DIFF_FOCUS_PRIMARY_SIDE = 'workbench.action.compareEditor.focusPrimarySide';
export const DIFF_FOCUS_SECONDARY_SIDE = 'workbench.action.compareEditor.focusSecondarySide';
export const DIFF_FOCUS_OTHER_SIDE = 'workbench.action.compareEditor.focusOtherSide';
export const DIFF_OPEN_SIDE = 'workbench.action.compareEditor.openSide';
export const TOGGLE_DIFF_IGNORE_TRIM_WHITESPACE = 'toggle.diff.ignoreTrimWhitespace';
export const DIFF_SWAP_SIDES = 'workbench.action.compareEditor.swapSides';
export function registerDiffEditorCommands() {
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: DIFF_OPEN_SIDE,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
        when: EditorContextKeys.inDiffEditor,
        primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 1024 /* KeyMod.Shift */ | 45 /* KeyCode.KeyO */),
        handler: async (accessor) => {
            const editorService = accessor.get(IEditorService);
            const activeEditor = editorService.activeEditor;
            const activeTextEditorControl = editorService.activeTextEditorControl;
            if (!isDiffEditor(activeTextEditorControl) || !(activeEditor instanceof DiffEditorInput)) {
                return;
            }
            let editor;
            const originalEditor = activeTextEditorControl.getOriginalEditor();
            if (originalEditor.hasTextFocus()) {
                editor = activeEditor.original;
            }
            else {
                editor = activeEditor.modified;
            }
            return editorService.openEditor(editor);
        }
    });
    MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
        command: {
            id: DIFF_OPEN_SIDE,
            title: localize2('compare.openSide', 'Open Active Diff Side'),
        }
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: GOTO_NEXT_CHANGE,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
        when: TextCompareEditorVisibleContext,
        primary: 512 /* KeyMod.Alt */ | 63 /* KeyCode.F5 */,
        handler: (accessor, ...args) => navigateInDiffEditor(accessor, args, true)
    });
    MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
        command: {
            id: GOTO_NEXT_CHANGE,
            title: localize2('compare.nextChange', 'Go to Next Change'),
        }
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: GOTO_PREVIOUS_CHANGE,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
        when: TextCompareEditorVisibleContext,
        primary: 512 /* KeyMod.Alt */ | 1024 /* KeyMod.Shift */ | 63 /* KeyCode.F5 */,
        handler: (accessor, ...args) => navigateInDiffEditor(accessor, args, false)
    });
    MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
        command: {
            id: GOTO_PREVIOUS_CHANGE,
            title: localize2('compare.previousChange', 'Go to Previous Change'),
        }
    });
    function getActiveTextDiffEditor(accessor, args) {
        const editorService = accessor.get(IEditorService);
        const resource = args.length > 0 && args[0] instanceof URI ? args[0] : undefined;
        for (const editor of [editorService.activeEditorPane, ...editorService.visibleEditorPanes]) {
            if (editor instanceof TextDiffEditor && (!resource || editor.input instanceof DiffEditorInput && isEqual(editor.input.primary.resource, resource))) {
                return editor;
            }
        }
        return undefined;
    }
    function navigateInDiffEditor(accessor, args, next) {
        const activeTextDiffEditor = getActiveTextDiffEditor(accessor, args);
        if (activeTextDiffEditor) {
            activeTextDiffEditor.getControl()?.goToDiff(next ? 'next' : 'previous');
        }
    }
    let FocusTextDiffEditorMode;
    (function (FocusTextDiffEditorMode) {
        FocusTextDiffEditorMode[FocusTextDiffEditorMode["Original"] = 0] = "Original";
        FocusTextDiffEditorMode[FocusTextDiffEditorMode["Modified"] = 1] = "Modified";
        FocusTextDiffEditorMode[FocusTextDiffEditorMode["Toggle"] = 2] = "Toggle";
    })(FocusTextDiffEditorMode || (FocusTextDiffEditorMode = {}));
    function focusInDiffEditor(accessor, args, mode) {
        const activeTextDiffEditor = getActiveTextDiffEditor(accessor, args);
        if (activeTextDiffEditor) {
            switch (mode) {
                case FocusTextDiffEditorMode.Original:
                    activeTextDiffEditor.getControl()?.getOriginalEditor().focus();
                    break;
                case FocusTextDiffEditorMode.Modified:
                    activeTextDiffEditor.getControl()?.getModifiedEditor().focus();
                    break;
                case FocusTextDiffEditorMode.Toggle:
                    if (activeTextDiffEditor.getControl()?.getModifiedEditor().hasWidgetFocus()) {
                        return focusInDiffEditor(accessor, args, FocusTextDiffEditorMode.Original);
                    }
                    else {
                        return focusInDiffEditor(accessor, args, FocusTextDiffEditorMode.Modified);
                    }
            }
        }
    }
    function toggleDiffSideBySide(accessor, args) {
        const configService = accessor.get(ITextResourceConfigurationService);
        const activeTextDiffEditor = getActiveTextDiffEditor(accessor, args);
        const m = activeTextDiffEditor?.getControl()?.getModifiedEditor()?.getModel();
        if (!m) {
            return;
        }
        const key = 'diffEditor.renderSideBySide';
        const val = configService.getValue(m.uri, key);
        configService.updateValue(m.uri, key, !val);
    }
    function toggleDiffIgnoreTrimWhitespace(accessor, args) {
        const configService = accessor.get(ITextResourceConfigurationService);
        const activeTextDiffEditor = getActiveTextDiffEditor(accessor, args);
        const m = activeTextDiffEditor?.getControl()?.getModifiedEditor()?.getModel();
        if (!m) {
            return;
        }
        const key = 'diffEditor.ignoreTrimWhitespace';
        const val = configService.getValue(m.uri, key);
        configService.updateValue(m.uri, key, !val);
    }
    async function swapDiffSides(accessor, args) {
        const editorService = accessor.get(IEditorService);
        const diffEditor = getActiveTextDiffEditor(accessor, args);
        const activeGroup = diffEditor?.group;
        const diffInput = diffEditor?.input;
        if (!diffEditor || typeof activeGroup === 'undefined' || !(diffInput instanceof DiffEditorInput) || !diffInput.modified.resource) {
            return;
        }
        const untypedDiffInput = diffInput.toUntyped({ preserveViewState: activeGroup.id, preserveResource: true });
        if (!untypedDiffInput) {
            return;
        }
        // Since we are about to replace the diff editor, make
        // sure to first open the modified side if it is not
        // yet opened. This ensures that the swapping is not
        // bringing up a confirmation dialog to save.
        if (diffInput.modified.isModified() && editorService.findEditors({ resource: diffInput.modified.resource, typeId: diffInput.modified.typeId, editorId: diffInput.modified.editorId }).length === 0) {
            const editorToOpen = { ...untypedDiffInput.modified };
            if (!editorToOpen.options) {
                editorToOpen.options = {};
            }
            editorToOpen.options.pinned = true;
            editorToOpen.options.inactive = true;
            await editorService.openEditor(editorToOpen, activeGroup);
        }
        // Replace the input with the swapped variant
        await editorService.replaceEditors([
            {
                editor: diffInput,
                replacement: {
                    ...untypedDiffInput,
                    original: untypedDiffInput.modified,
                    modified: untypedDiffInput.original,
                    options: {
                        ...untypedDiffInput.options,
                        pinned: true
                    }
                }
            }
        ], activeGroup);
    }
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: TOGGLE_DIFF_SIDE_BY_SIDE,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
        when: undefined,
        primary: undefined,
        handler: (accessor, ...args) => toggleDiffSideBySide(accessor, args)
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: DIFF_FOCUS_PRIMARY_SIDE,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
        when: undefined,
        primary: undefined,
        handler: (accessor, ...args) => focusInDiffEditor(accessor, args, FocusTextDiffEditorMode.Modified)
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: DIFF_FOCUS_SECONDARY_SIDE,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
        when: undefined,
        primary: undefined,
        handler: (accessor, ...args) => focusInDiffEditor(accessor, args, FocusTextDiffEditorMode.Original)
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: DIFF_FOCUS_OTHER_SIDE,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
        when: undefined,
        primary: undefined,
        handler: (accessor, ...args) => focusInDiffEditor(accessor, args, FocusTextDiffEditorMode.Toggle)
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: TOGGLE_DIFF_IGNORE_TRIM_WHITESPACE,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
        when: undefined,
        primary: undefined,
        handler: (accessor, ...args) => toggleDiffIgnoreTrimWhitespace(accessor, args)
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: DIFF_SWAP_SIDES,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
        when: undefined,
        primary: undefined,
        handler: (accessor, ...args) => swapDiffSides(accessor, args)
    });
    MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
        command: {
            id: TOGGLE_DIFF_SIDE_BY_SIDE,
            title: localize2('toggleInlineView', "Toggle Inline View"),
            category: localize('compare', "Compare")
        },
        when: TextCompareEditorActiveContext
    });
    MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
        command: {
            id: DIFF_SWAP_SIDES,
            title: localize2('swapDiffSides', "Swap Left and Right Editor Side"),
            category: localize('compare', "Compare")
        },
        when: ContextKeyExpr.and(TextCompareEditorActiveContext, ActiveCompareEditorCanSwapContext)
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlmZkVkaXRvckNvbW1hbmRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2RpZmZFZGl0b3JDb21tYW5kcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFtQixNQUFNLHFDQUFxQyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMvRCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLGlDQUFpQyxFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFDcEgsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUN6RCxPQUFPLEVBQUUsTUFBTSxFQUFFLFlBQVksRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUV0RixPQUFPLEVBQUUsbUJBQW1CLEVBQW9CLE1BQU0sK0RBQStELENBQUM7QUFDdEgsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQ3JELE9BQU8sRUFBRSxpQ0FBaUMsRUFBRSw4QkFBOEIsRUFBRSwrQkFBK0IsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3BKLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFFbEYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDbkYsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRzNFLE1BQU0sQ0FBQyxNQUFNLHdCQUF3QixHQUFHLDhCQUE4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