/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import './media/notebookFind.css';
import { Schemas } from '../../../../../../base/common/network.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { ICodeEditorService } from '../../../../../../editor/browser/services/codeEditorService.js';
import { EditorContextKeys } from '../../../../../../editor/common/editorContextKeys.js';
import { getSelectionSearchString, NextMatchFindAction, PreviousMatchFindAction, StartFindAction, StartFindReplaceAction } from '../../../../../../editor/contrib/find/browser/findController.js';
import { localize2 } from '../../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { NotebookFindContrib } from './notebookFindWidget.js';
import { NotebookMultiCellAction } from '../../controller/coreActions.js';
import { getNotebookEditorFromEditorPane } from '../../notebookBrowser.js';
import { registerNotebookContribution } from '../../notebookEditorExtensions.js';
import { CellUri, NotebookFindScopeType } from '../../../common/notebookCommon.js';
import { INTERACTIVE_WINDOW_IS_ACTIVE_EDITOR, NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_IS_ACTIVE_EDITOR } from '../../../common/notebookContextKeys.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { CONTEXT_FIND_WIDGET_VISIBLE } from '../../../../../../editor/contrib/find/browser/findModel.js';
registerNotebookContribution(NotebookFindContrib.id, NotebookFindContrib);
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'notebook.hideFind',
            title: localize2('notebookActions.hideFind', 'Hide Find in Notebook'),
            keybinding: {
                when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, CONTEXT_FIND_WIDGET_VISIBLE),
                primary: 9 /* KeyCode.Escape */,
                weight: 100 /* KeybindingWeight.EditorContrib */ + 5
            }
        });
    }
    async run(accessor) {
        const editorService = accessor.get(IEditorService);
        const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
        if (!editor) {
            return;
        }
        const controller = editor.getContribution(NotebookFindContrib.id);
        controller.hide();
        editor.focus();
    }
});
registerAction2(class extends NotebookMultiCellAction {
    constructor() {
        super({
            id: 'notebook.find',
            title: localize2('notebookActions.findInNotebook', 'Find in Notebook'),
            keybinding: {
                when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.or(NOTEBOOK_IS_ACTIVE_EDITOR, INTERACTIVE_WINDOW_IS_ACTIVE_EDITOR), EditorContextKeys.focus.toNegated()),
                primary: 36 /* KeyCode.KeyF */ | 2048 /* KeyMod.CtrlCmd */,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            }
        });
    }
    async runWithContext(accessor, context) {
        const editorService = accessor.get(IEditorService);
        const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
        if (!editor) {
            return;
        }
        const controller = editor.getContribution(NotebookFindContrib.id);
        controller.show(undefined, { findScope: { findScopeType: NotebookFindScopeType.None } });
    }
});
function notebookContainsTextModel(uri, textModel) {
    if (textModel.uri.scheme === Schemas.vscodeNotebookCell) {
        const cellUri = CellUri.parse(textModel.uri);
        if (cellUri && isEqual(cellUri.notebook, uri)) {
            return true;
        }
    }
    return false;
}
function getSearchStringOptions(editor, opts) {
    // Get the search string result, following the same logic in _start function in 'vs/editor/contrib/find/browser/findController'
    if (opts.seedSearchStringFromSelection === 'single') {
        const selectionSearchString = getSelectionSearchString(editor, opts.seedSearchStringFromSelection, opts.seedSearchStringFromNonEmptySelection);
        if (selectionSearchString) {
            return {
                searchString: selectionSearchString,
                selection: editor.getSelection()
            };
        }
    }
    else if (opts.seedSearchStringFromSelection === 'multiple' && !opts.updateSearchScope) {
        const selectionSearchString = getSelectionSearchString(editor, opts.seedSearchStringFromSelection);
        if (selectionSearchString) {
            return {
                searchString: selectionSearchString,
                selection: editor.getSelection()
            };
        }
    }
    return undefined;
}
function isNotebookEditorValidForSearch(accessor, editor, codeEditor) {
    if (!editor) {
        return false;
    }
    if (!codeEditor.hasModel()) {
        return false;
    }
    if (!editor.hasEditorFocus() && !editor.hasWebviewFocus()) {
        const codeEditorService = accessor.get(ICodeEditorService);
        // check if the active pane contains the active text editor
        const textEditor = codeEditorService.getFocusedCodeEditor() || codeEditorService.getActiveCodeEditor();
        if (editor.hasModel() && textEditor && textEditor.hasModel() && notebookContainsTextModel(editor.textModel.uri, textEditor.getModel())) {
            // the active text editor is in notebook editor
            return true;
        }
        else {
            return false;
        }
    }
    return true;
}
function openFindWidget(controller, editor, codeEditor, focusWidget = true) {
    if (!editor || !codeEditor || !controller) {
        return false;
    }
    if (!codeEditor.hasModel()) {
        return false;
    }
    const searchStringOptions = getSearchStringOptions(codeEditor, {
        forceRevealReplace: false,
        seedSearchStringFromSelection: codeEditor.getOption(50 /* EditorOption.find */).seedSearchStringFromSelection !== 'never' ? 'single' : 'none',
        seedSearchStringFromNonEmptySelection: codeEditor.getOption(50 /* EditorOption.find */).seedSearchStringFromSelection === 'selection',
        seedSearchStringFromGlobalClipboard: codeEditor.getOption(50 /* EditorOption.find */).globalFindClipboard,
        shouldFocus: 1 /* FindStartFocusAction.FocusFindInput */,
        shouldAnimate: true,
        updateSearchScope: false,
        loop: codeEditor.getOption(50 /* EditorOption.find */).loop
    });
    let options = undefined;
    const uri = codeEditor.getModel().uri;
    const data = CellUri.parse(uri);
    if (searchStringOptions?.selection && data) {
        const cell = editor.getCellByHandle(data.handle);
        if (cell) {
            options = {
                searchStringSeededFrom: { cell, range: searchStringOptions.selection },
                focus: focusWidget
            };
        }
    }
    else {
        options = { focus: focusWidget };
    }
    controller.show(searchStringOptions?.searchString, options);
    return true;
}
function findWidgetAction(accessor, codeEditor, next) {
    const editorService = accessor.get(IEditorService);
    const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
    if (!isNotebookEditorValidForSearch(accessor, editor, codeEditor)) {
        return false;
    }
    const controller = editor?.getContribution(NotebookFindContrib.id);
    if (!controller) {
        return false;
    }
    // Check if find widget is already visible
    if (controller.isVisible()) {
        // Find widget is open, navigate
        next ? controller.findNext() : controller.findPrevious();
        return true;
    }
    else {
        // Find widget is not open, open it without focusing the widget (keep focus in editor)
        return openFindWidget(controller, editor, codeEditor, false);
    }
}
async function runFind(accessor, next) {
    const editorService = accessor.get(IEditorService);
    const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
    if (!editor) {
        return;
    }
    const controller = editor.getContribution(NotebookFindContrib.id);
    if (controller && controller.isVisible()) {
        next ? controller.findNext() : controller.findPrevious();
    }
}
StartFindAction.addImplementation(100, (accessor, codeEditor, args) => {
    const editorService = accessor.get(IEditorService);
    const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
    if (!isNotebookEditorValidForSearch(accessor, editor, codeEditor)) {
        return false;
    }
    const controller = editor?.getContribution(NotebookFindContrib.id);
    return openFindWidget(controller, editor, codeEditor, true);
});
StartFindReplaceAction.addImplementation(100, (accessor, codeEditor, args) => {
    const editorService = accessor.get(IEditorService);
    const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
    if (!editor) {
        return false;
    }
    if (!codeEditor.hasModel()) {
        return false;
    }
    const controller = editor.getContribution(NotebookFindContrib.id);
    const searchStringOptions = getSearchStringOptions(codeEditor, {
        forceRevealReplace: false,
        seedSearchStringFromSelection: codeEditor.getOption(50 /* EditorOption.find */).seedSearchStringFromSelection !== 'never' ? 'single' : 'none',
        seedSearchStringFromNonEmptySelection: codeEditor.getOption(50 /* EditorOption.find */).seedSearchStringFromSelection === 'selection',
        seedSearchStringFromGlobalClipboard: codeEditor.getOption(50 /* EditorOption.find */).globalFindClipboard,
        shouldFocus: 1 /* FindStartFocusAction.FocusFindInput */,
        shouldAnimate: true,
        updateSearchScope: false,
        loop: codeEditor.getOption(50 /* EditorOption.find */).loop
    });
    if (controller) {
        controller.replace(searchStringOptions?.searchString);
        return true;
    }
    return false;
});
NextMatchFindAction.addImplementation(100, (accessor, codeEditor, args) => {
    return findWidgetAction(accessor, codeEditor, true);
});
PreviousMatchFindAction.addImplementation(100, (accessor, codeEditor, args) => {
    return findWidgetAction(accessor, codeEditor, false);
});
// Widget-focused keybindings - these handle F3/Shift+F3 when the notebook find widget has focus
// This follows the same pattern as the text editor which has separate keybindings for widget focus
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'notebook.findNext.fromWidget',
            title: localize2('notebook.findNext.fromWidget', 'Find Next'),
            keybinding: {
                when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, CONTEXT_FIND_WIDGET_VISIBLE),
                primary: 61 /* KeyCode.F3 */,
                mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 37 /* KeyCode.KeyG */, secondary: [61 /* KeyCode.F3 */] },
                weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 1
            }
        });
    }
    async run(accessor) {
        return runFind(accessor, true);
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'notebook.findPrevious.fromWidget',
            title: localize2('notebook.findPrevious.fromWidget', 'Find Previous'),
            keybinding: {
                when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, CONTEXT_FIND_WIDGET_VISIBLE),
                primary: 1024 /* KeyMod.Shift */ | 61 /* KeyCode.F3 */,
                mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 37 /* KeyCode.KeyG */, secondary: [1024 /* KeyMod.Shift */ | 61 /* KeyCode.F3 */] },
                weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 1
            }
        });
    }
    async run(accessor) {
        return runFind(accessor, false);
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tGaW5kLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svYnJvd3Nlci9jb250cmliL2ZpbmQvbm90ZWJvb2tGaW5kLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sMEJBQTBCLENBQUM7QUFFbEMsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUdyRSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxnRUFBZ0UsQ0FBQztBQUVwRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUV6RixPQUFPLEVBQXdCLHdCQUF3QixFQUFxQixtQkFBbUIsRUFBRSx1QkFBdUIsRUFBRSxlQUFlLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUMzTyxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDckQsT0FBTyxFQUFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUVoRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFHNUYsT0FBTyxFQUFrQyxtQkFBbUIsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQzlGLE9BQU8sRUFBMkIsdUJBQXVCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsK0JBQStCLEVBQW1CLE1BQU0sMEJBQTBCLENBQUM7QUFDNUYsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDakYsT0FBTyxFQUFFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ25GLE9BQU8sRUFBRSxtQ0FB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