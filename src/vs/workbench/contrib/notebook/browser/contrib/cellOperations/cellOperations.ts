/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { localize } from 'vs/nls';
import { registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { InputFocusedContext } from 'vs/platform/contextkey/common/contextkeys';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { INotebookCellActionContext, NotebookCellAction } from 'vs/workbench/contrib/notebook/browser/contrib/coreActions';
import { expandCellRangesWithHiddenCells, NOTEBOOK_EDITOR_FOCUSED } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import * as icons from 'vs/workbench/contrib/notebook/browser/notebookIcons';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { CellEditType, cellRangeContains, cellRangesToIndexes, SelectionStateType } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { cloneNotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';

const MOVE_CELL_UP_COMMAND_ID = 'notebook.cell.moveUp';
const MOVE_CELL_DOWN_COMMAND_ID = 'notebook.cell.moveDown';
const COPY_CELL_UP_COMMAND_ID = 'notebook.cell.copyUp';
const COPY_CELL_DOWN_COMMAND_ID = 'notebook.cell.copyDown';

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


async function moveCellRange(context: INotebookCellActionContext, direction: 'up' | 'down'): Promise<void> {
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

async function copyCellRange(context: INotebookCellActionContext, direction: 'up' | 'down'): Promise<void> {
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
