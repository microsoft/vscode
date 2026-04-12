/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { localize, localize2 } from '../../../../../../nls.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { registerWorkbenchContribution2 } from '../../../../../common/contributions.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { NOTEBOOK_CELL_EDITABLE, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_OUTPUT_FOCUSED } from '../../../common/notebookContextKeys.js';
import { cellRangeToViewCells, expandCellRangesWithHiddenCells, getNotebookEditorFromEditorPane } from '../../notebookBrowser.js';
import { CopyAction, CutAction, PasteAction } from '../../../../../../editor/contrib/clipboard/browser/clipboard.js';
import { IClipboardService } from '../../../../../../platform/clipboard/common/clipboardService.js';
import { cloneNotebookCellTextModel } from '../../../common/model/notebookCellTextModel.js';
import { SelectionStateType } from '../../../common/notebookCommon.js';
import { INotebookService } from '../../../common/notebookService.js';
import * as platform from '../../../../../../base/common/platform.js';
import { Action2, MenuId, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { NotebookAction, NotebookCellAction, NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT, NOTEBOOK_OUTPUT_WEBVIEW_ACTION_WEIGHT } from '../../controller/coreActions.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { InputFocusedContextKey } from '../../../../../../platform/contextkey/common/contextkeys.js';
import { RedoCommand, UndoCommand } from '../../../../../../editor/browser/editorExtensions.js';
import { Categories } from '../../../../../../platform/action/common/actionCommonCategories.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { showWindowLogActionId } from '../../../../../services/log/common/logConstants.js';
import { getActiveElement, getWindow, isEditableElement, isHTMLElement } from '../../../../../../base/browser/dom.js';
let _logging = false;
function toggleLogging() {
    _logging = !_logging;
}
function _log(loggerService, str) {
    if (_logging) {
        loggerService.info(`[NotebookClipboard]: ${str}`);
    }
}
function getFocusedEditor(accessor) {
    const loggerService = accessor.get(ILogService);
    const editorService = accessor.get(IEditorService);
    const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
    if (!editor) {
        _log(loggerService, '[Revive Webview] No notebook editor found for active editor pane, bypass');
        return;
    }
    if (!editor.hasEditorFocus()) {
        _log(loggerService, '[Revive Webview] Notebook editor is not focused, bypass');
        return;
    }
    if (!editor.hasWebviewFocus()) {
        _log(loggerService, '[Revive Webview] Notebook editor backlayer webview is not focused, bypass');
        return;
    }
    // If none of the outputs have focus, then webview is not focused
    const view = editor.getViewModel();
    if (view && view.viewCells.every(cell => !cell.outputIsFocused && !cell.outputIsHovered)) {
        return;
    }
    return { editor, loggerService };
}
function getFocusedWebviewDelegate(accessor) {
    const result = getFocusedEditor(accessor);
    if (!result) {
        return;
    }
    const webview = result.editor.getInnerWebview();
    _log(result.loggerService, '[Revive Webview] Notebook editor backlayer webview is focused');
    return webview;
}
function withWebview(accessor, f) {
    const webview = getFocusedWebviewDelegate(accessor);
    if (webview) {
        f(webview);
        return true;
    }
    return false;
}
function withEditor(accessor, f) {
    const result = getFocusedEditor(accessor);
    return result ? f(result.editor) : false;
}
const PRIORITY = 105;
UndoCommand.addImplementation(PRIORITY, 'notebook-webview', accessor => {
    return withWebview(accessor, webview => webview.undo());
});
RedoCommand.addImplementation(PRIORITY, 'notebook-webview', accessor => {
    return withWebview(accessor, webview => webview.redo());
});
CopyAction?.addImplementation(PRIORITY, 'notebook-webview', accessor => {
    return withWebview(accessor, webview => webview.copy());
});
PasteAction?.addImplementation(PRIORITY, 'notebook-webview', accessor => {
    return withWebview(accessor, webview => webview.paste());
});
CutAction?.addImplementation(PRIORITY, 'notebook-webview', accessor => {
    return withWebview(accessor, webview => webview.cut());
});
export function runPasteCells(editor, activeCell, pasteCells) {
    if (!editor.hasModel()) {
        return false;
    }
    const textModel = editor.textModel;
    if (editor.isReadOnly) {
        return false;
    }
    const originalState = {
        kind: SelectionStateType.Index,
        focus: editor.getFocus(),
        selections: editor.getSelections()
    };
    if (activeCell) {
        const currCellIndex = editor.getCellIndex(activeCell);
        const newFocusIndex = typeof currCellIndex === 'number' ? currCellIndex + 1 : 0;
        textModel.applyEdits([
            {
                editType: 1 /* CellEditType.Replace */,
                index: newFocusIndex,
                count: 0,
                cells: pasteCells.items.map(cell => cloneNotebookCellTextModel(cell))
            }
        ], true, originalState, () => ({
            kind: SelectionStateType.Index,
            focus: { start: newFocusIndex, end: newFocusIndex + 1 },
            selections: [{ start: newFocusIndex, end: newFocusIndex + pasteCells.items.length }]
        }), undefined, true);
    }
    else {
        if (editor.getLength() !== 0) {
            return false;
        }
        textModel.applyEdits([
            {
                editType: 1 /* CellEditType.Replace */,
                index: 0,
                count: 0,
                cells: pasteCells.items.map(cell => cloneNotebookCellTextModel(cell))
            }
        ], true, originalState, () => ({
            kind: SelectionStateType.Index,
            focus: { start: 0, end: 1 },
            selections: [{ start: 1, end: pasteCells.items.length + 1 }]
        }), undefined, true);
    }
    return true;
}
export function runCopyCells(accessor, editor, targetCell) {
    if (!editor.hasModel()) {
        return false;
    }
    if (editor.hasOutputTextSelection()) {
        getWindow(editor.getDomNode()).document.execCommand('copy');
        return true;
    }
    const clipboardService = accessor.get(IClipboardService);
    const notebookService = accessor.get(INotebookService);
    const selections = editor.getSelections();
    if (targetCell) {
        const targetCellIndex = editor.getCellIndex(targetCell);
        const containingSelection = selections.find(selection => selection.start <= targetCellIndex && targetCellIndex < selection.end);
        if (!containingSelection) {
            clipboardService.writeText(targetCell.getText());
            notebookService.setToCopy([targetCell.model], true);
            return true;
        }
    }
    const selectionRanges = expandCellRangesWithHiddenCells(editor, editor.getSelections());
    const selectedCells = cellRangeToViewCells(editor, selectionRanges);
    if (!selectedCells.length) {
        return false;
    }
    clipboardService.writeText(selectedCells.map(cell => cell.getText()).join('\n'));
    notebookService.setToCopy(selectedCells.map(cell => cell.model), true);
    return true;
}
export function runCutCells(accessor, editor, targetCell) {
    if (!editor.hasModel() || editor.isReadOnly) {
        return false;
    }
    const textModel = editor.textModel;
    const clipboardService = accessor.get(IClipboardService);
    const notebookService = accessor.get(INotebookService);
    const selections = editor.getSelections();
    if (targetCell) {
        // from ui
        const targetCellIndex = editor.getCellIndex(targetCell);
        const containingSelection = selections.find(selection => selection.start <= targetCellIndex && targetCellIndex < selection.end);
        if (!containingSelection) {
            clipboardService.writeText(targetCell.getText());
            // delete cell
            const focus = editor.getFocus();
            const newFocus = focus.end <= targetCellIndex ? focus : { start: focus.start - 1, end: focus.end - 1 };
            const newSelections = selections.map(selection => (selection.end <= targetCellIndex ? selection : { start: selection.start - 1, end: selection.end - 1 }));
            textModel.applyEdits([
                { editType: 1 /* CellEditType.Replace */, index: targetCellIndex, count: 1, cells: [] }
            ], true, { kind: SelectionStateType.Index, focus: editor.getFocus(), selections: selections }, () => ({ kind: SelectionStateType.Index, focus: newFocus, selections: newSelections }), undefined, true);
            notebookService.setToCopy([targetCell.model], false);
            return true;
        }
    }
    const focus = editor.getFocus();
    const containingSelection = selections.find(selection => selection.start <= focus.start && focus.end <= selection.end);
    if (!containingSelection) {
        // focus is out of any selection, we should only cut this cell
        const targetCell = editor.cellAt(focus.start);
        clipboardService.writeText(targetCell.getText());
        const newFocus = focus.end === editor.getLength() ? { start: focus.start - 1, end: focus.end - 1 } : focus;
        const newSelections = selections.map(selection => (selection.end <= focus.start ? selection : { start: selection.start - 1, end: selection.end - 1 }));
        textModel.applyEdits([
            { editType: 1 /* CellEditType.Replace */, index: focus.start, count: 1, cells: [] }
        ], true, { kind: SelectionStateType.Index, focus: editor.getFocus(), selections: selections }, () => ({ kind: SelectionStateType.Index, focus: newFocus, selections: newSelections }), undefined, true);
        notebookService.setToCopy([targetCell.model], false);
        return true;
    }
    const selectionRanges = expandCellRangesWithHiddenCells(editor, editor.getSelections());
    const selectedCells = cellRangeToViewCells(editor, selectionRanges);
    if (!selectedCells.length) {
        return false;
    }
    clipboardService.writeText(selectedCells.map(cell => cell.getText()).join('\n'));
    const edits = selectionRanges.map(range => ({ editType: 1 /* CellEditType.Replace */, index: range.start, count: range.end - range.start, cells: [] }));
    const firstSelectIndex = selectionRanges[0].start;
    /**
     * If we have cells, 0, 1, 2, 3, 4, 5, 6
     * and cells 1, 2 are selected, and then we delete cells 1 and 2
     * the new focused cell should still be at index 1
     */
    const newFocusedCellIndex = firstSelectIndex < textModel.cells.length - 1
        ? firstSelectIndex
        : Math.max(textModel.cells.length - 2, 0);
    textModel.applyEdits(edits, true, { kind: SelectionStateType.Index, focus: editor.getFocus(), selections: selectionRanges }, () => {
        return {
            kind: SelectionStateType.Index,
            focus: { start: newFocusedCellIndex, end: newFocusedCellIndex + 1 },
            selections: [{ start: newFocusedCellIndex, end: newFocusedCellIndex + 1 }]
        };
    }, undefined, true);
    notebookService.setToCopy(selectedCells.map(cell => cell.model), false);
    return true;
}
let NotebookClipboardContribution = class NotebookClipboardContribution extends Disposable {
    static { this.ID = 'workbench.contrib.notebookClipboard'; }
    constructor(_editorService) {
        super();
        this._editorService = _editorService;
        const PRIORITY = 105;
        if (CopyAction) {
            this._register(CopyAction.addImplementation(PRIORITY, 'notebook-clipboard', accessor => {
                return this.runCopyAction(accessor);
            }));
        }
        if (PasteAction) {
            this._register(PasteAction.addImplementation(PRIORITY, 'notebook-clipboard', accessor => {
                return this.runPasteAction(accessor);
            }));
        }
        if (CutAction) {
            this._register(CutAction.addImplementation(PRIORITY, 'notebook-clipboard', accessor => {
                return this.runCutAction(accessor);
            }));
        }
    }
    _getContext() {
        const editor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
        const activeCell = editor?.getActiveCell();
        return {
            editor,
            activeCell
        };
    }
    _focusInsideEmebedMonaco(editor) {
        const windowSelection = getWindow(editor.getDomNode()).getSelection();
        if (windowSelection?.rangeCount !== 1) {
            return false;
        }
        const activeSelection = windowSelection.getRangeAt(0);
        if (activeSelection.startContainer === activeSelection.endContainer && activeSelection.endOffset - activeSelection.startOffset === 0) {
            return false;
        }
        let container = activeSelection.commonAncestorContainer;
        const body = editor.getDomNode();
        if (!body.contains(container)) {
            return false;
        }
        while (container
            &&
                container !== body) {
            if (container.classList && container.classList.contains('monaco-editor')) {
                return true;
            }
            container = container.parentNode;
        }
        return false;
    }
    runCopyAction(accessor) {
        const loggerService = accessor.get(ILogService);
        const activeElement = getActiveElement();
        if (isHTMLElement(activeElement) && isEditableElement(activeElement)) {
            _log(loggerService, '[NotebookEditor] focus is on input or textarea element, bypass');
            return false;
        }
        const { editor } = this._getContext();
        if (!editor) {
            _log(loggerService, '[NotebookEditor] no active notebook editor, bypass');
            return false;
        }
        if (!editor.hasEditorFocus()) {
            _log(loggerService, '[NotebookEditor] focus is outside of the notebook editor, bypass');
            return false;
        }
        if (this._focusInsideEmebedMonaco(editor)) {
            _log(loggerService, '[NotebookEditor] focus is on embed monaco editor, bypass');
            return false;
        }
        _log(loggerService, '[NotebookEditor] run copy actions on notebook model');
        return runCopyCells(accessor, editor, undefined);
    }
    runPasteAction(accessor) {
        const activeElement = getActiveElement();
        if (activeElement && isEditableElement(activeElement)) {
            return false;
        }
        const { editor, activeCell } = this._getContext();
        if (!editor || !editor.hasEditorFocus() || this._focusInsideEmebedMonaco(editor)) {
            return false;
        }
        const notebookService = accessor.get(INotebookService);
        const pasteCells = notebookService.getToCopy();
        if (!pasteCells) {
            return false;
        }
        return runPasteCells(editor, activeCell, pasteCells);
    }
    runCutAction(accessor) {
        const activeElement = getActiveElement();
        if (activeElement && isEditableElement(activeElement)) {
            return false;
        }
        const { editor } = this._getContext();
        if (!editor || !editor.hasEditorFocus() || this._focusInsideEmebedMonaco(editor)) {
            return false;
        }
        return runCutCells(accessor, editor, undefined);
    }
};
NotebookClipboardContribution = __decorate([
    __param(0, IEditorService)
], NotebookClipboardContribution);
export { NotebookClipboardContribution };
registerWorkbenchContribution2(NotebookClipboardContribution.ID, NotebookClipboardContribution, 2 /* WorkbenchPhase.BlockRestore */);
const COPY_CELL_COMMAND_ID = 'notebook.cell.copy';
const CUT_CELL_COMMAND_ID = 'notebook.cell.cut';
const PASTE_CELL_COMMAND_ID = 'notebook.cell.paste';
const PASTE_CELL_ABOVE_COMMAND_ID = 'notebook.cell.pasteAbove';
registerAction2(class extends NotebookCellAction {
    constructor() {
        super({
            id: COPY_CELL_COMMAND_ID,
            title: localize('notebookActions.copy', "Copy Cell"),
            menu: {
                id: MenuId.NotebookCellTitle,
                when: NOTEBOOK_EDITOR_FOCUSED,
                group: "1_copy" /* CellOverflowToolbarGroups.Copy */,
                order: 2,
            },
            keybinding: platform.isNative ? undefined : {
                primary: 2048 /* KeyMod.CtrlCmd */ | 33 /* KeyCode.KeyC */,
                win: { primary: 2048 /* KeyMod.CtrlCmd */ | 33 /* KeyCode.KeyC */, secondary: [2048 /* KeyMod.CtrlCmd */ | 19 /* KeyCode.Insert */] },
                when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            }
        });
    }
    async runWithContext(accessor, context) {
        runCopyCells(accessor, context.notebookEditor, context.cell);
    }
});
registerAction2(class extends NotebookCellAction {
    constructor() {
        super({
            id: CUT_CELL_COMMAND_ID,
            title: localize('notebookActions.cut', "Cut Cell"),
            menu: {
                id: MenuId.NotebookCellTitle,
                when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE),
                group: "1_copy" /* CellOverflowToolbarGroups.Copy */,
                order: 1,
            },
            keybinding: platform.isNative ? undefined : {
                when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
                primary: 2048 /* KeyMod.CtrlCmd */ | 54 /* KeyCode.KeyX */,
                win: { primary: 2048 /* KeyMod.CtrlCmd */ | 54 /* KeyCode.KeyX */, secondary: [1024 /* KeyMod.Shift */ | 20 /* KeyCode.Delete */] },
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            }
        });
    }
    async runWithContext(accessor, context) {
        runCutCells(accessor, context.notebookEditor, context.cell);
    }
});
registerAction2(class extends NotebookAction {
    constructor() {
        super({
            id: PASTE_CELL_COMMAND_ID,
            title: localize('notebookActions.paste', "Paste Cell"),
            menu: {
                id: MenuId.NotebookCellTitle,
                when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE),
                group: "1_copy" /* CellOverflowToolbarGroups.Copy */,
                order: 3,
            },
            keybinding: platform.isNative ? undefined : {
                when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
                primary: 2048 /* KeyMod.CtrlCmd */ | 52 /* KeyCode.KeyV */,
                win: { primary: 2048 /* KeyMod.CtrlCmd */ | 52 /* KeyCode.KeyV */, secondary: [1024 /* KeyMod.Shift */ | 19 /* KeyCode.Insert */] },
                linux: { primary: 2048 /* KeyMod.CtrlCmd */ | 52 /* KeyCode.KeyV */, secondary: [1024 /* KeyMod.Shift */ | 19 /* KeyCode.Insert */] },
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    async runWithContext(accessor, context) {
        const notebookService = accessor.get(INotebookService);
        const pasteCells = notebookService.getToCopy();
        if (!context.notebookEditor.hasModel() || context.notebookEditor.isReadOnly) {
            return;
        }
        if (!pasteCells) {
            return;
        }
        runPasteCells(context.notebookEditor, context.cell, pasteCells);
    }
});
registerAction2(class extends NotebookCellAction {
    constructor() {
        super({
            id: PASTE_CELL_ABOVE_COMMAND_ID,
            title: localize('notebookActions.pasteAbove', "Paste Cell Above"),
            keybinding: {
                when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
                primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 52 /* KeyCode.KeyV */,
                weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
            },
        });
    }
    async runWithContext(accessor, context) {
        const notebookService = accessor.get(INotebookService);
        const pasteCells = notebookService.getToCopy();
        const editor = context.notebookEditor;
        const textModel = editor.textModel;
        if (editor.isReadOnly) {
            return;
        }
        if (!pasteCells) {
            return;
        }
        const originalState = {
            kind: SelectionStateType.Index,
            focus: editor.getFocus(),
            selections: editor.getSelections()
        };
        const currCellIndex = context.notebookEditor.getCellIndex(context.cell);
        const newFocusIndex = currCellIndex;
        textModel.applyEdits([
            {
                editType: 1 /* CellEditType.Replace */,
                index: currCellIndex,
                count: 0,
                cells: pasteCells.items.map(cell => cloneNotebookCellTextModel(cell))
            }
        ], true, originalState, () => ({
            kind: SelectionStateType.Index,
            focus: { start: newFocusIndex, end: newFocusIndex + 1 },
            selections: [{ start: newFocusIndex, end: newFocusIndex + pasteCells.items.length }]
        }), undefined, true);
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.toggleNotebookClipboardLog',
            title: localize2('toggleNotebookClipboardLog', 'Toggle Notebook Clipboard Troubleshooting'),
            category: Categories.Developer,
            f1: true
        });
    }
    run(accessor) {
        toggleLogging();
        if (_logging) {
            const commandService = accessor.get(ICommandService);
            commandService.executeCommand(showWindowLogActionId);
        }
    }
});
registerAction2(class extends NotebookCellAction {
    constructor() {
        super({
            id: 'notebook.cell.output.selectAll',
            title: localize('notebook.cell.output.selectAll', "Select All"),
            keybinding: {
                primary: 2048 /* KeyMod.CtrlCmd */ | 31 /* KeyCode.KeyA */,
                when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_OUTPUT_FOCUSED),
                weight: NOTEBOOK_OUTPUT_WEBVIEW_ACTION_WEIGHT
            }
        });
    }
    async runWithContext(accessor, _context) {
        withEditor(accessor, editor => {
            if (!editor.hasEditorFocus()) {
                return false;
            }
            if (editor.hasEditorFocus() && !editor.hasWebviewFocus()) {
                return true;
            }
            const cell = editor.getActiveCell();
            if (!cell || !cell.outputIsFocused || !editor.hasWebviewFocus()) {
                return true;
            }
            if (cell.inputInOutputIsFocused) {
                editor.selectInputContents(cell);
            }
            else {
                editor.selectOutputContent(cell);
            }
            return true;
        });
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tDbGlwYm9hcmQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9icm93c2VyL2NvbnRyaWIvY2xpcGJvYXJkL25vdGVib29rQ2xpcGJvYXJkLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDL0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3hFLE9BQU8sRUFBa0IsOEJBQThCLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN4RyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDeEYsT0FBTyxFQUFFLHNCQUFzQixFQUFFLHdCQUF3QixFQUFFLHVCQUF1QixFQUFFLHVCQUF1QixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDNUosT0FBTyxFQUFFLG9CQUFvQixFQUFFLCtCQUErQixFQUFFLCtCQUErQixFQUFtQyxNQUFNLDBCQUEwQixDQUFDO0FBQ25LLE9BQU8sRUFBRSxVQUFVLEVBQUUsU0FBUyxFQUFFLFdBQVcsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBQ3JILE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBQ3BHLE9BQU8sRUFBRSwwQkFBMEIsRUFBeUIsTUFBTSxnREFBZ0QsQ0FBQztBQUNuSCxPQUFPLEVBQXFELGtCQUFrQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDMUgsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDdEUsT0FBTyxLQUFLLFFBQVEsTUFBTSwyQ0FBMkMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxlQUFlLEVBQUUs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