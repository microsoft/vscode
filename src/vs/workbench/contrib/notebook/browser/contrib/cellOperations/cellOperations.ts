/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyChord, KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { localize } from 'vs/nls';
import { MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { InputFocusedContext } from 'vs/platform/contextkey/common/contextkeys';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { CellOverflowToolbarGroups, CellToolbarOrder, CELL_TITLE_CELL_GROUP_ID, INotebookCellActionContext, NotebookCellAction } from 'vs/workbench/contrib/notebook/browser/contrib/coreActions';
import { expandCellRangesWithHiddenCells, NOTEBOOK_CELL_EDITABLE, NOTEBOOK_CELL_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_EDITOR_FOCUSED } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import * as icons from 'vs/workbench/contrib/notebook/browser/notebookIcons';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { CellEditType, cellRangeContains, cellRangesToIndexes, NOTEBOOK_EDITOR_CURSOR_BEGIN_END, SelectionStateType } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { cloneNotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';

const MOVE_CELL_UP_COMMAND_ID = 'notebook.cell.moveUp';
const MOVE_CELL_DOWN_COMMAND_ID = 'notebook.cell.moveDown';
const COPY_CELL_UP_COMMAND_ID = 'notebook.cell.copyUp';
const COPY_CELL_DOWN_COMMAND_ID = 'notebook.cell.copyDown';
const SPLIT_CELL_COMMAND_ID = 'notebook.cell.split';
const JOIN_CELL_ABOVE_COMMAND_ID = 'notebook.cell.joinAbove';
const JOIN_CELL_BELOW_COMMAND_ID = 'notebook.cell.joinBelow';

registerAction2(class extends NotebookCellAction {
	constructor() {
		super(
			{
				id: MOVE_CELL_UP_COMMAND_ID,
				title: localize('notebookActions.moveCellUp', "Move Cell Up"),
				icon: icons.moveUpIcon,
				keybinding: {
					primary: KeyMod.Alt | KeyCode.UpArrow,
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, InputFocusedContext.toNegated()),
					weight: KeybindingWeight.WorkbenchContrib
				}
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		return moveCellRange(context, 'up');
	}
});

registerAction2(class extends NotebookCellAction {
	constructor() {
		super(
			{
				id: MOVE_CELL_DOWN_COMMAND_ID,
				title: localize('notebookActions.moveCellDown', "Move Cell Down"),
				icon: icons.moveDownIcon,
				keybinding: {
					primary: KeyMod.Alt | KeyCode.DownArrow,
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, InputFocusedContext.toNegated()),
					weight: KeybindingWeight.WorkbenchContrib
				}
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		return moveCellRange(context, 'down');
	}
});

export async function moveCellRange(context: INotebookCellActionContext, direction: 'up' | 'down'): Promise<void> {
	const viewModel = context.notebookEditor.viewModel;
	if (!viewModel) {
		return;
	}

	if (!viewModel.metadata.editable) {
		return;
	}

	const selections = context.notebookEditor.getSelections();
	const modelRanges = expandCellRangesWithHiddenCells(context.notebookEditor, context.notebookEditor.viewModel!, selections);
	const range = modelRanges[0];
	if (!range || range.start === range.end) {
		return;
	}

	if (direction === 'up') {
		if (range.start === 0) {
			return;
		}

		const indexAbove = range.start - 1;
		const finalSelection = { start: range.start - 1, end: range.end - 1 };
		const focus = context.notebookEditor.getFocus();
		const newFocus = cellRangeContains(range, focus) ? { start: focus.start - 1, end: focus.end - 1 } : { start: range.start - 1, end: range.start };
		viewModel.notebookDocument.applyEdits([
			{
				editType: CellEditType.Move,
				index: indexAbove,
				length: 1,
				newIdx: range.end - 1
			}],
			true,
			{
				kind: SelectionStateType.Index,
				focus: viewModel.getFocus(),
				selections: viewModel.getSelections()
			},
			() => ({ kind: SelectionStateType.Index, focus: newFocus, selections: [finalSelection] }),
			undefined
		);
		const focusRange = viewModel.getSelections()[0] ?? viewModel.getFocus();
		context.notebookEditor.revealCellRangeInView(focusRange);
	} else {
		if (range.end >= viewModel.length) {
			return;
		}

		const indexBelow = range.end;
		const finalSelection = { start: range.start + 1, end: range.end + 1 };
		const focus = context.notebookEditor.getFocus();
		const newFocus = cellRangeContains(range, focus) ? { start: focus.start + 1, end: focus.end + 1 } : { start: range.start + 1, end: range.start + 2 };

		viewModel.notebookDocument.applyEdits([
			{
				editType: CellEditType.Move,
				index: indexBelow,
				length: 1,
				newIdx: range.start
			}],
			true,
			{
				kind: SelectionStateType.Index,
				focus: viewModel.getFocus(),
				selections: viewModel.getSelections()
			},
			() => ({ kind: SelectionStateType.Index, focus: newFocus, selections: [finalSelection] }),
			undefined
		);

		const focusRange = viewModel.getSelections()[0] ?? viewModel.getFocus();
		context.notebookEditor.revealCellRangeInView(focusRange);
	}
}

registerAction2(class extends NotebookCellAction {
	constructor() {
		super(
			{
				id: COPY_CELL_UP_COMMAND_ID,
				title: localize('notebookActions.copyCellUp', "Copy Cell Up"),
				keybinding: {
					primary: KeyMod.Alt | KeyMod.Shift | KeyCode.UpArrow,
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, InputFocusedContext.toNegated()),
					weight: KeybindingWeight.WorkbenchContrib
				}
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		return copyCellRange(context, 'up');
	}
});

registerAction2(class extends NotebookCellAction {
	constructor() {
		super(
			{
				id: COPY_CELL_DOWN_COMMAND_ID,
				title: localize('notebookActions.copyCellDown', "Copy Cell Down"),
				keybinding: {
					primary: KeyMod.Alt | KeyMod.Shift | KeyCode.DownArrow,
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, InputFocusedContext.toNegated()),
					weight: KeybindingWeight.WorkbenchContrib
				}
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		return copyCellRange(context, 'down');
	}
});

export async function copyCellRange(context: INotebookCellActionContext, direction: 'up' | 'down'): Promise<void> {
	const viewModel = context.notebookEditor.viewModel;
	if (!viewModel) {
		return;
	}

	if (!viewModel.metadata.editable) {
		return;
	}

	const selections = context.notebookEditor.getSelections();
	const modelRanges = expandCellRangesWithHiddenCells(context.notebookEditor, context.notebookEditor.viewModel!, selections);
	const range = modelRanges[0];
	if (!range || range.start === range.end) {
		return;
	}

	if (direction === 'up') {
		// insert up, without changing focus and selections
		const focus = viewModel.getFocus();
		const selections = viewModel.getSelections();
		viewModel.notebookDocument.applyEdits([
			{
				editType: CellEditType.Replace,
				index: range.end,
				count: 0,
				cells: cellRangesToIndexes([range]).map(index => cloneNotebookCellTextModel(viewModel.viewCells[index].model))
			}],
			true,
			{
				kind: SelectionStateType.Index,
				focus: focus,
				selections: selections
			},
			() => ({ kind: SelectionStateType.Index, focus: focus, selections: selections }),
			undefined
		);
	} else {
		// insert down, move selections
		const focus = viewModel.getFocus();
		const selections = viewModel.getSelections();
		const newCells = cellRangesToIndexes([range]).map(index => cloneNotebookCellTextModel(viewModel.viewCells[index].model));
		const countDelta = newCells.length;
		const newFocus = { start: focus.start + countDelta, end: focus.end + countDelta };
		const newSelections = [{ start: range.start + countDelta, end: range.end + countDelta }];
		viewModel.notebookDocument.applyEdits([
			{
				editType: CellEditType.Replace,
				index: range.end,
				count: 0,
				cells: cellRangesToIndexes([range]).map(index => cloneNotebookCellTextModel(viewModel.viewCells[index].model))
			}],
			true,
			{
				kind: SelectionStateType.Index,
				focus: focus,
				selections: selections
			},
			() => ({ kind: SelectionStateType.Index, focus: newFocus, selections: newSelections }),
			undefined
		);

		const focusRange = viewModel.getSelections()[0] ?? viewModel.getFocus();
		context.notebookEditor.revealCellRangeInView(focusRange);
	}
}

export async function splitCell(context: INotebookCellActionContext): Promise<void> {
	const newCells = await context.notebookEditor.splitNotebookCell(context.cell);
	if (newCells) {
		context.notebookEditor.focusNotebookCell(newCells[newCells.length - 1], 'editor');
	}
}

registerAction2(class extends NotebookCellAction {
	constructor() {
		super(
			{
				id: SPLIT_CELL_COMMAND_ID,
				title: localize('notebookActions.splitCell', "Split Cell"),
				menu: {
					id: MenuId.NotebookCellTitle,
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE, NOTEBOOK_CELL_EDITOR_FOCUSED, NOTEBOOK_EDITOR_CURSOR_BEGIN_END.toNegated()),
					order: CellToolbarOrder.SplitCell,
					group: CELL_TITLE_CELL_GROUP_ID,
					// alt: {
					// 	id: JOIN_CELL_BELOW_COMMAND_ID,
					// 	title: localize('notebookActions.joinCellBelow', "Join with Next Cell")
					// }
				},
				icon: icons.splitCellIcon,
				keybinding: {
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE, NOTEBOOK_CELL_EDITOR_FOCUSED, NOTEBOOK_EDITOR_CURSOR_BEGIN_END.toNegated()),
					primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_BACKSLASH),
					weight: KeybindingWeight.WorkbenchContrib
				},
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		return splitCell(context);
	}
});

export async function joinCells(context: INotebookCellActionContext, direction: 'above' | 'below'): Promise<void> {
	const cell = await context.notebookEditor.joinNotebookCells(context.cell, direction);
	if (cell) {
		context.notebookEditor.focusNotebookCell(cell, 'editor');
	}
}

registerAction2(class extends NotebookCellAction {
	constructor() {
		super(
			{
				id: JOIN_CELL_ABOVE_COMMAND_ID,
				title: localize('notebookActions.joinCellAbove', "Join With Previous Cell"),
				keybinding: {
					when: NOTEBOOK_EDITOR_FOCUSED,
					primary: KeyMod.WinCtrl | KeyMod.Alt | KeyMod.Shift | KeyCode.KEY_J,
					weight: KeybindingWeight.WorkbenchContrib
				},
				menu: {
					id: MenuId.NotebookCellTitle,
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE),
					group: CellOverflowToolbarGroups.Edit,
					order: 10
				}
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		return joinCells(context, 'above');
	}
});

registerAction2(class extends NotebookCellAction {
	constructor() {
		super(
			{
				id: JOIN_CELL_BELOW_COMMAND_ID,
				title: localize('notebookActions.joinCellBelow', "Join With Next Cell"),
				keybinding: {
					when: NOTEBOOK_EDITOR_FOCUSED,
					primary: KeyMod.WinCtrl | KeyMod.Alt | KeyCode.KEY_J,
					weight: KeybindingWeight.WorkbenchContrib
				},
				menu: {
					id: MenuId.NotebookCellTitle,
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE),
					group: CellOverflowToolbarGroups.Edit,
					order: 11
				}
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		return joinCells(context, 'below');
	}
});
