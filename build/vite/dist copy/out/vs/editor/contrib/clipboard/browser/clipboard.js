/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as browser from '../../../../base/browser/browser.js';
import { getActiveDocument, getActiveWindow } from '../../../../base/browser/dom.js';
import * as platform from '../../../../base/common/platform.js';
import * as nls from '../../../../nls.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { CopyOptions, generateDataToCopyAndStoreInMemory, InMemoryClipboardMetadataManager } from '../../../browser/controller/editContext/clipboardUtils.js';
import { NativeEditContextRegistry } from '../../../browser/controller/editContext/native/nativeEditContextRegistry.js';
import { EditorAction, MultiCommand, registerEditorAction } from '../../../browser/editorExtensions.js';
import { ICodeEditorService } from '../../../browser/services/codeEditorService.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { CopyPasteController } from '../../dropOrPasteInto/browser/copyPasteController.js';
const CLIPBOARD_CONTEXT_MENU_GROUP = '9_cutcopypaste';
const supportsCut = (platform.isNative || document.queryCommandSupported('cut'));
const supportsCopy = (platform.isNative || document.queryCommandSupported('copy'));
// Firefox only supports navigator.clipboard.readText() in browser extensions.
// See https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/readText#Browser_compatibility
// When loading over http, navigator.clipboard can be undefined. See https://github.com/microsoft/monaco-editor/issues/2313
const supportsPaste = (typeof navigator.clipboard === 'undefined' || browser.isFirefox) ? document.queryCommandSupported('paste') : true;
function registerCommand(command) {
    command.register();
    return command;
}
export const CutAction = supportsCut ? registerCommand(new MultiCommand({
    id: 'editor.action.clipboardCutAction',
    precondition: undefined,
    kbOpts: (
    // Do not bind cut keybindings in the browser,
    // since browsers do that for us and it avoids security prompts
    platform.isNative ? {
        primary: 2048 /* KeyMod.CtrlCmd */ | 54 /* KeyCode.KeyX */,
        win: { primary: 2048 /* KeyMod.CtrlCmd */ | 54 /* KeyCode.KeyX */, secondary: [1024 /* KeyMod.Shift */ | 20 /* KeyCode.Delete */] },
        weight: 100 /* KeybindingWeight.EditorContrib */
    } : undefined),
    menuOpts: [{
            menuId: MenuId.MenubarEditMenu,
            group: '2_ccp',
            title: nls.localize({ key: 'miCut', comment: ['&& denotes a mnemonic'] }, "Cu&&t"),
            order: 1
        }, {
            menuId: MenuId.EditorContext,
            group: CLIPBOARD_CONTEXT_MENU_GROUP,
            title: nls.localize('actions.clipboard.cutLabel', "Cut"),
            when: EditorContextKeys.writable,
            order: 1,
        }, {
            menuId: MenuId.CommandPalette,
            group: '',
            title: nls.localize('actions.clipboard.cutLabel', "Cut"),
            order: 1
        }, {
            menuId: MenuId.SimpleEditorContext,
            group: CLIPBOARD_CONTEXT_MENU_GROUP,
            title: nls.localize('actions.clipboard.cutLabel', "Cut"),
            when: EditorContextKeys.writable,
            order: 1,
        }]
})) : undefined;
export const CopyAction = supportsCopy ? registerCommand(new MultiCommand({
    id: 'editor.action.clipboardCopyAction',
    precondition: undefined,
    kbOpts: (
    // Do not bind copy keybindings in the browser,
    // since browsers do that for us and it avoids security prompts
    platform.isNative ? {
        primary: 2048 /* KeyMod.CtrlCmd */ | 33 /* KeyCode.KeyC */,
        win: { primary: 2048 /* KeyMod.CtrlCmd */ | 33 /* KeyCode.KeyC */, secondary: [2048 /* KeyMod.CtrlCmd */ | 19 /* KeyCode.Insert */] },
        weight: 100 /* KeybindingWeight.EditorContrib */
    } : undefined),
    menuOpts: [{
            menuId: MenuId.MenubarEditMenu,
            group: '2_ccp',
            title: nls.localize({ key: 'miCopy', comment: ['&& denotes a mnemonic'] }, "&&Copy"),
            order: 2
        }, {
            menuId: MenuId.EditorContext,
            group: CLIPBOARD_CONTEXT_MENU_GROUP,
            title: nls.localize('actions.clipboard.copyLabel', "Copy"),
            order: 2,
        }, {
            menuId: MenuId.CommandPalette,
            group: '',
            title: nls.localize('actions.clipboard.copyLabel', "Copy"),
            order: 1
        }, {
            menuId: MenuId.SimpleEditorContext,
            group: CLIPBOARD_CONTEXT_MENU_GROUP,
            title: nls.localize('actions.clipboard.copyLabel', "Copy"),
            order: 2,
        }]
})) : undefined;
MenuRegistry.appendMenuItem(MenuId.MenubarEditMenu, { submenu: MenuId.MenubarCopy, title: nls.localize2('copy as', "Copy As"), group: '2_ccp', order: 3 });
MenuRegistry.appendMenuItem(MenuId.EditorContext, { submenu: MenuId.EditorContextCopy, title: nls.localize2('copy as', "Copy As"), group: CLIPBOARD_CONTEXT_MENU_GROUP, order: 3 });
MenuRegistry.appendMenuItem(MenuId.EditorContext, { submenu: MenuId.EditorContextShare, title: nls.localize2('share', "Share"), group: '11_share', order: -1, when: ContextKeyExpr.and(ContextKeyExpr.notEquals('resourceScheme', 'output'), EditorContextKeys.editorTextFocus) });
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, { submenu: MenuId.ExplorerContextShare, title: nls.localize2('share', "Share"), group: '11_share', order: -1 });
export const PasteAction = supportsPaste ? registerCommand(new MultiCommand({
    id: 'editor.action.clipboardPasteAction',
    precondition: undefined,
    kbOpts: (
    // Do not bind paste keybindings in the browser,
    // since browsers do that for us and it avoids security prompts
    platform.isNative ? {
        primary: 2048 /* KeyMod.CtrlCmd */ | 52 /* KeyCode.KeyV */,
        win: { primary: 2048 /* KeyMod.CtrlCmd */ | 52 /* KeyCode.KeyV */, secondary: [1024 /* KeyMod.Shift */ | 19 /* KeyCode.Insert */] },
        linux: { primary: 2048 /* KeyMod.CtrlCmd */ | 52 /* KeyCode.KeyV */, secondary: [1024 /* KeyMod.Shift */ | 19 /* KeyCode.Insert */] },
        weight: 100 /* KeybindingWeight.EditorContrib */
    } : undefined),
    menuOpts: [{
            menuId: MenuId.MenubarEditMenu,
            group: '2_ccp',
            title: nls.localize({ key: 'miPaste', comment: ['&& denotes a mnemonic'] }, "&&Paste"),
            order: 4
        }, {
            menuId: MenuId.EditorContext,
            group: CLIPBOARD_CONTEXT_MENU_GROUP,
            title: nls.localize('actions.clipboard.pasteLabel', "Paste"),
            when: EditorContextKeys.writable,
            order: 4,
        }, {
            menuId: MenuId.CommandPalette,
            group: '',
            title: nls.localize('actions.clipboard.pasteLabel', "Paste"),
            order: 1
        }, {
            menuId: MenuId.SimpleEditorContext,
            group: CLIPBOARD_CONTEXT_MENU_GROUP,
            title: nls.localize('actions.clipboard.pasteLabel', "Paste"),
            when: EditorContextKeys.writable,
            order: 4,
        }]
})) : undefined;
class ExecCommandCopyWithSyntaxHighlightingAction extends EditorAction {
    constructor() {
        super({
            id: 'editor.action.clipboardCopyWithSyntaxHighlightingAction',
            label: nls.localize2('actions.clipboard.copyWithSyntaxHighlightingLabel', "Copy with Syntax Highlighting"),
            precondition: undefined,
            kbOpts: {
                kbExpr: EditorContextKeys.textInputFocus,
                primary: 0,
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    run(accessor, editor) {
        const logService = accessor.get(ILogService);
        const clipboardService = accessor.get(IClipboardService);
        logService.trace('ExecCommandCopyWithSyntaxHighlightingAction#run');
        if (!editor.hasModel()) {
            return;
        }
        const emptySelectionClipboard = editor.getOption(45 /* EditorOption.emptySelectionClipboard */);
        if (!emptySelectionClipboard && editor.getSelection().isEmpty()) {
            return;
        }
        CopyOptions.forceCopyWithSyntaxHighlighting = true;
        editor.focus();
        logService.trace('ExecCommandCopyWithSyntaxHighlightingAction (before execCommand copy)');
        executeClipboardCopyWithWorkaround(editor, clipboardService);
        logService.trace('ExecCommandCopyWithSyntaxHighlightingAction (after execCommand copy)');
        CopyOptions.forceCopyWithSyntaxHighlighting = false;
    }
}
function executeClipboardCopyWithWorkaround(editor, clipboardService) {
    // !!!!!
    // This is a workaround for what we think is an Electron bug where
    // execCommand('copy') does not always work (it does not fire a clipboard event)
    // We will use this as a signal that we have executed a copy command
    // !!!!!
    CopyOptions.electronBugWorkaroundCopyEventHasFired = false;
    editor.getContainerDomNode().ownerDocument.execCommand('copy');
    if (platform.isNative && CopyOptions.electronBugWorkaroundCopyEventHasFired === false) {
        // We have encountered the Electron bug!
        // As a workaround, we will write (only the plaintext data) to the clipboard in a different way
        // We will use the clipboard service (which in the native case will go to electron's clipboard API)
        const { dataToCopy } = generateDataToCopyAndStoreInMemory(editor._getViewModel(), undefined, browser.isFirefox);
        clipboardService.writeText(dataToCopy.text);
    }
}
function registerExecCommandImpl(target, browserCommand) {
    if (!target) {
        return;
    }
    // 1. handle case when focus is in editor.
    target.addImplementation(10000, 'code-editor', (accessor, args) => {
        const logService = accessor.get(ILogService);
        const clipboardService = accessor.get(IClipboardService);
        logService.trace('registerExecCommandImpl (addImplementation code-editor for : ', browserCommand, ')');
        // Only if editor text focus (i.e. not if editor has widget focus).
        const focusedEditor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
        if (focusedEditor && focusedEditor.hasTextFocus() && focusedEditor.hasModel()) {
            // Do not execute if there is no selection and empty selection clipboard is off
            const emptySelectionClipboard = focusedEditor.getOption(45 /* EditorOption.emptySelectionClipboard */);
            const selection = focusedEditor.getSelection();
            if (selection && selection.isEmpty() && !emptySelectionClipboard) {
                return true;
            }
            // TODO this is very ugly. The entire copy/paste/cut system needs a complete refactoring.
            if (focusedEditor.getOption(170 /* EditorOption.effectiveEditContext */) && browserCommand === 'cut') {
                logCopyCommand(focusedEditor);
                // execCommand(copy) works for edit context, but not execCommand(cut).
                logService.trace('registerExecCommandImpl (before execCommand copy)');
                executeClipboardCopyWithWorkaround(focusedEditor, clipboardService);
                focusedEditor.trigger(undefined, "cut" /* Handler.Cut */, undefined);
                logService.trace('registerExecCommandImpl (after execCommand copy)');
            }
            else {
                logCopyCommand(focusedEditor);
                logService.trace('registerExecCommandImpl (before execCommand ' + browserCommand + ')');
                if (browserCommand === 'copy') {
                    executeClipboardCopyWithWorkaround(focusedEditor, clipboardService);
                }
                else {
                    focusedEditor.getContainerDomNode().ownerDocument.execCommand(browserCommand);
                }
                logService.trace('registerExecCommandImpl (after execCommand ' + browserCommand + ')');
            }
            return true;
        }
        return false;
    });
    // 2. (default) handle case when focus is somewhere else.
    target.addImplementation(0, 'generic-dom', (accessor, args) => {
        const logService = accessor.get(ILogService);
        logService.trace('registerExecCommandImpl (addImplementation generic-dom for : ', browserCommand, ')');
        logService.trace('registerExecCommandImpl (before execCommand ' + browserCommand + ')');
        getActiveDocument().execCommand(browserCommand);
        logService.trace('registerExecCommandImpl (after execCommand ' + browserCommand + ')');
        return true;
    });
}
function logCopyCommand(editor) {
    const editContextEnabled = editor.getOption(170 /* EditorOption.effectiveEditContext */);
    if (editContextEnabled) {
        const nativeEditContext = NativeEditContextRegistry.get(editor.getId());
        if (nativeEditContext) {
            nativeEditContext.handleWillCopy();
        }
    }
}
registerExecCommandImpl(CutAction, 'cut');
registerExecCommandImpl(CopyAction, 'copy');
if (PasteAction) {
    // 1. Paste: handle case when focus is in editor.
    PasteAction.addImplementation(10000, 'code-editor', (accessor, args) => {
        const logService = accessor.get(ILogService);
        logService.trace('registerExecCommandImpl (addImplementation code-editor for : paste)');
        const codeEditorService = accessor.get(ICodeEditorService);
        const clipboardService = accessor.get(IClipboardService);
        // Only if editor text focus (i.e. not if editor has widget focus).
        const focusedEditor = codeEditorService.getFocusedCodeEditor();
        if (focusedEditor && focusedEditor.hasModel() && focusedEditor.hasTextFocus()) {
            // execCommand(paste) does not work with edit context
            const editContextEnabled = focusedEditor.getOption(170 /* EditorOption.effectiveEditContext */);
            if (editContextEnabled) {
                const nativeEditContext = NativeEditContextRegistry.get(focusedEditor.getId());
                if (nativeEditContext) {
                    nativeEditContext.handleWillPaste();
                }
            }
            logService.trace('registerExecCommandImpl (before triggerPaste)');
            const triggerPaste = clipboardService.triggerPaste(getActiveWindow().vscodeWindowId);
            if (triggerPaste) {
                logService.trace('registerExecCommandImpl (triggerPaste defined)');
                return triggerPaste.then(async () => {
                    logService.trace('registerExecCommandImpl (after triggerPaste)');
                    return CopyPasteController.get(focusedEditor)?.finishedPaste() ?? Promise.resolve();
                });
            }
            else {
                logService.trace('registerExecCommandImpl (triggerPaste undefined)');
            }
            if (platform.isWeb) {
                logService.trace('registerExecCommandImpl (Paste handling on web)');
                // Use the clipboard service if document.execCommand('paste') was not successful
                return (async () => {
                    const clipboardText = await clipboardService.readText();
                    if (clipboardText !== '') {
                        const metadata = InMemoryClipboardMetadataManager.INSTANCE.get(clipboardText);
                        let pasteOnNewLine = false;
                        let multicursorText = null;
                        let mode = null;
                        if (metadata) {
                            pasteOnNewLine = (focusedEditor.getOption(45 /* EditorOption.emptySelectionClipboard */) && !!metadata.isFromEmptySelection);
                            multicursorText = (typeof metadata.multicursorText !== 'undefined' ? metadata.multicursorText : null);
                            mode = metadata.mode;
                        }
                        logService.trace('registerExecCommandImpl (clipboardText.length : ', clipboardText.length, ' id : ', metadata?.id, ')');
                        focusedEditor.trigger('keyboard', "paste" /* Handler.Paste */, {
                            text: clipboardText,
                            pasteOnNewLine,
                            multicursorText,
                            mode
                        });
                    }
                })();
            }
            return true;
        }
        return false;
    });
    // 2. Paste: (default) handle case when focus is somewhere else.
    PasteAction.addImplementation(0, 'generic-dom', (accessor, args) => {
        const logService = accessor.get(ILogService);
        logService.trace('registerExecCommandImpl (addImplementation generic-dom for : paste)');
        const triggerPaste = accessor.get(IClipboardService).triggerPaste(getActiveWindow().vscodeWindowId);
        return triggerPaste ?? false;
    });
}
if (supportsCopy) {
    registerEditorAction(ExecCommandCopyWithSyntaxHighlightingAction);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2xpcGJvYXJkLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvY2xpcGJvYXJkL2Jyb3dzZXIvY2xpcGJvYXJkLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxPQUFPLE1BQU0scUNBQXFDLENBQUM7QUFDL0QsT0FBTyxFQUFFLGlCQUFpQixFQUFFLGVBQWUsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRXJGLE9BQU8sS0FBSyxRQUFRLE1BQU0scUNBQXFDLENBQUM7QUFDaEUsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUsTUFBTSxFQUFFLFlBQVksRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUd0RixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDckUsT0FBTyxFQUFFLFdBQVcsRUFBRSxrQ0FBa0MsRUFBRSxnQ0FBZ0MsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQzlKLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLDZFQUE2RSxDQUFDO0FBRXhILE9BQU8sRUFBVyxZQUFZLEVBQUUsWUFBWSxFQUFFLG9CQUFvQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDakgsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFHcEYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDekUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFFM0YsTUFBTSw0QkFBNEIsR0FBRyxnQkFBZ0IsQ0FBQztBQUV0RCxNQUFN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