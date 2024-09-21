/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../../../nls.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { WorkbenchPhase, registerWorkbenchContribution2 } from '../../../../../common/contributions.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { NOTEBOOK_CELL_EDITABLE, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_OUTPUT_FOCUSED } from '../../../common/notebookContextKeys.js';
import { cellRangeToViewCells, expandCellRangesWithHiddenCells, getNotebookEditorFromEditorPane, ICellViewModel, INotebookEditor } from '../../notebookBrowser.js';
import { CopyAction, CutAction, PasteAction } from '../../../../../../editor/contrib/clipboard/browser/clipboard.js';
import { IClipboardService } from '../../../../../../platform/clipboard/common/clipboardService.js';
import { cloneNotebookCellTextModel, NotebookCellTextModel } from '../../../common/model/notebookCellTextModel.js';
import { CellEditType, ICellEditOperation, ISelectionState, SelectionStateType } from '../../../common/notebookCommon.js';
import { INotebookService } from '../../../common/notebookService.js';
import * as platform from '../../../../../../base/common/platform.js';
import { Action2, MenuId, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { CellOverflowToolbarGroups, INotebookActionContext, INotebookCellActionContext, NotebookAction, NotebookCellAction, NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT, NOTEBOOK_OUTPUT_WEBVIEW_ACTION_WEIGHT } from '../../controller/coreActions.js';
import { KeyCode, KeyMod } from '../../../../../../base/common/keyCodes.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { InputFocusedContextKey } from '../../../../../../platform/contextkey/common/contextkeys.js';
import { KeybindingWeight } from '../../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { RedoCommand, UndoCommand } from '../../../../../../editor/browser/editorExtensions.js';
import { IWebview } from '../../../../webview/browser/webview.js';
import { Categories } from '../../../../../../platform/action/common/actionCommonCategories.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { showWindowLogActionId } from '../../../../../services/log/common/logConstants.js';
import { getActiveElement, getWindow, isAncestor, isEditableElement, isHTMLElement } from '../../../../../../base/browser/dom.js';

let _logging: boolean = false;
function toggleLogging() {
	_logging = !_logging;
}

function _log(loggerService: ILogService, str: string) {
	if (_logging) {
		loggerService.info(`[NotebookClipboard]: ${str}`);
	}
}

function getFocusedEditor(accessor: ServicesAccessor) {
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
function getFocusedWebviewDelegate(accessor: ServicesAccessor): IWebview | undefined {
	const result = getFocusedEditor(accessor);
	if (!result) {
		return;
	}
	const webview = result.editor.getInnerWebview();
	_log(result.loggerService, '[Revive Webview] Notebook editor backlayer webview is focused');
	return webview;
}

function withWebview(accessor: ServicesAccessor, f: (webviewe: IWebview) => void) {
	const webview = getFocusedWebviewDelegate(accessor);
	if (webview) {
		f(webview);
		return true;
	}
	return false;
}

function withEditor(accessor: ServicesAccessor, f: (editor: INotebookEditor) => boolean) {
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

export function runPasteCells(editor: INotebookEditor, activeCell: ICellViewModel | undefined, pasteCells: {
	items: NotebookCellTextModel[];
	isCopy: boolean;
}): boolean {
	if (!editor.hasModel()) {
		return false;
	}
	const textModel = editor.textModel;

	if (editor.isReadOnly) {
		return false;
	}

	const originalState: ISelectionState = {
		kind: SelectionStateType.Index,
		focus: editor.getFocus(),
		selections: editor.getSelections()
	};

	if (activeCell) {
		const currCellIndex = editor.getCellIndex(activeCell);
		const newFocusIndex = typeof currCellIndex === 'number' ? currCellIndex + 1 : 0;
		textModel.applyEdits([
			{
				editType: CellEditType.Replace,
				index: newFocusIndex,
				count: 0,
				cells: pasteCells.items.map(cell => cloneNotebookCellTextModel(cell))
			}
		], true, originalState, () => ({
			kind: SelectionStateType.Index,
			focus: { start: newFocusIndex, end: newFocusIndex + 1 },
			selections: [{ start: newFocusIndex, end: newFocusIndex + pasteCells.items.length }]
		}), undefined, true);
	} else {
		if (editor.getLength() !== 0) {
			return false;
		}

		textModel.applyEdits([
			{
				editType: CellEditType.Replace,
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

export function runCopyCells(accessor: ServicesAccessor, editor: INotebookEditor, targetCell: ICellViewModel | undefined): boolean {
	if (!editor.hasModel()) {
		return false;
	}

	if (editor.hasOutputTextSelection()) {
		getWindow(editor.getDomNode()).document.execCommand('copy');
		return true;
	}

	const clipboardService = accessor.get<IClipboardService>(IClipboardService);
	const notebookService = accessor.get<INotebookService>(INotebookService);
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
export function runCutCells(accessor: ServicesAccessor, editor: INotebookEditor, targetCell: ICellViewModel | undefined): boolean {
	if (!editor.hasModel() || editor.isReadOnly) {
		return false;
	}

	const textModel = editor.textModel;
	const clipboardService = accessor.get<IClipboardService>(IClipboardService);
	const notebookService = accessor.get<INotebookService>(INotebookService);
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
				{ editType: CellEditType.Replace, index: targetCellIndex, count: 1, cells: [] }
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
			{ editType: CellEditType.Replace, index: focus.start, count: 1, cells: [] }
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
	const edits: ICellEditOperation[] = selectionRanges.map(range => ({ editType: CellEditType.Replace, index: range.start, count: range.end - range.start, cells: [] }));
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

export class NotebookClipboardContribution extends Disposable {

	static readonly ID = 'workbench.contrib.notebookClipboard';

	constructor(@IEditorService private readonly _editorService: IEditorService) {
		super();

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

	private _getContext() {
		const editor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
		const activeCell = editor?.getActiveCell();

		return {
			editor,
			activeCell
		};
	}

	private _focusInsideEmebedMonaco(editor: INotebookEditor) {
		const windowSelection = getWindow(editor.getDomNode()).getSelection();

		if (windowSelection?.rangeCount !== 1) {
			return false;
		}

		const activeSelection = windowSelection.getRangeAt(0);
		if (activeSelection.startContainer === activeSelection.endContainer && activeSelection.endOffset - activeSelection.startOffset === 0) {
			return false;
		}

		let container: any = activeSelection.commonAncestorContainer;
		const body = editor.getDomNode();

		if (!body.contains(container)) {
			return false;
		}

		while (container
			&&
			container !== body) {
			if ((container as HTMLElement).classList && (container as HTMLElement).classList.contains('monaco-editor')) {
				return true;
			}

			container = container.parentNode;
		}

		return false;
	}

	runCopyAction(accessor: ServicesAccessor) {
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

		if (!isAncestor(activeElement, editor.getDomNode())) {
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

	runPasteAction(accessor: ServicesAccessor) {
		const activeElement = <HTMLElement>getActiveElement();
		if (activeElement && isEditableElement(activeElement)) {
			return false;
		}

		const notebookService = accessor.get<INotebookService>(INotebookService);
		const pasteCells = notebookService.getToCopy();

		if (!pasteCells) {
			return false;
		}

		const { editor, activeCell } = this._getContext();
		if (!editor) {
			return false;
		}

		return runPasteCells(editor, activeCell, pasteCells);
	}

	runCutAction(accessor: ServicesAccessor) {
		const activeElement = <HTMLElement>getActiveElement();
		if (activeElement && isEditableElement(activeElement)) {
			return false;
		}

		const { editor } = this._getContext();
		if (!editor) {
			return false;
		}

		return runCutCells(accessor, editor, undefined);
	}
}

registerWorkbenchContribution2(NotebookClipboardContribution.ID, NotebookClipboardContribution, WorkbenchPhase.BlockRestore);

const COPY_CELL_COMMAND_ID = 'notebook.cell.copy';
const CUT_CELL_COMMAND_ID = 'notebook.cell.cut';
const PASTE_CELL_COMMAND_ID = 'notebook.cell.paste';
const PASTE_CELL_ABOVE_COMMAND_ID = 'notebook.cell.pasteAbove';

registerAction2(class extends NotebookCellAction {
	constructor() {
		super(
			{
				id: COPY_CELL_COMMAND_ID,
				title: localize('notebookActions.copy', "Copy Cell"),
				menu: {
					id: MenuId.NotebookCellTitle,
					when: NOTEBOOK_EDITOR_FOCUSED,
					group: CellOverflowToolbarGroups.Copy,
					order: 2,
				},
				keybinding: platform.isNative ? undefined : {
					primary: KeyMod.CtrlCmd | KeyCode.KeyC,
					win: { primary: KeyMod.CtrlCmd | KeyCode.KeyC, secondary: [KeyMod.CtrlCmd | KeyCode.Insert] },
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
					weight: KeybindingWeight.WorkbenchContrib
				}
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		runCopyCells(accessor, context.notebookEditor, context.cell);
	}
});

registerAction2(class extends NotebookCellAction {
	constructor() {
		super(
			{
				id: CUT_CELL_COMMAND_ID,
				title: localize('notebookActions.cut', "Cut Cell"),
				menu: {
					id: MenuId.NotebookCellTitle,
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE),
					group: CellOverflowToolbarGroups.Copy,
					order: 1,
				},
				keybinding: platform.isNative ? undefined : {
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
					primary: KeyMod.CtrlCmd | KeyCode.KeyX,
					win: { primary: KeyMod.CtrlCmd | KeyCode.KeyX, secondary: [KeyMod.Shift | KeyCode.Delete] },
					weight: KeybindingWeight.WorkbenchContrib
				}
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		runCutCells(accessor, context.notebookEditor, context.cell);
	}
});

registerAction2(class extends NotebookAction {
	constructor() {
		super(
			{
				id: PASTE_CELL_COMMAND_ID,
				title: localize('notebookActions.paste', "Paste Cell"),
				menu: {
					id: MenuId.NotebookCellTitle,
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE),
					group: CellOverflowToolbarGroups.Copy,
					order: 3,
				},
				keybinding: platform.isNative ? undefined : {
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
					primary: KeyMod.CtrlCmd | KeyCode.KeyV,
					win: { primary: KeyMod.CtrlCmd | KeyCode.KeyV, secondary: [KeyMod.Shift | KeyCode.Insert] },
					linux: { primary: KeyMod.CtrlCmd | KeyCode.KeyV, secondary: [KeyMod.Shift | KeyCode.Insert] },
					weight: KeybindingWeight.EditorContrib
				}
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext) {
		const notebookService = accessor.get<INotebookService>(INotebookService);
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
		super(
			{
				id: PASTE_CELL_ABOVE_COMMAND_ID,
				title: localize('notebookActions.pasteAbove', "Paste Cell Above"),
				keybinding: {
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
					primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyV,
					weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
				},
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		const notebookService = accessor.get<INotebookService>(INotebookService);
		const pasteCells = notebookService.getToCopy();
		const editor = context.notebookEditor;
		const textModel = editor.textModel;

		if (editor.isReadOnly) {
			return;
		}

		if (!pasteCells) {
			return;
		}

		const originalState: ISelectionState = {
			kind: SelectionStateType.Index,
			focus: editor.getFocus(),
			selections: editor.getSelections()
		};

		const currCellIndex = context.notebookEditor.getCellIndex(context.cell);
		const newFocusIndex = currCellIndex;
		textModel.applyEdits([
			{
				editType: CellEditType.Replace,
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

	run(accessor: ServicesAccessor): void {
		toggleLogging();
		if (_logging) {
			const commandService = accessor.get(ICommandService);
			commandService.executeCommand(showWindowLogActionId);
		}
	}
});


registerAction2(class extends NotebookCellAction {
	constructor() {
		super(
			{
				id: 'notebook.cell.output.selectAll',
				title: localize('notebook.cell.output.selectAll', "Select All"),
				keybinding: {
					primary: KeyMod.CtrlCmd | KeyCode.KeyA,
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_OUTPUT_FOCUSED),
					weight: NOTEBOOK_OUTPUT_WEBVIEW_ACTION_WEIGHT
				}
			});
	}

	async runWithContext(accessor: ServicesAccessor, _context: INotebookCellActionContext) {
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
			} else {
				editor.selectOutputContent(cell);
			}
			return true;
		});

	}
});
